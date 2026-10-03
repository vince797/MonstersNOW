const crypto = require("node:crypto");
const { getStorybookProductVariant, validateStorybookPageCount } = require("./lulu-products");
const { DEMO_PURPOSE } = require("./storybook-print-files");

const DEFAULT_SIGNED_FILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SIGNATURE_VERSION = "2";
const ALLOWED_QUERY_KEYS = new Set(["type", "v", "purpose", "format", "page_count", "expires", "width_pt", "height_pt", "signature"]);

// Demo URLs intentionally contain no child names, identity, story IDs, selected
// monster IDs, or approvals. Never use this regeneration URL for fulfillment.
function buildSignedPrintFileUrl({ request, purpose, type, variant, pageCount, coverDimensions }) {
  if (purpose !== DEMO_PURPOSE) throw signedFileError("Only explicit sandbox-demo files may use the generated PDF route.");
  validateDemoSelection(type, variant?.id, pageCount);
  const params = new URLSearchParams({ type, v: SIGNATURE_VERSION, purpose: DEMO_PURPOSE, format: variant.id, page_count: String(pageCount), expires: String(Date.now() + DEFAULT_SIGNED_FILE_TTL_MS) });
  if (type === "cover") {
    validateCoverDimensions(coverDimensions?.width, coverDimensions?.height);
    params.set("width_pt", String(coverDimensions.width));
    params.set("height_pt", String(coverDimensions.height));
  }
  params.set("signature", signPrintFileParams(params));
  return `${getRequestBaseUrl(request)}/api/lulu-sandbox-storybook-order?${params.toString()}`;
}

function verifySignedPrintFileQuery(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (!ALLOWED_QUERY_KEYS.has(key) || Array.isArray(value) || typeof value !== "string") {
      throw signedFileError("Invalid or duplicate signed demo file parameter.");
    }
    params.set(key, value);
  }
  if (params.get("v") !== SIGNATURE_VERSION || params.get("purpose") !== DEMO_PURPOSE) {
    throw signedFileError("Legacy and production PDF regeneration links are disabled. Use an explicit sandbox demo.");
  }
  const expires = Number(params.get("expires"));
  if (!Number.isSafeInteger(expires) || expires <= Date.now() || expires > Date.now() + DEFAULT_SIGNED_FILE_TTL_MS) {
    throw signedFileError("Signed demo file URL has expired or has an invalid expiry.");
  }
  if (!safeEquals(params.get("signature"), signPrintFileParams(params))) throw signedFileError("Invalid signed demo file URL.");
  const pageCount = Number(params.get("page_count"));
  const type = params.get("type");
  validateDemoSelection(type, params.get("format"), pageCount);
  if (type === "cover") validateCoverDimensions(Number(params.get("width_pt")), Number(params.get("height_pt")));
  else if (params.has("width_pt") || params.has("height_pt")) throw signedFileError("Interior demo dimensions cannot be overridden.");
  return {
    purpose: DEMO_PURPOSE,
    type,
    submissionId: "synthetic-sandbox-demo",
    storyLabel: "Synthetic sandbox demonstration",
    styleLabel: "Generic demo shapes",
    childName: "Demo",
    monsterName: "Demo Monster",
    format: params.get("format"),
    pageCount,
    coverWidth: params.get("width_pt"),
    coverHeight: params.get("height_pt"),
  };
}

function validateDemoSelection(type, format, pageCount) {
  if (!["interior", "cover"].includes(type) || !["softcover", "hardcover"].includes(format)) throw signedFileError("Choose an explicit demo PDF type and format.");
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw signedFileError("Demo page count must be an integer.");
  validateStorybookPageCount(getStorybookProductVariant(format), pageCount);
}
function validateCoverDimensions(width, height) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) throw signedFileError("Demo cover dimensions must be positive point values.");
}
function signPrintFileParams(params) {
  const canonical = [...params.entries()].filter(([key]) => key !== "signature").sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  return crypto.createHmac("sha256", getPrintFileSecret()).update(canonical).digest("base64url");
}
function getPrintFileSecret() {
  const secret = process.env.STORYBOOK_PRINT_FILE_SECRET || process.env.LULU_SANDBOX_ENDPOINT_SECRET || "";
  if (!secret) {
    const error = new Error("STORYBOOK_PRINT_FILE_SECRET or LULU_SANDBOX_ENDPOINT_SECRET must be configured.");
    error.name = "PrintFileConfigError";
    error.status = 500;
    throw error;
  }
  return secret;
}
function getRequestBaseUrl() {
  // Never let an untrusted Host/forwarded header choose Lulu's pull destination.
  const configured = process.env.STORYBOOK_PRINT_FILE_BASE_URL || process.env.STORYBOOK_CHECKOUT_SITE_URL || process.env.SITE_URL || "";
  let url;
  try { url = new URL(configured); } catch { throw signedFileError("Configure a trusted HTTPS site origin for demo file URLs."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw signedFileError("Demo file base URL must be a trusted HTTPS origin.");
  return url.origin;
}
function safeEquals(received, expected) {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}
function signedFileError(message) {
  const error = new Error(message);
  error.name = "ValidationError";
  error.status = 403;
  return error;
}
module.exports = { buildSignedPrintFileUrl, verifySignedPrintFileQuery };
