const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const adminMarkup = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const publicPolish = fs.readFileSync(path.join(root, "home-polish.css"), "utf8");
const adminScript = fs.readFileSync(path.join(root, "scripts/admin.js"), "utf8");
const adminBooksStyles = fs.readFileSync(path.join(root, "admin-books.css"), "utf8");
const brandStyles = fs.readFileSync(path.join(root, "brand.css"), "utf8");
const adminLogo = fs.readFileSync(path.join(root, "assets/monstersnow-logo-v2.svg"), "utf8");

test("admin workspace and homepage collection use the readable system typeface", () => {
  assert.match(adminMarkup, /styles\.css\?v=20261002-admin-system-type/);
  assert.match(styles, /--admin-ui-font: Inter, ui-sans-serif, system-ui/);
  assert.match(styles, /\.admin-page strong \{[\s\S]*font-family: var\(--admin-ui-font\)/);
  assert.doesNotMatch(styles, /Admin Fredoka/);
  assert.doesNotMatch(publicPolish, /Fredoka|Arial Rounded MT Bold/);
  assert.match(publicPolish, /\.books-section \.section-heading h2 \{[\s\S]*font-family: inherit/);
});

test("admin sign-in does not blame the device for a server credential timestamp error", () => {
  assert.doesNotMatch(adminScript, /Your device clock appears out of sync/);
  assert.match(adminScript, /Your device clock is not the cause/);
  assert.match(adminScript, /error\.code = result\.code/);
  assert.match(adminScript, /error\.status = response\.status/);
});

test("admin sign-in uses the MonstersNOW purple, orange, and teal identity", () => {
  assert.match(adminMarkup, /brand\.css\?v=20261007-admin-login-theme/);
  assert.match(adminMarkup, /assets\/monstersnow-logo-v2\.svg\?v=20261007-admin" alt="MonstersNOW" width="680" height="250"/);
  assert.match(adminLogo, /viewBox="0 0 680 250"/);
  assert.match(brandStyles, /\.admin-page \.admin-login-brand \{[\s\S]*linear-gradient\(145deg, #291448 0%, #3b1d6d 62%, #4a287e 100%\)/);
  assert.match(brandStyles, /\.admin-page \.admin-login-card \{[\s\S]*border-top: 4px solid #ff8a00/);
  assert.match(brandStyles, /\.admin-page \.admin-login-card form \.button\.primary \{[\s\S]*background: #ff8a00/);
  assert.match(brandStyles, /\.admin-page \.admin-login-security \{[\s\S]*background: #dff7f6/);
});

test("admin book workspace groups status, review files, and the next action", () => {
  assert.match(adminMarkup, /admin-books\.css\?v=20261004-book-workspace/);
  assert.match(adminMarkup, /data-admin-view="stories"><span aria-hidden="true">▤<\/span>Books /);
  assert.match(adminMarkup, /Review &amp; print/);
  assert.match(adminMarkup, /data-admin-view="monsters"><span aria-hidden="true">●<\/span>Monsters /);
  assert.match(adminMarkup, /id="book-workspace-summary"/);
  assert.match(adminMarkup, /id="book-review-files-list"/);
  assert.match(adminScript, /function renderBookWorkspace/);
  assert.match(adminScript, /function uploadBookReviewFile/);
  assert.match(adminScript, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(adminScript, /private review materials/);
  assert.match(adminBooksStyles, /@media \(max-width: 720px\)/);
  assert.doesNotMatch(adminScript, /Delete review PDF|Replace review PDF/);
});
