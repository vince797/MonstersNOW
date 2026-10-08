const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");
const {
  buildStorybookInterestSubmission,
  sendStorybookInterestEmail,
  storybookInterestErrorToResponse,
} = require("../lib/storybook-interest");
const { applyAdminAuthHeaders, assertAdminRequest } = require("../lib/admin-auth");
const { adminDataErrorContext, shouldLogAdminDataError } = require("../lib/admin-errors");
const { createStory, ensureCatalogStories, getStory, listStories, updateStory } = require("../lib/story-library");
const { listOrders, updateOrder } = require("../lib/order-library");
const { importManuscript } = require("../lib/manuscript-import");
const { uploadStoryArtwork } = require("../lib/story-artwork");
const { createMonsterSubmission, deleteAdminMonster, finalizeMonsterSubmission, listAdminMonsters } = require("../lib/monster-submissions");
const { enforceAiRateLimit, isAiLimitError, sendAiProtectionError } = require("../lib/ai-abuse-protection");
const { publicBotCheckConfig, verifyBotCheck } = require("../lib/bot-check");
const { createAdminStoryProof } = require("../lib/admin-story-proof");
const { getCustomerOrderView, reviewCustomerProof } = require("../lib/customer-orders");
const { confirmBookReviewUpload, createBookReviewUpload, listBookReviewFiles } = require("../lib/book-review-files");

