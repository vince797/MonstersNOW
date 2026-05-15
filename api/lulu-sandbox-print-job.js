const {
  assertSandboxEndpointSecret,
  getSandboxConfig,
  luluErrorToResponse,
  luluSandboxRequest,
} = require("../lib/lulu-sandbox");
const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const {
  buildPrintJobPayload,
  validationErrorToResponse,
} = require("../lib/lulu-payloads");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return rejectUnsupportedMethod(request, response, ["POST"]);
  }

  try {
    assertSandboxEndpointSecret(request, { required: true });

    const payload = buildPrintJobPayload(await readJsonBody(request), getSandboxConfig());
    const result = await luluSandboxRequest("/print-jobs/", {
      method: "POST",
      body: payload,
    });

    return sendJson(response, 201, {
      printJob: result.data,
      request: payload,
    });
  } catch (error) {
    const { status, payload } =
      error.name === "ValidationError" ? validationErrorToResponse(error) : luluErrorToResponse(error);

    return sendJson(response, status, payload);
  }
};
