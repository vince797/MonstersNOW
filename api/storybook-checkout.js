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
const { recordCheckoutOrder } = require("../lib/order-library");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return rejectUnsupportedMethod(request, response, ["POST"]);
  }

  let body;
  let submission;

  try {
    body = await readJsonBody(request, { maxBytes: 8 * 1024 * 1024 });
  } catch (error) {
    return sendJson(response, error.status || 400, {
      code: error.code || "invalid_json",
      error: error.status === 413 ? error.message : "Invalid JSON body.",
    });
  }

  try {
    submission = buildStorybookInterestSubmission(body);
    // Validate checkout configuration before sending intake email so an
    // unconfigured checkout path does not create duplicate operations work.
    buildStorybookCheckoutSessionPayload(submission, request);

    const checkoutSession = await createStorybookCheckoutSession(submission, request);
    const order = await recordCheckoutOrder(submission, checkoutSession.id);
    let intakeEmailId = null;
    try {
      const intakeEmail = await sendStorybookInterestEmail(submission);
      intakeEmailId = intakeEmail.emailId;
    } catch (emailError) {
      console.warn("Checkout created without an intake email", { code: emailError.code, service: emailError.service });
      submission.warnings.push("The operations email could not be sent; the order is still available in Admin.");
    }

    return sendJson(response, 200, {
      mode: "checkout",
      submissionId: submission.submissionId,
      intakeEmailId,
      checkoutSessionId: checkoutSession.id,
      checkoutUrl: checkoutSession.url,
      orderId: order?.id || null,
      warnings: submission.warnings,
      message: "Storybook checkout started.",
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
