const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const {
  buildStorybookInterestSubmission,
  sendStorybookInterestEmail,
  storybookInterestErrorToResponse,
} = require("../lib/storybook-interest");
const { assertAdminRequest } = require("../lib/admin-auth");
const { createStory, getStory, listStories, updateStory } = require("../lib/story-library");

module.exports = async function handler(request, response) {
  if (["GET", "PUT", "PATCH"].includes(request.method)) {
    return handleAdminStories(request, response);
  }

  if (request.method !== "POST") {
    return rejectUnsupportedMethod(request, response, ["GET", "POST", "PUT", "PATCH"]);
  }

  let body;

  try {
    body = await readJsonBody(request);
  } catch {
    return sendJson(response, 400, {
      code: "invalid_json",
      error: "Invalid JSON body.",
    });
  }

  try {
    const submission = buildStorybookInterestSubmission(body);
    const result = await sendStorybookInterestEmail(submission);

    return sendJson(response, 200, {
      mode: "email",
      submissionId: submission.submissionId,
      emailId: result.emailId,
      warnings: submission.warnings,
      message: "Storybook interest submitted.",
    });
  } catch (error) {
    const { status, payload } = storybookInterestErrorToResponse(error);

    if (status >= 500) {
      console.error("Storybook interest submission failed", {
        message: error?.message,
        code: error?.code,
        status: error?.status,
        missing: error?.missing,
        service: error?.service,
      });
    }

    return sendJson(response, status, payload);
  }
};

async function handleAdminStories(request, response) {
  try {
    assertAdminRequest(request);
    const id = firstQueryValue(request.query?.id);

    if (request.method === "GET") {
      const data = id ? await getStory(id) : await listStories();
      if (id && !data) return sendJson(response, 404, { error: "Story not found." });
      return sendJson(response, 200, { stories: id ? [data] : data });
    }

    const payload = await readJsonBody(request);
    const story = request.method === "PUT" ? await createStory(payload) : await updateStory(id, payload);
    if (!story) return sendJson(response, 404, { error: "Story not found." });
    return sendJson(response, request.method === "PUT" ? 201 : 200, { story });
  } catch (error) {
    if ((error.status || 500) >= 500) {
      console.error("Admin story request failed", { code: error.code, message: error.message });
    }
    return sendJson(response, error.status || 500, {
      code: error.code || "admin_story_failed",
      error: error.message || "Story request failed.",
    });
  }
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value || "";
}
