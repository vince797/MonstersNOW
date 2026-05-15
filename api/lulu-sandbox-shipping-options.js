const {
  assertSandboxEndpointSecret,
  luluErrorToResponse,
  luluSandboxRequest,
} = require("../lib/lulu-sandbox");
const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const {
  buildShippingOptionsPayload,
  validationErrorToResponse,
} = require("../lib/lulu-payloads");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return rejectUnsupportedMethod(request, response, ["POST"]);
  }

  try {
    assertSandboxEndpointSecret(request);

    const payload = buildShippingOptionsPayload(await readJsonBody(request));
    const result = await luluSandboxRequest("/shipping-options/", {
      method: "POST",
      body: payload,
    });

    return sendJson(response, 200, {
      request: payload,
      options: result.data,
    });
  } catch (error) {
    const { status, payload } =
      error.name === "ValidationError" ? validationErrorToResponse(error) : luluErrorToResponse(error);

    return sendJson(response, status, payload);
  }
};
