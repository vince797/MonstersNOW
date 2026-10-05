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
  assert.match(adminMarkup, /admin-books\.css\?v=20261005-review-scope-v2/);
  assert.match(adminMarkup, /scripts\/admin\.js\?v=20261005-review-scope-v2/);
  assert.match(adminMarkup, /Books &amp; stories/);
  assert.match(adminMarkup, /Review &amp; print/);
  assert.match(adminMarkup, /Artwork &amp; monsters/);
  assert.match(adminMarkup, /id="book-workspace-summary"/);
  assert.match(adminMarkup, /id="book-review-files-list"/);
  assert.match(adminMarkup, /id="book-production-blockers-list"/);
  assert.match(adminMarkup, /Background-art review, review-PDF approval, and final print approval are separate gates/);
  assert.match(adminScript, /function renderBookWorkspace/);
  assert.match(adminScript, /function uploadBookReviewFile/);
  assert.match(adminScript, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(adminScript, /review PDFs, not print approvals/);
  assert.match(adminScript, /Individual page background/);
  assert.match(adminScript, /This does not approve a PDF or unlock printing/);
  assert.match(adminScript, /Exact review-PDF approval is not recorded in the current data model/);
  assert.match(adminScript, /No final personalized print PDF has been created and approved/);
  assert.match(adminBooksStyles, /\.background-plate-check/);
  assert.match(adminBooksStyles, /@media \(max-width: 720px\)/);
  assert.doesNotMatch(adminScript, /Delete review PDF|Replace review PDF/);
});

test("admin pose production stays dormant until its database migration is available", () => {
  assert.match(adminScript, /posePipelineAvailable = monsterResult\.posePipelineAvailable === true/);
  assert.match(adminScript, /Apply the reviewed pose-pipeline database migration/);
  assert.match(adminScript, /if \(!posePipelineAvailable\)/);
});
