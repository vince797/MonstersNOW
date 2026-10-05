const REVIEW_BUCKET = "customer-proofs";
const SIGNED_URL_TTL_SECONDS = 15 * 60;

const BOOK_REVIEW_FILES = Object.freeze([
  Object.freeze({
    id: "halloween-wheelchair-production-candidate-v2",
    storySlug: "halloween-monster-night",
    fileName: "halloween-monster-night-wheelchair-production-candidate-v2.pdf",
    storagePath: "editorial/halloween-monster-night/halloween-monster-night-wheelchair-production-candidate-v2.pdf",
    label: "Wheelchair production candidate v2",
    category: "Digital candidate",
    status: "Review required",
    description: "32-page, 300 DPI digital candidate. Final human approval and a physical proof are still required.",
    nextAction: "Review every spread, approve the final composition, then order a physical proof before print release.",
    pages: 32,
    size: 12933876,
    sha256: "56b30976ae88ae8bb498158219f19d573733ca81b89db9ea8ccc02dcd397309d",
  }),
  Object.freeze({
    id: "halloween-wheelchair-reference-review",
    storySlug: "halloween-monster-night",
    fileName: "halloween-monster-night-wheelchair-reference-review.pdf",
    storagePath: "editorial/halloween-monster-night/halloween-monster-night-wheelchair-reference-review.pdf",
    label: "Wheelchair reference review",
    category: "Visual reference",
    status: "Not print ready",
    description: "32-page wheelchair continuity and composition reference. Keep it as review material only.",
    nextAction: "Use this file to check wheelchair continuity and composition; do not send it to print.",
    pages: 32,
    size: 14854554,
    sha256: "9167c31db4f8cba0c41872ef5c1d06ce3d933658d99fae8d0cac6166556be955",
  }),
  Object.freeze({
    id: "halloween-reusable-master-backgrounds-pages-01-32-review",
    storySlug: "halloween-monster-night",
    fileName: "halloween-reusable-master-backgrounds-pages-01-32-review.pdf",
    storagePath: "editorial/halloween-monster-night/halloween-reusable-master-backgrounds-pages-01-32-review.pdf",
    label: "Reusable master backgrounds, pages 1–32",
    category: "Background review",
    status: "Not print ready",
    description: "32-page character-free background review. These plates were upscaled from 1254 px and are review material only, not verified print masters.",
    nextAction: "Review all character-free backgrounds and selected revisions; do not send this file to print.",
    pages: 32,
    size: 16677582,
    sha256: "8e1c8b09db417da4fbd75104dcc3a736388b52e4b4b8665f8cbadba45c4d917d",
  }),
]);

async function listBookReviewFiles(storySlug = "") {
  const files = BOOK_REVIEW_FILES.filter((file) => !storySlug || file.storySlug === storySlug);
  return Promise.all(files.map(async (file) => {
    const info = await getFileInfo(file.storagePath);
    if (!info) return publicFile(file, { uploaded: false });
    return publicFile(file, {
      uploaded: true,
      uploadedAt: info.updated_at || info.updatedAt || info.created_at || info.createdAt || null,
      storedSize: Number(info.metadata?.size || info.size || 0) || file.size,
      downloadUrl: await createSignedDownloadUrl(file),
    });
  }));
}

async function createBookReviewUpload(payload = {}) {
  const file = BOOK_REVIEW_FILES.find((item) => item.id === payload.id);
  if (!file) throw reviewFileError("Choose a known review file.");
  if (payload.name !== file.fileName) throw reviewFileError(`Choose ${file.fileName}.`);
  if (payload.type !== "application/pdf") throw reviewFileError("Choose the exact PDF review file.");
  if (Number(payload.size) !== file.size) throw reviewFileError("This PDF does not match the preserved review candidate.");
  if (String(payload.sha256 || "").toLowerCase() !== file.sha256) throw reviewFileError("This PDF does not match the preserved review candidate.");

  const existing = await getFileInfo(file.storagePath);
  if (existing) throw reviewFileError("This review PDF is already preserved. Open the saved file instead of replacing it.", 409, "review_file_exists");

  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/upload/sign/${REVIEW_BUCKET}/${encodeObjectPath(file.storagePath)}`, {
    method: "POST",
    headers: storageHeaders(key, { "Content-Type": "application/json", "x-upsert": "false" }),
    body: "{}",
  });
  if (!response.ok) throw await storageError(response, "The review upload could not be prepared.");
  const body = await response.json();
  if (!body.url) throw reviewFileError("The review upload could not be prepared.", 502, "review_storage_error");
  return {
    file: publicFile(file, { uploaded: false }),
    signedUrl: body.url.startsWith("http")
      ? body.url
      : `${url}/storage/v1${body.url.startsWith("/") ? body.url : `/${body.url}`}`,
  };
}

async function confirmBookReviewUpload(id) {
  const file = BOOK_REVIEW_FILES.find((item) => item.id === id);
  if (!file) throw reviewFileError("Choose a known review file.");
  const info = await getFileInfo(file.storagePath);
  if (!info) throw reviewFileError("The review PDF has not finished uploading.", 409, "review_file_missing");
  const storedSize = Number(info.metadata?.size || info.size || 0);
  if (storedSize && storedSize !== file.size) throw reviewFileError("The stored PDF size does not match the approved review file.", 409, "review_file_mismatch");
  return publicFile(file, {
    uploaded: true,
    uploadedAt: info.updated_at || info.updatedAt || info.created_at || info.createdAt || null,
    storedSize: storedSize || file.size,
    downloadUrl: await createSignedDownloadUrl(file),
  });
}

async function getFileInfo(path) {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/info/${REVIEW_BUCKET}/${encodeObjectPath(path)}`, {
    headers: storageHeaders(key),
  });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw await storageError(response, "Review storage is unavailable.");
  return response.json();
}

async function createSignedDownloadUrl(file) {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/sign/${REVIEW_BUCKET}/${encodeObjectPath(file.storagePath)}`, {
    method: "POST",
    headers: storageHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
  });
  if (!response.ok) throw await storageError(response, "The review PDF could not be opened.");
  const body = await response.json();
  const signedPath = body.signedURL || body.signedUrl;
  if (!signedPath) throw reviewFileError("The review PDF could not be opened.", 502, "review_storage_error");
  return `${url}/storage/v1${signedPath.startsWith("/") ? signedPath : `/${signedPath}`}`;
}

function publicFile(file, state) {
  return {
    id: file.id,
    storySlug: file.storySlug,
    fileName: file.fileName,
    label: file.label,
    category: file.category,
    status: file.status,
    description: file.description,
    nextAction: file.nextAction,
    pages: file.pages,
    size: file.size,
    sha256: file.sha256,
    ...state,
  };
}

function storageConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw reviewFileError("Review storage is not configured.", 503, "review_storage_not_configured");
  return { url, key };
}

function storageHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

function encodeObjectPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function storageError(response, fallback) {
  const body = await response.json().catch(() => ({}));
  return reviewFileError(body.message || body.error || fallback, response.status < 500 ? response.status : 502, body.errorCode || body.code || "review_storage_error");
}

function reviewFileError(message, status = 400, code = "invalid_review_file") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

module.exports = { BOOK_REVIEW_FILES, confirmBookReviewUpload, createBookReviewUpload, listBookReviewFiles };
