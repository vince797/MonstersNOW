const { getStorybookProductVariant } = require("./lulu-products");
const { supabaseRequest } = require("./story-library");

async function listOrders() {
  return supabaseRequest("/storybook_orders?select=*&order=created_at.desc");
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
    updated_at: new Date().toISOString(),
  };
  const rows = await supabaseRequest("/storybook_orders?on_conflict=submission_id", {
    method: "POST",
    body: [order],
    prefer: "resolution=merge-duplicates,return=representation",
  });
  return rows[0];
}

async function updateOrder(id, payload = {}) {
  const allowedStatuses = ["checkout_started", "paid", "proofing", "approved", "printing", "shipped", "completed", "cancelled"];
  const status = allowedStatuses.includes(payload.status) ? payload.status : "";
  if (!id || (payload.status !== undefined && !status) || (payload.status === undefined && typeof payload.notes !== "string")) {
    const error = new Error("Choose a valid order status.");
    error.status = 400;
    error.code = "invalid_order_status";
    throw error;
  }
  const rows = await supabaseRequest(`/storybook_orders?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { ...(status ? { status } : {}), ...(typeof payload.notes === "string" ? { notes: payload.notes.trim().slice(0, 2000) } : {}), updated_at: new Date().toISOString() },
    prefer: "return=representation",
  });
  return rows[0] || null;
}

module.exports = { listOrders, recordCheckoutOrder, updateOrder };
