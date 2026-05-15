const {
  assertSandboxEndpointSecret,
  luluErrorToResponse,
  luluSandboxRequest,
} = require("../lib/lulu-sandbox");
const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const {
  buildCoverDimensionsPayload,
  validationErrorToResponse,
} = require("../lib/lulu-payloads");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return rejectUnsupportedMethod(request, response, ["POST"]);
  }

  try {
    assertSandboxEndpointSecret(request);

    const payload = buildCoverDimensionsPayload(await readJsonBody(request));
    const result = await luluSandboxRequest("/cover-dimensions/", {
      method: "POST",
      body: payload,
    });

    return sendJson(response, 200, {
      dimensions: result.data,
      request: payload,
    });
  } catch (error) {
    const { status, payload } =
      error.name === "ValidationError" ? validationErrorToResponse(error) : luluErrorToResponse(error);

    return sendJson(response, status, payload);
  }
};
