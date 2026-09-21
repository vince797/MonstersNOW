const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const handler = require("../lib/stripe-webhook-handler");
const { verifyStripeEvent } = require("../lib/stripe-webhook-events");

const secret = "whsec_live_mock";

function signedRequest(event) {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return { method: "POST", headers: { "stripe-signature": `t=${timestamp},v1=${signature}` }, body };
}

function responseStub() {
  return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

function checkoutEvent(type, overrides = {}) {
  return {
    id: "evt_live_mock",
    livemode: true,
    type,
    created: 1789992000,
    data: { object: { id: "cs_live_mock", payment_status: "paid", payment_intent: "pi_123mock", customer: "cus_123mock", currency: "usd", amount_subtotal: 2499, amount_total: 3198, total_details: { amount_shipping: 599, amount_tax: 100 }, shipping_details: { name: "Parent Example", phone: "4075550100", address: { line1: "123 Main St", line2: "", city: "Apopka", state: "FL", postal_code: "32712", country: "US" } }, metadata: { submission_id: "submission-123", source: "create-form" }, ...overrides } },
  };
}

test("live webhook signature verification rejects test events and modified bodies", () => {
  const request = signedRequest(checkoutEvent("checkout.session.completed"));
  assert.equal(verifyStripeEvent(request.body, request.headers["stripe-signature"], secret, { livemode: true }).livemode, true);
  assert.throws(() => verifyStripeEvent(`${request.body} `, request.headers["stripe-signature"], secret, { livemode: true }));
  const testRequest = signedRequest({ ...checkoutEvent("checkout.session.completed"), livemode: false });
  assert.throws(() => verifyStripeEvent(testRequest.body, testRequest.headers["stripe-signature"], secret, { livemode: true }));
});

test("paid live checkout updates only its matching initial order", async () => {
  const originalFetch = global.fetch;
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SECRET_KEY = "mock";
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => [] }; };
  try {
    const response = responseStub();
    await handler(signedRequest(checkoutEvent("checkout.session.completed")), response);
    assert.equal(response.code, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /stripe_checkout_session_id=eq.cs_live_mock/);
    assert.match(calls[0].url, /submission_id=eq.submission-123/);
    assert.match(calls[0].url, /status=eq.checkout_started/);
    const update = JSON.parse(calls[0].options.body);
    assert.equal(update.status, "paid");
    assert.equal(update.stripe_total_cents, 3198);
    assert.equal(update.stripe_shipping_cents, 599);
    assert.equal(update.stripe_payment_intent_id, "pi_123mock");
    assert.equal(update.shipping_address.city, "Apopka");
  } finally { global.fetch = originalFetch; }
});

test("refund and dispute events flag the matching PaymentIntent", async () => {
  const originalFetch = global.fetch;
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SECRET_KEY = "mock";
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => [] }; };
  try {
    const refund = responseStub();
    await handler(signedRequest({ livemode: true, created: 1789992000, type: "refund.created", data: { object: { id: "re_mock", payment_intent: "pi_123mock" } } }), refund);
    assert.equal(refund.code, 200);
    assert.match(calls[0].url, /stripe_payment_intent_id=eq.pi_123mock/);
    assert.equal(JSON.parse(calls[0].options.body).payment_issue, "refund_created");

    const dispute = responseStub();
    await handler(signedRequest({ livemode: true, created: 1789992000, type: "charge.dispute.created", data: { object: { id: "du_mock", payment_intent: "pi_123mock" } } }), dispute);
    assert.equal(dispute.code, 200);
    assert.equal(JSON.parse(calls[1].options.body).payment_issue, "dispute_created");
  } finally { global.fetch = originalFetch; }
});

test("failed live checkout cancels only the initial order and test metadata is rejected", async () => {
  const originalFetch = global.fetch;
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SECRET_KEY = "mock";
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => [] }; };
  try {
    const failed = responseStub();
    await handler(signedRequest(checkoutEvent("checkout.session.expired", { payment_status: "unpaid" })), failed);
    assert.equal(failed.code, 200);
    assert.equal(JSON.parse(calls[0].options.body).status, "cancelled");

    const rejected = responseStub();
    await handler(signedRequest(checkoutEvent("checkout.session.completed", { metadata: { submission_id: "test-abc", test_order: "yes" } })), rejected);
    assert.equal(rejected.code, 400);
    assert.equal(calls.length, 1);
  } finally { global.fetch = originalFetch; }
});
