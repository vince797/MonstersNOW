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
  assert.match(adminMarkup, /styles\.css\?v=20261007-artwork-panel-v2/);
  assert.match(styles, /--admin-ui-font: Inter, ui-sans-serif, system-ui/);
  assert.match(styles, /\.admin-page strong \{[\s\S]*font-family: var\(--admin-ui-font\)/);
  assert.doesNotMatch(styles, /Admin Fredoka/);
  assert.doesNotMatch(publicPolish, /Fredoka|Arial Rounded MT Bold/);
  assert.match(publicPolish, /\.books-section \.section-heading h2 \{[\s\S]*font-family: inherit/);
});

test("admin sign-in does not blame the device for a server credential timestamp error", () => {
  assert.doesNotMatch(adminScript, /Your device clock appears out of sync/);
  assert.match(adminScript, /Your device clock is not the cause/);
  assert.doesNotMatch(adminScript, /update the Supabase secret key in Vercel/);
  assert.match(adminScript, /database service had a temporary timestamp problem/);
  assert.match(adminScript, /method === "GET"/);
  assert.match(adminScript, /retryCount === 0/);
  assert.match(adminScript, /result\.code === "PGRST303"/);
  assert.match(adminScript, /error\.code = result\.code/);
  assert.match(adminScript, /error\.status = response\.status/);
});

test("admin book workspace groups status, review files, and the next action", () => {
  assert.match(adminMarkup, /admin-books\.css\?v=20261007-master-monsters-v1/);
  assert.match(adminMarkup, /scripts\/admin\.js\?v=20261007-artwork-panel-v2/);
  assert.match(adminMarkup, />Orders/);
  assert.match(adminMarkup, /Master Books/);
  assert.match(adminMarkup, /Character Assets/);
  assert.match(adminMarkup, /Master background review/);
  assert.match(adminMarkup, /Personalized customer proof/);
  assert.match(adminMarkup, /Cover preview/);
  assert.match(adminMarkup, /Print preflight/);
  assert.match(adminMarkup, /Lulu acceptance/);
  assert.match(adminMarkup, /Every master page has separate layers/);
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
  assert.match(adminScript, /Background plate needed/);
  assert.match(adminScript, /zone\.hidden = !hasVisual/);
  assert.match(adminScript, /MONSTER AREA/);
  assert.doesNotMatch(adminScript, /CUSTOM MONSTER/);
  assert.match(adminScript, /page\.backgroundPlateConfirmed === true/);
  assert.match(adminScript, /Number\(page\.backgroundPlateVersion \|\| 0\) >= 2/);
  assert.match(adminScript, /Exact review-PDF approval is not recorded in the current data model/);
  assert.match(adminScript, /No final personalized print PDF has been created and approved/);
  assert.match(adminBooksStyles, /\.background-plate-check/);
  assert.match(adminBooksStyles, /@media \(max-width: 720px\)/);
  assert.match(styles, /\.page-artwork-visual\.is-empty \.monster-zone/);
  assert.doesNotMatch(styles, /\.monster-zone::before|\.monster-zone::after/);
  assert.doesNotMatch(adminScript, /Delete review PDF|Replace review PDF/);
});

test("admin pose production stays dormant until its database migration is available", () => {
  assert.match(adminScript, /posePipelineAvailable = monsterResult\.posePipelineAvailable === true/);
  assert.match(adminScript, /Apply the reviewed pose-pipeline database migration/);
  assert.match(adminScript, /if \(!posePipelineAvailable\)/);
});
