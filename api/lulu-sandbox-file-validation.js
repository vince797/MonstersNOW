const {
  assertSandboxEndpointSecret,
  luluErrorToResponse,
  luluSandboxRequest,
} = require("../lib/lulu-sandbox");
const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const {
  buildFileValidationPayload,
  getFileValidationReadPath,
  validationErrorToResponse,
} = require("../lib/lulu-payloads");

module.exports = async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") {
    return rejectUnsupportedMethod(request, response, ["GET", "POST"]);
  }

  try {
    assertSandboxEndpointSecret(request);

    if (request.method === "GET") {
      const result = await luluSandboxRequest(getFileValidationReadPath(request.query || {}));
      return sendJson(response, 200, { validation: result.data });
    }

    const validation = buildFileValidationPayload(await readJsonBody(request));
    const result = await luluSandboxRequest(validation.endpoint, {
      method: "POST",
      body: validation.body,
    });

    return sendJson(response, 201, {
      validation: result.data,
    });
  } catch (error) {
    const { status, payload } =
      error.name === "ValidationError" ? validationErrorToResponse(error) : luluErrorToResponse(error);

    return sendJson(response, status, payload);
  }
};
