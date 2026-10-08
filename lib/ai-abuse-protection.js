const crypto = require("node:crypto");

// Abuse protection for the paid AI endpoints and the drawing upload that gates
// them. Limits are durable when the Supabase table from migration
// 20261008150000_add_ai_rate_limits.sql exists, and fall back to per-instance
// memory (same limits) when it does not, so the site keeps working either way.

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

// A normal customer uploads one drawing, makes up to 3 monster previews, and
// renders a few child-character versions. Limits leave generous room for
// retries and families sharing one network, while stopping scripted abuse.
const POLICIES = {
  upload: {
    ip: [{ name: "ip-hour", limit: 15, window: HOUR }, { name: "ip-day", limit: 40, window: DAY }],
    session: null,
    global: false,
  },
  monster: {
    ip: [{ name: "ip-hour", limit: 20, window: HOUR }, { name: "ip-day", limit: 60, window: DAY }],
    session: { limit: 8, window: DAY },
    global: true,
  },
  child: {
    ip: [{ name: "ip-hour", limit: 30, window: HOUR }, { name: "ip-day", limit: 80, window: DAY }],
    session: { limit: 12, window: DAY },
    global: true,
  },
  // Admin-only batch generation of the Character Studio's quick-start looks.
  preset: {
    ip: [{ name: "ip-hour", limit: 40, window: HOUR }, { name: "ip-day", limit: 100, window: DAY }],
    session: null,
    global: true,
  },
};
const DEFAULT_GLOBAL_DAILY_LIMIT = 1000;
const STORE_TIMEOUT_MS = 2500;
const MAX_MEMORY_BUCKETS = 10000;

const memoryBuckets = new Map();
let warnedMissingTable = false;
let lastStoreWarningAt = 0;

/**
 * Consumes one request against every limit for `scope`. Resolves with
 * { store } when allowed; rejects with an AiLimitError (status 429) otherwise.
 */
async function enforceAiRateLimit(request, { scope, sessionId = null } = {}) {
  const policy = POLICIES[scope];
  if (!policy) throw new Error(`Unknown AI rate limit scope: ${scope}`);
  if (/^(false|off|0)$/i.test(process.env.AI_RATE_LIMITS_ENABLED || "")) return { store: "disabled" };

  const buckets = buildBuckets(request, scope, policy, sessionId);
  let result;
  let store = "supabase";
  try {
    result = await consumeSupabase(buckets);
  } catch (error) {
    store = "memory";
    noteStoreFailure(error);
    result = consumeMemory(buckets);
  }
  if (!result) {
    store = "memory";
    result = consumeMemory(buckets);
  }
  if (!result.allowed) throw aiLimitError(scope, result, buckets);
  return { store };
}

function buildBuckets(request, scope, policy, sessionId) {
  const ipKey = hashClient(clientAddress(request));
  const buckets = policy.ip.map((rule) => ({ bucket: `${scope}:${rule.name}:${ipKey}`, limit: rule.limit, window_seconds: rule.window, kind: "ip" }));
  if (policy.session && sessionId) {
    buckets.push({ bucket: `${scope}:session:${String(sessionId).slice(0, 64)}`, limit: policy.session.limit, window_seconds: policy.session.window, kind: "session" });
  }
  const globalLimit = globalDailyLimit();
  if (policy.global && globalLimit) {
    buckets.push({ bucket: `ai:global-day:${new Date().toISOString().slice(0, 10)}`, limit: globalLimit, window_seconds: DAY, kind: "global" });
  }
  return buckets;
}

function globalDailyLimit() {
  const raw = String(process.env.AI_GLOBAL_DAILY_LIMIT || "").trim();
  if (/^(off|none|unlimited)$/i.test(raw)) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_GLOBAL_DAILY_LIMIT;
}

