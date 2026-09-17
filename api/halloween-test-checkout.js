const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const { buildHalloweenProof, verifyProof, STORY_ID, TITLE } = require("../lib/halloween-proof");
const { buildStorybookInterestSubmission } = require("../lib/storybook-interest");
const { createStorybookCheckoutSession, buildStorybookCheckoutSessionPayload } = require("../lib/stripe-checkout");
const { recordCheckoutOrder } = require("../lib/order-library");
const { supabaseRequest } = require("../lib/story-library");
const crypto = require("node:crypto");

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return rejectUnsupportedMethod(request, response, ["POST"]);
  try {
    const body = await readJsonBody(request);
    if (body.proofApproved !== true) return sendJson(response, 400, { error: "Review and approve your layout proof first." });
    const proof = buildHalloweenProof(body);
    verifyProof(proof, body.proofToken);
    const submission = buildStorybookInterestSubmission({ ...body, storyId: STORY_ID, storyLabel: TITLE, source: "halloween-test" });
    // Server-derived identity prevents caller-controlled IDs from overwriting
    // another order, and keeps retries idempotent for the same proof/email.
    submission.submissionId = `test-${crypto.createHash("sha256").update(`${submission.email}:${proof.proofHash}`).digest("hex")}`;
    Object.assign(submission, { testMode: true, proofHash: proof.proofHash, manuscriptVersion: proof.manuscriptVersion });
    buildStorybookCheckoutSessionPayload(submission, request);
    // Verify storage before opening a payment session. A failed storage request
    // must not leave the customer able to pay an untracked order.
    const order = await recordCheckoutOrder(submission, null);
    if (!order || order.status !== "checkout_started") return sendJson(response, 409, { error: "This test proof already has a processed order. Create a new proof to start another test." });
    const session = await createStorybookCheckoutSession(submission, request);
    if (session.livemode !== false) throw Object.assign(new Error("Only Stripe test sessions are allowed."), { status: 502 });
    await supabaseRequest(`/storybook_orders?submission_id=eq.${encodeURIComponent(submission.submissionId)}&status=eq.checkout_started`, {
      method: "PATCH", body: { stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() }, prefer: "return=representation",
    });
    return sendJson(response, 200, { checkoutUrl: session.url });
  } catch (error) {
    return sendJson(response, error.status >= 400 && error.status < 500 ? error.status : 503, { error: error.status && error.status < 500 ? error.message : "Test checkout is unavailable. Check the test payment and order-storage configuration. No print order was submitted." });
  }
};
