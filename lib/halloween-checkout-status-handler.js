const { rejectUnsupportedMethod, sendJson } = require("./http");
const { getTestSession } = require("./stripe-test-events");

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") return rejectUnsupportedMethod(request, response, ["GET"]);
  try {
    const query = new URL(request.url, "https://monstersnow.com").searchParams;
    const session = await getTestSession(query.get("session_id"));
    return sendJson(response, 200, { testOrder: true, paymentStatus: session.payment_status, status: session.status, fulfillment: "disabled" });
  } catch (error) {
    return sendJson(response, error.status || 400, { error: "Could not verify this test checkout." });
  }
};
