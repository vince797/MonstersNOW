const { guardReviewPreview } = require("../lib/review-preview-api-guard");
const { assertSandboxEndpointSecret, luluErrorToResponse } = require('../lib/lulu-sandbox');
const { rejectUnsupportedMethod, sendJson } = require('../lib/http');

// Do not let the legacy generic endpoint bypass exact-artifact order review.
module.exports = async function handler(request, response) {
  if (await guardReviewPreview(request, response)) return;
  if (request.method !== 'POST') return rejectUnsupportedMethod(request, response, ['POST']);
  try {
    assertSandboxEndpointSecret(request, { required: true });
    return sendJson(response, 409, {
      code: 'approved_artifact_handoff_unavailable',
      error: 'Print submission is disabled until the exact approved interior and binding-specific cover artifacts are verified and hosted. Generic file URLs cannot bypass order review.',
    });
  } catch (error) {
    const { status, payload } = luluErrorToResponse(error);
    return sendJson(response, status, payload);
  }
};
