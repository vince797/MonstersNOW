const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const adminMarkup = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const publicPolish = fs.readFileSync(path.join(root, "home-polish.css"), "utf8");

test("admin workspace uses a readable system typeface without changing the storefront brand", () => {
  assert.match(adminMarkup, /styles\.css\?v=20261002-admin-system-type/);
  assert.match(styles, /--admin-ui-font: Inter, ui-sans-serif, system-ui/);
  assert.match(styles, /\.admin-page strong \{[\s\S]*font-family: var\(--admin-ui-font\)/);
  assert.doesNotMatch(styles, /Admin Fredoka/);
  assert.match(publicPolish, /font-family: "Fredoka"/);
});
