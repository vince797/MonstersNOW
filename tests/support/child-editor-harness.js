// Local harness for the Character Studio end-to-end test. Serves the site and
// runs the REAL render/proof/checkout handlers in-process; every external
// service (Supabase REST + Storage, OpenAI, Stripe) is an in-memory mock.
// Never uses production credentials and never contacts Lulu or email.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..", "..");
const SUPABASE = "https://db.example.com";

function setEnv() {
  Object.assign(process.env, {
    STORYBOOK_PROOF_SECRET: "local-proof-secret",
    STRIPE_TEST_SECRET_KEY: "sk_test_mock",
    STRIPE_TEST_STORYBOOK_SHIPPING_RATE_IDS: "shr_mock",
    SUPABASE_URL: SUPABASE,
    SUPABASE_SECRET_KEY: "mock-service-key",
    OPENAI_API_KEY: "sk-test-mock",
    ADMIN_PASSWORD: "local-admin-password",
    AI_GLOBAL_DAILY_LIMIT: "off",
  });
  delete process.env.CHILD_CHARACTER_IMAGE_QUALITY;
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SITE_KEY;
}

function createState() {
  return {
    submissions: new Map(),
    previews: [],
    storage: new Map(), // "bucket/path" -> { bytes, contentType, createdAt }
    external: [],
    imageCalls: [],
    rateLimitHits: new Map(),
    scenario: { imageDelayMs: 150, imageQueue: [], rateLimit: null },
    paintCount: 0,
  };
}

// The mock "painter" returns the site's own animated-style reference art
// (mirrored on alternate versions) so screenshots look like real results.
async function paintPng(index, prompt = "") {
  const { createCanvas, loadImage } = require("@napi-rs/canvas");
  const boy = /\bboy\b/i.test(prompt) && !/\bgirl\b/i.test(prompt);
  const aid = /seated naturally and confidently in a contemporary child-sized wheelchair/i.test(prompt) ? "-wheelchair"
    : /using exactly two correctly fitted child-sized forearm crutches/i.test(prompt) ? "-forearm-crutches" : "";
  const art = await loadImage(fs.readFileSync(path.join(root, `assets/child-editor/default-${boy ? "boy" : "girl"}${aid}-feature-animation-v1.webp`)));
  const canvas = createCanvas(1024, 1536);
  const ctx = canvas.getContext("2d");
  const scale = Math.min(1024 / art.width, 1536 / art.height);
  const width = art.width * scale;
  const height = art.height * scale;
  ctx.save();
  if (index % 2 === 0) { ctx.translate(1024, 0); ctx.scale(-1, 1); }
  ctx.drawImage(art, (1024 - width) / 2, 1536 - height, width, height);
  ctx.restore();
  return canvas.encode("png");
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
  });
}

function installFetchMock(state) {
  const original = global.fetch;
  global.fetch = async (input, options = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = (options.method || "GET").toUpperCase();
    state.external.push({ url, method });
    if (url.startsWith("https://api.openai.com/v1/moderations")) {
      const body = JSON.parse(options.body || "{}");
      const flagged = /\bmoderation-flag\b/i.test(String(body.input || ""));
      return json({ results: [{ flagged, categories: {} }] });
    }
    if (url.startsWith("https://api.openai.com/v1/images/edits")) {
      const prompt = options.body?.get?.("prompt") || "";
      state.imageCalls.push({ at: Date.now(), prompt: String(prompt) });
      const step = state.scenario.imageQueue.length ? state.scenario.imageQueue.shift() : { kind: "ok" };
      await delay(step.delayMs ?? state.scenario.imageDelayMs, options.signal);
      if (step.kind === "server-error") return json({ error: { message: "Internal server error", type: "server_error" } }, 500, { "x-request-id": "req_mock" });
      if (step.kind === "busy") return json({ error: { message: "Rate limit reached for images", type: "rate_limit_exceeded" } }, 429, { "x-request-id": "req_mock" });
      if (step.kind === "policy") return json({ error: { message: "Your request was rejected as a result of our safety system.", code: "moderation_blocked" } }, 400, { "x-request-id": "req_mock" });
      if (step.kind === "hang") { await delay(10 * 60 * 1000, options.signal); }
      state.paintCount += 1;
      const png = await paintPng(state.paintCount, String(prompt));
      return json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] });
    }
    if (url.startsWith("https://api.stripe.com")) {
      return json({ id: "cs_test_mock", livemode: false, url: `${state.base}/success.html?session_id=cs_test_mock`, payment_status: "paid", status: "complete", metadata: { test_order: "yes" } });
    }
    if (url.startsWith(`${SUPABASE}/storage/v1/`)) return storageMock(state, url, method, options);
    if (url.startsWith(`${SUPABASE}/rest/v1/`)) return restMock(state, url, method, options);
    if (url.startsWith("http://127.0.0.1") && original) return original(input, options);
    throw new Error(`Unexpected external request: ${method} ${url}`);
  };
  return () => { global.fetch = original; };
}

