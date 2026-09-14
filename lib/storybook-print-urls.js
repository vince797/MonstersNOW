const crypto = require("node:crypto");

const DEFAULT_SIGNED_FILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SIGNATURE_VERSION = "1";

function buildSignedPrintFileUrl({ request, type, submission, variant, pageCount, coverDimensions }) {
  const baseUrl = getRequestBaseUrl(request);
  const params = new URLSearchParams({
    type,
    v: SIGNATURE_VERSION,
    submission_id: normalizeParam(submission.submissionId || submission.submission_id, "storybook"),
    story_label: normalizeParam(submission.storyLabel || submission.story_label, "My Monster Storybook"),
    style_label: normalizeParam(submission.styleLabel || submission.style_label, "Soft 3D Storybook Monster"),
    format: normalizeParam(variant.id, "softcover"),
    page_count: String(pageCount),
    expires: String(Date.now() + DEFAULT_SIGNED_FILE_TTL_MS),
  });

  if (type === "cover") {
    params.set("width_pt", String(coverDimensions.width));
    params.set("height_pt", String(coverDimensions.height));
  }

  params.set("signature", signPrintFileParams(params));

  return `${baseUrl}/api/storybook-print-file?${params.toString()}`;
}

function verifySignedPrintFileQuery(query) {
  const params = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      params.set(key, value[0] || "");
      return;
    }

    params.set(key, value === undefined || value === null ? "" : String(value));
  });

  const signature = params.get("signature") || "";
  const expectedSignature = signPrintFileParams(params);
  const expires = Number.parseInt(params.get("expires"), 10);

  if (!Number.isFinite(expires) || expires < Date.now()) {
    const error = new Error("Signed print file URL has expired.");
    error.status = 403;
    throw error;
  }

  if (!safeEquals(signature, expectedSignature)) {
    const error = new Error("Invalid signed print file URL.");
    error.status = 403;
    throw error;
  }

  return {
    type: params.get("type"),
    submissionId: params.get("submission_id"),
    storyLabel: params.get("story_label"),
    styleLabel: params.get("style_label"),
    format: params.get("format"),
    pageCount: params.get("page_count"),
    coverWidth: params.get("width_pt"),
    coverHeight: params.get("height_pt"),
  };
}

function signPrintFileParams(params) {
  const secret = getPrintFileSecret();
  const canonical = [...params.entries()]
    .filter(([key]) => key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  return crypto.createHmac("sha256", secret).update(canonical).digest("base64url");
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

function getRequestBaseUrl(request) {
  const configured = stripTrailingSlash(
    process.env.STORYBOOK_PRINT_FILE_BASE_URL ||
      process.env.STORYBOOK_CHECKOUT_SITE_URL ||
      process.env.SITE_URL ||
      "",
  );

  if (configured) {
    return configured;
  }

  const host = getHeader(request, "x-forwarded-host") || getHeader(request, "host");

  if (!host) {
    const error = new Error("A public site URL is required to generate Lulu print file URLs.");
    error.status = 500;
    throw error;
  }

  const protocol = getHeader(request, "x-forwarded-proto") || "https";
  return `${protocol}://${host}`;
}

function getHeader(request, name) {
  if (request.headers?.get) {
    return request.headers.get(name) || "";
  }

  return request.headers?.[name.toLowerCase()] || request.headers?.[name] || "";
}

function normalizeParam(value, fallback) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function safeEquals(received, expected) {
  if (!received || !expected) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

module.exports = {
  buildSignedPrintFileUrl,
  verifySignedPrintFileQuery,
};
