const crypto = require("node:crypto");
const {
  createSignedUrl,
  downloadPrivateObject,
  isUuid,
  listPrivateObjectEntries,
  matchesImageSignature,
  uploadPrivateImage,
} = require("./monster-submissions");
const {
  CHILD_AGE_BANDS, CHILD_COSTUMES, CHILD_EYE_COLORS, CHILD_FACE_DETAILS, CHILD_GLASSES, CHILD_HAIR_COLORS, CHILD_HAIR_STYLES,
  CHILD_HEADWEAR, CHILD_HEARING_AIDS, CHILD_MOBILITY_AIDS, CHILD_OUTFIT_COLORS, CHILD_OUTFIT_STYLES, CHILD_PRESENTATIONS,
  CHILD_RELATIVE_HEIGHTS, CHILD_SKIN_TONES, childProfileKey, resolveChildCharacter, sanitizeChildDetail,
} = require("./child-characters");

// Child character renders, persisted in the private monster-submissions
// bucket next to the monster they belong to:
//
//   <submission>/child/render-<id>.png          lossless master from the model
//   <submission>/child/render-<id>.<meta>.webp  display copy (editor + proof)
//   <submission>/child/print-<id>-2x.png        2x print master (made at checkout)
//
// The bucket only accepts images, so render metadata (version number and the
// compact profile it was made from) travels compactly encoded in the display
// file name (see encodeRenderMeta). Everything lives directly under
// <submission>/child/, which Admin's "delete monster" already removes.

const RENDER_ID_PATTERN = /^[a-z0-9]{8,12}-[a-f0-9]{8}$/;
const MAX_LISTED_RENDERS = 12;
const DISPLAY_WEBP_QUALITY = 90;
const STORAGE_LIMIT_BYTES = 8 * 1024 * 1024;
const PRINT_SCALE = 2;
// Render metadata codec. Each enum field is stored as one base36 character:
// 0 = unset, otherwise 1 + the value's index in the option table. Option
// tables in lib/child-characters.js are therefore APPEND-ONLY (a unit test pins
// the encoding). The optional special detail follows as base64url UTF-8,
// capped so the whole file name stays under 255 characters.
const META_VERSION = "2";
const META_FIELDS = [
  ["presentation", CHILD_PRESENTATIONS], ["skinTone", CHILD_SKIN_TONES], ["hairStyle", CHILD_HAIR_STYLES],
  ["hairColor", CHILD_HAIR_COLORS], ["eyeColor", CHILD_EYE_COLORS], ["outfitStyle", CHILD_OUTFIT_STYLES],
  ["outfitColor", CHILD_OUTFIT_COLORS], ["costume", CHILD_COSTUMES], ["glasses", CHILD_GLASSES],
  ["hearingAid", CHILD_HEARING_AIDS], ["headwear", CHILD_HEADWEAR], ["faceDetail", CHILD_FACE_DETAILS],
  ["ageBand", CHILD_AGE_BANDS], ["relativeHeight", CHILD_RELATIVE_HEIGHTS], ["mobilityAid", CHILD_MOBILITY_AIDS],
].map(([field, options]) => [field, Object.keys(options)]);
const META_HEAD_LENGTH = 2 + META_FIELDS.length;
const META_DETAIL_MAX_BYTES = 150;

function canvasModule() {
  // Loaded lazily so routes that never touch pixels stay fast to boot.
  return require("@napi-rs/canvas");
}

function newRenderId(now = Date.now()) {
  return `${now.toString(36).padStart(8, "0")}-${crypto.randomBytes(4).toString("hex")}`;
}

function isRenderId(value) {
  return typeof value === "string" && RENDER_ID_PATTERN.test(value);
}

function encodeRenderMeta({ profile = {}, version = 1 } = {}) {
  let head = META_VERSION + Math.max(1, Math.min(9, Number(version) || 1)).toString();
  for (const [field, values] of META_FIELDS) {
    const index = values.indexOf(profile[field]);
    head += index >= 0 && index < 35 ? (index + 1).toString(36) : "0";
  }
  return head + encodeDetail(sanitizeChildDetail(profile.detail));
}

