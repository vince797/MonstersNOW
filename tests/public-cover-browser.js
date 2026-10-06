// Local browser check for the approved seven-cover collection on public catalog surfaces.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "tmp", "public-cover-check");
fs.mkdirSync(output, { recursive: true });
const approvedCoverFiles = [
  "halloween-monster-night-v3-web.jpg",
  "big-adventure-v3-web.jpg",
  "bedtime-monster-v3-web.jpg",
  "abc-monster-book-v3-web.jpg",
  "counting-with-my-monster-v3-web.jpg",
  "the-monster-who-lost-their-glow-v4-web.jpg",
  "birthday-monster-adventure-v3-web.jpg",
];

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.statusCode = 404;
    return response.end();
  }
  const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
  response.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(response);
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    });
    for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/index.html`);
      const cover = page.locator('img[src*="halloween-monster-night-v3-web.jpg"]').first();
      await cover.scrollIntoViewIfNeeded();
      await cover.waitFor({ state: "visible" });
      await page.waitForFunction((image) => image.complete && image.naturalWidth > 0, await cover.elementHandle());
      assert.equal(await cover.evaluate((image) => image.complete && image.naturalWidth > 0), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      await cover.locator("xpath=ancestor::article[1]").screenshot({ path: path.join(output, `halloween-cover-${viewport.name}.png`) });
      await page.goto(`${base}/books.html`);
      const catalogGrid = page.locator(".story-catalog-grid");
      await catalogGrid.scrollIntoViewIfNeeded();
      for (const fileName of approvedCoverFiles) {
        const catalogCover = page.locator(`img[src*="${fileName}"]`).first();
        await catalogCover.scrollIntoViewIfNeeded();
        await page.waitForFunction((image) => image.complete && image.naturalWidth > 0, await catalogCover.elementHandle());
        assert.equal(await catalogCover.evaluate((image) => image.complete && image.naturalWidth > 0), true);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      await catalogGrid.screenshot({ path: path.join(output, `cover-collection-${viewport.name}.png`) });
      await page.close();
    }
    console.log("PASS: approved seven-cover collection loads on public catalog surfaces at desktop/mobile sizes with no overflow or browser errors.");
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
