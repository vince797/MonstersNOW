const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_GLOBAL_DAILY_LIMIT,
  enforceAiRateLimit,
  normalizeAddress,
  resetAiRateLimitMemory,
} = require("../lib/ai-abuse-protection");

const root = path.resolve(__dirname, "..");
const SUBMISSION_ID = "123e4567-e89b-42d3-a456-426614174000";
const SUBMISSION_TOKEN = "saved-monster-token-that-is-long-enough-for-test";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "AI_GLOBAL_DAILY_LIMIT", "AI_RATE_LIMITS_ENABLED", "OPENAI_API_KEY", "TURNSTILE_ENABLED", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"];

function request(ip = "203.0.113.10", extra = {}) {
  return { method: "POST", headers: { "x-forwarded-for": `${ip}, 10.0.0.1` }, ...extra };
}

function responseStub() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function json(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: new Map(), json: async () => body };
}

async function scenario(env, fetchImpl, run) {
  const previousEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const previousFetch = global.fetch;
  const previousWarn = console.warn;
  const warnings = [];
  ENV_KEYS.forEach((key) => delete process.env[key]);
  Object.entries(env).forEach(([key, value]) => { process.env[key] = value; });
  global.fetch = fetchImpl || (async (url) => { throw new Error(`Unexpected request: ${url}`); });
  console.warn = (...args) => warnings.push(args.join(" "));
  resetAiRateLimitMemory();
  try {
    return await run(warnings);
  } finally {
    global.fetch = previousFetch;
    console.warn = previousWarn;
    ENV_KEYS.forEach((key) => { if (previousEnv[key] === undefined) delete process.env[key]; else process.env[key] = previousEnv[key]; });
    resetAiRateLimitMemory();
  }
}

const supabaseEnv = { SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "mock" };

test("without the durable store, monster previews fall back to memory limits per session and per IP", () => scenario({}, null, async () => {
  for (let index = 0; index < 8; index += 1) {
    assert.deepEqual(await enforceAiRateLimit(request(), { scope: "monster", sessionId: "session-a" }), { store: "memory" });
  }
  await assert.rejects(enforceAiRateLimit(request(), { scope: "monster", sessionId: "session-a" }), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.code, "ai_session_limit");
    assert.match(error.message, /This drawing has had lots of tries today/);
    assert.ok(error.retryAfterSeconds > 20 * 60 * 60);
    return true;
  });
  // A new drawing from the same network still works until the hourly IP limit (20).
  for (let index = 0; index < 12; index += 1) await enforceAiRateLimit(request(), { scope: "monster", sessionId: `session-${index}` });
  await assert.rejects(enforceAiRateLimit(request(), { scope: "monster", sessionId: "session-new" }), (error) => {
    assert.equal(error.code, "ai_rate_limited");
    assert.match(error.message, /lot of monster magic.*about (an hour|\d+ minutes)/);
    return true;
  });
  // Other visitors are unaffected.
  await enforceAiRateLimit(request("198.51.100.7"), { scope: "monster", sessionId: "session-b" });
  // Scopes are independent: child renders have their own budget.
  await enforceAiRateLimit(request(), { scope: "child", sessionId: "session-a" });
}));

