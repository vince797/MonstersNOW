const crypto = require("node:crypto");

function assertAdminRequest(request) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const received = getHeader(request, "x-admin-password");

  if (!expected) {
    throw adminAuthError("Admin access is not configured.", 503, "admin_not_configured");
  }

  if (!safeEqual(received, expected)) {
    throw adminAuthError("Incorrect admin password.", 401, "invalid_admin_password");
  }
}

function safeEqual(received, expected) {
  const receivedDigest = crypto.createHash("sha256").update(String(received)).digest();
  const expectedDigest = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(receivedDigest, expectedDigest);
}

function getHeader(request, name) {
  if (request.headers?.get) return request.headers.get(name) || "";
  return request.headers?.[name] || request.headers?.[name.toLowerCase()] || "";
}

function adminAuthError(message, status, code) {
  const error = new Error(message);
  error.name = "AdminAuthError";
  error.status = status;
  error.code = code;
  return error;
}

module.exports = { assertAdminRequest };
