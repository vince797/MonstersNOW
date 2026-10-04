const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
const polish = fs.readFileSync(path.join(root, "home-polish.css"), "utf8");

test("homepage story cards use full covers and aligned status actions", () => {
  assert.match(homepage, /home-polish\.css\?v=20261004-card-polish/);
  assert.match(polish, /\.series-book-preview \.series-cover-image \{[\s\S]*?height: 100%;[\s\S]*?aspect-ratio: 1;/);
  assert.match(polish, /\.home-cover-grid \.book-card-link,[\s\S]*?\.home-cover-grid \.book-card-availability \{[\s\S]*?margin-top: auto;/);
  assert.match(polish, /\.home-cover-grid \.book-card\.is-ready-book \{/);
  assert.match(polish, /\.home-cover-grid \.book-card:not\(\.is-ready-book\):hover \{[\s\S]*?transform: none;/);
});
