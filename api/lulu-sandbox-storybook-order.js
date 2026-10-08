const {
  assertSandboxEndpointSecret,
  luluErrorToResponse,
} = require("../lib/lulu-sandbox");
const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const { validationErrorToResponse } = require("../lib/lulu-payloads");
const { prepareLuluSandboxStorybookOrder } = require("../lib/storybook-lulu-order");
const { verifySignedPrintFileQuery } = require("../lib/storybook-print-urls");

module.exports = async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") {
    return rejectUnsupportedMethod(request, response, ["GET", "POST"]);
  }

  try {
    if (request.method === "GET") {
      return await sendSignedPrintFile(request, response);
    }

    assertSandboxEndpointSecret(request, { required: true });

    const result = await prepareLuluSandboxStorybookOrder(await readJsonBody(request), request);

    return sendJson(response, result.submittedPrintJob ? 201 : 202, result);
  } catch (error) {
    const { status, payload } =
      error.name === "ValidationError" || error.name === "ProductionError" || isSignedUrlError(error)
        ? validationErrorToResponse(error)
        : luluErrorToResponse(error);

    if (response.headersSent) return response.end();
    return sendJson(response, status, payload);
  }
};

// Streams the rendered PDF in chunks: full 300 PPI interiors are tens of MB,
// far above the 4.5 MB buffered-response limit of a Vercel Function.
async function sendSignedPrintFile(request, response) {
  const fileRequest = verifySignedPrintFileQuery(request.query || {});

  if (fileRequest.type !== "cover" && fileRequest.type !== "interior") {
    return response.status(400).json({ error: "type must be cover or interior." });
  }

  // Load the native-canvas compositor only for file requests so the POST
  // order-preparation path never depends on it.
  const { renderPrintFileForRequest } = require("../lib/storybook-print-job");
  const { pdf, report } = await renderPrintFileForRequest(fileRequest, { mode: "proof" });
  const filename = `monstersnow-${fileRequest.submissionId || "storybook"}-${fileRequest.type}.pdf`;

  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(filename)}"`);
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Content-Length", String(pdf.length));
  response.setHeader("X-MonstersNOW-Renderer", report.renderer);
  response.setHeader("X-MonstersNOW-Print-Blockers", String(report.blockers.length));
  response.statusCode = 200;
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < pdf.length; offset += chunkSize) {
    const chunk = pdf.subarray(offset, offset + chunkSize);
    if (!response.write(chunk)) await new Promise((resolve) => response.once("drain", resolve));
  }
  return response.end();
}

// Expired or tampered print-file URLs carry status 403 and must not surface as 500s.
function isSignedUrlError(error) {
  return error instanceof Error && error.constructor === Error && error.status === 403;
}

function sanitizeFilename(value) {
  return String(value || "monstersnow-storybook.pdf").replace(/[^a-zA-Z0-9._-]+/g, "-");
}
