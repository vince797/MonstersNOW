// Full customer and existing-admin integration using synthetic local fixtures.
// No production routes, credentials, generated AI artwork, payment or printing.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createReviewServer } = require('./review-server');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'tmp/personalized-review');
(async () => {
 const server = createReviewServer();
 let browser;
 try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  fs.mkdirSync(out, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [], blockedExternal = [], apiCalls = [];
  await context.route('**/*', route => {
   const url = route.request().url();
   if (!url.startsWith(base + '/')) { blockedExternal.push(url); return route.abort(); }
   if (url.includes('/api/')) apiCalls.push(new URL(url).pathname);
   return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  for (const format of ['softcover','hardcover']) {
   await page.goto(`${base}/create.html`);
   await page.locator('#child-character-deep-braids-black').check();
   await page.locator('#monster-upload').setInputFiles(path.join(root, 'assets/step-2-character.jpg'));
   await page.locator('#confirm-monster').click();
   await page.locator('#child-name').fill('Sample');
   await page.locator('#monster-name').fill('Fizz');
   await page.locator('#interest-email').fill('sample@example.test');
   await page.locator(`input[name="storybook-format"][value="${format}"]`).check();
   await page.locator('#storybook-interest').click();
   await page.waitForURL('**/halloween-proof.html');
   assert.equal(await page.locator('.composed-proof-page').count(), 32);
   assert.equal(await page.locator('.composition-child').count(), 28);
   assert.equal(await page.locator('.composition-background').count(), 28);
   assert.equal(await page.locator('#proof-checkout').isVisible(), false);
   assert.match(await page.locator('#proof-composition-notice').innerText(), new RegExp(format === 'softcover' ? 'Softcover' : 'Hardcover'));
   const spread = page.locator('[data-page-number="4"]');
   await spread.scrollIntoViewIfNeeded();
   await page.locator('[data-page-number="4"] .composition-child img').waitFor({ state: 'visible' });
   assert.equal(await overflow(), false);
   await page.screenshot({ path: path.join(out, `${format}-desktop.png`) });
   await page.setViewportSize({ width:390, height:844 });
   assert.equal(await overflow(), false);
   await spread.scrollIntoViewIfNeeded();
   await page.screenshot({ path: path.join(out, `${format}-mobile.png`) });
   await page.goBack();
   assert.equal(await page.locator('#child-character-deep-braids-black').isChecked(), true);
   await page.setViewportSize({ width:1440, height:1000 });
  }
  await page.goto(`${base}/admin.html`);
  await page.locator('#admin-password').fill('synthetic-local-harness-only');
  await page.locator('#admin-login-form button[type="submit"]').click();
  await page.locator('[data-admin-view="orders"]').click();
  await page.locator('.order-board-card').click();
  await page.locator('#order-composition-details summary').click();
  assert.equal(await page.locator('#order-composition-pages .composed-proof-page').count(), 32);
  assert.equal(await page.locator('#order-composition-pages .composition-child').count(), 28);
  assert.equal(await page.locator('#send-order-lulu').isDisabled(), true);
  assert.match(await page.locator('#order-composition-notice').innerText(), /current-master review/);
  await page.locator('#order-composition-review').scrollIntoViewIfNeeded();
  await page.screenshot({ path:path.join(out,'admin-review.png') });
  await page.locator('#close-order-detail').click();
  assert.equal(await page.locator('#order-detail').isVisible(), false);
  await page.locator('.order-board-card').click();
  assert.equal(await page.locator('#order-composition-details').getAttribute('open'), null);
  assert.equal(await page.locator('#order-composition-pages .composed-proof-page').count(), 32);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#order-detail').isVisible(), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedExternal, []);
  assert.ok(apiCalls.every(url => !/lulu|checkout|resend/.test(url)));
  console.log('PASS: pre-upload child selection → monster confirmation → both 32-page book formats; customer/admin shared composition; mobile fit; Close/Escape/reopen; zero external/checkout/print calls.');
 } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