module.exports = async function handler(request, response) {
  const resource = firstQueryValue(request.query?.resource) || new URL(request.url, "https://monstersnow.com").searchParams.get("resource");
  const testHandlers = {
    "halloween-proof": "../lib/halloween-proof-handler",
    "halloween-test-checkout": "../lib/halloween-test-checkout-handler",
    "halloween-checkout-status": "../lib/halloween-checkout-status-handler",
    "stripe-test-webhook": "../lib/stripe-test-webhook-handler",
    "stripe-webhook": "../lib/stripe-webhook-handler",
  };
  if (Object.hasOwn(testHandlers, resource)) return require(testHandlers[resource])(request, response);
  if (resource === "customer-order") {
    response.setHeader("Cache-Control", "private, no-store");
    try {
      const token = bearerToken(request) || firstQueryValue(request.query?.token);
      if (request.method === "GET") return sendJson(response, 200, { order: await getCustomerOrderView(token) });
      if (request.method === "POST") return sendJson(response, 200, { order: await reviewCustomerProof(token, await readJsonBody(request)) });
      return rejectUnsupportedMethod(request, response, ["GET", "POST"]);
    } catch (error) {
      if ((error.status || 500) >= 500) console.error("Customer order request failed", { code: error.code, message: error.message });
      return sendJson(response, error.status || 500, {
        code: error.code || "customer_order_failed",
        error: error.status && error.status < 500 ? error.message : "The order could not be opened.",
      });
    }
  }
  if (resource === "monster-submissions" && request.method === "GET") {
    // Tells the storefront whether to show the optional "I'm human" check.
    response.setHeader("Cache-Control", "public, max-age=300");
    return sendJson(response, 200, { botCheck: publicBotCheckConfig() });
  }
  if (resource === "monster-submissions" && ["POST", "PATCH"].includes(request.method)) {
    try {
      const payload = await readJsonBody(request);
      if (request.method === "POST") {
        // A saved submission unlocks the paid AI endpoints, so uploads are
        // rate limited and (when enabled) bot checked.
        await enforceAiRateLimit(request, { scope: "upload" });
        await verifyBotCheck(request, payload?.turnstileToken);
      }
      const submission = request.method === "POST"
        ? await createMonsterSubmission(payload)
        : await finalizeMonsterSubmission(payload);
      return sendJson(response, request.method === "POST" ? 201 : 200, { submission });
    } catch (error) {
      if (isAiLimitError(error)) return sendAiProtectionError(response, error);
      if ((error.status || 500) >= 500) console.error("Monster submission request failed", { code: error.code, message: error.message });
      return sendJson(response, error.status || 500, {
        code: error.code || "monster_submission_failed",
        error: error.message || "The monster submission could not be saved.",
      });
    }
  }
  if (resource === "story-proof" && request.method === "GET") {
    try {
      assertAdminRequest(request);
      const story = await getStory(firstQueryValue(request.query?.id));
      if (!story) return sendJson(response, 404, { error: "Story not found." });
      const pdf = createAdminStoryProof(story, {
        childName: firstQueryValue(request.query?.child_name),
        monsterName: firstQueryValue(request.query?.monster_name),
      });
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Content-Disposition", `attachment; filename="${story.slug}-editorial-proof.pdf"`);
      response.setHeader("Cache-Control", "private, no-store");
      return response.status(200).send(pdf);
    } catch (error) {
      applyAdminAuthHeaders(response, error);
      return sendJson(response, error.status || 500, { error: error.message || "The editorial proof could not be generated." });
    }
  }
  if (request.method === "POST" && firstQueryValue(request.query?.resource) === "manuscript") {
    try {
      assertAdminRequest(request);
      return sendJson(response, 200, await importManuscript(await readJsonBody(request)));
    } catch (error) {
      applyAdminAuthHeaders(response, error);
      return sendJson(response, error.status || 500, {
        code: error.code || "manuscript_import_failed",
        error: error.message || "The manuscript could not be imported.",
      });
    }
  }
  if (request.method === "POST" && resource === "artwork") {
    try {
      assertAdminRequest(request);
      return sendJson(response, 201, { artwork: await uploadStoryArtwork(await readJsonBody(request)) });
    } catch (error) {
      applyAdminAuthHeaders(response, error);
      return sendJson(response, error.status || 500, {
        code: error.code || "artwork_upload_failed",
        error: error.message || "Artwork could not be uploaded.",
      });
    }
  }
  if (request.method === "POST" && resource === "catalog-setup") {
    try {
      assertAdminRequest(request);
      return sendJson(response, 200, await ensureCatalogStories());
    } catch (error) {
      applyAdminAuthHeaders(response, error);
      return sendJson(response, error.status || 500, {
        code: error.code || "catalog_setup_failed",
        error: error.message || "The catalog books could not be created.",
      });
    }
  }

  if (resource === "book-review-files") {
    try {
      assertAdminRequest(request);
      if (request.method !== "GET") return rejectUnsupportedMethod(request, response, ["GET"]);
      response.setHeader("Cache-Control", "private, no-store");
      return sendJson(response, 200, { files: await listBookReviewFiles(firstQueryValue(request.query?.story_slug)) });
    } catch (error) {
      applyAdminAuthHeaders(response, error);
      return sendJson(response, error.status || 500, { code: error.code || "review_files_failed", error: error.message || "Review files could not be opened." });
    }
  }

  if (resource === "book-review-upload") {
    try {
      assertAdminRequest(request);
      if (request.method !== "POST") return rejectUnsupportedMethod(request, response, ["POST"]);
      return sendJson(response, 200, await createBookReviewUpload(await readJsonBody(request)));
    } catch (error) {
      applyAdminAuthHeaders(response, error);
      return sendJson(response, error.status || 500, { code: error.code || "review_upload_failed", error: error.message || "The review upload could not be prepared." });
    }
  }

  if (resource === "book-review-confirm") {
    try {
      assertAdminRequest(request);
      if (request.method !== "POST") return rejectUnsupportedMethod(request, response, ["POST"]);
      const payload = await readJsonBody(request);
      return sendJson(response, 200, { file: await confirmBookReviewUpload(payload.id) });
    } catch (error) {
      applyAdminAuthHeaders(response, error);
      return sendJson(response, error.status || 500, { code: error.code || "review_confirm_failed", error: error.message || "The review upload could not be confirmed." });
    }
  }

  if (["GET", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    return handleAdminStories(request, response);
  }

  if (request.method !== "POST") {
    return rejectUnsupportedMethod(request, response, ["GET", "POST", "PUT", "PATCH", "DELETE"]);
  }

  let body;

  try {
    body = await readJsonBody(request, { maxBytes: 8 * 1024 * 1024 });
  } catch (error) {
    return sendJson(response, error.status || 400, {
      code: error.code || "invalid_json",
      error: error.status === 413 ? error.message : "Invalid JSON body.",
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
module.exports.config = { api: { bodyParser: false } };

async function handleAdminStories(request, response) {
  const resource = firstQueryValue(request.query?.resource) || "stories";
  try {
    assertAdminRequest(request);
    const id = firstQueryValue(request.query?.id);

    if (resource === "orders") {
      if (request.method === "GET") return sendJson(response, 200, { orders: await listOrders() });
      if (request.method === "PATCH") {
        const order = await updateOrder(id, await readJsonBody(request, { maxBytes: 28 * 1024 * 1024 }), { request });
        if (!order) return sendJson(response, 404, { error: "Order not found." });
        return sendJson(response, 200, { order });
      }
      return rejectUnsupportedMethod(request, response, ["GET", "PATCH"]);
    }

    if (resource === "monsters") {
      if (request.method === "GET") {
        response.setHeader("Cache-Control", "private, no-store");
        return sendJson(response, 200, { monsters: await listAdminMonsters() });
      }
      if (request.method === "DELETE") {
        const deleted = await deleteAdminMonster(id);
        if (!deleted) return sendJson(response, 404, { error: "Saved monster not found." });
        return sendJson(response, 200, { deleted: true, id });
      }
      return rejectUnsupportedMethod(request, response, ["GET", "DELETE"]);
    }

    if (request.method === "DELETE") return rejectUnsupportedMethod(request, response, ["GET", "PUT", "PATCH"]);

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
    applyAdminAuthHeaders(response, error);
    if (shouldLogAdminDataError(error)) {
      console.error("Admin data request failed", adminDataErrorContext(error, request, resource));
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

function bearerToken(request) {
  const value = request.headers?.get ? request.headers.get("authorization") : request.headers?.authorization;
  const match = typeof value === "string" && value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}
