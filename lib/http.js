async function readJsonBody(request) {
  if (Buffer.isBuffer(request.body)) {
    const rawBody = request.body.toString("utf8").trim();
    return rawBody ? JSON.parse(rawBody) : {};
  }

  if (typeof request.body === "string") {
    return request.body.trim() ? JSON.parse(request.body) : {};
  }

  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  return rawBody ? JSON.parse(rawBody) : {};
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
