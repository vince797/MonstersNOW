const {
  assertSandboxEndpointSecret,
  luluErrorToResponse,
} = require("../lib/lulu-sandbox");
const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const { validationErrorToResponse } = require("../lib/lulu-payloads");
const { prepareLuluSandboxStorybookOrder } = require("../lib/storybook-lulu-order");
const {
  createStorybookCoverPdf,
  createStorybookInteriorPdf,
} = require("../lib/storybook-print-files");
const { verifySignedPrintFileQuery } = require("../lib/storybook-print-urls");

module.exports = async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") {
    return rejectUnsupportedMethod(request, response, ["GET", "POST"]);
  }

  try {
    if (request.method === "GET") {
      return sendSignedPrintFile(request, response);
    }

    assertSandboxEndpointSecret(request, { required: true });

    const result = await prepareLuluSandboxStorybookOrder(await readJsonBody(request), request);

    return sendJson(response, result.submittedPrintJob ? 201 : 202, result);
  } catch (error) {
    const { status, payload } =
      error.name === "ValidationError" ? validationErrorToResponse(error) : luluErrorToResponse(error);

    return sendJson(response, status, payload);
  }
};

function sendSignedPrintFile(request, response) {
  const fileRequest = verifySignedPrintFileQuery(request.query || {});

  if (fileRequest.type !== "cover" && fileRequest.type !== "interior") {
    return response.status(400).json({ error: "type must be cover or interior." });
  }

  const pdf =
    fileRequest.type === "cover"
      ? createStorybookCoverPdf(fileRequest)
      : createStorybookInteriorPdf(fileRequest);
  const filename = `monstersnow-${fileRequest.submissionId || "storybook"}-${fileRequest.type}.pdf`;

  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(filename)}"`);
  response.setHeader("Cache-Control", "private, no-store");
  return response.status(200).send(pdf);
}

function sanitizeFilename(value) {
  return String(value || "monstersnow-storybook.pdf").replace(/[^a-zA-Z0-9._-]+/g, "-");
}
