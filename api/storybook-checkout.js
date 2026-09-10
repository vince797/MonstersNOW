const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const {
  buildStorybookInterestSubmission,
  sendStorybookInterestEmail,
  storybookInterestErrorToResponse,
} = require("../lib/storybook-interest");
const {
  buildStorybookCheckoutSessionPayload,
  createStorybookCheckoutSession,
  storybookCheckoutErrorToResponse,
} = require("../lib/stripe-checkout");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return rejectUnsupportedMethod(request, response, ["POST"]);
  }

  let body;
  let submission;

  try {
    body = await readJsonBody(request);
  } catch {
    return sendJson(response, 400, {
      code: "invalid_json",
      error: "Invalid JSON body.",
    });
  }

  try {
    submission = buildStorybookInterestSubmission(body);
    // Validate checkout configuration before sending intake email so an
    // unconfigured checkout path does not create duplicate operations work.
    buildStorybookCheckoutSessionPayload(submission, request);

    const intakeEmail = await sendStorybookInterestEmail(submission);
    const checkoutSession = await createStorybookCheckoutSession(submission, request);

    return sendJson(response, 200, {
      mode: "checkout",
      submissionId: submission.submissionId,
      intakeEmailId: intakeEmail.emailId,
      checkoutSessionId: checkoutSession.id,
      checkoutUrl: checkoutSession.url,
      warnings: submission.warnings,
      message: "Halloween storybook checkout started.",
    });
  } catch (error) {
    const mapper =
      error.name === "StorybookInterestError"
        ? storybookInterestErrorToResponse
        : storybookCheckoutErrorToResponse;
    const { status, payload } = mapper(error);

    if (status >= 500) {
      console.error("Storybook checkout failed", {
        message: error?.message,
        code: error?.code,
        status: error?.status,
        missing: error?.missing,
        service: error?.service,
        submissionId: submission?.submissionId,
      });
    }

    return sendJson(response, status, payload);
  }
};
