const test = require("node:test");
const assert = require("node:assert/strict");
const { assertAllowedStatusChange, decorateOrder, encodeApprovalNotes, normalizeLuluShippingAddress, parseApprovalNotes } = require("../lib/order-library");

test("proof approval audit survives operator note edits without a schema migration", () => {
  const approval = {
    proofFingerprint: "a".repeat(64),
    masterStoryVersion: 4,
    proofApprovedAt: "2026-09-21T12:00:00.000Z",
    proofApprovedBy: "MonstersNOW admin",
    luluPrintJobId: null,
    luluSubmittedAt: null,
  };
  const stored = encodeApprovalNotes("Reviewed every page.", approval);
  const parsed = parseApprovalNotes(stored);
  assert.equal(parsed.notes, "Reviewed every page.");
  assert.deepEqual(parsed.approval, approval);

  const order = decorateOrder({ id: "order-1", notes: stored });
  assert.equal(order.notes, "Reviewed every page.");
  assert.equal(order.proof_fingerprint, "a".repeat(64));
  assert.equal(order.master_story_version, 4);
});

test("revoking approval removes only the audit marker", () => {
  const stored = encodeApprovalNotes("Keep this note.", { proofFingerprint: "b".repeat(64) });
  assert.equal(encodeApprovalNotes(stored, null), "Keep this note.");
});

test("production package metadata is never truncated by long operator notes", () => {
  const metadata = {
    proofFingerprint: "d".repeat(64),
    productionInteriorPath: `order/${"i".repeat(64)}-lulu-interior.pdf`,
    productionInteriorFingerprint: "i".repeat(64).replaceAll("i", "1"),
    productionCoverPath: `order/${"c".repeat(64)}-lulu-cover.pdf`,
    productionCoverFingerprint: "c".repeat(64),
  };
  const stored = encodeApprovalNotes("n".repeat(2000), metadata);
  const parsed = parseApprovalNotes(stored);
  assert.equal(stored.length, 2000);
  assert.deepEqual(parsed.approval, metadata);
  assert.ok(parsed.notes.length < 2000);
});

test("production statuses cannot bypass approval and Lulu submission", () => {
  assert.throws(() => assertAllowedStatusChange({ status: "checkout_started" }, "paid"), /next required step/i);
  assert.doesNotThrow(() => assertAllowedStatusChange({ status: "paid" }, "proofing"));
  assert.throws(() => assertAllowedStatusChange({ status: "proofing" }, "approved"), /proof approval/i);
  assert.throws(() => assertAllowedStatusChange({ status: "approved" }, "printing"), /Lulu/i);
  assert.throws(() => assertAllowedStatusChange({ status: "printing" }, "shipped"), /print job/i);
  assert.doesNotThrow(() => assertAllowedStatusChange({ status: "printing", lulu_print_job_id: "job-1" }, "shipped"));
  assert.throws(() => assertAllowedStatusChange({ status: "paid", payment_issue: "refund_created" }, "proofing"), /payment issue/i);
});

test("Lulu shipping handoff always includes the order email", () => {
  assert.deepEqual(normalizeLuluShippingAddress({
    name: "Parent", phone_number: "555-0100", street1: "1 Main St", city: "Apopka", state_code: "FL", postcode: "32703", country_code: "US",
  }, { customer_email: "parent@example.com" }), {
    name: "Parent",
    email: "parent@example.com",
    phone_number: "555-0100",
    street1: "1 Main St",
    street2: undefined,
    city: "Apopka",
    state_code: "FL",
    postcode: "32703",
    country_code: "US",
  });
});
