const crypto = require("node:crypto");
const { supabaseRequest } = require("./story-library");

const BUCKET = "monster-submissions";
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function createMonsterSubmission(payload = {}) {
  const image = parseImage(payload.drawing, "Upload a JPG, PNG, or WebP drawing under 6 MB.");
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("base64url");
  const originalPath = `${id}/original-${Date.now()}.${MIME_EXTENSIONS[image.contentType]}`;
  const row = {
    id,
    access_token_hash: hashToken(token),
    source_filename: cleanName(payload.filename || "monster-drawing"),
    original_path: originalPath,
    updated_at: new Date().toISOString(),
  };

  await supabaseRequest("/monster_submissions", {
    method: "POST",
    body: [row],
    prefer: "return=minimal",
  });

  try {
    await uploadPrivateImage(originalPath, image);
  } catch (error) {
    await supabaseRequest(`/monster_submissions?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    throw error;
  }

  return { id, token, status: "draft" };
}

async function startMonsterPreview({ submissionId, token, variationNumber, styleId, model }) {
  await requireSubmission(submissionId, token);
  const variation = Number.parseInt(variationNumber, 10);
  if (!Number.isInteger(variation) || variation < 1 || variation > 3) throw submissionError("Choose preview 1, 2, or 3.");

  const existing = await supabaseRequest(
    `/monster_previews?submission_id=eq.${encodeURIComponent(submissionId)}&variation_number=eq.${variation}&select=*`,
  );
  if (existing[0]?.status === "complete" || existing[0]?.status === "pending") {
    const error = submissionError("This preview version already exists.");
    error.status = 409;
    error.code = "preview_already_exists";
    throw error;
  }

  if (existing[0]) {
    const rows = await supabaseRequest(`/monster_previews?id=eq.${encodeURIComponent(existing[0].id)}`, {
      method: "PATCH",
      body: { status: "pending", error_code: null, style_id: styleId, model, completed_at: null },
      prefer: "return=representation",
    });
    return rows[0];
  }

  const rows = await supabaseRequest("/monster_previews", {
    method: "POST",
    body: [{
      submission_id: submissionId,
      variation_number: variation,
      style_id: String(styleId || "storybook").slice(0, 80),
      model: String(model || "unknown").slice(0, 120),
      status: "pending",
    }],
    prefer: "return=representation",
  });
  return rows[0];
}

async function completeMonsterPreview({ submissionId, token, previewId, monsterImage, coloringPage }) {
  await requireSubmission(submissionId, token);
  const preview = await getOwnedPreview(submissionId, previewId);
  const monster = parseImage(monsterImage, "The generated monster image could not be saved.");
  const previewPath = `${submissionId}/previews/${previewId}.${MIME_EXTENSIONS[monster.contentType]}`;
  await uploadPrivateImage(previewPath, monster);

  let coloringPagePath = null;
  if (coloringPage) {
    const coloring = parseImage(coloringPage, "The generated coloring page could not be saved.");
    coloringPagePath = `${submissionId}/coloring/${previewId}.${MIME_EXTENSIONS[coloring.contentType]}`;
    await uploadPrivateImage(coloringPagePath, coloring);
  }

  const rows = await supabaseRequest(`/monster_previews?id=eq.${encodeURIComponent(preview.id)}`, {
    method: "PATCH",
    body: {
      status: "complete",
      preview_path: previewPath,
      coloring_page_path: coloringPagePath,
      error_code: null,
      completed_at: new Date().toISOString(),
    },
    prefer: "return=representation",
  });
  return rows[0];
}

async function failMonsterPreview({ submissionId, previewId, code }) {
  if (!submissionId || !previewId) return;
  await supabaseRequest(`/monster_previews?id=eq.${encodeURIComponent(previewId)}&submission_id=eq.${encodeURIComponent(submissionId)}`, {
    method: "PATCH",
    body: { status: "error", error_code: String(code || "generation_failed").slice(0, 120), completed_at: new Date().toISOString() },
    prefer: "return=minimal",
  }).catch(() => {});
}

async function finalizeMonsterSubmission(payload = {}) {
  const submission = await requireSubmission(payload.submissionId, payload.token);
  const preview = await getOwnedPreview(submission.id, payload.selectedPreviewId);
  if (preview.status !== "complete") throw submissionError("Choose a completed monster preview.");
  const featurePermission = payload.featurePermission && typeof payload.featurePermission === "object" ? payload.featurePermission : {};
  const rows = await supabaseRequest(`/monster_submissions?id=eq.${encodeURIComponent(submission.id)}`, {
    method: "PATCH",
    body: {
      status: "ready",
      selected_preview_id: preview.id,
      customer_email: cleanText(payload.email, 320),
      child_name: cleanText(payload.childName, 40),
      monster_name: cleanText(payload.monsterName, 40),
      story_id: cleanText(payload.storyId, 120),
      format_id: payload.format === "hardcover" ? "hardcover" : "softcover",
      feature_permission: featurePermission,
      updated_at: new Date().toISOString(),
    },
    prefer: "return=representation",
  });
  return { id: rows[0].id, selectedPreviewId: rows[0].selected_preview_id, status: rows[0].status };
}

async function requireSubmission(id, token) {
  if (!isUuid(id) || typeof token !== "string" || token.length < 32) throw unauthorizedError();
  const rows = await supabaseRequest(`/monster_submissions?id=eq.${encodeURIComponent(id)}&select=*`);
  const row = rows[0];
  if (!row || !safeEqual(row.access_token_hash, hashToken(token)) || new Date(row.expires_at).getTime() < Date.now()) throw unauthorizedError();
  return row;
}

async function getOwnedPreview(submissionId, previewId) {
  if (!isUuid(previewId)) throw submissionError("Choose a valid monster preview.");
  const rows = await supabaseRequest(`/monster_previews?id=eq.${encodeURIComponent(previewId)}&submission_id=eq.${encodeURIComponent(submissionId)}&select=*`);
  if (!rows[0]) throw submissionError("That monster preview was not found.");
  return rows[0];
}

async function getAdminMonsterAssets(submissionId) {
  if (!isUuid(submissionId)) return null;
  const submissions = await supabaseRequest(`/monster_submissions?id=eq.${encodeURIComponent(submissionId)}&select=*`);
  if (!submissions[0]) return null;
  const previews = await supabaseRequest(`/monster_previews?submission_id=eq.${encodeURIComponent(submissionId)}&select=*&order=variation_number.asc`);
  const selected = previews.find((preview) => preview.id === submissions[0].selected_preview_id) || null;
  return {
    originalUrl: await createSignedUrl(submissions[0].original_path),
    selectedPreviewUrl: await createSignedUrl(selected?.preview_path),
    coloringPageUrl: await createSignedUrl(selected?.coloring_page_path),
    previews: await Promise.all(previews.filter((preview) => preview.preview_path).map(async (preview) => ({
      id: preview.id,
      variationNumber: preview.variation_number,
      styleId: preview.style_id,
      url: await createSignedUrl(preview.preview_path),
    }))),
  };
}

async function listAdminMonsters() {
  const submissions = await supabaseRequest(
    "/monster_submissions?select=id,status,source_filename,selected_preview_id,customer_email,child_name,monster_name,story_id,format_id,feature_permission,created_at,updated_at&order=updated_at.desc",
  );
  const previews = await supabaseRequest(
    "/monster_previews?select=id,submission_id,variation_number,style_id,status,preview_path,coloring_page_path,created_at&order=variation_number.asc",
  );
  const orders = await supabaseRequest(
    "/storybook_orders?select=id,monster_submission_id,story_label,status,created_at&monster_submission_id=not.is.null&order=created_at.desc",
  );
  const previewsBySubmission = new Map();
  const ordersBySubmission = new Map();
  previews.forEach((preview) => {
    if (!previewsBySubmission.has(preview.submission_id)) previewsBySubmission.set(preview.submission_id, []);
    previewsBySubmission.get(preview.submission_id).push(preview);
  });
  orders.forEach((order) => {
    if (!ordersBySubmission.has(order.monster_submission_id)) ordersBySubmission.set(order.monster_submission_id, []);
    ordersBySubmission.get(order.monster_submission_id).push(order);
  });

  return Promise.all(submissions.map(async (submission) => {
    const submissionPreviews = previewsBySubmission.get(submission.id) || [];
    const explicitlySelected = submissionPreviews.find((preview) => preview.id === submission.selected_preview_id) || null;
    const selected = explicitlySelected || [...submissionPreviews].reverse().find((preview) => preview.status === "complete") || null;
    return {
      id: submission.id,
      status: submission.status,
      sourceFilename: submission.source_filename,
      customerEmail: submission.customer_email,
      childName: submission.child_name,
      monsterName: submission.monster_name,
      storyId: submission.story_id,
      formatId: submission.format_id,
      featurePermission: submission.feature_permission || {},
      createdAt: submission.created_at,
      updatedAt: submission.updated_at,
      originalUrl: await createSignedUrl(submission.original_path),
      selectedPreviewUrl: await createSignedUrl(selected?.preview_path),
      coloringPageUrl: await createSignedUrl(selected?.coloring_page_path),
      selectedStyleId: selected?.style_id || null,
      hasSelectedPreview: Boolean(explicitlySelected),
      previewCount: submissionPreviews.filter((preview) => preview.status === "complete").length,
      orders: ordersBySubmission.get(submission.id) || [],
    };
  }));
}

async function deleteAdminMonster(submissionId) {
  if (!isUuid(submissionId)) throw submissionError("Choose a valid saved monster.");
  const submissions = await supabaseRequest(`/monster_submissions?id=eq.${encodeURIComponent(submissionId)}&select=id,original_path`);
  if (!submissions[0]) return false;
  const previews = await supabaseRequest(
    `/monster_previews?submission_id=eq.${encodeURIComponent(submissionId)}&select=preview_path,coloring_page_path`,
  );
  const paths = [
    submissions[0].original_path,
    ...previews.flatMap((preview) => [preview.preview_path, preview.coloring_page_path]),
  ].filter(Boolean);
  if (paths.length) await deletePrivateImages(paths);
  await supabaseRequest(`/monster_submissions?id=eq.${encodeURIComponent(submissionId)}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
  return true;
}

async function uploadPrivateImage(objectPath, image) {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${encodeObjectPath(objectPath)}`, {
    method: "POST",
    headers: storageHeaders(key, { "Content-Type": image.contentType, "Cache-Control": "3600", "x-upsert": "false" }),
    body: image.bytes,
  });
  if (!response.ok) throw await storageError(response, "Customer artwork could not be saved.");
}

async function deletePrivateImages(objectPaths) {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: storageHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: [...new Set(objectPaths)] }),
  });
  if (!response.ok) throw await storageError(response, "Customer artwork could not be deleted.");
}

async function createSignedUrl(objectPath) {
  if (!objectPath) return null;
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${encodeObjectPath(objectPath)}`, {
    method: "POST",
    headers: storageHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
  });
  if (!response.ok) throw await storageError(response, "Customer artwork could not be opened.");
  const body = await response.json();
  const signedPath = body.signedURL || body.signedUrl;
  return signedPath ? `${url}/storage/v1${signedPath.startsWith("/") ? signedPath : `/${signedPath}`}` : null;
}

function parseImage(value, message) {
  const match = typeof value === "string" && value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw submissionError(message);
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || !matchesImageSignature(bytes, match[1])) throw submissionError(message);
  return { contentType: match[1], bytes };
}

function storageConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) {
    const error = new Error("Monster storage is not configured.");
    error.status = 503;
    error.code = "monster_storage_not_configured";
    throw error;
  }
  return { url, key };
}

function storageHeaders(key, extra = {}) { return { apikey: key, Authorization: `Bearer ${key}`, ...extra }; }
function hashToken(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function safeEqual(left, right) { const a = Buffer.from(String(left)); const b = Buffer.from(String(right)); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "")); }
function cleanName(value) { return String(value || "drawing").replace(/[\u0000-\u001f]/g, "").slice(0, 180); }
function cleanText(value, max) { return typeof value === "string" ? value.trim().slice(0, max) || null : null; }
function encodeObjectPath(value) { return String(value).split("/").map(encodeURIComponent).join("/"); }
function matchesImageSignature(bytes, type) {
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  return false;
}
async function storageError(response, fallback) { const body = await response.json().catch(() => ({})); const error = new Error(body.message || body.error || fallback); error.status = response.status < 500 ? response.status : 502; error.code = body.errorCode || body.code || "monster_storage_error"; return error; }
function submissionError(message) { const error = new Error(message); error.status = 400; error.code = "invalid_monster_submission"; return error; }
function unauthorizedError() { const error = new Error("This monster submission is unavailable or expired."); error.status = 403; error.code = "invalid_submission_token"; return error; }

module.exports = {
  completeMonsterPreview,
  createMonsterSubmission,
  deleteAdminMonster,
  failMonsterPreview,
  finalizeMonsterSubmission,
  getAdminMonsterAssets,
  listAdminMonsters,
  requireSubmission,
  startMonsterPreview,
};
