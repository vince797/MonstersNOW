const { getStorybookProductVariant } = require("./lulu-products");
const { supabaseRequest } = require("./story-library");
const { getAdminMonsterAssets } = require("./monster-submissions");
const { buildPersonalizedBook } = require("./personalized-book");
const { listStories } = require("./story-library");
const APPROVAL_MARKER = "\n\n[MONSTERSNOW_PROOF_APPROVAL]";

async function listOrders() {
  const orders = await supabaseRequest("/storybook_orders?select=*&order=created_at.desc");
  return Promise.all(orders.map(async (row) => {
    const order = decorateOrder(row);
    return {
    ...order,
    monster_assets: order.monster_submission_id
      ? await getAdminMonsterAssets(order.monster_submission_id).catch(() => null)
      : null,
    };
  }));
}

async function recordCheckoutOrder(submission, checkoutSessionId) {
  const variant = getStorybookProductVariant(submission.format.id);
  const order = {
    submission_id: submission.submissionId,
    stripe_checkout_session_id: checkoutSessionId || null,
    customer_email: submission.email,
    child_name: submission.personalization.childName,
    monster_name: submission.personalization.monsterName,
    story_id: submission.story.id,
    story_label: submission.story.label,
    format_id: variant.id,
    amount_cents: variant.retailPriceCents,
    currency: variant.currency,
    status: "checkout_started",
    selected_preview_id: submission.selectedPreviewId || null,
    monster_style: submission.styleLabel,
    monster_submission_id: submission.monsterSubmissionId || null,
    ...(submission.testMode ? { notes: JSON.stringify({ testOrder: true, proofHash: submission.proofHash, manuscriptVersion: submission.manuscriptVersion, fulfillment: "disabled" }) } : {}),
    updated_at: new Date().toISOString(),
  };
  const rows = await supabaseRequest("/storybook_orders?on_conflict=submission_id", {
    method: "POST",
    body: [order],
    prefer: submission.testMode ? "resolution=ignore-duplicates,return=representation" : "resolution=merge-duplicates,return=representation",
  });
  if (submission.testMode && !rows[0]) {
    const existing = await supabaseRequest(`/storybook_orders?submission_id=eq.${encodeURIComponent(submission.submissionId)}&select=*`);
    return existing[0];
  }
  return rows[0];
}

async function updateOrder(id, payload = {}) {
  if (payload.action === "approve_proof") return approveOrderProof(id, payload.approvedBy);
  if (payload.action === "revoke_proof_approval") return revokeOrderProofApproval(id);
  const allowedStatuses = ["checkout_started", "paid", "proofing", "approved", "printing", "shipped", "completed", "cancelled"];
  const status = allowedStatuses.includes(payload.status) ? payload.status : "";
  if (!id || (payload.status !== undefined && !status) || (payload.status === undefined && typeof payload.notes !== "string")) {
    const error = new Error("Choose a valid order status.");
    error.status = 400;
    error.code = "invalid_order_status";
    throw error;
  }
  if (["approved", "printing"].includes(status)) {
    const existing = await getOrder(id);
    if (!existing?.proof_fingerprint || !existing?.proof_approved_at) {
      throw orderError("Approve the fingerprinted proof before moving this order into production.", 409);
    }
  }
  const existing = typeof payload.notes === "string" ? await getOrder(id) : null;
  const notes = typeof payload.notes === "string"
    ? encodeApprovalNotes(payload.notes, approvalFromOrder(existing))
    : undefined;
  const rows = await supabaseRequest(`/storybook_orders?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { ...(status ? { status } : {}), ...(notes !== undefined ? { notes } : {}), updated_at: new Date().toISOString() },
    prefer: "return=representation",
  });
  return rows[0] ? decorateOrder(rows[0]) : null;
}

async function approveOrderProof(id, approvedBy) {
  const order = await getOrder(id);
  if (!order) return null;
  if (!["paid", "proofing", "approved"].includes(order.status)) throw orderError("Only paid or proofing orders can be approved.", 409);
  if (!order.monster_submission_id) throw orderError("This order is not connected to a saved monster.", 409);

  const stories = await listStories();
  const story = stories.find((item) => item.id === order.story_id || item.slug === order.story_id);
  if (!story) throw orderError("The order's master story could not be found.", 409);
  const assets = await getAdminMonsterAssets(order.monster_submission_id);
  const personalized = buildPersonalizedBook(story, {
    childName: order.child_name,
    monsterName: order.monster_name,
    selectedPreviewId: order.selected_preview_id,
  }, assets || {});
  if (!personalized.readiness.copyReady || !personalized.readiness.artworkReady || !personalized.readiness.monsterReady) {
    throw orderError("The proof cannot be approved until all 32 master pages have final artwork and the selected monster is available.", 409);
  }

  const approval = {
    proofFingerprint: personalized.fingerprint,
    masterStoryVersion: personalized.masterVersion,
    proofApprovedAt: new Date().toISOString(),
    proofApprovedBy: cleanApprover(approvedBy),
    luluPrintJobId: null,
    luluSubmittedAt: null,
  };
  const rows = await supabaseRequest(`/storybook_orders?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: {
      status: "approved",
      notes: encodeApprovalNotes(order.notes, approval),
      updated_at: new Date().toISOString(),
    },
    prefer: "return=representation",
  });
  return rows[0] ? decorateOrder(rows[0]) : null;
}

