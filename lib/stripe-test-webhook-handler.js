const { rejectUnsupportedMethod, sendJson } = require("./http");
const { verifyTestEvent, readRawBody } = require("./stripe-test-events");
const { supabaseRequest } = require("./story-library");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") return rejectUnsupportedMethod(request, response, ["POST"]);
  let event;
  try {
    event = verifyTestEvent(await readRawBody(request), request.headers["stripe-signature"], process.env.STRIPE_TEST_WEBHOOK_SECRET);
  } catch (error) {
    return sendJson(response, error.status || 400, { error: "Test webhook configuration or signature is invalid." });
  }
  const session = event.data?.object;
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type) || session?.payment_status !== "paid" || session?.metadata?.test_order !== "yes") return sendJson(response, 200, { received: true });
  if (!/^cs_test_[A-Za-z0-9]+$/.test(session.id || "") || !/^test-/.test(session.metadata.submission_id || "")) return sendJson(response, 400, { error: "Invalid test order." });
  try {
    // Filter by both identifiers and the initial status: replayed events cannot
    // regress a reviewed order. There is deliberately no Lulu call here.
    await supabaseRequest(`/storybook_orders?stripe_checkout_session_id=eq.${encodeURIComponent(session.id)}&submission_id=eq.${encodeURIComponent(session.metadata.submission_id)}&status=eq.checkout_started`, {
      method: "PATCH", body: { status: "paid", updated_at: new Date().toISOString() }, prefer: "return=representation",
    });
    return sendJson(response, 200, { received: true });
  } catch {
    return sendJson(response, 503, { error: "Test payment could not be recorded. Retry the event." });
  }
};
module.exports.config = { api: { bodyParser: false } };
