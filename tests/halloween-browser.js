// Local browser integration check. All external services are mocked; never
// supplies production credentials, generates AI artwork, or submits to Lulu.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "tmp", "halloween-check");
fs.mkdirSync(output, { recursive: true });
const image = `data:image/jpeg;base64,${fs.readFileSync(path.join(root, "assets/step-2-character.jpg")).toString("base64")}`;
Object.assign(process.env, {
  STORYBOOK_PROOF_SECRET: "local-proof-secret", STRIPE_TEST_SECRET_KEY: "sk_test_mock",
  STRIPE_TEST_STORYBOOK_SHIPPING_RATE_IDS: "shr_mock", SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "mock",
});
let base;
const external = [];
global.fetch = async (url, options = {}) => {
  external.push({ url, options });
  if (url.startsWith("https://api.stripe.com")) return { ok: true, json: async () => ({ id: "cs_test_mock", livemode: false, url: `${base}/success.html?session_id=cs_test_mock`, payment_status: "paid", status: "complete", metadata: { test_order: "yes" } }) };
  if (url.startsWith("https://db.example.com")) return { ok: true, json: async () => [{ id: "mock-order", status: "checkout_started" }] };
  throw new Error(`Unexpected external request: ${url}`);
};
const routes = {
  "/api/halloween-proof": require("../api/halloween-proof"),
  "/api/halloween-test-checkout": require("../api/halloween-test-checkout"),
  "/api/halloween-checkout-status": require("../api/halloween-checkout-status"),
};
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/api/convert-monster") {
    req.resume(); res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ monsterImage: image, style: "storybook" }));
  }
  if (routes[pathname]) {
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
    try { await routes[pathname](req, res); } catch { res.statusCode = 500; res.end(); }
    return;
  }
  const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(root + path.sep) || !/\.(html|css|js|png|jpg|jpeg|webp)$/.test(file) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
  const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg" };
  res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/create.html?test=halloween`);
    await page.locator("#monster-upload").setInputFiles(path.join(root, "assets/step-2-character.jpg"));
    await page.locator("#storybook-interest").waitFor({ state: "visible" });
    await page.locator("#child-name").fill("Alexandria");
    await page.locator("#monster-name").fill("Noodle");
    await page.locator("#interest-email").fill("parent@example.com");
    await page.locator("#storybook-interest").click();
    await page.waitForURL("**/halloween-proof.html");
    await page.locator("#proof-checkout").waitFor({ state: "visible" });
    assert.equal(await page.locator(".book-proof-page").count(), 32);
    const layout = () => page.evaluate(() => ({ horizontal: document.documentElement.scrollWidth > innerWidth, clipped: [...document.querySelectorAll(".book-proof-page")].filter((p) => p.scrollHeight > p.clientHeight + 2).length }));
    assert.deepEqual(await layout(), { horizontal: false, clipped: 0 });
    await page.screenshot({ path: path.join(output, "desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.deepEqual(await layout(), { horizontal: false, clipped: 0 });
    await page.screenshot({ path: path.join(output, "mobile.png") });
    const normalSaved = await page.evaluate(() => sessionStorage.getItem("monstersnow_halloween_test_proof"));
    const { buildHalloweenProof, signProof } = require("../lib/halloween-proof");
    const longSubmission = { personalization: { childName: "Alexandria".repeat(4), monsterName: "Noodle".repeat(6) }, monsterImage: image, format: "softcover", email: "parent@example.com" };
    const longProof = buildHalloweenProof(longSubmission);
    await page.evaluate((saved) => sessionStorage.setItem("monstersnow_halloween_test_proof", saved), JSON.stringify({ proof: longProof, proofToken: signProof(longProof), submission: longSubmission }));
    await page.setViewportSize({ width: 320, height: 740 });
    await page.reload();
    assert.deepEqual(await layout(), { horizontal: false, clipped: 0 });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(100);
    assert.deepEqual(await layout(), { horizontal: false, clipped: 0 });
    await page.evaluate((saved) => sessionStorage.setItem("monstersnow_halloween_test_proof", saved), normalSaved);
    await page.reload();
    await page.locator("#proof-approved").check();
    await page.locator("#proof-checkout button").click();
    await page.waitForURL("**/success.html?session_id=cs_test_mock");
    await page.getByRole("heading", { name: "Your test checkout is complete." }).waitFor();
    assert.deepEqual(errors, []);
    assert.ok(external.every((call) => !/lulu|resend/.test(call.url)));
    console.log("PASS: upload → selected preview → 32-page proof → approval → mocked test checkout → verified success; desktop/mobile fit; no JS errors; no print/email calls.");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
