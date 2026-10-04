const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const adminMarkup = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const publicPolish = fs.readFileSync(path.join(root, "home-polish.css"), "utf8");
const adminScript = fs.readFileSync(path.join(root, "scripts/admin.js"), "utf8");

test("admin workspace uses a readable system typeface without changing the storefront brand", () => {
  assert.match(adminMarkup, /styles\.css\?v=20261004-admin-resilience-v1/);
  assert.match(styles, /--admin-ui-font: Inter, ui-sans-serif, system-ui/);
  assert.match(styles, /\.admin-page strong \{[\s\S]*font-family: var\(--admin-ui-font\)/);
  assert.doesNotMatch(styles, /Admin Fredoka/);
  assert.match(publicPolish, /font-family: "Fredoka"/);
});

test("admin sign-in does not blame the device for a server credential timestamp error", () => {
  assert.doesNotMatch(adminScript, /Your device clock appears out of sync/);
  assert.match(adminScript, /This request does not use your device clock/);
  assert.doesNotMatch(adminScript, /update the Supabase secret key/);
  assert.match(adminScript, /error\.code = result\.code/);
  assert.match(adminScript, /error\.status = response\.status/);
});
