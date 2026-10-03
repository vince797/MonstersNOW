const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deriveOrderAccess,
  getCustomerOrderView,
  publishCustomerProof,
  reviewCustomerProof,
} = require("../lib/customer-orders");

const secret = "test-order-access-secret-at-least-32-characters";

function baseOrder(overrides = {}) {
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    submission_id: "order-abc",
    order_access_token_hash: "a".repeat(64),
    customer_email: "private@example.com",
    shipping_address: { line1: "private" },
    status: "proofing",
    child_name: "Sam",
    monster_name: "Noodle",
    story_label: "Halloween Monster Night",
    format_id: "softcover",
    amount_cents: 2499,
    currency: "USD",
    customer_proof_status: "ready",
    customer_proof_path: "order-1/proof.pdf",
    customer_proof_fingerprint: "b".repeat(64),
    customer_proof_revision_count: 0,
    ...overrides,
  };
}

test("order access is deterministic, opaque, and stored only as a hash", () => {
  process.env.ORDER_ACCESS_SECRET = secret;
  const submission = {
    submissionId: "client-nonce",
    monsterSubmissionId: "123e4567-e89b-42d3-a456-426614174000",
    email: "parent@example.com",
    selectedPreviewId: "preview-1",
    format: { id: "softcover" },
  };
  const first = deriveOrderAccess(submission);
  const second = deriveOrderAccess(submission);
  assert.deepEqual(first, second);
  assert.match(first.submissionId, /^order-[a-f0-9]{48}$/);
  assert.match(first.token, /^mn_order_[A-Za-z0-9_-]{43}$/);
  assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(first.tokenHash, /mn_order_/);
});

test("customer order view is redacted and uses a short-lived proof URL", async () => {
  process.env.ORDER_ACCESS_SECRET = secret;
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SECRET_KEY = "service-secret";
  const access = deriveOrderAccess({ submissionId: "nonce", email: "parent@example.com", format: { id: "softcover" } });
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes("/rest/v1/storybook_orders")) return { ok: true, json: async () => [baseOrder({ order_access_token_hash: access.tokenHash })] };
    return { ok: true, json: async () => ({ signedURL: "/object/sign/customer-proofs/order-1/proof.pdf?token=signed" }) };
  };
  try {
    const order = await getCustomerOrderView(access.token);
    assert.equal(order.childName, "Sam");
    assert.match(order.proof.url, /^https:\/\/db\.example\.com\/storage\/v1\/object\/sign\//);
    assert.equal(Object.hasOwn(order, "customer_email"), false);
    assert.equal(Object.hasOwn(order, "shipping_address"), false);
  } finally { global.fetch = originalFetch; }
});

test("manual review PDF fingerprints cannot bypass exact package approval", async () => {
  process.env.ORDER_ACCESS_SECRET = secret;
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SECRET_KEY = "service-secret";
  const access = deriveOrderAccess({ submissionId: "nonce-2", email: "parent@example.com", format: { id: "softcover" } });
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/object/sign/")) return { ok: true, json: async () => ({ signedURL: "/object/sign/customer-proofs/order-1/proof.pdf?token=signed" }) };
    if (options.method === "PATCH") return { ok: true, json: async () => [baseOrder({ customer_proof_status: "approved", customer_proof_reviewed_at: "2026-10-02T20:00:00.000Z" })] };
    return { ok: true, json: async () => [baseOrder({ order_access_token_hash: access.tokenHash })] };
  };
  try {
    await assert.rejects(() => reviewCustomerProof(access.token, { action: "approve", fingerprint: "c".repeat(64) }), /proof changed/i);
    await assert.rejects(() => reviewCustomerProof(access.token, { action: "approve", fingerprint: "b".repeat(64) }), /exact interior-and-cover package/);
    assert.equal(calls.some((call) => call.options.method === "PATCH"), false);
  } finally { global.fetch = originalFetch; }
});

test("publishing a proof fingerprints the PDF and resets customer review state", async () => {
  process.env.ORDER_ACCESS_SECRET = secret;
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SECRET_KEY = "service-secret";
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/storage/v1/object/customer-proofs/")) return { ok: true, json: async () => ({}) };
    const body = JSON.parse(options.body);
    return { ok: true, json: async () => [baseOrder({ ...body, customer_proof_path: body.customer_proof_path })] };
  };
  try {
    const proofData = `data:application/pdf;base64,${Buffer.from("%PDF-1.7\nproof\n%%EOF").toString("base64")}`;
    const published = await publishCustomerProof(baseOrder({ customer_proof_status: "changes_requested" }), { proofData, masterStoryVersion: 7 });
    assert.equal(published.customer_proof_status, "ready");
    assert.match(published.customer_proof_fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(published.customer_proof_master_version, 7);
    assert.equal(JSON.parse(calls[1].options.body).customer_proof_revision_notes, null);
  } finally { global.fetch = originalFetch; }
});

test('an invalidated package workflow never falls back to an older manual proof', async () => {
  const oldFetch = global.fetch;
  process.env.ORDER_ACCESS_SECRET = secret;
  const access = deriveOrderAccess({ submissionId: 'expired-package', email: 'sample@example.com', format: { id: 'softcover' } });
  const calls = [];
  global.fetch = async url => {
    calls.push(url);
    if (url.includes('/storybook_orders')) return { ok: true, json: async () => [baseOrder({ active_artifact_package_id: null, artifact_workflow_started_at: '2026-10-03T00:00:00Z', order_access_token_hash: access.tokenHash })] };
    if (url.includes('/order_render_jobs')) return { ok: true, json: async () => [{ id: 'job', status: 'completed', attempts: 1 }] };
    throw Error('Must not sign the old manual proof');
  };
  try {
    const view = await getCustomerOrderView(access.token);
    assert.equal(view.proof.url, null); assert.equal(view.proof.fingerprint, null); assert.equal(view.proof.canApprove, false);
    assert.equal(view.artifactError.code, 'artifact_source_changed'); assert.equal(calls.some(url => url.includes('/object/sign')), false);
  } finally { global.fetch = oldFetch; }
});
