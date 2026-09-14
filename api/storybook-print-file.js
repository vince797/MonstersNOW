const { rejectUnsupportedMethod } = require("../lib/http");
const {
  createStorybookCoverPdf,
  createStorybookInteriorPdf,
} = require("../lib/storybook-print-files");
const { verifySignedPrintFileQuery } = require("../lib/storybook-print-urls");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    return rejectUnsupportedMethod(request, response, ["GET"]);
  }

  try {
    const fileRequest = verifySignedPrintFileQuery(request.query || {});

    if (fileRequest.type !== "cover" && fileRequest.type !== "interior") {
      return response.status(400).json({ error: "type must be cover or interior." });
    }

    const pdf =
      fileRequest.type === "cover"
        ? createStorybookCoverPdf(fileRequest)
        : createStorybookInteriorPdf(fileRequest);
    const filename = `monstersnow-${fileRequest.submissionId || "storybook"}-${fileRequest.type || "interior"}.pdf`;

    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(filename)}"`);
    response.setHeader("Cache-Control", "private, no-store");
    response.status(200).send(pdf);
  } catch (error) {
    const status = error.status || (error.name === "ValidationError" ? 400 : 500);

    response.status(status).json({
      error: status === 500 ? "Print file could not be generated." : error.message,
    });
  }
};

function sanitizeFilename(value) {
  return String(value || "monstersnow-storybook.pdf").replace(/[^a-zA-Z0-9._-]+/g, "-");
}
