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
  "/api/halloween-proof": require("../lib/halloween-proof-handler"),
  "/api/halloween-test-checkout": require("../lib/halloween-test-checkout-handler"),
  "/api/halloween-checkout-status": require("../lib/halloween-checkout-status-handler"),
};
const mockSubmissionId = "11111111-1111-4111-8111-111111111111";
const mockPreviewId = "22222222-2222-4222-8222-222222222222";
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/api/monster-submissions") {
    req.resume(); res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ submission: req.method === "POST" ? { id: mockSubmissionId, token: "mock-submission-token-that-is-long-enough", status: "draft" } : { id: mockSubmissionId, selectedPreviewId: mockPreviewId, status: "ready" } }));
  }
  if (pathname === "/api/convert-monster") {
    await new Promise((resolve) => setTimeout(resolve, 140));
    req.resume(); res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ monsterImage: image, style: "storybook", submissionId: mockSubmissionId, previewId: mockPreviewId }));
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
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    for (const suffix of ["", "?story=halloween-monster-night"]) {
      const discovery = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await discovery.goto(`${base}/create.html${suffix}`);
      assert.equal(await discovery.locator("#child-editor-start").isVisible(), true, `child editor should be visible on ${suffix || "default URL"}`);
      assert.match(await discovery.locator("#book-offer-status").textContent(), /Explore the child creator now/i);
      assert.equal(await discovery.locator("#storybook-interest").isHidden(), true, "book review stays locked before monster selection");
      await discovery.locator("#jump-to-child-editor").click();
      await discovery.waitForFunction(() => {
        const top = document.querySelector("#child-editor-start")?.getBoundingClientRect().top;
        return typeof top === "number" && top >= -2 && top < 220;
      });
      const childEntryTop = await discovery.locator("#child-editor-start").evaluate((element) => element.getBoundingClientRect().top);
      assert.ok(childEntryTop >= -2 && childEntryTop < 220, `child creator link did not reveal editor: ${childEntryTop}`);
      if (!suffix) {
        await discovery.screenshot({ path: path.join(output, "child-editor-entry-mobile.png"), fullPage: true });
        await discovery.locator("#monster-upload").setInputFiles({ name: "not-a-drawing.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
        await discovery.locator("#upload-error").waitFor({ state: "visible" });
        assert.equal(await discovery.locator("#child-editor-start").isVisible(), true, "failed upload must not hide child editor");
      }
      await discovery.close();
    }
    const desktopDiscovery = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await desktopDiscovery.goto(`${base}/create.html`);
    assert.equal(await desktopDiscovery.locator("#child-editor-start").isVisible(), true);
    assert.equal(await desktopDiscovery.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await desktopDiscovery.screenshot({ path: path.join(output, "create-studio-desktop.png"), fullPage: true });
    await desktopDiscovery.close();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/create.html?test=halloween`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#monster-upload").setInputFiles(path.join(root, "assets/step-2-character.jpg"));
    await page.waitForFunction(() => document.querySelector("#monster-result")?.getAttribute("aria-busy") === "true");
    assert.equal(await page.locator("#confirm-monster").isHidden(), true, "monster confirmation stays hidden while generation is pending");
    await page.locator("#confirm-monster").waitFor({ state: "visible" });
    await page.locator("#confirm-monster").click();
    await page.locator("#child-editor-start").waitFor({ state: "visible" });
    assert.equal(await page.locator("#child-character-title").textContent(), "Create your child");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "child-editor-start");
    await page.waitForTimeout(350);
    const editorPosition = await page.locator("#child-editor-start").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, viewport: innerHeight, horizontal: document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal(editorPosition.horizontal, false);
    assert.ok(editorPosition.top >= -2 && editorPosition.top < editorPosition.viewport, JSON.stringify(editorPosition));
    await page.screenshot({ path: path.join(output, "child-editor-mobile.png"), fullPage: true });
    await page.locator("label").filter({ has: page.locator('input[name="child-character"][value="warm-curly-dark"]') }).click();
    await page.getByText("Ages 5–6 · About average height. Saved with the book profile.").waitFor();
    await page.locator(".child-accessibility-section > summary").click();
    assert.equal(await page.locator('input[name="child-mobility-aid"][value="wheelchair"]').isEnabled(), true);
    await page.locator("label").filter({ has: page.locator('input[name="child-mobility-aid"][value="wheelchair"]') }).click();
    await page.getByText(/Wheelchair shown in every scene.*Saved with the book profile/).waitFor();
    assert.equal(await page.locator("#child-preview-stage").evaluate((element) => element.classList.contains("mobility-wheelchair")), true);
    assert.equal(await page.locator('input[name="child-character"][value="deep-coils-black"]').isDisabled(), true);
    assert.equal(await page.locator('input[name="child-age-band"][value="2-4"]').isDisabled(), true);
    assert.equal(await page.locator('input[name="child-relative-height"][value="shorter"]').isDisabled(), true);
    await page.locator("label").filter({ has: page.locator('input[name="child-character"][value="deep-braids-black"]') }).click();
    await page.locator("label").filter({ has: page.locator('input[name="child-age-band"][value="7-8"]') }).click();
    await page.locator("label").filter({ has: page.locator('input[name="child-relative-height"][value="taller"]') }).click();
    await page.getByText(/Ages 7–8.*Taller than most.*Wheelchair shown in every scene/).waitFor();
    const editorTargets = await page.locator("#child-editor-undo, #child-editor-reset, .child-editor-section > summary").evaluateAll((elements) => elements.map((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    })));
    assert.ok(editorTargets.every((target) => target.height >= 44 && target.width >= 44), JSON.stringify(editorTargets));
    await page.screenshot({ path: path.join(output, "child-editor-mobile-wheelchair-editable.png"), fullPage: true });
    await page.locator("#child-editor-reset").click();
    assert.equal(await page.locator('input[name="child-character"][value="none"]').isChecked(), true);
    await page.getByText("Character reset to monster-only.").waitFor();
    await page.locator("#child-editor-undo").click();
    await page.getByText("Last character change undone.").waitFor();
    assert.equal(await page.locator('input[name="child-character"][value="deep-braids-black"]').isChecked(), true);
    assert.equal(await page.locator('input[name="child-age-band"][value="7-8"]').isChecked(), true);
    assert.equal(await page.locator('input[name="child-relative-height"][value="taller"]').isChecked(), true);
    const savedProfile = await page.evaluate(() => JSON.parse(localStorage.getItem("monstersnow_child_character_profile_v1")));
    assert.deepEqual(savedProfile, { id: "deep-braids-black", ageBand: "7-8", relativeHeight: "taller", mobilityAid: "wheelchair" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    assert.equal(await page.locator('input[name="child-character"][value="deep-braids-black"]').isChecked(), true);
    assert.equal(await page.locator('input[name="child-age-band"][value="7-8"]').isChecked(), true);
    assert.equal(await page.locator('input[name="child-relative-height"][value="taller"]').isChecked(), true);
    await page.screenshot({ path: path.join(output, "child-editor-desktop-wheelchair-editable.png"), fullPage: true });
    await page.goto(`${base}/about.html`);
    await page.goBack();
    assert.equal(await page.locator('input[name="child-character"][value="deep-braids-black"]').isChecked(), true);
    assert.equal(await page.locator('input[name="child-mobility-aid"][value="wheelchair"]').isChecked(), true);
    await page.locator("#monster-upload").setInputFiles(path.join(root, "assets/step-2-character.jpg"));
    await page.locator("#confirm-monster").waitFor({ state: "visible" });
    await page.locator("#confirm-monster").click();
    await page.locator("#storybook-interest").waitFor({ state: "visible" });
    await page.locator("#download-coloring").click();
    await page.locator("#coloring-page-dialog[open]").waitFor({ state: "visible" });
    assert.match(await page.locator("#coloring-page-preview").getAttribute("src"), /^data:image\/png;base64,/);
    assert.match(await page.locator("#coloring-page-download-link").getAttribute("href"), /^data:image\/png;base64,/);
    await page.locator("#coloring-page-done").click();
    await page.locator("#child-name").fill("Alexandria");
    await page.locator("#monster-name").fill("Noodle");
    await page.locator("#interest-email").fill("parent@example.com");
    await page.locator("#storybook-interest").click();
    await page.waitForURL("**/halloween-proof.html");
    await page.locator("#proof-checkout").waitFor({ state: "visible" });
    if (await page.locator("#proof-child-profile").isHidden()) {
      throw new Error(JSON.stringify({
        pageErrors: errors,
        proofStatus: await page.locator("#proof-status").textContent(),
        saved: JSON.parse(await page.evaluate(() => sessionStorage.getItem("monstersnow_halloween_test_proof"))),
      }));
    }
    assert.match(await page.locator("#proof-child-profile-copy").textContent(), /Ages 7–8.*Taller than most/i);
    assert.equal(await page.locator(".book-proof-page").count(), 32);
    const savedSubmission = JSON.parse(await page.evaluate(() => sessionStorage.getItem("monstersnow_halloween_test_proof")));
    assert.equal(savedSubmission.submission.personalization.childCharacter.id, "deep-braids-black");
    assert.equal(savedSubmission.submission.personalization.childCharacter.ageBand, "7-8");
    assert.equal(savedSubmission.submission.personalization.childCharacter.relativeHeight, "taller");
    assert.equal(savedSubmission.submission.personalization.childCharacter.mobilityAid, "wheelchair");
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
    console.log("PASS: upload → bounded editable wheelchair profile → reset/undo/persistence → coloring-page viewer → selected preview → 32-page proof → approval → mocked test checkout → verified success; back/forward/reload and desktop/mobile fit; no JS errors; no print/email calls.");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
