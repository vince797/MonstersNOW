const crypto = require("crypto");

const BUCKET = "story-artwork";
const MAX_BYTES = 3 * 1024 * 1024;
const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function uploadStoryArtwork(payload = {}) {
  const storyId = safeSegment(payload.storyId || "unsaved-story", 80);
  const page = Number(payload.page);
  const match = typeof payload.data === "string" && payload.data.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!storyId || !Number.isInteger(page) || page < 1 || page > 32 || !match) {
    throw artworkError("Choose a JPG, PNG, or WebP image for a valid story page.");
  }

  const contentType = match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_BYTES) throw artworkError("Artwork must be smaller than 3 MB.");
  if (!matchesImageSignature(bytes, contentType)) throw artworkError("The selected file does not appear to be a valid image.");

  const { url, key } = storageConfig();
  await ensureBucket(url, key);
  const extension = MIME_EXTENSIONS[contentType];
  const objectPath = `${storyId}/page-${String(page).padStart(2, "0")}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${extension}`;
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "POST",
    headers: storageHeaders(key, { "Content-Type": contentType, "Cache-Control": "3600", "x-upsert": "false" }),
    body: bytes,
  });
  if (!response.ok) throw await storageError(response, "Artwork could not be uploaded.");

  return {
    url: `${url}/storage/v1/object/public/${BUCKET}/${objectPath.split("/").map(encodeURIComponent).join("/")}`,
    path: objectPath,
    name: cleanName(payload.name),
    contentType,
    size: bytes.length,
  };
}

async function ensureBucket(url, key) {
  const existing = await fetch(`${url}/storage/v1/bucket/${BUCKET}`, { headers: storageHeaders(key) });
  if (existing.ok) return;
  if (existing.status !== 404) throw await storageError(existing, "Artwork storage is unavailable.");
  const created = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: storageHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: MAX_BYTES,
      allowed_mime_types: Object.keys(MIME_EXTENSIONS),
    }),
  });
  if (!created.ok && created.status !== 409) throw await storageError(created, "Artwork storage could not be created.");
}

function storageConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) {
    const error = new Error("Artwork storage is not configured.");
    error.status = 503;
    error.code = "artwork_storage_not_configured";
    throw error;
  }
  return { url, key };
}

function storageHeaders(key, extra = {}) {
  return { apikey: key, ...extra };
}

async function storageError(response, fallback) {
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.message || body.error || fallback);
  error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
  error.code = body.errorCode || body.code || "artwork_storage_error";
  return error;
}

function safeSegment(value, max) {
  return String(value).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max);
}

function cleanName(value) {
  return String(value || "artwork").replace(/[\u0000-\u001f]/g, "").slice(0, 180);
}

function matchesImageSignature(bytes, contentType) {
  if (contentType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/webp") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  return false;
}

function artworkError(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = "invalid_artwork";
  return error;
}

module.exports = { uploadStoryArtwork };
