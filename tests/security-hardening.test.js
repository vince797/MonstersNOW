const test = require("node:test");
const assert = require("node:assert/strict");
const { readJsonBody } = require("../lib/http");
const { buildStorybookCheckoutSessionPayload } = require("../lib/stripe-checkout");
const { readRawBody } = require("../lib/stripe-webhook-events");
const { buildStorybookInterestSubmission } = require("../lib/storybook-interest");

test("JSON request reader rejects oversized parsed and raw bodies", async () => {
  await assert.rejects(() => readJsonBody({ headers: {}, body: { value: "x".repeat(1024) } }, { maxBytes: 128 }), (error) => error.status === 413);
  await assert.rejects(() => readJsonBody({ headers: { "content-length": "500" }, body: "{}" }, { maxBytes: 128 }), (error) => error.status === 413);
});

test("webhook reader enforces its size cap for already-buffered bodies", async () => {
  await assert.rejects(() => readRawBody({ body: Buffer.alloc(1024 * 1024 + 1) }), /too large/i);
  await assert.rejects(() => readRawBody({ body: "x".repeat(1024 * 1024 + 1) }), /too large/i);
});

test("checkout rejects an attacker-controlled forwarded host", () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    siteUrl: process.env.STORYBOOK_CHECKOUT_SITE_URL,
    vercelUrl: process.env.VERCEL_URL,
  };
  process.env.NODE_ENV = "production";
  delete process.env.STORYBOOK_CHECKOUT_SITE_URL;
  delete process.env.VERCEL_URL;
  process.env.STRIPE_SECRET_KEY = "sk_live_mock";
  process.env.STRIPE_STORYBOOK_SHIPPING_RATE_IDS = "shr_live_mock";
  const submission = buildStorybookInterestSubmission({
    email: "parent@example.com",
    personalization: { childName: "Sam", monsterName: "Noodle" },
    format: "softcover",
  });
  try {
    assert.throws(
      () => buildStorybookCheckoutSessionPayload(submission, { headers: { "x-forwarded-host": "evil.example", host: "www.monstersnow.com" } }),
      /not configured for this host/i,
    );
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.siteUrl === undefined) delete process.env.STORYBOOK_CHECKOUT_SITE_URL; else process.env.STORYBOOK_CHECKOUT_SITE_URL = previous.siteUrl;
    if (previous.vercelUrl === undefined) delete process.env.VERCEL_URL; else process.env.VERCEL_URL = previous.vercelUrl;
  }
});

test("monster generation rejects anonymous requests before using the image provider", async () => {
  const handler = require("../api/convert-monster");
  const response = {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({
    method: "POST",
    headers: {},
    body: { drawing: "data:image/png;base64,iVBORw0KGgo=" },
  }, response);
  assert.equal(response.code, 403);
  assert.equal(response.body.code, "monster_submission_required");
});
