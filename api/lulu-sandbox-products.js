const {
  getStorybookPricingSummary,
  getStorybookProductVariants,
} = require("../lib/lulu-products");
const {
  assertSandboxEndpointSecret,
  luluErrorToResponse,
  luluSandboxRequest,
} = require("../lib/lulu-sandbox");
const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const {
  buildCostPayload,
  buildCoverDimensionsPayload,
  validationErrorToResponse,
} = require("../lib/lulu-payloads");

module.exports = async function handler(request, response) {
  const resource = firstQueryValue(request.query?.resource);

  if (resource === "cost") {
    return handleCost(request, response);
  }

  if (resource === "cover-dimensions") {
    return handleCoverDimensions(request, response);
  }

  if (request.method !== "GET") {
    return rejectUnsupportedMethod(request, response, ["GET"]);
  }

  return sendJson(response, 200, {
    pricing: getStorybookPricingSummary(),
    products: getStorybookProductVariants(),
  });
};

async function handleCost(request, response) {
  if (request.method !== "POST") {
    return rejectUnsupportedMethod(request, response, ["POST"]);
  }

  try {
    assertSandboxEndpointSecret(request);
    const payload = buildCostPayload(await readJsonBody(request));
    const result = await luluSandboxRequest("/print-job-cost-calculations/", {
      method: "POST",
      body: payload,
    });

    return sendJson(response, 200, { cost: result.data, request: payload });
  } catch (error) {
    return sendLuluError(response, error);
  }
}

async function handleCoverDimensions(request, response) {
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

    return sendJson(response, 200, { dimensions: result.data, request: payload });
  } catch (error) {
    return sendLuluError(response, error);
  }
}

function sendLuluError(response, error) {
  const { status, payload } =
    error.name === "ValidationError" ? validationErrorToResponse(error) : luluErrorToResponse(error);

  return sendJson(response, status, payload);
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}
