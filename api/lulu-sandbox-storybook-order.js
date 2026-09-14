const {
  assertSandboxEndpointSecret,
  luluErrorToResponse,
} = require("../lib/lulu-sandbox");
const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const { validationErrorToResponse } = require("../lib/lulu-payloads");
const { prepareLuluSandboxStorybookOrder } = require("../lib/storybook-lulu-order");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return rejectUnsupportedMethod(request, response, ["POST"]);
  }

  try {
    assertSandboxEndpointSecret(request, { required: true });

    const result = await prepareLuluSandboxStorybookOrder(await readJsonBody(request), request);

    return sendJson(response, result.submittedPrintJob ? 201 : 202, result);
  } catch (error) {
    const { status, payload } =
      error.name === "ValidationError" ? validationErrorToResponse(error) : luluErrorToResponse(error);

    return sendJson(response, status, payload);
  }
};