async function revokeOrderProofApproval(id) {
  const order = await getOrder(id);
  if (!order) return null;
  if (order.lulu_print_job_id) throw orderError("Approval cannot be revoked after the order has been sent to Lulu.", 409);
  const rows = await supabaseRequest(`/storybook_orders?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: {
      status: order.status === "approved" ? "proofing" : order.status,
      notes: encodeApprovalNotes(order.notes, null),
      updated_at: new Date().toISOString(),
    },
    prefer: "return=representation",
  });
  return rows[0] ? decorateOrder(rows[0]) : null;
}

async function getOrder(id) {
  if (!id) throw orderError("Choose an order.");
  const rows = await supabaseRequest(`/storybook_orders?id=eq.${encodeURIComponent(id)}&select=*`);
  return rows[0] ? decorateOrder(rows[0]) : null;
}

function decorateOrder(row) {
  const parsed = parseApprovalNotes(row?.notes);
  const approval = parsed.approval || {};
  return {
    ...row,
    notes: parsed.notes,
    proof_fingerprint: approval.proofFingerprint || null,
    master_story_version: approval.masterStoryVersion || null,
    proof_approved_at: approval.proofApprovedAt || null,
    proof_approved_by: approval.proofApprovedBy || null,
    lulu_print_job_id: approval.luluPrintJobId || null,
    lulu_submitted_at: approval.luluSubmittedAt || null,
  };
}

function approvalFromOrder(order) {
  return order?.proof_fingerprint ? {
    proofFingerprint: order.proof_fingerprint,
    masterStoryVersion: order.master_story_version,
    proofApprovedAt: order.proof_approved_at,
    proofApprovedBy: order.proof_approved_by,
    luluPrintJobId: order.lulu_print_job_id,
    luluSubmittedAt: order.lulu_submitted_at,
  } : null;
}

function parseApprovalNotes(value) {
  const notes = typeof value === "string" ? value : "";
  const markerIndex = notes.lastIndexOf(APPROVAL_MARKER);
  if (markerIndex < 0) return { notes, approval: null };
  try {
    const encoded = notes.slice(markerIndex + APPROVAL_MARKER.length).trim();
    const approval = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return { notes: notes.slice(0, markerIndex).trim(), approval };
  } catch { return { notes, approval: null }; }
}

function encodeApprovalNotes(notes, approval) {
  const cleanNotes = parseApprovalNotes(notes).notes.trim().slice(0, 1300);
  if (!approval) return cleanNotes;
  const encoded = Buffer.from(JSON.stringify(approval), "utf8").toString("base64url");
  return `${cleanNotes}${APPROVAL_MARKER}${encoded}`.slice(0, 2000);
}

function cleanApprover(value) {
  const approver = typeof value === "string" ? value.trim().slice(0, 160) : "";
  return approver || "MonstersNOW admin";
}

function orderError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.code = "invalid_order_approval";
  return error;
}

module.exports = { approveOrderProof, decorateOrder, encodeApprovalNotes, listOrders, parseApprovalNotes, recordCheckoutOrder, revokeOrderProofApproval, updateOrder };
