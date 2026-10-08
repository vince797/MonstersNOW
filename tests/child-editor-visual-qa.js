// Visual QA pass for the Character Studio: screenshots of every editor
// section, painting, versions, and an error state at phone, tablet, and
// desktop widths, with automated layout checks at every shot.
//   CHILD_EDITOR_QA_DIR=/tmp/qa node tests/child-editor-visual-qa.js
// (needs the `playwright` package + Chromium; uses the in-memory mocks.)
const fs = require("node:fs");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const harness = require("./support/child-editor-harness");
const { assertCleanLayout } = require("./support/layout-checks");

const OUT = process.env.CHILD_EDITOR_QA_DIR || path.join(harness.root, "tmp", "child-editor-qa");
const SIZES = [
  { name: "375", context: { ...devices["iPhone SE"], viewport: { width: 375, height: 667 } } },
  { name: "390", context: { ...devices["iPhone 13"] } },
  { name: "414", context: { ...devices["iPhone 11 Pro Max"], viewport: { width: 414, height: 896 } } },
  { name: "768", context: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: devices["iPad Mini"].userAgent } },
  { name: "1280", context: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
];
const launchOptions = { headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) };

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => {
    let last = -1; let still = 0;
    const tick = () => { still = scrollY === last ? still + 1 : 0; last = scrollY; if (still >= 6) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  await page.waitForTimeout(120);
}

// Scroll so `selector` starts just below the header (and the phone bar, if it will show).
async function scrollTo(page, selector, extra = 0) {
  await page.evaluate(([sel, extraOffset]) => {
    const el = document.querySelector(sel);
    const header = document.querySelector(".site-header").getBoundingClientRect().bottom;
    const bar = innerWidth <= 980 ? 74 : 0;
    window.scrollTo(0, el.getBoundingClientRect().top + scrollY - header - bar - 12 + extraOffset);
  }, [selector, extra]);
  await settle(page);
}

async function tab(page, name) {
  const button = page.locator(`[data-editor-tab="${name}"]`);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await settle(page);
}

async function pick(page, name, value) {
  await page.locator(`label:has(input[name="${name}"][value="${value}"])`).click();
  await page.waitForFunction(([n, v]) => document.querySelector(`input[name="${n}"][value="${v}"]`)?.checked, [name, value]);
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const h = await harness.start();
  const browser = await chromium.launch(launchOptions);
  const shots = [];
  try {
    for (const size of SIZES) {
      const dir = path.join(OUT, size.name);
      fs.mkdirSync(dir, { recursive: true });
      const context = await browser.newContext(size.context);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let n = 0;
      const touch = Boolean(size.context.hasTouch);
      // A Chromium full-page capture resets touch emulation, after which the
      // "phone" reports a fine hover pointer and shows hover styles a real
      // phone never would. Restore it so every shot looks like the device.
      const cdp = touch ? await context.newCDPSession(page) : null;
      const shot = async (label, { fullPage = false } = {}) => {
        await settle(page);
        if (touch && await page.evaluate(() => matchMedia("(hover: hover)").matches)) throw new Error(`${size.name}px ${label}: touch emulation lost (hover styles would show)`);
        await assertCleanLayout(page, `${size.name}px ${label}`, { focus: false });
        const file = path.join(dir, `${String(++n).padStart(2, "0")}-${label}.png`);
        await page.screenshot({ path: file, fullPage });
        if (fullPage && cdp) await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
        shots.push(file);
      };

      h.state.scenario.imageDelayMs = 150;
      await page.goto(`${h.base}/create.html?test=halloween`);
      await page.locator("#monster-upload").setInputFiles(path.join(harness.root, "assets/step-2-character.jpg"));
      await page.locator("#confirm-monster").waitFor({ state: "visible", timeout: 20000 });
      await page.locator("#confirm-monster").click();
      await page.locator("#child-editor-start").waitFor({ state: "visible" });
      await page.evaluate(() => window.MonstersNowChildStudio.init({ requestTimeoutMs: 15000, autoRetryDelayMs: 150 }));
      await settle(page);
      await shot("editor-top");
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot("full-page", { fullPage: true });

      await scrollTo(page, "[data-child-presets]");
      await shot("quick-start-looks");
      await scrollTo(page, ".child-accessibility-section");
      await shot("movement-support");

      await tab(page, "appearance");
      await scrollTo(page, ".child-editor-tabs");
      await shot("look-tab-top");
      await scrollTo(page, ".child-hair-style-options", -60);
      await shot("look-tab-hair");
      await scrollTo(page, '[data-editor-panel="appearance"] fieldset:last-of-type');
      await shot("look-tab-bottom");

      await tab(page, "outfit");
      await scrollTo(page, ".child-editor-tabs");
      await shot("clothes-tab");
      await pick(page, "child-outfit-style", "costume");
      await pick(page, "child-costume", "witch");
      await scrollTo(page, "#child-costume-field", -40);
      await shot("clothes-costumes");

      await tab(page, "extras");
      await pick(page, "child-glasses", "round");
      await pick(page, "child-headwear", "beanie");
      await scrollTo(page, ".child-editor-tabs");
      await shot("extras-tab");

      await tab(page, "build");
      await page.locator("#child-special-detail").fill("star hair clip");
      await scrollTo(page, ".child-editor-tabs");
      await shot("details-tab");
      await scrollTo(page, ".child-special-detail-field", -120);
      await shot("details-special-detail");

      // Painting (slow mock so the progress state is visible).
      h.state.scenario.imageDelayMs = 2500;
      await page.locator("#render-child-character").scrollIntoViewIfNeeded();
      await page.locator("#render-child-character").click();
      await page.locator("#child-render-progress").waitFor({ state: "visible" });
      await scrollTo(page, "#child-preview-stage", -20);
      await shot("painting-progress");
      await page.waitForFunction(() => !window.MonstersNowChildStudio.isBusy(), null, { timeout: 30000 });
      h.state.scenario.imageDelayMs = 150;
      await scrollTo(page, "#child-preview-stage", -20);
      await shot("painted-character");
      await scrollTo(page, "#child-render-versions", -40);
      await shot("painted-versions");
      if (size.name !== "1280" && size.name !== "768") {
        await tab(page, "appearance");
        await scrollTo(page, ".child-hair-style-options", -60);
        await shot("mid-editor-with-painted-bar");
      }

      // Error state: a new look where both versions come back busy.
      await tab(page, "extras");
      await pick(page, "child-glasses", "square");
      h.state.scenario.imageQueue = [{ kind: "busy" }, { kind: "busy" }];
      await page.locator("#render-child-character").scrollIntoViewIfNeeded();
      await page.locator("#render-child-character").click();
      await page.locator("#child-render-retry").waitFor({ state: "visible", timeout: 20000 });
      await scrollTo(page, "#child-render-retry", -260);
      await shot("error-retry");
      h.state.scenario.imageQueue = [];

      await page.evaluate(() => window.scrollTo(0, 0));
      await shot("full-page-after-painting", { fullPage: true });
      if (errors.length) throw new Error(`${size.name}px page errors: ${errors.join("; ")}`);
      console.log(`  ✓ ${size.name}px: ${n} screenshots, layout checks clean`);
      await context.close();
    }
    console.log(`PASS: visual QA (${shots.length} screenshots in ${OUT})`);
  } finally {
    await browser.close();
    await h.stop();
  }
}

run().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
