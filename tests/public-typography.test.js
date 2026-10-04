const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("homepage collection UI uses the site system typeface", () => {
  const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const polish = fs.readFileSync(path.join(root, "home-polish.css"), "utf8");

  assert.match(homepage, /home-polish\.css\?v=20261004-card-polish/);
  assert.doesNotMatch(polish, /Fredoka|Arial Rounded MT Bold/);
  assert.match(polish, /\.books-section \.section-heading h2 \{[\s\S]*?font-family: inherit;/);
  assert.match(polish, /\.home-cover-grid \.book-card h3 \{[\s\S]*?font-family: inherit;/);
});