function encodeDetail(detail) {
  if (!detail) return "";
  let bytes = Buffer.from(detail, "utf8");
  if (bytes.length > META_DETAIL_MAX_BYTES) {
    // Only very long non-Latin details get here; trim on a character boundary.
    let trimmed = detail;
    while (Buffer.byteLength(trimmed, "utf8") > META_DETAIL_MAX_BYTES) trimmed = trimmed.slice(0, -1);
    bytes = Buffer.from(trimmed.trim(), "utf8");
  }
  return bytes.toString("base64url");
}

function decodeRenderMeta(value) {
  const text = String(value || "");
  if (text.length < META_HEAD_LENGTH || text[0] !== META_VERSION || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const version = Number.parseInt(text[1], 10);
  if (!(version >= 1 && version <= 9)) return null;
  const profile = { id: "custom" };
  for (const [position, [field, values]] of META_FIELDS.entries()) {
    const code = Number.parseInt(text[2 + position], 36);
    if (code > 0 && values[code - 1]) profile[field] = values[code - 1];
  }
  const detail = sanitizeChildDetail(Buffer.from(text.slice(META_HEAD_LENGTH), "base64url").toString("utf8"));
  if (detail) profile.detail = detail;
  return { version, profileKey: childProfileKey(resolveChildCharacter(profile)), profile };
}

function dataUrlBytes(dataUrl, contentType) {
  const match = typeof dataUrl === "string" && dataUrl.match(/^data:(image\/(?:png|webp|jpeg));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || (contentType && match[1] !== contentType)) throw renderError("The character renderer returned an unreadable image.", 502, "child_render_unreadable");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || !matchesImageSignature(bytes, match[1])) throw renderError("The character renderer returned an unreadable image.", 502, "child_render_unreadable");
  return { bytes, contentType: match[1] };
}

/**
 * Turns the model's PNG into: the untouched lossless master, a WebP display
 * copy for the editor/proof, and a transparency check (the four corners and
 * most of the border must be transparent for clean book compositing).
 */
async function processRenderedImage(dataUrl) {
  const { bytes, contentType } = dataUrlBytes(dataUrl);
  const { createCanvas, loadImage } = canvasModule();
  const image = await loadImage(bytes);
  const width = image.width;
  const height = image.height;
  if (!width || !height) throw renderError("The character renderer returned an empty image.", 502, "child_render_unreadable");
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const transparency = measureBorderTransparency(context, width, height);
  const display = await canvas.encode("webp", DISPLAY_WEBP_QUALITY);
  const master = contentType === "image/png" ? bytes : await canvas.encode("png");
  return { master, display, width, height, transparentBackground: transparency >= 0.9, borderTransparency: Number(transparency.toFixed(3)) };
}

function measureBorderTransparency(context, width, height) {
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.01));
  const regions = [
    [0, 0, width, band], [0, height - band, width, band], [0, 0, band, height], [width - band, 0, band, height],
  ];
  let transparent = 0;
  let total = 0;
  for (const [x, y, w, h] of regions) {
    const { data } = context.getImageData(x, y, w, h);
    for (let index = 3; index < data.length; index += 16) {
      total += 1;
      if (data[index] < 16) transparent += 1;
    }
  }
  return total ? transparent / total : 0;
}

function renderPaths(submissionId, renderId, meta = "") {
  const prefix = `${submissionId}/child`;
  return {
    prefix,
    master: `${prefix}/render-${renderId}.png`,
    display: meta ? `${prefix}/render-${renderId}.${meta}.webp` : null,
    print: `${prefix}/print-${renderId}-2x.png`,
  };
}

async function saveChildRender({ submissionId, renderId, master, display, profile, profileKey, version }) {
  if (!isUuid(submissionId) || !isRenderId(renderId)) throw renderError("Invalid character render.", 400, "invalid_child_render");
  const meta = encodeRenderMeta({ profile, version });
  const paths = renderPaths(submissionId, renderId, meta);
  await uploadPrivateImage(paths.master, { contentType: "image/png", bytes: master });
  await uploadPrivateImage(paths.display, { contentType: "image/webp", bytes: display });
  return paths;
}

