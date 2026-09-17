const crypto = require("node:crypto");

function verifyTestEvent(raw, header, secret, now = Date.now()) {
  if (!secret) throw Object.assign(new Error("Test webhook is not configured."), { status: 503 });
  const pieces = String(header || "").split(",").map((part) => part.split("="));
  const timestamp = pieces.find(([key]) => key === "t")?.[1];
  if (!/^\d+$/.test(timestamp || "") || Math.abs(now / 1000 - Number(timestamp)) > 300) throw new Error("Invalid webhook timestamp.");
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  const valid = pieces.some(([key, value]) => key === "v1" && /^[a-f0-9]{64}$/.test(value || "") && crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected)));
  if (!valid) throw new Error("Invalid webhook signature.");
  const event = JSON.parse(raw);
  if (event.livemode !== false) throw new Error("Live events are not allowed on the test endpoint.");
  return event;
}

async function readRawBody(request) {
  if (Buffer.isBuffer(request.body)) return request.body.toString("utf8");
  if (typeof request.body === "string") return request.body;
  if (request.body) throw new Error("Webhook body must not be JSON-parsed.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 1024 * 1024) throw new Error("Webhook body is too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
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
