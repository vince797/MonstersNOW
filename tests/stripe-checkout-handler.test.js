const test = require("node:test");
const assert = require("node:assert/strict");
const { buildHalloweenProof, signProof } = require("../lib/halloween-proof");

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
  delete process.env.RESEND_API_KEY;
  delete process.env.STORYBOOK_INTEREST_FROM_EMAIL;
  const submissionId = "submission-123";
  const monsterSubmissionId = "11111111-1111-4111-8111-111111111111";
  const previewId = "22222222-2222-4222-8222-222222222222";
  const monsterImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
  const proofInput = {
    submissionId,
    email: "parent@example.com",
    personalization: { childName: "Sam", monsterName: "Noodle", childCharacter: { id: "light-short-brown", label: "Short brown hair", included: true } },
    format: "softcover",
    source: "create-form",
    monsterImage,
    monsterSubmissionId,
    selectedPreviewId: previewId,
  };
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === "https://api.stripe.com/v1/checkout/sessions") {
      return { ok: true, json: async () => ({ id: "cs_live_mock", url: "https://checkout.stripe.com/mock", livemode: true }) };
    }
    if (url.includes("/monster_submissions?")) return { ok: true, json: async () => [{ selected_preview_id: previewId }] };
    if (url.includes("/monster_previews?")) return { ok: true, json: async () => [{ id: previewId, preview_path: `${monsterSubmissionId}/previews/${previewId}.png` }] };
    if (url.includes("/storage/v1/object/sign/")) return { ok: true, json: async () => ({ signedURL: "/object/sign/monster.png?token=mock" }) };
    if (url.includes("/master_stories?")) return { ok: true, json: async () => [{
      id: "story-1", slug: "halloween-monster-night", status: "published",
      pages: Array.from({ length: 32 }, (_, index) => ({
        page: index + 1, text: `Page ${index + 1}`, artworkUrl: `https://assets.example/page-${index + 1}.jpg`, artworkStatus: "final", backgroundPlateConfirmed: true, backgroundPlateVersion: 2,
      })),
    }] };
    if (url.includes("/storybook_orders")) return { ok: true, json: async () => [{ id: "order-1", status: "checkout_started" }] };
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
    assert.deepEqual(storedOrder.child_character, { id: "light-short-brown", label: "Short brown hair", included: true });
    assert.equal(storedOrder.story_id, "halloween-monster-night");
    assert.equal(storedOrder.selected_preview_id, previewId);
    assert.match(response.body.warnings.join(" "), /order is still available in Admin/i);
    const stripeIndex = calls.findIndex((call) => call.url === "https://api.stripe.com/v1/checkout/sessions");
    assert.ok(calls.indexOf(orderInsert) < stripeIndex, "order must be recorded before Stripe Checkout opens");
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
