const { readRawBody, verifyStripeEvent } = require("./stripe-webhook-events");

function verifyTestEvent(raw, header, secret, now = Date.now()) {
  if (!secret) throw Object.assign(new Error("Test webhook is not configured."), { status: 503 });
  return verifyStripeEvent(raw, header, secret, { livemode: false, now });
}

async function getTestSession(id) {
  const key = process.env.STRIPE_TEST_SECRET_KEY || "";
  if (!key.startsWith("sk_test_")) throw Object.assign(new Error("Test checkout is not configured."), { status: 503 });
  if (!/^cs_test_[A-Za-z0-9]+$/.test(id || "")) throw new Error("Invalid test checkout session.");
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${key}` } });
  const session = await response.json();
  if (!response.ok || session.livemode !== false || session.metadata?.test_order !== "yes") throw new Error("Test checkout session not found.");
  return session;
}

module.exports = { verifyTestEvent, readRawBody, getTestSession };
