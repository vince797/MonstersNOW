const crypto = require("node:crypto");

function verifyStripeEvent(raw, header, secret, options = {}) {
  if (!secret) throw Object.assign(new Error("Stripe webhook is not configured."), { status: 503 });
  const pieces = String(header || "").split(",").map((part) => part.split("="));
  const timestamp = pieces.find(([key]) => key === "t")?.[1];
  const now = options.now ?? Date.now();
  if (!/^\d+$/.test(timestamp || "") || Math.abs(now / 1000 - Number(timestamp)) > 300) throw new Error("Invalid webhook timestamp.");
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  const valid = pieces.some(([key, value]) => key === "v1" && /^[a-f0-9]{64}$/.test(value || "") && crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected)));
  if (!valid) throw new Error("Invalid webhook signature.");
  const event = JSON.parse(raw);
  if (typeof options.livemode === "boolean" && event.livemode !== options.livemode) {
    throw new Error(options.livemode ? "Test events are not allowed on the live endpoint." : "Live events are not allowed on the test endpoint.");
  }
  return event;
}

async function readRawBody(request) {
  const maxBytes = 1024 * 1024;
  if (request[Symbol.asyncIterator] && !request.readableEnded) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes) throw new Error("Webhook body is too large.");
      chunks.push(buffer);
    }
    if (bytes) return Buffer.concat(chunks).toString("utf8");
  }
  if (Buffer.isBuffer(request.body)) {
    if (request.body.length > maxBytes) throw new Error("Webhook body is too large.");
    return request.body.toString("utf8");
  }
  if (typeof request.body === "string") {
    if (Buffer.byteLength(request.body) > maxBytes) throw new Error("Webhook body is too large.");
    return request.body;
  }
  if (request.body) throw new Error("Webhook body must not be JSON-parsed.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) throw new Error("Webhook body is too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

module.exports = { readRawBody, verifyStripeEvent };
