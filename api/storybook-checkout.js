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
const { attachCheckoutSession, recordCheckoutOrder } = require("../lib/order-library");
const { deriveOrderAccess } = require("../lib/customer-orders");
const { getAdminMonsterAssets, requireSubmission, saveCheckoutChildImage } = require("../lib/monster-submissions");
const { listStories, validateStoryPublishReadiness } = require("../lib/story-library");
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
    const access = deriveOrderAccess(submission);
    submission.submissionId = access.submissionId;
    // Validate checkout configuration before sending intake email so an
    // unconfigured checkout path does not create duplicate operations work.
    buildStorybookCheckoutSessionPayload(submission, request, { orderAccessToken: access.token });
    await assertCheckoutMonsterOwnership(body, submission);

    // Persist the initial order before opening a payment session. Stripe
    // idempotency and the deterministic submission identity make retries safe.
    // Pin the exact child render the customer approved in the signed proof.
    const childImagePath = submission.personalization.childCharacter?.included && proof.childImage
      ? await saveCheckoutChildImage({ submissionId: submission.submissionId, monsterSubmissionId: submission.monsterSubmissionId, childImage: proof.childImage })
      : null;
    const initialOrder = await recordCheckoutOrder(submission, null, { orderAccessTokenHash: access.tokenHash, childImagePath });
    if (!initialOrder || initialOrder.status !== "checkout_started") {
      const error = new Error("This order has already moved beyond checkout.");
      error.status = 409;
      error.code = "checkout_already_processed";
      throw error;
    }
    const checkoutSession = await createStorybookCheckoutSession(submission, request, { orderAccessToken: access.token });
    if (checkoutSession.livemode !== true || !/^cs_live_[A-Za-z0-9]+$/.test(checkoutSession.id || "")) {
      const error = new Error("Stripe did not create a live checkout session.");
      error.status = 502;
      error.code = "invalid_live_checkout_session";
      throw error;
    }
    const order = await attachCheckoutSession(submission.submissionId, checkoutSession.id);
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
    const mapped = mapper(error);
    const status = error.status && error.name !== "StorybookCheckoutError" && error.name !== "StorybookInterestError" ? error.status : mapped.status;
    const payload = error.status && error.name !== "StorybookCheckoutError" && error.name !== "StorybookInterestError"
      ? { code: error.code || "storybook_checkout_failed", error: error.status < 500 ? error.message : "Storybook checkout could not be started." }
      : mapped.payload;

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

async function assertCheckoutMonsterOwnership(body, submission) {
  if (!submission.monsterSubmissionId || !submission.selectedPreviewId || !body.monsterSubmissionToken) {
    const error = new Error("Save and confirm the selected monster before checkout.");
    error.status = 409;
    error.code = "saved_monster_required";
    throw error;
  }
  const saved = await requireSubmission(submission.monsterSubmissionId, body.monsterSubmissionToken);
  const expected = {
    selected_preview_id: submission.selectedPreviewId,
    customer_email: submission.email,
    child_name: submission.personalization.childName,
    monster_name: submission.personalization.monsterName,
    story_id: submission.story.id,
    format_id: submission.format.id,
  };
  const mismatch = saved.status !== "ready" || Object.entries(expected).some(([key, value]) => String(saved[key] || "") !== String(value || ""));
  if (mismatch) {
    const error = new Error("The saved monster details changed. Confirm the monster again before checkout.");
    error.status = 409;
    error.code = "saved_monster_changed";
    throw error;
  }
}
