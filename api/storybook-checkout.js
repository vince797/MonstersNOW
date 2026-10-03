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
const { getAdminMonsterAssets } = require("../lib/monster-submissions");
const { listStories, supabaseRequest, validateStoryPublishReadiness } = require("../lib/story-library");
const { buildHalloweenProof, verifyProof, STORY_ID, TITLE } = require("../lib/halloween-proof");

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
    if (process.env.STORYBOOK_LIVE_CHECKOUT_ENABLED !== "true") {
      const error = new Error("Printed book checkout is not open yet. Your monster and proof are still saved in this browser.");
      error.name = "StorybookInterestError";
      error.status = 503;
      error.code = "live_checkout_disabled";
      throw error;
    }
    if (body.proofApproved !== true) {
      const error = new Error("Review and approve your layout proof before checkout.");
      error.name = "StorybookInterestError";
      error.status = 400;
      error.code = "proof_not_approved";
      throw error;
    }
    let proof;
    try {
      proof = buildHalloweenProof(body);
      verifyProof(proof, body.proofToken);
    } catch (error) {
      error.name = "StorybookInterestError";
      error.code = error.code || "invalid_storybook_proof";
      throw error;
    }
    submission = buildStorybookInterestSubmission({ ...body, storyId: STORY_ID, storyLabel: TITLE });
    if (!submission.monsterSubmissionId || !submission.selectedPreviewId) {
      const error = new Error("Save and select a monster before checkout.");
      error.name = "StorybookInterestError";
      error.status = 400;
      error.code = "missing_monster_identity";
      throw error;
    }
    const [assets, stories] = await Promise.all([
      getAdminMonsterAssets(submission.monsterSubmissionId, submission.selectedPreviewId),
      listStories(),
    ]);
    if (!assets?.selectedPreviewUrl || assets.selectedPreviewId !== submission.selectedPreviewId) {
      const error = new Error("The selected monster could not be verified. Return to Create and select it again.");
      error.name = "StorybookInterestError";
      error.status = 409;
      error.code = "monster_identity_mismatch";
      throw error;
    }
    const story = stories.find((item) => item.slug === STORY_ID && item.status === "published");
    if (!story) {
      const error = new Error("This story is not available for checkout yet.");
      error.name = "StorybookInterestError";
      error.status = 409;
      error.code = "story_not_available";
      throw error;
    }
    try {
      validateStoryPublishReadiness(story.pages || []);
    } catch {
      const error = new Error("This story is still completing its production artwork and is not available for checkout yet.");
      error.name = "StorybookInterestError";
      error.status = 409;
      error.code = "story_not_ready";
      throw error;
    }
    // Validate checkout configuration before sending intake email so an
    // unconfigured checkout path does not create duplicate operations work.
    buildStorybookCheckoutSessionPayload(submission, request);

    const order = await recordCheckoutOrder(submission, null);
    if (!order || order.status !== "checkout_started") {
      const error = new Error("This proof already has an order. Check your payment confirmation before trying again.");
      error.name = "StorybookInterestError";
      error.status = 409;
      error.code = "order_already_processed";
      throw error;
    }
    const checkoutSession = await createStorybookCheckoutSession(submission, request);
    await supabaseRequest(`/storybook_orders?submission_id=eq.${encodeURIComponent(submission.submissionId)}&status=eq.checkout_started`, {
      method: "PATCH",
      body: { stripe_checkout_session_id: checkoutSession.id, updated_at: new Date().toISOString() },
      prefer: "return=representation",
    });
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

    if (status >= 500 && error.code !== "live_checkout_disabled") {
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
