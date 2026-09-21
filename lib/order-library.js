const { getStorybookProductVariant } = require("./lulu-products");
const { supabaseRequest } = require("./story-library");
const { getAdminMonsterAssets } = require("./monster-submissions");
const { buildPersonalizedBook } = require("./personalized-book");
const { prepareLuluSandboxStorybookOrder } = require("./storybook-lulu-order");
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

async function updateOrder(id, payload = {}, context = {}) {
  if (payload.action === "approve_proof") return approveOrderProof(id, payload.approvedBy);
  if (payload.action === "revoke_proof_approval") return revokeOrderProofApproval(id);
  if (payload.action === "submit_to_lulu") return submitOrderToLulu(id, payload, context.request);
  const allowedStatuses = ["checkout_started", "paid", "proofing", "approved", "printing", "shipped", "completed", "cancelled"];
  const status = allowedStatuses.includes(payload.status) ? payload.status : "";
  if (!id || (payload.status !== undefined && !status) || (payload.status === undefined && typeof payload.notes !== "string")) {
    const error = new Error("Choose a valid order status.");
    error.status = 400;
    error.code = "invalid_order_status";
    throw error;
  }
  const existing = await getOrder(id);
  assertAllowedStatusChange(existing, status);
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

function assertAllowedStatusChange(order, nextStatus) {
  if (!nextStatus || !order || nextStatus === order.status) return;
  if (nextStatus === "cancelled") return;
  if (order.payment_issue) throw orderError("Resolve the Stripe payment issue before advancing this order.", 409);
  if (nextStatus === "approved") throw orderError("Use proof approval to move an order to approved.", 409);
  if (nextStatus === "printing") throw orderError("Send the approved order to Lulu to begin printing.", 409);
  if (nextStatus === "shipped" && !order.lulu_print_job_id) throw orderError("A Lulu print job is required before marking an order shipped.", 409);
  const allowed = {
    checkout_started: ["paid"],
    paid: ["proofing"],
    proofing: [],
    approved: [],
    printing: ["shipped"],
    shipped: ["completed"],
    completed: [],
    cancelled: [],
  };
  if (!(allowed[order.status] || []).includes(nextStatus)) {
    throw orderError(`Move this order from ${String(order.status).replaceAll("_", " ")} through its next required step.`, 409);
  }
}

async function submitOrderToLulu(id, payload, request) {
  const order = await getOrder(id);
  if (!order) return null;
  if (!order.proof_fingerprint || !order.proof_approved_at || order.status !== "approved") {
    throw orderError("Approve the fingerprinted proof before sending this order to Lulu.", 409);
  }
  if (order.lulu_print_job_id) throw orderError("This order has already been sent to Lulu.", 409);
  if (order.payment_issue) throw orderError("Resolve the Stripe payment issue before sending this order to Lulu.", 409);
  if (!request) throw orderError("The Lulu submission request context is unavailable.", 500);

  const result = await prepareLuluSandboxStorybookOrder({
    submission_id: order.submission_id,
    external_id: `monstersnow-${order.id}`,
    title: order.story_label,
    story_label: order.story_label,
    style_label: order.monster_style,
    child_name: order.child_name,
    monster_name: order.monster_name,
    story_id: order.story_id,
    master_version: order.master_story_version,
    monster_submission_id: order.monster_submission_id,
    selected_preview_id: order.selected_preview_id,
    proof_fingerprint: order.proof_fingerprint,
    proof_approved_at: order.proof_approved_at,
    format: order.format_id,
    submit_print_job: true,
    contact_email: order.customer_email,
    shipping_level: payload.shippingLevel,
    shipping_address: normalizeLuluShippingAddress(payload.shippingAddress, order),
  }, request);
  const printJobId = result.printJob?.id;
  if (!printJobId) throw orderError("Lulu accepted the request but did not return a print job ID.", 502);
  const approval = {
    ...approvalFromOrder(order),
    luluPrintJobId: String(printJobId),
    luluSubmittedAt: new Date().toISOString(),
  };
  const rows = await supabaseRequest(`/storybook_orders?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { status: "printing", notes: encodeApprovalNotes(order.notes, approval), updated_at: new Date().toISOString() },
    prefer: "return=representation",
  });
  return rows[0] ? decorateOrder(rows[0]) : null;
}

async function approveOrderProof(id, approvedBy) {
  const order = await getOrder(id);
  if (!order) return null;
  if (!["proofing", "approved"].includes(order.status)) throw orderError("Move the paid order into proofing before approval.", 409);
  if (order.payment_issue) throw orderError("Resolve the Stripe payment issue before approving this proof.", 409);
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

function normalizeLuluShippingAddress(value, order) {
  const address = value && typeof value === "object" ? value : {};
  const saved = order.shipping_address && typeof order.shipping_address === "object" ? order.shipping_address : {};
  return {
    name: address.name || order.shipping_name,
    phone_number: address.phone_number || order.shipping_phone,
    street1: address.street1 || saved.line1,
    street2: address.street2 || saved.line2,
    city: address.city || saved.city,
    state_code: address.state_code || saved.state,
    postcode: address.postcode || saved.postal_code,
    country_code: address.country_code || saved.country,
  };
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

module.exports = { approveOrderProof, assertAllowedStatusChange, decorateOrder, encodeApprovalNotes, listOrders, parseApprovalNotes, recordCheckoutOrder, revokeOrderProofApproval, submitOrderToLulu, updateOrder };