function storageMock(state, url, method, options) {
  const rest = decodeURIComponent(url.slice(`${SUPABASE}/storage/v1/`.length).split("?")[0]);
  if (rest.startsWith("object/list/")) {
    const bucket = rest.slice("object/list/".length);
    const { prefix = "", limit = 100, offset = 0 } = JSON.parse(options.body || "{}");
    const entries = [...state.storage.entries()]
      .filter(([key]) => key.startsWith(`${bucket}/${prefix}/`) && !key.slice(`${bucket}/${prefix}/`.length).includes("/"))
      .map(([key, value]) => ({ name: key.slice(`${bucket}/${prefix}/`.length), id: crypto.createHash("md5").update(key).digest("hex"), created_at: value.createdAt }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return json(entries.slice(offset, offset + limit));
  }
  if (rest.startsWith("object/sign/")) {
    return json({ signedURL: `/object/sign/${rest.slice("object/sign/".length)}?token=mock` });
  }
  if (rest.startsWith("object/")) {
    const key = rest.slice("object/".length);
    if (method === "POST" || method === "PUT") {
      const headers = options.headers || {};
      const contentType = headers["Content-Type"] || headers["content-type"] || "application/octet-stream";
      if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) return json({ message: "mime type not supported" }, 415);
      const bytes = Buffer.from(options.body);
      if (bytes.length > 8 * 1024 * 1024) return json({ message: "Payload too large" }, 413);
      state.storage.set(key, { bytes, contentType, createdAt: new Date(Date.now() + state.storage.size).toISOString() });
      return json({ Key: key });
    }
    if (method === "GET") {
      const object = state.storage.get(key);
      if (!object) return json({ message: "Object not found" }, 404);
      return new Response(object.bytes, { status: 200, headers: { "content-type": object.contentType } });
    }
    if (method === "DELETE") return json([]);
  }
  return json({ message: "unsupported" }, 400);
}

function restMock(state, url, method, options) {
  const parsed = new URL(url);
  const table = parsed.pathname.replace("/rest/v1/", "");
  const eq = (name) => (parsed.searchParams.get(name) || "").replace(/^eq\./, "");
  if (table === "rpc/consume_ai_rate_limits") {
    if (state.scenario.rateLimit) return json({ allowed: false, bucket: state.scenario.rateLimit, retry_after_seconds: 3600 });
    return json({ allowed: true });
  }
  if (table === "monster_submissions") {
    const row = state.submissions.get(eq("id"));
    if (method === "PATCH" && row) Object.assign(row, JSON.parse(options.body || "{}"));
    return json(row ? [row] : []);
  }
  if (table === "monster_previews") {
    const submissionId = eq("submission_id");
    const id = eq("id");
    return json(state.previews.filter((preview) => preview.submission_id === submissionId && (!id || preview.id === id)));
  }
  return json([{ id: "mock-order", status: "checkout_started" }]);
}

function monsterImageBytes() {
  return fs.readFileSync(path.join(root, "assets/step-2-character.jpg"));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function vercelResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); return res; };
  return res;
}

async function start() {
  setEnv();
  const state = createState();
  const restoreFetch = installFetchMock(state);
  const routes = {
    "/api/render-child-character": require("../../api/render-child-character"),
    "/api/halloween-proof": require("../../lib/halloween-proof-handler"),
    "/api/halloween-test-checkout": require("../../lib/halloween-test-checkout-handler"),
    "/api/halloween-checkout-status": require("../../lib/halloween-checkout-status-handler"),
  };
  const monsterJpeg = monsterImageBytes();
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    vercelResponse(res);
    try {
      if (pathname === "/api/monster-submissions") {
        const body = JSON.parse((await readBody(req)) || "{}");
        if (req.method === "POST") {
          const id = crypto.randomUUID();
          const token = crypto.randomBytes(24).toString("hex");
          state.submissions.set(id, { id, access_token_hash: crypto.createHash("sha256").update(token).digest("hex"), expires_at: new Date(Date.now() + 86400000).toISOString(), status: "draft", selected_preview_id: null });
          return res.json({ submission: { id, token, status: "draft" } });
        }
        const row = state.submissions.get(body.submissionId);
        if (row) Object.assign(row, { selected_preview_id: body.selectedPreviewId, status: "ready" });
        return res.json({ submission: { id: body.submissionId, selectedPreviewId: body.selectedPreviewId, status: "ready" } });
      }
      if (pathname === "/api/convert-monster") {
        const body = JSON.parse((await readBody(req)) || "{}");
        await delay(120);
        const previewId = crypto.randomUUID();
        const objectPath = `${body.submissionId}/previews/${previewId}.jpg`;
        state.storage.set(`monster-submissions/${objectPath}`, { bytes: monsterJpeg, contentType: "image/jpeg", createdAt: new Date().toISOString() });
        state.previews.push({ id: previewId, submission_id: body.submissionId, variation_number: body.variationNumber || 1, style_id: body.style || "storybook", status: "complete", preview_path: objectPath, coloring_page_path: null });
        return res.json({ monsterImage: `data:image/jpeg;base64,${monsterJpeg.toString("base64")}`, style: body.style || "storybook", submissionId: body.submissionId, previewId });
      }
      if (routes[pathname]) return await routes[pathname](req, res);
      if (pathname.startsWith("/api/")) { res.statusCode = 404; return res.json({ error: "not mocked" }); }
      const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!file.startsWith(root + path.sep) || !/\.(html|css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(file) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
      const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
      res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      console.error("harness route failed", pathname, error);
      if (!res.headersSent) { res.statusCode = 500; res.end(); }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  state.base = `http://127.0.0.1:${server.address().port}`;
  return {
    base: state.base,
    state,
    stop: async () => { restoreFetch(); await new Promise((resolve) => server.close(resolve)); },
  };
}

module.exports = { start, root, createState, installFetchMock, paintPng, setEnv };
