const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const brand = fs.readFileSync(path.join(root, "brand.css"), "utf8");

test("homepage controls retain 44px touch targets", () => {
  assert.match(styles, /\.nav-toggle \{[^}]*height: 44px;/);
  assert.match(
    styles,
    /@media \(max-width: 520px\) \{[\s\S]*?\.hero \.button\.secondary \{[\s\S]*?min-height: 44px;/,
  );
});

test("common laptop widths keep the full brand navigation", () => {
  assert.match(
    brand,
    /@media \(max-width: 1320px\) \{[\s\S]*?\.brand-theme \.nav-toggle \{[^}]*display: block;/,
  );
  assert.doesNotMatch(brand, /@media \(max-width: 1440px\)/);
});

test("keepsakes remain two-column on landscape tablets", () => {
  assert.match(
    styles,
    /@media \(min-width: 900px\) and \(max-width: 1320px\) \{[\s\S]*?\.seasonal-section \{[\s\S]*?grid-template-columns: minmax\(320px, 0\.95fr\) minmax\(300px, 0\.55fr\);/,
  );
});
