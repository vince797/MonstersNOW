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

test("admin book workspace groups status, review files, and the next action", () => {
  assert.match(adminMarkup, /admin-books\.css\?v=20261004-book-workspace/);
  assert.match(adminMarkup, /Books &amp; stories/);
  assert.match(adminMarkup, /Review &amp; print/);
  assert.match(adminMarkup, /Artwork &amp; monsters/);
  assert.match(adminMarkup, /id="book-workspace-summary"/);
  assert.match(adminMarkup, /id="book-review-files-list"/);
  assert.match(adminScript, /function renderBookWorkspace/);
  assert.match(adminScript, /function uploadBookReviewFile/);
  assert.match(adminScript, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(adminScript, /private review materials/);
  assert.match(adminBooksStyles, /@media \(max-width: 720px\)/);
  assert.doesNotMatch(adminScript, /Delete review PDF|Replace review PDF/);
});
