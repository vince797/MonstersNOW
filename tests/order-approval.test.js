const test = require("node:test");
const assert = require("node:assert/strict");
const { decorateOrder, encodeApprovalNotes, parseApprovalNotes } = require("../lib/order-library");

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