test("the durable store receives hashed IP, session, and global daily buckets in one atomic call", () => {
  const calls = [];
  return scenario({ ...supabaseEnv, AI_GLOBAL_DAILY_LIMIT: "250" }, async (url, options) => {
    calls.push({ url, options });
    return json({ allowed: true, bucket: null, retry_after_seconds: 0 });
  }, async () => {
    assert.deepEqual(await enforceAiRateLimit(request("203.0.113.10"), { scope: "child", sessionId: SUBMISSION_ID }), { store: "supabase" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://db.example.com/rest/v1/rpc/consume_ai_rate_limits");
    assert.equal(calls[0].options.headers.Authorization, "Bearer mock");
    const { p_buckets: buckets } = JSON.parse(calls[0].options.body);
    assert.doesNotMatch(calls[0].options.body, /203\.0\.113\.10/, "raw IPs are never stored");
    assert.deepEqual(buckets.map((item) => [item.bucket.replace(/[a-f0-9]{32}$/, "<ip>"), item.limit, item.window_seconds]), [
      ["child:ip-hour:<ip>", 30, 3600],
      ["child:ip-day:<ip>", 80, 86400],
      [`child:session:${SUBMISSION_ID}`, 12, 86400],
      [`ai:global-day:${new Date().toISOString().slice(0, 10)}`, 250, 86400],
    ]);
  });
});

test("uploads are limited per IP only, and the global cap can be turned off", () => {
  const bodies = [];
  return scenario({ ...supabaseEnv, AI_GLOBAL_DAILY_LIMIT: "off" }, async (url, options) => {
    bodies.push(JSON.parse(options.body).p_buckets);
    return json({ allowed: true, bucket: null, retry_after_seconds: 0 });
  }, async () => {
    await enforceAiRateLimit(request(), { scope: "upload" });
    await enforceAiRateLimit(request(), { scope: "monster", sessionId: "s" });
    assert.deepEqual(bodies[0].map((item) => item.limit), [15, 40]);
    assert.equal(bodies[1].some((item) => item.bucket.startsWith("ai:global-day:")), false);
  });
});

test("the global daily cap defaults to 1000 and tells visitors to come back tomorrow", () => scenario(supabaseEnv, async (url, options) => {
  const buckets = JSON.parse(options.body).p_buckets;
  const global = buckets.find((item) => item.bucket.startsWith("ai:global-day:"));
  assert.equal(global.limit, DEFAULT_GLOBAL_DAILY_LIMIT);
  assert.equal(DEFAULT_GLOBAL_DAILY_LIMIT, 1000);
  return json({ allowed: false, bucket: global.bucket, hits: 1000, limit: 1000, retry_after_seconds: 50000 });
}, async () => {
  await assert.rejects(enforceAiRateLimit(request(), { scope: "monster", sessionId: "s" }), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.code, "ai_daily_capacity_reached");
    assert.match(error.message, /come back tomorrow/);
    assert.ok(error.retryAfterSeconds >= 60 && error.retryAfterSeconds <= 86400);
    return true;
  });
}));

test("a missing rate limit table falls back to memory limits and warns once", () => scenario(supabaseEnv, async () => json({ code: "PGRST202", message: "Could not find the function public.consume_ai_rate_limits" }, 404), async (warnings) => {
  assert.deepEqual(await enforceAiRateLimit(request(), { scope: "upload" }), { store: "memory" });
  assert.deepEqual(await enforceAiRateLimit(request(), { scope: "upload" }), { store: "memory" });
  assert.equal(warnings.filter((line) => /Apply migration 20261008150000/.test(line)).length, 1);
  for (let index = 2; index < 15; index += 1) await enforceAiRateLimit(request(), { scope: "upload" });
  await assert.rejects(enforceAiRateLimit(request(), { scope: "upload" }), /uploaded lots of drawings/);
}));

test("a slow or failing store never blocks generation by itself", () => scenario(supabaseEnv, async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); }, async (warnings) => {
  assert.deepEqual(await enforceAiRateLimit(request(), { scope: "child", sessionId: "s" }), { store: "memory" });
  assert.equal(warnings.length, 1);
}));

test("rate limits can be switched off in an emergency", () => scenario({ ...supabaseEnv, AI_RATE_LIMITS_ENABLED: "false" }, null, async () => {
  for (let index = 0; index < 30; index += 1) assert.deepEqual(await enforceAiRateLimit(request(), { scope: "monster", sessionId: "s" }), { store: "disabled" });
}));

