// Local browser check for Admin book-review language and responsive layout.
// All private APIs are mocked; this never uses production credentials or writes data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const { buildHalloweenMasterPages } = require("../lib/halloween-master-pages");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "tmp", "admin-books-check");
fs.mkdirSync(output, { recursive: true });

const catalogSlugs = [
  "halloween-monster-night", "big-adventure", "bedtime-monster", "abc-monster-book",
  "counting-with-my-monster", "the-monster-who-lost-their-glow", "birthday-monster-adventure",
];
const halloweenPages = buildHalloweenMasterPages().map((page, index) => ({
  ...page,
  artworkUrl: index === 0 ? "" : "/assets/step-2-character.jpg",
  artworkName: index === 0 ? "" : `page-${index + 1}.jpg`,
  artworkStatus: index === 0 ? "missing" : "approved",
  backgroundPlateConfirmed: index !== 0,
  backgroundPlateVersion: index === 0 ? 0 : 2,
}));
const stories = catalogSlugs.map((slug, index) => ({
  id: `story-${index + 1}`,
  slug,
  title_template: slug === "halloween-monster-night" ? "Halloween Monster Night" : slug.replaceAll("-", " "),
  description: "Local browser fixture",
  status: "draft",
  version: 4,
  is_seasonal: slug === "halloween-monster-night",
  available_from: slug === "halloween-monster-night" ? "2026-09-15" : null,
  available_until: slug === "halloween-monster-night" ? "2026-10-31" : null,
  pages: slug === "halloween-monster-night" ? halloweenPages : [],
}));
const reviewFiles = [
  {
    id: "halloween-wheelchair-production-candidate-v2", storySlug: "halloween-monster-night",
    label: "Wheelchair production candidate v2", category: "Digital candidate", pages: 32, size: 12933876,
    reviewStatus: "Approval not recorded", printStatus: "Not print ready",
    approvalScope: "Artwork and composition review only. A final personalized print PDF and physical proof remain separate gates.",
    description: "32-page digital candidate.", nextAction: "Review every spread.", uploaded: false,
  },
  {
    id: "halloween-wheelchair-reference-review", storySlug: "halloween-monster-night",
    label: "Wheelchair reference review", category: "Visual reference", pages: 32, size: 14854554,
    reviewStatus: "Approval not recorded", printStatus: "Not print ready",
    approvalScope: "Continuity reference only. This file cannot approve artwork or printing.",
    description: "32-page continuity reference.", nextAction: "Review continuity.", uploaded: false,
  },
  {
    id: "halloween-reusable-master-backgrounds-pages-01-32-review", storySlug: "halloween-monster-night",
    label: "Reusable master backgrounds, pages 1–32", category: "Background review", pages: 32, size: 16677582,
    reviewStatus: "Approval not recorded", printStatus: "Not print ready",
    approvalScope: "Background-art review only. This is not a final personalized print PDF.",
    description: "32-page character-free background review.", nextAction: "Review all backgrounds.", uploaded: true,
    downloadUrl: "/mock-review.pdf",
  },
];

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = path.resolve(root, `.${pathname === "/" ? "/admin.html" : pathname}`);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.statusCode = 404;
    return response.end();
  }
  const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
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
      await page.addInitScript(() => sessionStorage.setItem("monstersnow_admin_password", "local-mock-only"));
      await page.route("**/api/storybook-interest**", async (route) => {
        const resource = new URL(route.request().url()).searchParams.get("resource") || "stories";
        const body = resource === "orders" ? { orders: [] }
          : resource === "monsters" ? { monsters: [], posePipelineAvailable: false }
            : resource === "book-review-files" ? { files: reviewFiles }
              : { stories };
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      });
      await page.goto(`${base}/admin.html`);
      await page.locator('[data-admin-view="stories"]').click();
      await page.locator(".story-list-item", { hasText: "Halloween Monster Night" }).click();
      await page.locator("#book-workspace-summary").waitFor({ state: "visible" });
      assert.match(await page.locator("#book-review-files-summary").textContent(), /1\/3 stored · review PDFs, not print approvals/);
      assert.match(await page.locator("#book-production-blockers-list").textContent(), /Exact review-PDF approval is not recorded/);
      assert.match(await page.locator("#book-production-blockers-list").textContent(), /No final personalized print PDF/);
      assert.equal(await page.getByText("Individual page background", { exact: true }).count(), 32);
      assert.equal(await page.getByText("This page background is character-free", { exact: true }).count(), 32);
      assert.equal(await page.getByText("Applies only to this individual page, not any PDF.", { exact: true }).count(), 32);
      assert.equal(await page.getByText("Individual page background", { exact: true }).first().isVisible(), true);
      assert.equal(await page.locator(".book-review-file", { hasText: "Approval not recorded" }).count(), 3);
      assert.equal(await page.locator(".book-review-file", { hasText: "Not print ready" }).count(), 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(output, `admin-books-review-${viewport.name}.png`), fullPage: true });
      await page.close();
    }
    console.log("PASS: Admin separates page-background review, review-PDF status, and print approval on desktop/mobile; no JS errors or private writes.");
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
