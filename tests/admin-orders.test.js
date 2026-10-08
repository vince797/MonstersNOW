const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { assertAdminRequest, applyAdminAuthHeaders, resetAdminRateLimit } = require("../lib/admin-auth");

const root = path.resolve(__dirname, "..");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";

function responseStub() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function withEnv(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.entries(values).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  const restore = () => Object.entries(previous).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  return Promise.resolve().then(run).finally(restore);
}

function withFetch(handler, run) {
  const original = global.fetch;
  global.fetch = handler;
  return Promise.resolve().then(run).finally(() => { global.fetch = original; });
}

test("admin sign-in locks a client out after 10 wrong passwords and reports Retry-After", () => withEnv({ ADMIN_PASSWORD: "correct horse" }, () => {
  resetAdminRateLimit();
  const attacker = { headers: { "x-admin-password": "guess", "x-forwarded-for": "203.0.113.9, 10.0.0.1" } };
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.throws(() => assertAdminRequest(attacker), (error) => error.status === 401 && error.code === "invalid_admin_password");
  }
  let limited;
  assert.throws(() => assertAdminRequest(attacker), (error) => { limited = error; return error.status === 429 && error.code === "admin_rate_limited"; });
  assert.ok(limited.retryAfterSeconds > 0 && limited.retryAfterSeconds <= 15 * 60);
  // The right password does not bypass an active lockout from that client.
  assert.throws(() => assertAdminRequest({ headers: { ...attacker.headers, "x-admin-password": "correct horse" } }), /Too many/);
  const response = responseStub();
  applyAdminAuthHeaders(response, limited);
  assert.equal(response.headers["Retry-After"], String(limited.retryAfterSeconds));
  // Other clients are unaffected.
  assert.doesNotThrow(() => assertAdminRequest({ headers: { "x-admin-password": "correct horse", "x-forwarded-for": "198.51.100.4" } }));
  resetAdminRateLimit();
}));

test("a successful admin sign-in clears earlier failures", () => withEnv({ ADMIN_PASSWORD: "correct horse" }, () => {
  resetAdminRateLimit();
  const headers = { "x-real-ip": "192.0.2.50" };
  for (let attempt = 0; attempt < 9; attempt += 1) assert.throws(() => assertAdminRequest({ headers: { ...headers, "x-admin-password": "nope" } }));
  assert.doesNotThrow(() => assertAdminRequest({ headers: { ...headers, "x-admin-password": "correct horse" } }));
  for (let attempt = 0; attempt < 9; attempt += 1) assert.throws(() => assertAdminRequest({ headers: { ...headers, "x-admin-password": "nope" } }), (error) => error.status === 401);
  resetAdminRateLimit();
}));

test("the admin API answers 429 with Retry-After once a client is rate limited", () => withEnv({ ADMIN_PASSWORD: "correct horse" }, async () => {
  resetAdminRateLimit();
  const handler = require("../api/storybook-interest");
  const request = () => ({ method: "GET", query: { resource: "orders" }, headers: { "x-admin-password": "wrong", "x-forwarded-for": "203.0.113.77" } });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = responseStub();
    await handler(request(), response);
    assert.equal(response.code, 401);
    assert.equal(response.headers["Retry-After"], undefined);
  }
  const response = responseStub();
  await handler(request(), response);
  assert.equal(response.code, 429);
  assert.match(response.headers["Retry-After"], /^\d+$/);
  resetAdminRateLimit();
}));

test("child render URLs are only signed for child render paths", () => withEnv({ SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "mock" }, () => {
  const { createChildImageUrl } = require("../lib/monster-submissions");
  const signed = [];
  return withFetch(async (url) => {
    signed.push(url);
    return { ok: true, json: async () => ({ signedURL: "/object/sign/child.webp?token=mock" }) };
  }, async () => {
    assert.match(await createChildImageUrl("123e4567-e89b-42d3-a456-426614174000/child/abc123.webp"), /token=mock/);
    assert.match(await createChildImageUrl("checkout/order-1/child-abc.png"), /token=mock/);
    assert.equal(await createChildImageUrl("123e4567-e89b-42d3-a456-426614174000/original.png"), null);
    assert.equal(await createChildImageUrl("checkout/../123e4567-e89b-42d3-a456-426614174000/original.png"), null);
    assert.equal(await createChildImageUrl("https://evil.example/x.png"), null);
    assert.equal(await createChildImageUrl(null), null);
    assert.equal(signed.length, 2);
  });
}));

