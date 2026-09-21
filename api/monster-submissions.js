const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const { createMonsterSubmission, finalizeMonsterSubmission } = require("../lib/monster-submissions");

module.exports = async function handler(request, response) {
  if (!["POST", "PATCH"].includes(request.method)) return rejectUnsupportedMethod(request, response, ["POST", "PATCH"]);
  try {
    const payload = await readJsonBody(request);
    const submission = request.method === "POST"
      ? await createMonsterSubmission(payload)
      : await finalizeMonsterSubmission(payload);
    return sendJson(response, request.method === "POST" ? 201 : 200, { submission });
  } catch (error) {
    if ((error.status || 500) >= 500) console.error("Monster submission request failed", { code: error.code, message: error.message });
    return sendJson(response, error.status || 500, {
      code: error.code || "monster_submission_failed",
      error: error.message || "The monster submission could not be saved.",
    });
  }
};
