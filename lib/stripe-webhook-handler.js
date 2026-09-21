const { rejectUnsupportedMethod, sendJson } = require("./http");
const { readRawBody, verifyStripeEvent } = require("./stripe-webhook-events");
const { supabaseRequest } = require("./story-library");

const paidEvents = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);
const cancelledEvents = new Set(["checkout.session.async_payment_failed", "checkout.session.expired"]);
const issueEvents = new Map([
  ["refund.created", "refund_created"],
  ["charge.dispute.created", "dispute_created"],
]);

module.exports = async function handler(request, response) {
  if (request.method !== "POST") return rejectUnsupportedMethod(request, response, ["POST"]);
  let event;
  try {
    event = verifyStripeEvent(await readRawBody(request), request.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET, { livemode: true });
  } catch (error) {
    return sendJson(response, error.status || 400, { error: "Webhook configuration or signature is invalid." });
  }

  const session = event.data?.object;
  if (issueEvents.has(event.type)) return recordPaymentIssue(event, response);
  if (!paidEvents.has(event.type) && !cancelledEvents.has(event.type)) return sendJson(response, 200, { received: true });
  if (!isLiveStorybookSession(session)) return sendJson(response, 400, { error: "Invalid live storybook order." });
  if (paidEvents.has(event.type) && session.payment_status !== "paid") return sendJson(response, 200, { received: true });

  try {
    const paid = paidEvents.has(event.type);
    const nextStatus = paid ? "paid" : "cancelled";
    const shipping = getShippingDetails(session);
    await supabaseRequest(`/storybook_orders?stripe_checkout_session_id=eq.${encodeURIComponent(session.id)}&submission_id=eq.${encodeURIComponent(session.metadata.submission_id)}&status=eq.checkout_started`, {
      method: "PATCH",
      body: {
        status: nextStatus,
        stripe_payment_status: cleanText(session.payment_status, 40),
        ...(paid ? buildPaidOrderFields(session, shipping, event.created) : {}),
        updated_at: new Date().toISOString(),
      },
      prefer: "return=representation",
    });
    return sendJson(response, 200, { received: true });
  } catch {
    return sendJson(response, 503, { error: "Payment status could not be recorded. Retry the event." });
  }
};

async function recordPaymentIssue(event, response) {
  const object = event.data?.object || {};
  const paymentIntentId = object.payment_intent?.id || object.payment_intent;
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId || "")) return sendJson(response, 400, { error: "Payment issue is missing its PaymentIntent." });
  try {
    await supabaseRequest(`/storybook_orders?stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}`, {
      method: "PATCH",
      body: { payment_issue: issueEvents.get(event.type), payment_issue_at: stripeTimestamp(event.created), updated_at: new Date().toISOString() },
      prefer: "return=representation",
    });
    return sendJson(response, 200, { received: true });
  } catch {
    return sendJson(response, 503, { error: "Payment issue could not be recorded. Retry the event." });
  }
}

function buildPaidOrderFields(session, shipping, created) {
  const totalDetails = session.total_details || {};
  return {
    stripe_payment_intent_id: objectId(session.payment_intent),
    stripe_customer_id: objectId(session.customer),
    stripe_paid_at: stripeTimestamp(created),
    stripe_subtotal_cents: cleanAmount(session.amount_subtotal),
    stripe_shipping_cents: cleanAmount(totalDetails.amount_shipping),
    stripe_tax_cents: cleanAmount(totalDetails.amount_tax),
    stripe_total_cents: cleanAmount(session.amount_total),
    currency: cleanText(session.currency, 3).toUpperCase() || "USD",
    shipping_name: cleanText(shipping?.name || session.customer_details?.name, 160),
    shipping_phone: cleanText(shipping?.phone || session.customer_details?.phone, 80),
    shipping_address: normalizeAddress(shipping?.address || session.customer_details?.address),
    payment_issue: null,
    payment_issue_at: null,
  };
}

function getShippingDetails(session) {
  return session.shipping_details || session.collected_information?.shipping_details || null;
}

function normalizeAddress(address) {
  if (!address) return null;
  return {
    line1: cleanText(address.line1, 200),
    line2: cleanText(address.line2, 200),
    city: cleanText(address.city, 120),
    state: cleanText(address.state, 120),
    postal_code: cleanText(address.postal_code, 40),
    country: cleanText(address.country, 2).toUpperCase(),
  };
}

function cleanAmount(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function objectId(value) {
  return cleanText(value?.id || value, 160) || null;
}

function stripeTimestamp(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

function isLiveStorybookSession(session) {
  return /^cs_live_[A-Za-z0-9]+$/.test(session?.id || "")
    && Boolean(session?.metadata?.submission_id)
    && session.metadata.test_order !== "yes"
    && !/^test-/.test(session.metadata.submission_id);
}

module.exports.config = { api: { bodyParser: false } };
module.exports.isLiveStorybookSession = isLiveStorybookSession;
module.exports.buildPaidOrderFields = buildPaidOrderFields;
