const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { buildHalloweenProof, signProof, verifyProof } = require("../lib/halloween-proof");
const { verifyTestEvent } = require("../lib/stripe-test-events");
const { buildStorybookInterestSubmission } = require("../lib/storybook-interest");
const { buildStorybookCheckoutSessionPayload } = require("../lib/stripe-checkout");

const input = {
  personalization: { childName: "Sam", monsterName: "Noodle" },
  monsterImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
  format: "softcover", email: "parent@example.com",
};
process.env.STORYBOOK_PROOF_SECRET = "local-test-secret-not-for-production";

test("32 consecutive personalized pages use the approved full manuscript", () => {
  const proof = buildHalloweenProof(input);
  assert.deepEqual(proof.pages.map((p) => p.number), Array.from({ length: 32 }, (_, n) => n + 1));
  const text = proof.pages.map((p) => p.text).join(" ");
  assert.match(text, /Noodle led the Pumpkin Parade/);
  assert.match(text, /The porch lights were on/);
  assert.doesNotMatch(text, /\{child_name\}|\{monster_name\}|Moxie|Mia/);
  assert.equal(proof.monsterImage, input.monsterImage);
});

test("receipt binds names, format and image; rejects expiration and tampering", () => {
  const proof = buildHalloweenProof(input);
  const token = signProof(proof);
  assert.doesNotThrow(() => verifyProof(proof, token));
  for (const change of [{ format: "hardcover" }, { personalization: { childName: "Alex", monsterName: "Noodle" } }, { monsterImage: input.monsterImage.replace("AAAAB", "AAAAC") }]) {
    assert.throws(() => verifyProof(buildHalloweenProof({ ...input, ...change }), token));
  }
  assert.throws(() => verifyProof(proof, token + "0"));
  const value = Buffer.from(JSON.stringify({ hash: proof.proofHash, expires: 1 })).toString("base64url");
  const expired = `${value}.${crypto.createHmac("sha256", process.env.STORYBOOK_PROOF_SECRET).update(value).digest("hex")}`;
  assert.throws(() => verifyProof(proof, expired));
});

test("image sources and missing/overlong names are rejected", () => {
  assert.throws(() => buildHalloweenProof({ ...input, monsterImage: "https://example.com/monster.png" }));
  assert.throws(() => buildHalloweenProof({ ...input, monsterImage: "data:image/svg+xml;base64,aGVsbG8=" }));
  assert.throws(() => buildHalloweenProof({ ...input, personalization: { childName: "x".repeat(41), monsterName: "Noodle" } }));
});

test("test checkout cannot use a live key or live shipping configuration", () => {
  const proof = buildHalloweenProof(input);
  const submission = Object.assign(buildStorybookInterestSubmission(input), { testMode: true, proofHash: proof.proofHash, manuscriptVersion: proof.manuscriptVersion });
  process.env.STRIPE_SECRET_KEY = "sk_live_never_used";
  process.env.STRIPE_TEST_SECRET_KEY = "sk_live_wrong";
  assert.throws(() => buildStorybookCheckoutSessionPayload(submission, { headers: { host: "localhost" } }));
  process.env.STRIPE_TEST_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_TEST_STORYBOOK_SHIPPING_RATE_IDS = "shr_test_mock";
  const { apiKey, params } = buildStorybookCheckoutSessionPayload(submission, { headers: { host: "localhost" } });
  assert.equal(apiKey, "sk_test_mock");
  assert.equal(params.get("metadata[test_order]"), "yes");
  assert.match(params.get("cancel_url"), /test=halloween/);
  assert.match(params.get("line_items[0][price_data][product_data][description]"), /No physical book/);
});

test("webhook requires fresh raw-body signature and rejects live events", () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = "whsec_mock";
  const raw = JSON.stringify({ livemode: false, type: "checkout.session.completed" });
  const header = `t=${timestamp},v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`;
  assert.equal(verifyTestEvent(raw, header, secret).livemode, false);
  assert.throws(() => verifyTestEvent(raw + " ", header, secret));
  assert.throws(() => verifyTestEvent(raw, header, secret, Date.now() + 600000));
  const live = JSON.stringify({ livemode: true });
  const liveHeader = `t=${timestamp},v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${live}`).digest("hex")}`;
  assert.throws(() => verifyTestEvent(live, liveHeader, secret));
});

function responseStub() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
}

test("checkout handler connects approved proof to test payment and storage only", async () => {
  const handler = require("../lib/halloween-test-checkout-handler");
  const originalFetch = global.fetch;
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SECRET_KEY = "mock";
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.startsWith("https://api.stripe.com")) return { ok: true, json: async () => ({ id: "cs_test_mock", url: "https://checkout.stripe.com/mock", livemode: false }) };
    return { ok: true, json: async () => [{ id: "order-mock", status: "checkout_started" }] };
  };
  try {
    const res = responseStub();
    await handler({ method: "POST", headers: { host: "localhost" }, body: { ...input, proofApproved: true, proofToken: signProof(buildHalloweenProof(input)) } }, res);
    assert.equal(res.code, 200);
    assert.equal(calls.length, 3);
    assert.equal(JSON.parse(calls[0].options.body)[0].story_id, "halloween-monster-night");
    assert.match(calls[1].options.headers.Authorization, /sk_test_/);
    assert.equal(new URLSearchParams(calls[1].options.body).get("metadata[proof_hash]"), buildHalloweenProof(input).proofHash);
    assert.equal(JSON.parse(calls[2].options.body).stripe_checkout_session_id, "cs_test_mock");
    assert.ok(calls.every((call) => !/lulu|resend/.test(call.url)));
    const rejected = responseStub();
    await handler({ method: "POST", body: input }, rejected);
    assert.equal(rejected.code, 400);
    assert.equal(calls.length, 3);
  } finally { global.fetch = originalFetch; }
});

test("paid test webhook updates only initial matching orders, without fulfillment", async () => {
  const handler = require("../lib/stripe-test-webhook-handler");
  const originalFetch = global.fetch;
  process.env.STRIPE_TEST_WEBHOOK_SECRET = "whsec_mock";
  const raw = JSON.stringify({ livemode: false, type: "checkout.session.completed", data: { object: { id: "cs_test_mock", payment_status: "paid", metadata: { test_order: "yes", submission_id: "test-abc" } } } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", "whsec_mock").update(`${timestamp}.${raw}`).digest("hex");
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => [] }; };
  try {
    const res = responseStub();
    await handler({ method: "POST", headers: { "stripe-signature": `t=${timestamp},v1=${signature}` }, body: raw }, res);
    assert.equal(res.code, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /status=eq.checkout_started/);
    assert.match(calls[0].url, /submission_id=eq.test-abc/);
    assert.equal(JSON.parse(calls[0].options.body).status, "paid");
  } finally { global.fetch = originalFetch; }
});