test("the approved child render is saved privately and pinned on the order at checkout", () => withEnv({ SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "mock" }, () => {
  const { saveCheckoutChildImage } = require("../lib/monster-submissions");
  const { recordCheckoutOrder } = require("../lib/order-library");
  const calls = [];
  return withFetch(async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/storage/v1/object/monster-submissions/")) return { ok: true, json: async () => ({ Key: "ok" }) };
    if (url.includes("/storybook_orders?on_conflict=")) return { ok: true, json: async () => [{ ...JSON.parse(options.body)[0], id: "order-1" }] };
    throw new Error(`Unexpected request: ${url}`);
  }, async () => {
    const monsterSubmissionId = "123e4567-e89b-42d3-a456-426614174000";
    const imagePath = await saveCheckoutChildImage({ submissionId: "order-abc", monsterSubmissionId, childImage: PNG });
    assert.match(imagePath, new RegExp(`^${monsterSubmissionId}/child/[a-f0-9]{32}\\.png$`));
    const upload = calls[0];
    assert.equal(upload.options.method, "POST");
    assert.equal(upload.options.headers["x-upsert"], "true");
    assert.equal(upload.options.headers["Content-Type"], "image/png");
    // Same bytes produce the same object, so checkout retries are idempotent.
    assert.equal(await saveCheckoutChildImage({ submissionId: "order-abc", monsterSubmissionId, childImage: PNG }), imagePath);
    assert.match(await saveCheckoutChildImage({ submissionId: "order/../x", monsterSubmissionId: null, childImage: PNG }), /^checkout\/[A-Za-z0-9._-]+\/child-[a-f0-9]{32}\.png$/);
    assert.equal(await saveCheckoutChildImage({ submissionId: "order-abc", monsterSubmissionId, childImage: null }), null);
    await assert.rejects(saveCheckoutChildImage({ submissionId: "order-abc", monsterSubmissionId, childImage: "data:text/html;base64,PHA+" }));

    const order = await recordCheckoutOrder(checkoutSubmission(monsterSubmissionId), null, { childImagePath: imagePath });
    const insert = JSON.parse(calls.find((call) => call.url.includes("on_conflict")).options.body)[0];
    assert.equal(insert.child_image_path, imagePath);
    assert.equal(order.child_image_path, imagePath);
  });
}));

test("checkout still records the order before the child image migration is applied", () => withEnv({ SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "mock" }, () => {
  const { recordCheckoutOrder } = require("../lib/order-library");
  const inserts = [];
  const warn = console.warn;
  console.warn = () => {};
  return withFetch(async (url, options = {}) => {
    const row = JSON.parse(options.body)[0];
    inserts.push(row);
    if ("child_image_path" in row) {
      return { ok: false, status: 400, json: async () => ({ code: "PGRST204", message: "Could not find the 'child_image_path' column of 'storybook_orders' in the schema cache" }) };
    }
    return { ok: true, json: async () => [{ ...row, id: "order-1" }] };
  }, async () => {
    const path = "123e4567-e89b-42d3-a456-426614174000/child/abc.png";
    const order = await recordCheckoutOrder(checkoutSubmission("123e4567-e89b-42d3-a456-426614174000"), null, { childImagePath: path });
    assert.equal(inserts.length, 2);
    assert.equal(inserts[1].child_character.imagePath, path);
    assert.equal(inserts[1].child_character.id, "light-short-brown");
    assert.equal(order.id, "order-1");
  }).finally(() => { console.warn = warn; });
}));

test("other order insert failures are not hidden by the migration fallback", () => withEnv({ SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "mock" }, () => {
  const { recordCheckoutOrder } = require("../lib/order-library");
  let attempts = 0;
  return withFetch(async () => {
    attempts += 1;
    return { ok: false, status: 409, json: async () => ({ code: "23505", message: "duplicate key value" }) };
  }, async () => {
    await assert.rejects(recordCheckoutOrder(checkoutSubmission(null), null, { childImagePath: "checkout/x/child-a.png" }), /duplicate/);
    assert.equal(attempts, 1);
  });
}));

test("decorated orders expose the child render path from either storage location", () => {
  const { decorateOrder } = require("../lib/order-library");
  assert.equal(decorateOrder({ id: "1", child_image_path: "a/child/x.png" }).child_image_path, "a/child/x.png");
  assert.equal(decorateOrder({ id: "1", child_character: { imagePath: "checkout/o/child-x.png" } }).child_image_path, "checkout/o/child-x.png");
  assert.equal(decorateOrder({ id: "1" }).child_image_path, null);
});

