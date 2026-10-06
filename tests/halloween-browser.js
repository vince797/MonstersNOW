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
const monsterPreviewRequests = [];
let failNextMonsterSubmission = false;
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
const readJsonBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (error) { reject(error); }
  });
  req.on("error", reject);
});
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/api/monster-submissions") {
    req.resume(); res.setHeader("Content-Type", "application/json");
    if (failNextMonsterSubmission) {
      failNextMonsterSubmission = false;
      res.statusCode = 503;
      return res.end(JSON.stringify({ code: "story_database_error", error: "The private artwork store is temporarily unavailable." }));
    }
    return res.end(JSON.stringify({ submission: req.method === "POST" ? { id: mockSubmissionId, token: "mock-submission-token-that-is-long-enough", status: "draft" } : { id: mockSubmissionId, selectedPreviewId: mockPreviewId, status: "ready" } }));
  }
  if (pathname === "/api/convert-monster") {
    const request = await readJsonBody(req);
    monsterPreviewRequests.push(request);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ monsterImage: image, style: request.style, submissionId: mockSubmissionId, previewId: `${mockPreviewId.slice(0, -1)}${monsterPreviewRequests.length}` }));
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
      assert.equal(await discovery.getByText("Upload your monster drawing", { exact: true }).count(), 2, "one heading and one primary upload action should lead the step");
      assert.equal(await discovery.locator("#selected-drawing").isHidden(), true);
      assert.equal(await discovery.locator("#monster-result").isHidden(), true, "example result should not compete with the initial upload action");
      assert.equal(await discovery.locator(".preview-options").isHidden(), true, "personality choices appear only after a drawing is selected");
      const accept = await discovery.locator("#monster-upload").getAttribute("accept");
      assert.match(accept, /image\/jpeg/);
      assert.match(accept, /image\/heic/);
      assert.equal(await discovery.locator("#monster-upload").getAttribute("capture"), null, "browser picker remains free to offer camera or photo library");
      assert.equal(await discovery.locator("#result-book-offer").isHidden(), true, `child editor should stay locked before monster selection on ${suffix || "default URL"}`);
      assert.equal(await discovery.locator("#child-editor-start").count(), 1, "child editor should remain available in the locked next step");
      assert.equal(await discovery.locator("#storybook-interest").isHidden(), true, "book review stays locked before monster selection");
      assert.equal(await discovery.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (!suffix) {
        await discovery.screenshot({ path: path.join(output, "child-editor-entry-mobile.png"), fullPage: true });
        await discovery.locator("#monster-upload").setInputFiles({ name: "not-a-drawing.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
        await discovery.locator("#upload-error").waitFor({ state: "visible" });
        assert.match(await discovery.locator("#upload-error").textContent(), /PNG, JPG, HEIC, WebP, or GIF/);
        await discovery.locator("#monster-upload").setInputFiles({ name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc((8 * 1024 * 1024) + 1) });
        assert.match(await discovery.locator("#upload-error").textContent(), /under 8(?:\.0)? MB/);
        assert.equal(await discovery.locator("#result-book-offer").isHidden(), true, "failed upload must not skip into the child step");
      }
      await discovery.close();
    }
    const desktopDiscovery = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await desktopDiscovery.goto(`${base}/create.html`);
    assert.equal(await desktopDiscovery.locator("#result-book-offer").isHidden(), true);
    assert.equal(await desktopDiscovery.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await desktopDiscovery.screenshot({ path: path.join(output, "create-studio-desktop.png"), fullPage: true });
    await desktopDiscovery.close();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/create.html?test=halloween`);
    await page.setViewportSize({ width: 390, height: 844 });
    const previewOptions = page.locator(".preview-options");
    assert.equal(await previewOptions.isHidden(), true, "personality controls stay out of the initial upload decision");
    const requestsBeforeSelection = monsterPreviewRequests.length;
    await page.locator("#monster-upload").setInputFiles({ name: "first-monster.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(path.join(root, "assets/step-2-character.jpg")) });
    await page.locator("#selected-drawing").waitFor({ state: "visible" });
    assert.equal(monsterPreviewRequests.length, requestsBeforeSelection, "selecting a drawing must wait for explicit Continue");
    assert.equal(await page.locator("#monster-result").isHidden(), true);
    assert.equal(await page.locator("#selected-drawing-title").textContent(), "first-monster.jpg");
    assert.equal(await page.locator("#drawing-preview").evaluate((image) => image.complete && image.naturalWidth > 0), true);
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("#replace-selected-drawing").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([]);
    assert.equal(await page.locator("#selected-drawing-title").textContent(), "first-monster.jpg", "canceling Replace keeps the selected drawing");
    await page.locator("#monster-upload").setInputFiles({ name: "replacement-monster.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(path.join(root, "assets/step-2-character.jpg")) });
    assert.equal(await page.locator("#selected-drawing-title").textContent(), "replacement-monster.jpg");
    assert.equal(monsterPreviewRequests.length, requestsBeforeSelection, "replacing a drawing still waits for explicit Continue");
    await page.screenshot({ path: path.join(output, "selected-drawing-mobile.png"), fullPage: true });
    await page.locator("#monster-upload").setInputFiles({ name: "oversize-replacement.png", mimeType: "image/png", buffer: Buffer.alloc((8 * 1024 * 1024) + 1) });
    assert.match(await page.locator("#upload-error").textContent(), /under 8(?:\.0)? MB/);
    assert.equal(await page.locator("#selected-drawing-title").textContent(), "replacement-monster.jpg", "invalid replacement keeps the current drawing selected");
    assert.equal(await previewOptions.isVisible(), true);
    assert.equal(await previewOptions.evaluate((element) => element.open), false, "personality choices start progressively disclosed");
    await previewOptions.locator("summary").click();
    assert.equal(await previewOptions.evaluate((element) => element.open), true);
    await previewOptions.locator("summary").click();
    assert.equal(await previewOptions.evaluate((element) => element.open), false, "repeated disclosure clicks return to the original state");
    await previewOptions.locator("summary").click();
    await page.locator('[data-monster-style="silly"]').click();
    assert.match(await page.locator("#next-personality-status").textContent(), /Playful is ready for the first preview/);
    await page.locator("#convert-button").evaluate((button) => { button.click(); button.click(); });
    await page.waitForFunction(() => document.querySelector("#monster-result")?.getAttribute("aria-busy") === "true");
    await page.locator('[data-monster-style="adventure"]').click();
    assert.match(await page.locator("#upload-action-status").textContent(), /queued for the next preview.*(?:will not|has not) changed?/i);
    assert.equal(await page.locator("#confirm-monster").isHidden(), true, "monster confirmation stays hidden while generation is pending");
    await page.locator("#confirm-monster").waitFor({ state: "visible" });
    assert.equal(monsterPreviewRequests.length, requestsBeforeSelection + 1, "repeated Continue taps create only one request");
    assert.equal(monsterPreviewRequests[0].style, "silly", "selected personality must reach the generation request");
    assert.equal(monsterPreviewRequests[0].submissionId, mockSubmissionId, "persisted submission must authorize generation");
    assert.equal(await page.locator("#selected-preview-personality").textContent(), "Selected preview · Playful");
    assert.match(await page.locator("#next-personality-status").textContent(), /Brave will be used when you create the next preview/);
    const selectedPreviewSource = await page.locator("#monster-preview").getAttribute("src");
    await page.locator('[data-monster-style="cute"]').click();
    assert.equal(await page.locator("#monster-preview").getAttribute("src"), selectedPreviewSource, "choosing the next personality must not restyle the current preview");
    assert.equal(await page.locator("#selected-preview-personality").textContent(), "Selected preview · Playful");
    await page.locator("#confirm-monster").click();
    await page.locator("#child-editor-start").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector("#child-preview-monster")?.src.startsWith("data:image/webp"));
    assert.equal(await page.locator("#child-preview-monster").isVisible(), true, "selected persisted preview should populate the child scene");
    assert.equal(await page.locator("#child-character-title").textContent(), "Choose who joins the story");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "child-editor-start");
    await page.locator("#back-to-monster").click();
    assert.equal(await page.locator("#monster-result").isVisible(), true, "back should restore the monster editor");
    assert.equal(await page.locator("#selected-preview-personality").textContent(), "Selected preview · Playful");
    await page.locator("#confirm-monster").click();
    await page.locator("#child-editor-start").waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const rect = document.querySelector("#child-editor-start")?.getBoundingClientRect();
      return rect && rect.top >= -2 && rect.top < innerHeight;
    });
    const editorPosition = await page.locator("#child-editor-start").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const offerRect = document.querySelector("#result-book-offer")?.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        offerTop: offerRect?.top,
        scrollY,
        viewport: innerHeight,
        horizontal: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.equal(editorPosition.horizontal, false);
    assert.ok(editorPosition.top >= -2 && editorPosition.top < editorPosition.viewport, JSON.stringify(editorPosition));
    await page.screenshot({ path: path.join(output, "child-editor-mobile.png"), fullPage: true });
    await page.locator("label").filter({ has: page.locator('input[name="child-gender"][value="boy"]') }).click();
    await page.locator("label").filter({ has: page.locator('input[name="child-character"][value="warm-curly-dark"]') }).click();
    await page.locator("#child-preview-details", { hasText: /Dark curls.*Ages 6–8.*Previewed beside/i }).waitFor();
    await page.locator(".child-accessibility-section > summary").click();
    assert.equal(await page.locator('input[name="child-mobility-aid"][value="wheelchair"]').isEnabled(), true);
    await page.locator("label").filter({ has: page.locator('input[name="child-mobility-aid"][value="wheelchair"]') }).click();
    await page.locator("#child-preview-details", { hasText: /Wheelchair shown in every scene.*Previewed beside/i }).waitFor();
    assert.equal(await page.locator("#child-preview-stage").evaluate((element) => element.classList.contains("mobility-wheelchair")), true);
    assert.equal(await page.locator('input[name="child-character"][value="deep-coils-black"]').isDisabled(), true);
    assert.equal(await page.locator('input[name="child-age-band"][value="3-5"]').isDisabled(), true);
    assert.equal(await page.locator('input[name="child-relative-height"]').count(), 0, "relative height is not a launch choice");
    await page.locator("label").filter({ has: page.locator('input[name="child-gender"][value="girl"]') }).click();
    await page.locator("label").filter({ has: page.locator('input[name="child-character"][value="deep-braids-black"]') }).click();
    await page.locator("label").filter({ has: page.locator('input[name="child-mobility-aid"][value="wheelchair"]') }).click();
    const basicsSection = page.locator(".child-character-details > .child-editor-section").first();
    if (!(await basicsSection.evaluate((element) => element.open))) {
      await basicsSection.locator("summary").click();
    }
    await page.locator("label").filter({ has: page.locator('input[name="child-age-band"][value="6-8"]') }).click();
    await page.locator("#child-preview-details", { hasText: /Ages 6–8.*Wheelchair shown in every scene/i }).waitFor();
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
    assert.equal(await page.locator('input[name="child-age-band"][value="6-8"]').isChecked(), true);
    const savedProfile = await page.evaluate(() => JSON.parse(localStorage.getItem("monstersnow_child_character_profile_v1")));
    assert.deepEqual(savedProfile, { id: "deep-braids-black", ageBand: "6-8", relativeHeight: "standard", profileVersion: "launch-v2", mobilityAid: "wheelchair" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    assert.equal(await page.locator('input[name="child-character"][value="deep-braids-black"]').isChecked(), true);
    assert.equal(await page.locator('input[name="child-age-band"][value="6-8"]').isChecked(), true);
    await page.screenshot({ path: path.join(output, "child-editor-desktop-wheelchair-editable.png"), fullPage: true });
    await page.goto(`${base}/about.html`);
    await page.goBack();
    assert.equal(await page.locator('input[name="child-character"][value="deep-braids-black"]').isChecked(), true);
    assert.equal(await page.locator('input[name="child-mobility-aid"][value="wheelchair"]').isChecked(), true);
    await page.locator("#monster-upload").setInputFiles(path.join(root, "assets/step-2-character.jpg"));
    await page.locator("#convert-button").click();
    await page.locator("#confirm-monster").waitFor({ state: "visible" });
    await page.locator("#download-coloring").click();
    await page.locator("#coloring-page-dialog[open]").waitFor({ state: "visible" });
    assert.match(await page.locator("#coloring-page-preview").getAttribute("src"), /^data:image\/png;base64,/);
    assert.match(await page.locator("#coloring-page-download-link").getAttribute("href"), /^data:image\/png;base64,/);
    await page.locator("#coloring-page-done").click();
    await page.locator("#confirm-monster").click();
    await page.locator("#storybook-interest").waitFor({ state: "visible" });
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
    assert.match(await page.locator("#proof-child-profile-copy").textContent(), /Ages 6–8/i);
    assert.doesNotMatch(await page.locator("#proof-child-profile-copy").textContent(), /height|proportion/i);
    assert.equal(await page.locator(".book-proof-page").count(), 32);
    const savedSubmission = JSON.parse(await page.evaluate(() => sessionStorage.getItem("monstersnow_halloween_test_proof")));
    assert.equal(savedSubmission.submission.personalization.childCharacter.id, "deep-braids-black");
    assert.equal(savedSubmission.submission.personalization.childCharacter.ageBand, "6-8");
    assert.equal(savedSubmission.submission.personalization.childCharacter.relativeHeight, "standard");
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
    const errorPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await errorPage.goto(`${base}/create.html`);
    const convertCountBeforeFailure = monsterPreviewRequests.length;
    failNextMonsterSubmission = true;
    await errorPage.locator("#monster-upload").setInputFiles(path.join(root, "assets/step-2-character.jpg"));
    await errorPage.locator("#convert-button").click();
    await errorPage.locator("#upload-error").waitFor({ state: "visible" });
    assert.match(await errorPage.locator("#upload-error").textContent(), /couldn't safely save.*no preview was created.*Nothing was charged/i);
    assert.equal(monsterPreviewRequests.length, convertCountBeforeFailure, "generation must not run without a persisted submission");
    assert.equal(await errorPage.locator("#convert-button").isEnabled(), true, "persistence failure should leave an explicit retry available");
    await errorPage.close();
    console.log("PASS: upload → bounded editable wheelchair profile → reset/undo/persistence → coloring-page viewer → selected preview → 32-page proof → approval → mocked test checkout → verified success; back/forward/reload and desktop/mobile fit; no JS errors; no print/email calls.");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
