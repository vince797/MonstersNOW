const test = require("node:test");
const assert = require("node:assert/strict");
const {
  confirmCustomerProofPackage,
  createCustomerProofPackageUploads,
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

test("customer approval is bound to the published proof fingerprint", async () => {
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
    const approved = await reviewCustomerProof(access.token, { action: "approve", fingerprint: "b".repeat(64) });
    assert.equal(approved.proof.status, "approved");
    const patchCall = calls.find((call) => call.options.method === "PATCH");
    assert.equal(JSON.parse(patchCall.options.body).customer_proof_status, "approved");
  } finally { global.fetch = originalFetch; }
});

test("publishing a proof locks the exact customer, interior, and cover PDFs", async () => {
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
    const pdfData = (label) => `data:application/pdf;base64,${Buffer.from(`%PDF-1.7\n${label}\n%%EOF`).toString("base64")}`;
    let packageMetadata;
    const published = await publishCustomerProof(baseOrder({ customer_proof_status: "changes_requested" }), {
      proofData: pdfData("proof"), interiorData: pdfData("interior"), coverData: pdfData("cover"), masterStoryVersion: 7,
      buildNotes: (metadata) => { packageMetadata = metadata; return JSON.stringify(metadata); },
    });
    assert.equal(published.customer_proof_status, "ready");
    assert.match(published.customer_proof_fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(published.customer_proof_master_version, 7);
    assert.equal(calls.filter((call) => call.url.includes("/storage/v1/object/customer-proofs/")).length, 3);
    assert.match(packageMetadata.productionInteriorFingerprint, /^[a-f0-9]{64}$/);
    assert.match(packageMetadata.productionCoverFingerprint, /^[a-f0-9]{64}$/);
    const patchCall = calls.find((call) => call.url.includes("/rest/v1/storybook_orders"));
    assert.equal(JSON.parse(patchCall.options.body).customer_proof_revision_notes, null);
    assert.match(JSON.parse(patchCall.options.body).notes, /productionInteriorPath/);
  } finally { global.fetch = originalFetch; }
});

test("large production PDFs use signed private uploads before the order is updated", async () => {
  process.env.ORDER_ACCESS_SECRET = secret;
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SECRET_KEY = "service-secret";
  const files = ["proof", "interior", "cover"].map((role, index) => ({
    role, name: `${role}.pdf`, type: "application/pdf", size: 30 * 1024 * 1024 + index, sha256: String(index + 1).repeat(64),
  }));
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/object/upload/sign/")) return { ok: true, json: async () => ({ url: `/object/upload/sign/customer-proofs/file-${calls.length}` }) };
    if (url.includes("/object/info/")) {
      const role = url.includes("-customer-proof.pdf") ? "proof" : url.includes("-lulu-interior.pdf") ? "interior" : "cover";
      const file = files.find((item) => item.role === role);
      return { ok: true, json: async () => ({ metadata: { size: file.size, mimetype: "application/pdf" } }) };
    }
    const body = JSON.parse(options.body);
    return { ok: true, json: async () => [baseOrder(body)] };
  };
  try {
    const prepared = await createCustomerProofPackageUploads(baseOrder(), { files });
    assert.equal(prepared.files.length, 3);
    assert.equal(prepared.files.every((file) => file.signedUrl.startsWith("https://db.example.com/storage/v1/")), true);
    let productionFiles;
    const confirmed = await confirmCustomerProofPackage(baseOrder(), {
      files, masterStoryVersion: 9,
      buildNotes: (metadata) => { productionFiles = metadata; return "locked-package"; },
    });
    assert.equal(confirmed.customer_proof_master_version, 9);
    assert.match(productionFiles.productionInteriorPath, /-lulu-interior\.pdf$/);
    assert.match(productionFiles.productionCoverPath, /-lulu-cover\.pdf$/);
    assert.equal(calls.filter((call) => call.url.includes("/object/info/")).length, 3);
  } finally { global.fetch = originalFetch; }
});