test("IPv6 visitors are grouped by /64 so rotating addresses share one limit", () => {
  assert.equal(normalizeAddress("2001:db8:abcd:12:1:2:3:4"), "2001:db8:abcd:12::/64");
  assert.equal(normalizeAddress("2001:db8:abcd:12:ffff::9"), "2001:db8:abcd:12::/64");
  assert.equal(normalizeAddress("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(normalizeAddress("::ffff:198.51.100.2"), "198.51.100.2");
  assert.equal(normalizeAddress("198.51.100.2:443"), "198.51.100.2");
  return scenario({}, null, async () => {
    for (let index = 0; index < 15; index += 1) await enforceAiRateLimit(request(`2001:db8:abcd:12::${index + 1}`), { scope: "upload" });
    await assert.rejects(enforceAiRateLimit(request("2001:db8:abcd:12:aaaa::1"), { scope: "upload" }), (error) => error.status === 429);
  });
});

function submissionFetch({ rateLimit, extra } = {}) {
  const calls = [];
  const handler = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/rest/v1/rpc/consume_ai_rate_limits")) return json(rateLimit(JSON.parse(options.body).p_buckets));
    if (String(url).includes("/rest/v1/monster_submissions?id=eq.")) {
      return json([{ id: SUBMISSION_ID, access_token_hash: crypto.createHash("sha256").update(SUBMISSION_TOKEN).digest("hex"), status: "draft", expires_at: "2099-01-01T00:00:00.000Z" }]);
    }
    if (extra) {
      const result = await extra(String(url), options);
      if (result) return result;
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return { calls, handler };
}

test("monster generation answers 429 with Retry-After before any OpenAI call when limited", () => {
  const { calls, handler } = submissionFetch({
    rateLimit: (buckets) => ({ allowed: false, bucket: buckets.find((item) => item.bucket.includes(":session:")).bucket, retry_after_seconds: 5400 }),
  });
  return scenario({ ...supabaseEnv, OPENAI_API_KEY: "sk-test" }, handler, async () => {
    const response = responseStub();
    await require("../api/convert-monster")(request("203.0.113.10", {
      body: { drawing: PNG, submissionId: SUBMISSION_ID, submissionToken: SUBMISSION_TOKEN, variationNumber: 1 },
    }), response);
    assert.equal(response.code, 429);
    assert.equal(response.headers["Retry-After"], "5400");
    assert.equal(response.body.code, "ai_session_limit");
    assert.equal(response.body.retryAfterSeconds, 5400);
    assert.match(response.body.error, /about 2 hours/);
    assert.equal(calls.some((call) => call.url.includes("openai.com")), false);
    assert.equal(calls.some((call) => call.url.includes("/monster_previews")), false);
  });
});

test("child character rendering answers 429 before any OpenAI call when limited", () => {
  const { calls, handler } = submissionFetch({
    rateLimit: (buckets) => ({ allowed: false, bucket: buckets[0].bucket, retry_after_seconds: 600 }),
  });
  return scenario({ ...supabaseEnv, OPENAI_API_KEY: "sk-test" }, handler, async () => {
    const response = responseStub();
    await require("../api/render-child-character")(request("203.0.113.10", {
      body: { submissionId: SUBMISSION_ID, submissionToken: SUBMISSION_TOKEN, profile: { id: "light-short-brown" } },
    }), response);
    assert.equal(response.code, 429);
    assert.equal(response.headers["Retry-After"], "600");
    assert.equal(response.body.code, "ai_rate_limited");
    assert.match(response.body.error, /about 10 minutes/);
    assert.equal(calls.some((call) => call.url.includes("openai.com")), false);
  });
});

test("an allowed request consumes the monster session bucket for that submission", () => {
  const seen = [];
  const { handler } = submissionFetch({
    rateLimit: (buckets) => { seen.push(...buckets.map((item) => item.bucket)); return { allowed: true, bucket: null, retry_after_seconds: 0 }; },
    extra: async (url) => {
      if (url.includes("api.openai.com/v1/responses")) return json({ output_text: JSON.stringify({ contains_drawing: false, reason: "test" }) });
      return null;
    },
  });
  return scenario({ ...supabaseEnv, OPENAI_API_KEY: "sk-test" }, handler, async () => {
    const previousError = console.error;
    console.error = () => {};
    try {
      await require("../api/convert-monster")(request("203.0.113.10", {
        body: { drawing: PNG, submissionId: SUBMISSION_ID, submissionToken: SUBMISSION_TOKEN },
      }), responseStub());
    } finally { console.error = previousError; }
    assert.ok(seen.includes(`monster:session:${SUBMISSION_ID}`));
  });
});

function uploadRequest(body, ip = "203.0.113.10") {
  return { method: "POST", query: { resource: "monster-submissions" }, headers: { "x-forwarded-for": ip }, body };
}

test("drawing uploads are rate limited with a friendly message", () => scenario(supabaseEnv, async (url, options) => {
  if (String(url).includes("/rpc/consume_ai_rate_limits")) {
    const buckets = JSON.parse(options.body).p_buckets;
    return json({ allowed: false, bucket: buckets[0].bucket, retry_after_seconds: 1200 });
  }
  throw new Error(`Unexpected request: ${url}`);
}, async () => {
  const response = responseStub();
  await require("../api/storybook-interest")(uploadRequest({ drawing: PNG }), response);
  assert.equal(response.code, 429);
  assert.equal(response.headers["Retry-After"], "1200");
  assert.match(response.body.error, /uploaded lots of drawings.*20 minutes/);
}));

test("the bot check is off by default and the storefront can read its config", () => scenario({}, null, async () => {
  const response = responseStub();
  await require("../api/storybook-interest")({ method: "GET", query: { resource: "monster-submissions" }, headers: {} }, response);
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, { botCheck: { enabled: false } });
  assert.equal(response.headers["Cache-Control"], "public, max-age=300");
}));

test("the bot check stays off when the flag is on but keys are missing", () => scenario({ TURNSTILE_ENABLED: "true", TURNSTILE_SITE_KEY: "0x4AAA" }, null, async () => {
  const { publicBotCheckConfig } = require("../lib/bot-check");
  assert.deepEqual(publicBotCheckConfig(), { enabled: false });
}));

test("with Turnstile enabled, uploads need a verified token", () => {
  const siteverify = [];
  return scenario({ ...supabaseEnv, TURNSTILE_ENABLED: "true", TURNSTILE_SITE_KEY: "0x4AAA-site", TURNSTILE_SECRET_KEY: "0x4AAA-secret" }, async (url, options = {}) => {
    url = String(url);
    if (url.includes("/rpc/consume_ai_rate_limits")) return json({ allowed: true, bucket: null, retry_after_seconds: 0 });
    if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
      const form = new URLSearchParams(options.body);
      siteverify.push(form);
      if (form.get("response") === "network-down") throw new Error("ECONNRESET");
      return json(form.get("response") === "good-token"
        ? { success: true, action: "monster_upload", hostname: "www.monstersnow.com" }
        : { success: false, "error-codes": ["invalid-input-response"] });
    }
    if (url.includes("/rest/v1/monster_submissions")) return json([]);
    if (url.includes("/storage/v1/object/monster-submissions/")) return json({ Key: "saved" });
    throw new Error(`Unexpected request: ${url}`);
  }, async () => {
    const handler = require("../api/storybook-interest");
    let response = responseStub();
    await handler(uploadRequest({ drawing: PNG }), response);
    assert.equal(response.code, 403);
    assert.equal(response.body.code, "bot_check_required");
    assert.deepEqual(response.body.botCheck, { enabled: true, provider: "turnstile", siteKey: "0x4AAA-site", action: "monster_upload" });
    assert.equal(siteverify.length, 0);

    response = responseStub();
    await handler(uploadRequest({ drawing: PNG, turnstileToken: "bad-token" }), response);
    assert.equal(response.code, 403);
    assert.equal(response.body.code, "bot_check_failed");

    response = responseStub();
    await handler(uploadRequest({ drawing: PNG, turnstileToken: "good-token" }), response);
    assert.equal(response.code, 201);
    assert.ok(response.body.submission.id);
    const verified = siteverify.at(-1);
    assert.equal(verified.get("secret"), "0x4AAA-secret");
    assert.equal(verified.get("remoteip"), "203.0.113.10");
    assert.ok(verified.get("idempotency_key"));

    // If Cloudflare is unreachable the upload continues (rate limits still apply).
    response = responseStub();
    await handler(uploadRequest({ drawing: PNG, turnstileToken: "network-down" }), response);
    assert.equal(response.code, 201);
  });
});

test("the storefront shows limit messages, loads Turnstile only when enabled, and CSP allows it", () => {
  const main = fs.readFileSync(path.join(root, "scripts/main.js"), "utf8");
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const csp = vercel.headers.flatMap((entry) => entry.headers).find((header) => header.key === "Content-Security-Policy").value;
  assert.match(main, /async function getBotCheckToken/);
  assert.match(main, /if \(!config\?\.enabled \|\| config\.provider !== "turnstile" \|\| !config\.siteKey\) return null;/);
  assert.match(main, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(main, /error\?\.status === 429/);
  assert.match(main, /turnstileToken/);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net https:\/\/challenges\.cloudflare\.com;/);
  assert.match(csp, /frame-src https:\/\/challenges\.cloudflare\.com;/);
});

test("the rate limit migration is service-role only and atomic", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/20261008150000_add_ai_rate_limits.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.ai_rate_limits/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on function public\.consume_ai_rate_limits\(jsonb\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.consume_ai_rate_limits\(jsonb\) to service_role/);
  assert.match(sql, /for update/);
});
