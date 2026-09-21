const test = require("node:test");
const assert = require("node:assert/strict");

function responseStub() {
  return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test("checkout succeeds and records an order when optional intake email is not configured", async () => {
  const handler = require("../api/storybook-checkout");
  const originalFetch = global.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_live_mock";
  process.env.STRIPE_STORYBOOK_SHIPPING_RATE_IDS = "shr_live_mock";
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SECRET_KEY = "mock";
  delete process.env.RESEND_API_KEY;
  delete process.env.STORYBOOK_INTEREST_FROM_EMAIL;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === "https://api.stripe.com/v1/checkout/sessions") {
      return { ok: true, json: async () => ({ id: "cs_live_mock", url: "https://checkout.stripe.com/mock", livemode: true }) };
    }
    return { ok: true, json: async () => [{ id: "order-1", status: "checkout_started" }] };
  };
  try {
    const response = responseStub();
    await handler({
      method: "POST",
      headers: { host: "www.monstersnow.com", "x-forwarded-proto": "https" },
      body: {
        submissionId: "submission-123",
        email: "parent@example.com",
        personalization: { childName: "Sam", monsterName: "Noodle" },
        format: "softcover",
        source: "create-form",
      },
    }, response);
    assert.equal(response.code, 200);
    assert.equal(response.body.checkoutUrl, "https://checkout.stripe.com/mock");
    assert.equal(response.body.orderId, "order-1");
    assert.equal(response.body.intakeEmailId, null);
    assert.match(response.body.warnings.join(" "), /order is still available in Admin/i);
    assert.equal(calls.length, 2);
  } finally { global.fetch = originalFetch; }
});