async function consumeSupabase(buckets) {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STORE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/consume_ai_rate_limits`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_buckets: buckets.map(({ bucket, limit, window_seconds }) => ({ bucket, limit, window_seconds })) }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.message || `Rate limit store returned ${response.status}.`);
    error.code = body?.code || `http_${response.status}`;
    error.status = response.status;
    throw error;
  }
  if (!body || typeof body.allowed !== "boolean") throw Object.assign(new Error("Rate limit store returned an unexpected response."), { code: "invalid_rate_limit_response" });
  return { allowed: body.allowed, bucket: body.bucket || null, retryAfterSeconds: Number(body.retry_after_seconds) || 0 };
}

function consumeMemory(buckets, now = Date.now()) {
  let blocked = null;
  let retryAfterSeconds = 0;
  for (const item of buckets) {
    const entry = memoryBuckets.get(item.bucket);
    const active = entry && now < entry.startedAt + item.window_seconds * 1000;
    if (active && entry.hits >= item.limit) {
      blocked ||= item.bucket;
      retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((entry.startedAt + item.window_seconds * 1000 - now) / 1000));
    }
  }
  if (blocked) return { allowed: false, bucket: blocked, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  for (const item of buckets) {
    const entry = memoryBuckets.get(item.bucket);
    if (entry && now < entry.startedAt + item.window_seconds * 1000) {
      entry.hits += 1;
    } else {
      if (!entry && memoryBuckets.size >= MAX_MEMORY_BUCKETS) memoryBuckets.delete(memoryBuckets.keys().next().value);
      memoryBuckets.set(item.bucket, { hits: 1, startedAt: now });
    }
  }
  return { allowed: true, bucket: null, retryAfterSeconds: 0 };
}

function noteStoreFailure(error) {
  const missing = error?.status === 404 || ["PGRST202", "PGRST205", "42P01", "42883"].includes(error?.code);
  if (missing) {
    if (!warnedMissingTable) {
      warnedMissingTable = true;
      console.warn("AI rate limit table is not installed; using per-instance memory limits. Apply migration 20261008150000_add_ai_rate_limits.sql.");
    }
    return;
  }
  const now = Date.now();
  if (now - lastStoreWarningAt > 60 * 1000) {
    lastStoreWarningAt = now;
    console.warn("AI rate limit store unavailable; using per-instance memory limits.", { code: error?.code, status: error?.status, message: error?.name === "AbortError" ? "timeout" : error?.message });
  }
}

function aiLimitError(scope, result, buckets) {
  const blocked = buckets.find((item) => item.bucket === result.bucket) || buckets[0];
  let retryAfterSeconds = Math.max(1, Math.round(result.retryAfterSeconds || 60));
  if (blocked.kind === "global") retryAfterSeconds = secondsUntilUtcMidnight();
  const wait = describeWait(retryAfterSeconds);
  const messages = {
    global: ["ai_daily_capacity_reached", "Our monster studio is extra busy today and has paused new creations. Please come back tomorrow. We can't wait to see your drawing!"],
    session: scope === "child"
      ? ["ai_session_limit", `You've made lots of character versions for this book. Pick your favorite to keep going, or try again in about ${wait}.`]
      : ["ai_session_limit", `This drawing has had lots of tries today. Choose one of your monster versions to keep going, or try again in about ${wait}.`],
    ip: scope === "upload"
      ? ["ai_rate_limited", `You've uploaded lots of drawings in a short time. Please take a little break and try again in about ${wait}.`]
      : ["ai_rate_limited", `Whoa, that's a lot of monster magic in a short time! Please take a little break and try again in about ${wait}.`],
  };
  const [code, message] = messages[blocked.kind];
  const error = new Error(message);
  error.name = "AiLimitError";
  error.status = 429;
  error.code = code;
  error.retryAfterSeconds = retryAfterSeconds;
  return error;
}

function isAiLimitError(error) {
  return error?.name === "AiLimitError" || error?.name === "BotCheckError";
}

/** Writes a friendly limit/bot-check response with Retry-After when known. */
function sendAiProtectionError(response, error) {
  if (error.retryAfterSeconds && typeof response.setHeader === "function") response.setHeader("Retry-After", String(error.retryAfterSeconds));
  return response.status(error.status).json({
    code: error.code,
    error: error.message,
    ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
    ...(error.botCheck ? { botCheck: error.botCheck } : {}),
  });
}

function describeWait(seconds) {
  if (seconds < 90) return "a minute";
  if (seconds < 90 * 60) return `${Math.ceil(seconds / 60)} minutes`;
  const hours = Math.ceil(seconds / 3600);
  return hours === 1 ? "an hour" : `${hours} hours`;
}

function secondsUntilUtcMidnight(now = new Date()) {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((next - now.getTime()) / 1000));
}

function clientAddress(request) {
  const header = (name) => {
    if (request?.headers?.get) return request.headers.get(name) || "";
    const value = request?.headers?.[name];
    return Array.isArray(value) ? value[0] || "" : value || "";
  };
  const raw = header("x-vercel-forwarded-for") || header("x-forwarded-for") || header("x-real-ip") || request?.socket?.remoteAddress || "unknown";
  return normalizeAddress(String(raw).split(",")[0].trim());
}

/** IPv6 clients are grouped by /64 so rotating addresses in one block share a limit. */
function normalizeAddress(address) {
  const value = address.replace(/^\[|\](?::\d+)?$/g, "").replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "").replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, "$1");
  if (!value.includes(":")) return value.slice(0, 64) || "unknown";
  const [head, tail = ""] = value.toLowerCase().split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const parts = value.includes("::")
    ? [...headParts, ...Array(Math.max(0, 8 - headParts.length - tailParts.length)).fill("0"), ...tailParts]
    : headParts;
  return `${parts.slice(0, 4).map((part) => part.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

function hashClient(address) {
  const secret = process.env.AI_RATE_LIMIT_SECRET || process.env.ORDER_ACCESS_SECRET || "monstersnow-ai-rate-limit";
  return crypto.createHmac("sha256", secret).update(address).digest("hex").slice(0, 32);
}

function resetAiRateLimitMemory() {
  memoryBuckets.clear();
  warnedMissingTable = false;
  lastStoreWarningAt = 0;
}

module.exports = {
  POLICIES,
  DEFAULT_GLOBAL_DAILY_LIMIT,
  clientAddress,
  enforceAiRateLimit,
  isAiLimitError,
  normalizeAddress,
  resetAiRateLimitMemory,
  sendAiProtectionError,
};
