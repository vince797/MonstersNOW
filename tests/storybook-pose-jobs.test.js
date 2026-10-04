const test = require("node:test");
const assert = require("node:assert/strict");
const { updatePoseJob } = require("../lib/storybook-pose-jobs");

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("paid pose generation fails closed before contacting the image provider", async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  const originalEnabled = process.env.MONSTERSNOW_POSE_GENERATION_ENABLED;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "server-secret";
  delete process.env.MONSTERSNOW_POSE_GENERATION_ENABLED;
  delete process.env.OPENAI_API_KEY;
  const jobId = "11111111-1111-4111-8111-111111111111";
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes(`/storybook_pose_jobs?id=eq.${jobId}`)) return jsonResponse([{
      id: jobId,
      submission_id: "22222222-2222-4222-8222-222222222222",
      source_preview_id: "33333333-3333-4333-8333-333333333333",
      story_id: "44444444-4444-4444-8444-444444444444",
      story_version: 1,
      status: "planned",
      pose_plan: { sourcePreviewId: "33333333-3333-4333-8333-333333333333", limits: { costCapCents: 50 }, baseAssets: [{ key: "monster:base:lead_walk" }], scenes: [] },
      model: "gpt-image-1.5",
      quality: "low",
      cost_cap_cents: 50,
      estimated_cost_cents: 3,
      actual_cost_cents: 0,
    }]);
    if (url.includes(`/storybook_pose_assets?job_id=eq.${jobId}`)) return jsonResponse([{
      id: "55555555-5555-4555-8555-555555555555",
      job_id: jobId,
      asset_key: "monster:base:lead_walk",
      subject_type: "monster",
      asset_kind: "base",
      pose_id: "lead_walk",
      status: "queued",
      attempts: 0,
      max_attempts: 2,
      has_transparency: false,
      identity_approved: false,
      anatomy_approved: false,
      qa: {},
    }]);
    if (url.includes(`/storybook_scene_mappings?job_id=eq.${jobId}`)) return jsonResponse([]);
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    await assert.rejects(
      updatePoseJob(jobId, { action: "generate_next", spendApproved: true }),
      (error) => error.code === "pose_generation_spend_disabled",
    );
    assert.equal(calls.some((call) => call.url.startsWith("https://api.openai.com/")), false);
    assert.equal(calls.some((call) => ["POST", "PATCH"].includes(call.options.method)), false);
  } finally {
    global.fetch = originalFetch;
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SECRET_KEY = originalKey;
    if (originalEnabled === undefined) delete process.env.MONSTERSNOW_POSE_GENERATION_ENABLED;
    else process.env.MONSTERSNOW_POSE_GENERATION_ENABLED = originalEnabled;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
  }
});
