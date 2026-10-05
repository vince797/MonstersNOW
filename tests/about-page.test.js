const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("About page centers the founders and their real story", () => {
  const html = fs.readFileSync(path.join(root, "about.html"), "utf8");
  assert.match(html, /Meet the young founders/);
  assert.equal(html.match(/young founders/gi)?.length, 1);
  assert.match(html, /James and Luke/);
  assert.match(html, /neighborhood duty/i);
  assert.match(html, /assets\/about-james-luke\.jpg/);
  assert.match(html, /Creativity first\. Privacy always\./);
  assert.match(html, /Free to create/);
  assert.match(html, /<body class="brand-theme about-page">/);
  assert.match(html, /styles\.css\?v=20261005-about-simple-v3/);
  assert.doesNotMatch(html, /<source media="\(max-width: 520px\)"/);
  assert.doesNotMatch(html, /—/);
  assert.doesNotMatch(html, /about-principles|about-family-promise-mark|MONSTER<\/span><strong>APPROVED/);
});

test("Founder photo is a lightweight local JPEG", () => {
  const photo = path.join(root, "assets", "about-james-luke.jpg");
  assert.equal(fs.existsSync(photo), true);
  assert.ok(fs.statSync(photo).size < 400_000);
  assert.deepEqual([...fs.readFileSync(photo).subarray(0, 2)], [0xff, 0xd8]);
});

test("Founder page keeps its story, photo, and family promise responsive", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(css, /\.about-family-promise/);
  assert.match(css, /\.about-promise-list/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.about-page \.about-page-actions[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.about-page \.about-page-hero-art[\s\S]*margin: 4px auto 0;[\s\S]*justify-self: center/);
  assert.match(css, /\.about-page \.about-page-hero-art figcaption[\s\S]*margin-top: 12px/);
});
