const test = require("node:test");
const assert = require("node:assert/strict");
const { buildHalloweenProof, signProof } = require("../lib/halloween-proof");
const crypto = require("node:crypto");

function responseStub() {
  return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test("checkout succeeds and records an order when optional intake email is not configured", async () => {
  const handler = require("../api/storybook-checkout");
  const originalFetch = global.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_live_mock";
  process.env.STRIPE_STORYBOOK_SHIPPING_RATE_IDS = "shr_live_mock";
  process.env.STORYBOOK_LIVE_CHECKOUT_ENABLED = "true";
  process.env.STORYBOOK_PROOF_SECRET = "checkout-handler-test-secret";
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SECRET_KEY = "mock";
  process.env.ORDER_ACCESS_SECRET = "test-order-access-secret-at-least-32-characters";
  delete process.env.RESEND_API_KEY;
  delete process.env.STORYBOOK_INTEREST_FROM_EMAIL;
  const submissionId = "submission-123";
  const monsterSubmissionId = "123e4567-e89b-42d3-a456-426614174000";
  const previewId = "123e4567-e89b-42d3-a456-426614174001";
  const monsterSubmissionToken = "saved-monster-token-that-is-long-enough-for-test";
  const monsterImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
  const proofInput = {
    submissionId,
    email: "parent@example.com",
    personalization: { childName: "Sam", monsterName: "Noodle", childCharacter: { id: "light-short-brown", ageBand: "3-5" } },
    format: "softcover",
    source: "create-form",
    monsterImage,
    monsterSubmissionId,
    monsterSubmissionToken,
    selectedPreviewId: previewId,
  };
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/rest/v1/monster_submissions")) {
      return { ok: true, json: async () => [{
        id: monsterSubmissionId,
        access_token_hash: crypto.createHash("sha256").update(monsterSubmissionToken).digest("hex"),
        status: "ready",
        selected_preview_id: previewId,
        customer_email: "parent@example.com",
        child_name: "Sam",
        monster_name: "Noodle",
        story_id: "halloween-monster-night",
        format_id: "softcover",
        original_path: `${monsterSubmissionId}/original.png`,
        expires_at: "2099-01-01T00:00:00.000Z",
      }] };
    }
    if (url.includes("/monster_previews?")) return { ok: true, json: async () => [{ id: previewId, preview_path: `${monsterSubmissionId}/previews/${previewId}.png`, variation_number: 1, style_id: "storybook" }] };
    if (url.includes("/storybook_pose_jobs?")) return { ok: true, json: async () => [] };
    if (url.includes("/storage/v1/object/sign/")) return { ok: true, json: async () => ({ signedURL: "/object/sign/monster.png?token=mock" }) };
    if (url.includes("/master_stories?")) return { ok: true, json: async () => [{
      id: "story-1", slug: "halloween-monster-night", status: "published",
      pages: Array.from({ length: 32 }, (_, index) => ({
        page: index + 1, text: `Page ${index + 1}`, artworkUrl: `https://assets.example/page-${index + 1}.jpg`, artworkStatus: "final", backgroundPlateConfirmed: true, backgroundPlateVersion: 2,
      })),
    }] };
    if (url === "https://api.stripe.com/v1/checkout/sessions") {
      return { ok: true, json: async () => ({ id: "cs_live_mock", url: "https://checkout.stripe.com/mock", livemode: true }) };
    }
    if (url.includes("/storybook_orders")) {
      const requestBody = options.body ? JSON.parse(options.body) : null;
      if (options.method === "POST") return { ok: true, json: async () => [{ ...requestBody[0], id: "order-1", status: "checkout_started", stripe_checkout_session_id: null }] };
      return { ok: true, json: async () => [{ id: "order-1", status: "checkout_started", stripe_checkout_session_id: "cs_live_mock" }] };
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const response = responseStub();
    await handler({
      method: "POST",
      headers: { host: "www.monstersnow.com", "x-forwarded-proto": "https" },
      body: {
        ...proofInput,
        proofApproved: true,
        proofToken: signProof(buildHalloweenProof(proofInput)),
      },
    }, response);
    assert.equal(response.code, 200);
    assert.equal(response.body.checkoutUrl, "https://checkout.stripe.com/mock");
    assert.equal(response.body.orderId, "order-1");
    assert.equal(response.body.intakeEmailId, null);
    const orderInsert = calls.find((call) => call.url.includes("/storybook_orders?on_conflict="));
    const storedOrder = JSON.parse(orderInsert.options.body)[0];
    assert.deepEqual(storedOrder.child_character, {
      id: "light-short-brown", label: "Tousled brown", included: true, gender: "boy", skinTone: "light", hairColor: "brown", hairStyle: "short",
      ageBand: "3-5", ageBandLabel: "Ages 3–5", relativeHeight: "standard", relativeHeightLabel: "Standard illustrated proportions",
      mobilityAid: "none", mobilityAidLabel: "No mobility aid", profileVersion: "launch-v2", legacyProfile: false, requiresAgeBandReselection: false,
    });
    assert.equal(storedOrder.story_id, "halloween-monster-night");
    assert.equal(storedOrder.selected_preview_id, previewId);
    const stripeIndex = calls.findIndex((call) => call.url === "https://api.stripe.com/v1/checkout/sessions");
    assert.ok(calls.indexOf(orderInsert) < stripeIndex, "order must be recorded before Stripe Checkout opens");
    assert.match(storedOrder.submission_id, /^order-[a-f0-9]{48}$/);
    assert.match(storedOrder.order_access_token_hash, /^[a-f0-9]{64}$/);
    const stripeCall = calls.find((call) => call.url === "https://api.stripe.com/v1/checkout/sessions");
    const stripeParams = new URLSearchParams(stripeCall.options.body);
    assert.match(stripeParams.get("success_url"), /order_token=mn_order_/);
    assert.equal(stripeParams.get("automatic_tax[enabled]"), "true");
    assert.equal(stripeParams.get("metadata[child_mobility_aid]"), "none");
    assert.equal(stripeParams.get("metadata[child_gender]"), "boy");
    assert.match(response.body.warnings.join(" "), /order is still available in Admin/i);
  } finally { global.fetch = originalFetch; }
});

test("live checkout stays closed until production fulfillment is explicitly enabled", async () => {
  const handler = require("../api/storybook-checkout");
  const previous = process.env.STORYBOOK_LIVE_CHECKOUT_ENABLED;
  delete process.env.STORYBOOK_LIVE_CHECKOUT_ENABLED;
  try {
    const response = responseStub();
    await handler({ method: "POST", body: {} }, response);
    assert.equal(response.code, 503);
    assert.equal(response.body.code, "live_checkout_disabled");
    assert.match(response.body.error, /not open yet/i);
  } finally {
    if (previous === undefined) delete process.env.STORYBOOK_LIVE_CHECKOUT_ENABLED;
    else process.env.STORYBOOK_LIVE_CHECKOUT_ENABLED = previous;
  }
});
