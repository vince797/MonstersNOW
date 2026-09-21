const DEFAULT_MAX_JSON_BYTES = 1024 * 1024;

async function readJsonBody(request, { maxBytes = DEFAULT_MAX_JSON_BYTES } = {}) {
  const declaredLength = Number(getHeader(request, "content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw bodyTooLargeError(maxBytes);

  if (Buffer.isBuffer(request.body)) {
    if (request.body.length > maxBytes) throw bodyTooLargeError(maxBytes);
    const rawBody = request.body.toString("utf8").trim();
    return rawBody ? JSON.parse(rawBody) : {};
  }

  if (typeof request.body === "string") {
    if (Buffer.byteLength(request.body) > maxBytes) throw bodyTooLargeError(maxBytes);
    return request.body.trim() ? JSON.parse(request.body) : {};
  }

  if (request.body && typeof request.body === "object") {
    if (Buffer.byteLength(JSON.stringify(request.body)) > maxBytes) throw bodyTooLargeError(maxBytes);
    return request.body;
  }

  const chunks = [];
  let bytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) throw bodyTooLargeError(maxBytes);
    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  return rawBody ? JSON.parse(rawBody) : {};
}

function getHeader(request, name) {
  if (request.headers?.get) return request.headers.get(name) || "";
  return request.headers?.[name] || request.headers?.[name.toLowerCase()] || "";
}

function bodyTooLargeError(maxBytes) {
  const error = new Error(`Request body exceeds the ${Math.ceil(maxBytes / 1024 / 1024)} MB limit.`);
  error.name = "RequestBodyError";
  error.status = 413;
  error.code = "request_body_too_large";
  return error;
}

function sendJson(response, status, payload) {
  response.status(status).json(payload);
}

function rejectUnsupportedMethod(request, response, methods) {
  response.setHeader("Allow", methods.join(", "));
  sendJson(response, 405, { error: "Method not allowed" });
}

module.exports = {
  readJsonBody,
  rejectUnsupportedMethod,
  sendJson,
};
