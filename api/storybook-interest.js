const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const {
  buildStorybookInterestSubmission,
  sendStorybookInterestEmail,
  storybookInterestErrorToResponse,
} = require("../lib/storybook-interest");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return rejectUnsupportedMethod(request, response, ["POST"]);
  }

  let body;

  try {
    body = await readJsonBody(request);
  } catch {
    return sendJson(response, 400, {
      code: "invalid_json",
      error: "Invalid JSON body.",
    });
  }

  try {
    const submission = buildStorybookInterestSubmission(body);
    const result = await sendStorybookInterestEmail(submission);

    return sendJson(response, 200, {
      mode: "email",
      submissionId: submission.submissionId,
      emailId: result.emailId,
      warnings: submission.warnings,
      message: "Halloween storybook interest submitted.",
    });
  } catch (error) {
    const { status, payload } = storybookInterestErrorToResponse(error);

    if (status >= 500) {
      console.error("Storybook interest submission failed", {
        message: error?.message,
        code: error?.code,
        status: error?.status,
        missing: error?.missing,
        service: error?.service,
      });
    }

    return sendJson(response, status, payload);
  }
};
