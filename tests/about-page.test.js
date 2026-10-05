const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("About page centers the founders and their real story", () => {
  const html = fs.readFileSync(path.join(root, "about.html"), "utf8");
  assert.match(html, /Meet the young founders/);
  assert.match(html, /James and Luke/);
  assert.match(html, /neighborhood duty/i);
  assert.match(html, /assets\/about-james-luke\.jpg/);
  assert.match(html, /Big creativity deserves a safe place to grow/);
  assert.match(html, /styles\.css\?v=20261004-founder-story/);
});

test("Founder photo is a lightweight local JPEG", () => {
  const photo = path.join(root, "assets", "about-james-luke.jpg");
  assert.equal(fs.existsSync(photo), true);
  assert.ok(fs.statSync(photo).size < 400_000);
  assert.deepEqual([...fs.readFileSync(photo).subarray(0, 2)], [0xff, 0xd8]);
});

test("Founder page has responsive story, principles, and family promise layouts", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(css, /\.founder-spark-list/);
  assert.match(css, /\.founder-photo-sticker/);
  assert.match(css, /\.about-story-stat/);
  assert.match(css, /\.about-family-promise/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.about-family-promise/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
});
