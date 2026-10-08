const crypto = require("node:crypto");

// Basic brute-force protection for the shared admin password. Failed attempts
// are counted per client IP in memory, so the limit applies per warm function
// instance. That is enough to slow password guessing without new
// infrastructure. A durable limiter (Vercel WAF rule or a database counter) is
// still the production recommendation.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;
const MAX_TRACKED_CLIENTS = 5000;
const failedAttempts = new Map();

function assertAdminRequest(request) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const received = getHeader(request, "x-admin-password");

  if (!expected) {
    throw adminAuthError("Admin access is not configured.", 503, "admin_not_configured");
  }

  const client = clientKey(request);
  const now = Date.now();
  const attempts = recentFailures(client, now);
  if (attempts.length >= MAX_FAILED_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((attempts[0] + LOGIN_WINDOW_MS - now) / 1000));
    const error = adminAuthError("Too many incorrect password attempts. Wait a few minutes and try again.", 429, "admin_rate_limited");
    error.retryAfterSeconds = retryAfterSeconds;
    throw error;
  }

  if (!safeEqual(received, expected)) {
    recordFailure(client, attempts, now);
    throw adminAuthError("Incorrect admin password.", 401, "invalid_admin_password");
  }

  failedAttempts.delete(client);
}

function recentFailures(client, now) {
  const attempts = (failedAttempts.get(client) || []).filter((time) => now - time < LOGIN_WINDOW_MS);
  if (attempts.length) failedAttempts.set(client, attempts);
  else failedAttempts.delete(client);
  return attempts;
}

function recordFailure(client, attempts, now) {
  if (!failedAttempts.has(client) && failedAttempts.size >= MAX_TRACKED_CLIENTS) {
    // Drop the oldest tracked client so memory stays bounded.
    failedAttempts.delete(failedAttempts.keys().next().value);
  }
  failedAttempts.set(client, [...attempts, now]);
}

function clientKey(request) {
  const forwarded = getHeader(request, "x-vercel-forwarded-for")
    || getHeader(request, "x-forwarded-for")
    || getHeader(request, "x-real-ip")
    || request?.socket?.remoteAddress
    || "unknown";
  return String(forwarded).split(",")[0].trim().slice(0, 64) || "unknown";
}

/** Sets Retry-After on rate-limited admin responses. */
function applyAdminAuthHeaders(response, error) {
  if (error?.retryAfterSeconds && typeof response?.setHeader === "function") {
    response.setHeader("Retry-After", String(error.retryAfterSeconds));
  }
}

function safeEqual(received, expected) {
  const receivedDigest = crypto.createHash("sha256").update(String(received)).digest();
  const expectedDigest = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(receivedDigest, expectedDigest);
}

function getHeader(request, name) {
  if (request?.headers?.get) return request.headers.get(name) || "";
  return request?.headers?.[name] || request?.headers?.[name.toLowerCase()] || "";
}

function adminAuthError(message, status, code) {
  const error = new Error(message);
  error.name = "AdminAuthError";
  error.status = status;
  error.code = code;
  return error;
}

function resetAdminRateLimit() {
  failedAttempts.clear();
}

module.exports = { applyAdminAuthHeaders, assertAdminRequest, resetAdminRateLimit };