/** Newest renders for a submission, parsed from the display file names. */
async function listChildRenders(submissionId) {
  if (!isUuid(submissionId)) return [];
  const prefix = `${submissionId}/child`;
  const entries = await listPrivateObjectEntries(prefix, { max: 300 });
  const masters = new Set(entries.map((entry) => entry.name).filter((name) => /^render-[a-z0-9-]+\.png$/.test(name)));
  const renders = [];
  for (const entry of entries) {
    const match = entry.name.match(/^render-([a-z0-9]{8,12}-[a-f0-9]{8})\.([A-Za-z0-9_-]+)\.webp$/);
    if (!match || !masters.has(`render-${match[1]}.png`)) continue;
    const meta = decodeRenderMeta(match[2]);
    if (!meta) continue;
    renders.push({
      id: match[1],
      createdAt: entry.created_at || null,
      version: meta.version,
      profileKey: meta.profileKey,
      profile: meta.profile,
      displayPath: `${prefix}/${entry.name}`,
      masterPath: `${prefix}/render-${match[1]}.png`,
    });
  }
  renders.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || b.id.localeCompare(a.id));
  return renders.slice(0, MAX_LISTED_RENDERS);
}

async function findChildRender(submissionId, renderId) {
  if (!isRenderId(renderId)) return null;
  return (await listChildRenders(submissionId)).find((render) => render.id === renderId) || null;
}

async function loadChildRenderDisplay(render) {
  const { bytes } = await downloadPrivateObject(render.displayPath, { maxBytes: STORAGE_LIMIT_BYTES });
  if (!matchesImageSignature(bytes, "image/webp")) throw renderError("The saved character could not be opened.", 502, "child_render_unreadable");
  return `data:image/webp;base64,${bytes.toString("base64")}`;
}

async function signedMasterUrl(render) {
  return createSignedUrl(render.masterPath).catch(() => null);
}

/**
 * Print master for an order: the lossless render upscaled 2x with high-quality
 * resampling (2048x3072 from a 1024x1536 render). This is interpolation, not
 * new detail: it gives the PDF a smooth, high-resolution raster to place at
 * book size. Falls back to lossless WebP when the PNG would exceed the bucket's
 * 8 MB limit. Returns the stored object path.
 */
async function createPrintChildImage({ submissionId, renderId }) {
  if (!isUuid(submissionId) || !isRenderId(renderId)) throw renderError("Invalid character render.", 400, "invalid_child_render");
  const paths = renderPaths(submissionId, renderId);
  const { bytes } = await downloadPrivateObject(paths.master, { maxBytes: STORAGE_LIMIT_BYTES });
  if (!matchesImageSignature(bytes, "image/png")) throw renderError("The saved character could not be opened.", 502, "child_render_unreadable");
  const upscaled = await upscaleImage(bytes, PRINT_SCALE);
  if (upscaled.png.length <= STORAGE_LIMIT_BYTES - 64 * 1024) {
    await uploadPrivateImage(paths.print, { contentType: "image/png", bytes: upscaled.png }, { upsert: true });
    return paths.print;
  }
  const webp = await upscaled.canvas.encode("webp", 100);
  const webpPath = paths.print.replace(/\.png$/, ".webp");
  if (webp.length > STORAGE_LIMIT_BYTES - 64 * 1024) return paths.master;
  await uploadPrivateImage(webpPath, { contentType: "image/webp", bytes: webp }, { upsert: true });
  return webpPath;
}

async function upscaleImage(bytes, scale) {
  const { createCanvas, loadImage } = canvasModule();
  const image = await loadImage(bytes);
  const canvas = createCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, png: await canvas.encode("png"), width: canvas.width, height: canvas.height };
}

function renderError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

module.exports = {
  MAX_LISTED_RENDERS,
  createPrintChildImage,
  decodeRenderMeta,
  encodeRenderMeta,
  findChildRender,
  isRenderId,
  listChildRenders,
  loadChildRenderDisplay,
  newRenderId,
  processRenderedImage,
  renderPaths,
  saveChildRender,
  signedMasterUrl,
  upscaleImage,
};
