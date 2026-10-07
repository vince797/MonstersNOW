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
const poseJobs = fs.readFileSync(path.join(root, "lib/storybook-pose-jobs.js"), "utf8");
const luluOrder = fs.readFileSync(path.join(root, "lib/storybook-lulu-order.js"), "utf8");
const orderLibrary = fs.readFileSync(path.join(root, "lib/order-library.js"), "utf8");

test("admin workspace and homepage collection use the readable system typeface", () => {
  assert.match(adminMarkup, /styles\.css\?v=20261007-order-workflow-v1/);
  assert.match(styles, /--admin-ui-font: Inter, ui-sans-serif, system-ui/);
  assert.match(styles, /\.admin-page strong \{[\s\S]*font-family: var\(--admin-ui-font\)/);
  assert.doesNotMatch(styles, /Admin Fredoka/);
  assert.doesNotMatch(publicPolish, /Fredoka|Arial Rounded MT Bold/);
  assert.match(publicPolish, /\.books-section \.section-heading h2 \{[\s\S]*font-family: inherit/);
});

test("gallery collection uses compact responsive transformation cards", () => {
  assert.match(styles, /\.monster-library \{[^}]*repeat\(auto-fit, minmax\(280px, 1fr\)\)/s);
  assert.match(styles, /\.monster-library-images \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 22px minmax\(0, 1fr\)/s);
  assert.match(styles, /\.monster-library-info \{[^}]*gap:\s*9px;[^}]*padding:\s*11px/s);
  assert.match(styles, /\.monster-library-actions \.button \{[^}]*min-height:\s*34px/s);
  assert.match(styles, /@media \(max-width: 520px\)[^{]*\{[^}]*\.monster-library \{ grid-template-columns: 1fr; \}/s);
});

test("admin sign-in matches the public purple brand treatment", () => {
  assert.match(adminMarkup, /monstersnow-stacked-footer-v1\.png" alt="MonstersNow\.com"/);
  assert.match(styles, /\.admin-login-brand \{[\s\S]*linear-gradient\(135deg, #291448, #3b1d6d 68%, #422278\)/);
  assert.match(styles, /\.admin-login-brand > a \{[^}]*background:\s*transparent/s);
  assert.match(styles, /\.admin-login-brand \.eyebrow \{ color: #21c7c6; \}/);
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
  assert.match(adminMarkup, /admin-books\.css\?v=20261007-editor-v2/);
  assert.match(adminMarkup, /scripts\/admin\.js\?v=20261007-order-workflow-v1/);
  assert.match(adminMarkup, />Orders/);
  assert.match(adminMarkup, /Master Books/);
  assert.match(adminMarkup, /Gallery Collection/);
  assert.match(adminMarkup, /Master background review/);
  assert.match(adminMarkup, /Personalized customer proof/);
  assert.match(adminMarkup, /Cover preview/);
  assert.match(adminMarkup, /Print preflight/);
  assert.match(adminMarkup, /Lulu acceptance/);
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

test("admin story editor keeps writing primary and collapses production-only tools", () => {
  assert.match(adminMarkup, /<button class="button secondary" id="save-draft"[^>]*>Save now<\/button>/);
  assert.match(adminMarkup, /<details class="book-workspace-summary" id="book-workspace-summary">/);
  assert.match(adminMarkup, /Readiness, approvals, and review files/);
  assert.match(adminMarkup, /<details class="selected-spread-preview">/);
  assert.doesNotMatch(adminMarkup, /<details class="selected-spread-preview" open>/);
  assert.doesNotMatch(adminMarkup, /master-layer-guide|book-checks-panel|story-readiness-list/);
  assert.match(adminScript, /document\.createElement\("details"\)/);
  assert.match(adminScript, /data-artwork-summary/);
  assert.match(adminScript, /Page artwork &amp; placement/);
  assert.match(adminScript, /Words &amp; illustration/);
  assert.match(adminScript, /duplicate\.hidden = cards\.length >= 32/);
  assert.match(adminScript, /querySelector\("#add-page"\)\.hidden = cards\.length >= 32/);
  assert.doesNotMatch(adminScript, /data-page-number|data-page-role/);
  assert.doesNotMatch(adminScript, /book-workspace-state|book-checks-panel|story-readiness-list/);
  assert.match(styles, /\.page-artwork-panel > summary/);
  assert.match(styles, /\.page-artwork-body \{[^}]*grid-template-columns/s);
  assert.doesNotMatch(styles, /\.story-editor-heading \{[^}]*position:\s*sticky/s);
  assert.match(adminBooksStyles, /\.book-workspace-heading::after/);
  assert.match(adminBooksStyles, /\.book-workspace-summary\[open\]/);
});

test("admin no longer exposes the unrelated Print Checks workspace", () => {
  assert.doesNotMatch(adminMarkup, /data-admin-view="production"/);
  assert.doesNotMatch(adminMarkup, /id="production-admin"/);
  assert.doesNotMatch(adminMarkup, /id="open-story-production"/);
  assert.doesNotMatch(adminScript, /showView\("production"\)/);
  assert.doesNotMatch(adminScript, /title: "Print checks"/);
  assert.match(adminMarkup, /id="download-story-proof"/);
  assert.match(adminMarkup, /id="approve-order-proof"/);
  assert.match(adminMarkup, /id="send-order-lulu"/);
});

test("order production is one gated customer-proof-to-Lulu workflow", () => {
  assert.match(adminMarkup, /Personalized book production/);
  assert.match(adminMarkup, /Complete personalized book/);
  assert.match(adminMarkup, /Publish the complete book proof/);
  assert.match(adminMarkup, /Approve the exact customer version/);
  assert.match(adminMarkup, /Validate and send to Lulu/);
  assert.match(adminMarkup, /Track printing and delivery/);
  assert.match(adminMarkup, /id="open-customer-proof-link"/);
  assert.match(adminMarkup, /id="production-interior-file"/);
  assert.match(adminMarkup, /id="production-cover-file"/);
  assert.match(adminMarkup, /id="open-production-interior"/);
  assert.match(adminMarkup, /id="open-production-cover"/);
  assert.match(adminMarkup, /id="proof-review-confirm"/);
  assert.match(adminMarkup, /customer proof matches the Lulu interior and wrap cover/);
  assert.match(adminMarkup, /This safely tests the complete handoff\. It does not purchase a production print/);
  assert.match(adminScript, /function renderOrderBookChecklist/);
  assert.match(adminScript, /function renderWorkflowStageStates/);
  assert.match(adminScript, /function openSelectedCustomerProofLink/);
  assert.match(adminScript, /function openSelectedProductionFile/);
  assert.match(adminScript, /function hasOrderProductionFiles/);
  assert.match(adminScript, /prepare_customer_proof_upload/);
  assert.match(adminScript, /uploadSignedPdf/);
  assert.match(orderLibrary, /interior_url: await createSignedProofUrl\(order\.production_interior_path/);
  assert.match(orderLibrary, /cover_url: await createSignedProofUrl\(order\.production_cover_path/);
  assert.match(luluOrder, /Exact approved interior and cover PDFs are required before submitting a print job/);
  assert.match(adminScript, /customerStatus !== "approved" \|\| !productionReady \|\| !reviewConfirmation\.checked/);
  assert.match(styles, /\.order-production-layout \{[^}]*grid-template-columns: minmax\(0,1fr\) 310px/s);
  assert.match(styles, /\.order-workflow-stage\.is-current/);
});

test("admin pose production stays dormant until its database migration is available", () => {
  assert.match(adminScript, /posePipelineAvailable = monsterResult\.posePipelineAvailable === true/);
  assert.match(adminScript, /Apply the reviewed pose-pipeline database migration/);
  assert.match(adminScript, /if \(!posePipelineAvailable\)/);
  assert.match(adminScript, /Build book pose set/);
  assert.match(adminScript, /Locked child identity/);
  assert.match(adminScript, /Automatically attached from the confirmed selection/);
  assert.match(adminScript, /Existing Halloween art/);
  assert.match(adminScript, /14 environment spreads/);
  assert.match(adminScript, /Only missing personalized character layers will be generated/);
  assert.match(adminScript, /Connect existing Halloween art/);
  assert.match(adminScript, /job\?\.blueprintOutdated/);
  assert.match(adminScript, /function buildPoseAssetGroup/);
  assert.match(adminScript, /Generate next \$\{nextAsset\.subjectType\} pose/);
  assert.match(styles, /\.monster-pose-stages/);
  assert.match(styles, /\.monster-pose-identity/);
  assert.match(styles, /\.monster-pose-blueprint/);
  assert.match(poseJobs, /loadChildArtwork/);
  assert.match(poseJobs, /child_anchor_path: childAnchorPath/);
  assert.match(poseJobs, /child_profile_key=eq\.\$\{encodeURIComponent\(childProfileKey\)\}/);
  assert.match(poseJobs, /Story age lock/);
  assert.match(poseJobs, /posePlansCompatible/);
  assert.match(poseJobs, /pose_plan_outdated/);
});
