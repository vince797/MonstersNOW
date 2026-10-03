// Local-only browser regression: no uploads, real child data, or external calls.
// Run: node tests/child-characters-browser.js
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { childCharacterIds } = require("../lib/child-characters");
const { STORAGE_KEY } = require("../scripts/child-character-picker");
const root = path.resolve(__dirname, "..");
const output = process.env.CHILD_PICKER_SCREENSHOT_DIR || "/tmp/monstersnow-child-picker-review";
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(root + path.sep) || !types[path.extname(file)] || !fs.existsSync(file)) {
    res.statusCode = 404; return res.end();
  }
  res.setHeader("Content-Type", types[path.extname(file)]);
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium" });
  try {
    fs.mkdirSync(output, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
    const requests = [];
    const allowOnlyStaticLocal = (route) => {
      const request = route.request();
      if (!request.url().startsWith(base + "/") || new URL(request.url()).pathname.startsWith("/api/")) {
        requests.push(request.url()); return route.abort();
      }
      return route.continue();
    };
    await context.route("**/*", allowOnlyStaticLocal);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/create.html`);
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator('input[type="radio"]').count(), 11); // Nine characters, two hidden formats.
    assert.equal(await page.locator(".child-character-option").count(), 9);
    assert.equal(await page.locator(".child-character-art img").count(), 8);
    assert.equal(await page.locator("#child-character-none").isChecked(), true);
    assert.equal(await page.locator("#result-book-offer").isVisible(), false);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll(".child-character-art img")].every((img) => img.complete && img.naturalWidth > 0)), true);
    assert.equal(await page.evaluate(() => document.querySelector("#child-character-picker").getBoundingClientRect().bottom < document.querySelector("#monster-upload").getBoundingClientRect().top), true);
    for (const id of childCharacterIds()) {
      await page.locator(`#child-character-${id}`).check();
      assert.equal(await page.evaluate(() => getSelectedChildCharacter().id), id);
      assert.equal(await page.locator(".child-character-option.is-selected").count(), 1);
    }
    await page.reload();
    assert.equal(await page.locator("#child-character-deep-braids-black").isChecked(), true);
    assert.deepEqual(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) })), { local: [], session: [STORAGE_KEY] });
    assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEY), "deep-braids-black");
    await page.locator("#child-character-none").check();
    await page.locator("#child-character-none").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#child-character-warm-curly-dark").isChecked(), true);
    assert.equal(await page.locator("#child-character-warm-curly-dark").evaluate((input) => input === document.activeElement), true);
    await page.locator("#child-character-picker").screenshot({ path: path.join(output, "picker-desktop.png") });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}px`);
      const target = page.locator("#child-character-deep-braids-black");
      await target.check();
      assert.equal(await target.isChecked(), true);
      assert.equal(await page.locator("#child-character-selection").textContent(), "Braids");
      await page.locator("#child-character-picker").screenshot({ path: path.join(output, `picker-${width}.png`) });
    }
    await page.evaluate((key) => sessionStorage.setItem(key, "__proto__"), STORAGE_KEY);
    await page.reload();
    assert.equal(await page.locator("#child-character-none").isChecked(), true);
    const fresh = await context.newPage();
    await fresh.goto(`${base}/create.html`);
    assert.equal(await fresh.locator("#child-character-none").isChecked(), true);
    await fresh.close();
    // Blocking storage does not disable visual selection or create a JS error.
    const privateContext = await browser.newContext();
    await privateContext.route("**/*", allowOnlyStaticLocal);
    await privateContext.addInitScript(() => Object.defineProperty(window, "sessionStorage", { get() { throw new Error("blocked"); } }));
    const privatePage = await privateContext.newPage();
    privatePage.on("pageerror", (error) => errors.push(error.message));
    await privatePage.goto(`${base}/create.html`);
    await privatePage.locator("#child-character-light-wavy-blonde").check();
    assert.equal(await privatePage.evaluate(() => getSelectedChildCharacter().id), "light-wavy-blonde");
    await privateContext.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    console.log(`PASS: eight loaded assets + Monster only before upload; canonical selection; keyboard; reload; 390/320px; no storage failure errors; no API/external calls. Screenshots: ${output}`);
  } finally { await browser.close(); server.close(); }
})().catch((error) => { server.close(); console.error(error); process.exitCode = 1; });