test("regenerating print files mints fresh signed PDF links for an active order", () => withEnv({
  SUPABASE_URL: "https://db.example.com",
  SUPABASE_SECRET_KEY: "mock",
  STORYBOOK_PRINT_FILE_SECRET: "print-file-secret-for-tests",
  LULU_SANDBOX_CLIENT_KEY: undefined,
  LULU_SANDBOX_CLIENT_SECRET: undefined,
}, () => {
  const { updateOrder } = require("../lib/order-library");
  const row = {
    id: "order-1", status: "paid", submission_id: "order-abc", story_id: "halloween-monster-night", story_label: "Halloween Monster Night",
    child_name: "Sam", monster_name: "Noodle", monster_style: "Soft 3D storybook", format_id: "softcover",
    monster_submission_id: "123e4567-e89b-42d3-a456-426614174000", selected_preview_id: "123e4567-e89b-42d3-a456-426614174001",
    child_character: { id: "light-short-brown", included: true },
  };
  let current = row;
  return withFetch(async (url) => {
    if (url.includes("/storybook_orders?id=eq.")) return { ok: true, json: async () => [current] };
    throw new Error(`Unexpected request: ${url}`);
  }, async () => {
    const request = { headers: { host: "preview.monstersnow.com", "x-forwarded-proto": "https" } };
    const order = await updateOrder("order-1", { action: "regenerate_print_files" }, { request });
    assert.match(order.print_files.interior, /^https:\/\/preview\.monstersnow\.com\/api\/lulu-sandbox-storybook-order\?type=interior&/);
    assert.match(order.print_files.interior, /signature=/);
    assert.match(order.print_files.interior, /child_name=Sam/);
    assert.equal(order.print_files.cover, null);
    assert.ok(order.print_files.coverError, "a missing Lulu cover-size lookup drops only the cover link");
    assert.ok(order.print_files.generatedAt);
    assert.equal(order.status, "paid", "regenerating files never changes order status");

    current = { ...row, status: "cancelled" };
    await assert.rejects(updateOrder("order-1", { action: "regenerate_print_files" }, { request }), (error) => error.status === 409);
    current = { ...row, status: "checkout_started" };
    await assert.rejects(updateOrder("order-1", { action: "regenerate_print_files" }, { request }), (error) => error.status === 409);
    current = { ...row, monster_submission_id: null };
    await assert.rejects(updateOrder("order-1", { action: "regenerate_print_files" }, { request }), /missing its story or saved monster/);
  });
}));

test("the child image migration adds a guarded column and backfills existing orders", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/20261008120000_add_order_child_image.sql"), "utf8");
  assert.match(sql, /add column if not exists child_image_path text/i);
  assert.match(sql, /check \(/i);
  assert.match(sql, /child_character->>'imagePath'/);
});

test("admin opens on a simple orders list with clutter tucked under More tools", () => {
  const markup = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  const ordersScript = fs.readFileSync(path.join(root, "scripts/admin-orders.js"), "utf8");
  const adminScript = fs.readFileSync(path.join(root, "scripts/admin.js"), "utf8");
  assert.match(markup, /<button class="is-active" type="button" data-admin-view="orders">/);
  assert.match(markup, /<details class="admin-nav-more">[\s\S]*data-admin-view="dashboard"[\s\S]*data-admin-view="production"[\s\S]*data-admin-view="customers"[\s\S]*<\/details>/);
  assert.match(markup, /<section class="admin-dashboard" id="admin-dashboard" hidden/);
  assert.doesNotMatch(markup, /id="rail-new-story"|id="halloween-story"|id="order-detail"/);
  assert.match(markup, /id="order-search"/);
  assert.match(markup, /<dialog id="order-panel"/);
  for (const id of ["order-characters", "order-customer", "order-book", "order-payment", "order-copy-proof", "order-email-proof", "order-regenerate-print", "order-status-select", "order-print"]) {
    assert.match(markup, new RegExp(`id="${id}"`), id);
  }
  assert.match(markup, /scripts\/admin\.js\?v=[^"]+"><\/script>\s*<script src="scripts\/admin-orders\.js/);
  assert.match(ordersScript, /action: "regenerate_print_files"/);
  assert.match(ordersScript, /action: "get_customer_proof_link"/);
  assert.match(ordersScript, /mailto:/);
  assert.match(ordersScript, /Live status sync is not connected yet/);
  assert.doesNotMatch(ordersScript, /innerHTML = `[^`]*\$\{/, "order data is never interpolated into HTML");
  assert.doesNotMatch(adminScript, /function openOrderDetail|function renderOrderBoard|#order-detail/);
  assert.match(adminScript, /showView\("orders"\);\n  \} catch/);
  assert.match(adminScript, /admin_rate_limited/);
});

function checkoutSubmission(monsterSubmissionId) {
  return {
    submissionId: "order-abc",
    email: "parent@example.com",
    personalization: { childName: "Sam", monsterName: "Noodle", childCharacter: { id: "light-short-brown", included: true } },
    story: { id: "halloween-monster-night", label: "Halloween Monster Night" },
    format: { id: "softcover" },
    selectedPreviewId: "123e4567-e89b-42d3-a456-426614174001",
    styleLabel: "Soft 3D storybook",
    monsterSubmissionId,
  };
}
