const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  completeMonsterPreview,
  createMonsterSubmission,
  deleteAdminMonster,
  finalizeMonsterSubmission,
  startMonsterPreview,
} = require("../lib/monster-submissions");

const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test("monster submission is recorded before its private original is uploaded", async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "server-secret";
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/rest/v1/monster_submissions")) return jsonResponse([]);
    if (url.includes("/storage/v1/object/monster-submissions/")) return jsonResponse({ Key: "saved" });
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const submission = await createMonsterSubmission({ drawing: onePixelPng, filename: "Sam's monster.png" });
    assert.match(submission.id, /^[0-9a-f-]{36}$/);
    assert.ok(submission.token.length >= 40);
    assert.match(calls[0].url, /\/rest\/v1\/monster_submissions$/);
    assert.match(calls[1].url, /\/storage\/v1\/object\/monster-submissions\//);
    const saved = JSON.parse(calls[0].options.body)[0];
    assert.equal(saved.id, submission.id);
    assert.equal(saved.access_token_hash, crypto.createHash("sha256").update(submission.token).digest("hex"));
    assert.doesNotMatch(calls[0].options.body, new RegExp(submission.token));
    assert.equal(calls[1].options.headers.apikey, "server-secret");
    assert.equal(calls[1].options.headers.Authorization, "Bearer server-secret");
  } finally {
    global.fetch = originalFetch;
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SECRET_KEY = originalKey;
  }
});

test("admin deletion removes private files before the monster record", async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "server-secret";
  const submissionId = "11111111-1111-4111-8111-111111111111";
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes(`/monster_submissions?id=eq.${submissionId}`) && (options.method || "GET") === "GET") {
      return jsonResponse([{ id: submissionId, original_path: `${submissionId}/original.png` }]);
    }
    if (url.includes(`/monster_previews?submission_id=eq.${submissionId}`)) {
      return jsonResponse([{ preview_path: `${submissionId}/previews/one.png`, coloring_page_path: `${submissionId}/coloring/one.png` }]);
    }
    if (url.endsWith("/storage/v1/object/monster-submissions") && options.method === "DELETE") return jsonResponse([]);
    if (url.includes(`/monster_submissions?id=eq.${submissionId}`) && options.method === "DELETE") return jsonResponse([]);
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    assert.equal(await deleteAdminMonster(submissionId), true);
    const storageDelete = calls.find((call) => call.url.endsWith("/storage/v1/object/monster-submissions") && call.options.method === "DELETE");
    assert.deepEqual(JSON.parse(storageDelete.options.body).prefixes, [
      `${submissionId}/original.png`,
      `${submissionId}/previews/one.png`,
      `${submissionId}/coloring/one.png`,
    ]);
    const storageIndex = calls.indexOf(storageDelete);
    const rowIndex = calls.findIndex((call) => call.url.includes("/monster_submissions?id=eq.") && call.options.method === "DELETE");
    assert.ok(storageIndex < rowIndex);
  } finally {
    global.fetch = originalFetch;
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SECRET_KEY = originalKey;
  }
});

test("preview lifecycle persists pending work, private assets, and the selected result", async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "server-secret";
  const submissionId = "11111111-1111-4111-8111-111111111111";
  const previewId = "22222222-2222-4222-8222-222222222222";
  const token = "a-secure-opaque-token-that-is-long-enough-for-testing";
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes(`/monster_submissions?id=eq.${submissionId}`) && (options.method || "GET") === "GET") {
      return jsonResponse([{ id: submissionId, access_token_hash: tokenHash, expires_at: "2099-01-01T00:00:00.000Z" }]);
    }
    if (url.includes("/monster_previews?submission_id=") && url.includes("variation_number=eq.1")) return jsonResponse([]);
    if (url.endsWith("/rest/v1/monster_previews") && options.method === "POST") {
      return jsonResponse([{ id: previewId, submission_id: submissionId, variation_number: 1, status: "pending" }]);
    }
    if (url.includes(`/monster_previews?id=eq.${previewId}`) && url.includes("submission_id=eq.")) {
      return jsonResponse([{ id: previewId, submission_id: submissionId, status: "complete" }]);
    }
    if (url.includes("/storage/v1/object/monster-submissions/")) return jsonResponse({ Key: "saved" });
    if (url.includes(`/monster_previews?id=eq.${previewId}`) && options.method === "PATCH") {
      return jsonResponse([{ id: previewId, submission_id: submissionId, status: "complete" }]);
    }
    if (url.includes(`/monster_submissions?id=eq.${submissionId}`) && options.method === "PATCH") {
      return jsonResponse([{ id: submissionId, selected_preview_id: previewId, status: "ready" }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const pending = await startMonsterPreview({ submissionId, token, variationNumber: 1, styleId: "friendly", model: "image-model" });
    assert.equal(pending.id, previewId);
    const completed = await completeMonsterPreview({ submissionId, token, previewId, monsterImage: onePixelPng, coloringPage: onePixelPng });
    assert.equal(completed.status, "complete");
    const final = await finalizeMonsterSubmission({
      submissionId,
      token,
      selectedPreviewId: previewId,
      email: "parent@example.com",
      childName: "Sam",
      monsterName: "Noodle",
      storyId: "halloween-monster-night",
      format: "hardcover",
      featurePermission: { accepted: true },
    });
    assert.equal(final.status, "ready");
    const pendingInsert = calls.find((call) => call.url.endsWith("/rest/v1/monster_previews") && call.options.method === "POST");
    assert.equal(JSON.parse(pendingInsert.options.body)[0].status, "pending");
    assert.equal(calls.filter((call) => call.url.includes("/storage/v1/object/monster-submissions/")).length, 2);
    const finalPatch = calls.find((call) => call.url.includes(`/monster_submissions?id=eq.${submissionId}`) && call.options.method === "PATCH");
    assert.equal(JSON.parse(finalPatch.options.body).selected_preview_id, previewId);
  } finally {
    global.fetch = originalFetch;
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SECRET_KEY = originalKey;
  }
});

test("invalid image content and invalid submission tokens are rejected", async () => {
  await assert.rejects(
    createMonsterSubmission({ drawing: "data:image/png;base64,aGVsbG8=" }),
    /Upload a JPG, PNG, or WebP drawing/,
  );

  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "server-secret";
  global.fetch = async () => jsonResponse([{
    id: "11111111-1111-4111-8111-111111111111",
    access_token_hash: "0".repeat(64),
    expires_at: "2099-01-01T00:00:00.000Z",
  }]);
  try {
    await assert.rejects(
      startMonsterPreview({
        submissionId: "11111111-1111-4111-8111-111111111111",
        token: "the-wrong-token-that-is-still-long-enough-to-check",
        variationNumber: 1,
        styleId: "friendly",
        model: "image-model",
      }),
      /unavailable or expired/,
    );
  } finally {
    global.fetch = originalFetch;
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SECRET_KEY = originalKey;
  }
});
