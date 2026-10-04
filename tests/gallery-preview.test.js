const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");

test("the gallery preserves the approved original drawing and its crop", () => {
  assert.match(read("monsters.html"), /class="gallery-image-crop gallery-image-crop-drawing">\s*<img src="assets\/gallery\/red-blue-monster-before-after-source-v1\.jpg"/);
  assert.equal(hash("assets/gallery/red-blue-monster-before-after-source-v1.jpg"), "7bb2713d70d8347b349dfa1daf3a16f7d953045bc6d29a75b6a3e7b0cc05694a");
  assert.match(read("styles.css"), /\.gallery-image-crop-drawing img \{\s*top: -93\.7%;\s*left: -34%;\s*width: 168%;\s*\}/);
});

test("the generated gallery image is the approved transparent three-legged Larry", () => {
  const markup = read("monsters.html");
  assert.match(markup, /class="gallery-image-crop gallery-image-render">\s*<img src="assets\/gallery\/larry-three-leg-gallery-v1\.png" alt="Larry,[^"]*three blue striped legs\." width="1024" height="1536"/);
  assert.equal(hash("assets/gallery/larry-three-leg-gallery-v1.png"), "7d3a4cb6a1cd8f4f8f6e69942e041170d1e8f51fb69abbfda271f9ae8f6937ce");
  const png = fs.readFileSync(path.join(root, "assets/gallery/larry-three-leg-gallery-v1.png"));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1536);
  assert.equal(png[25], 6, "retain RGBA transparency");
});

test("the new full-character sizing does not change the legacy homepage crop", () => {
  const css = read("gallery.css");
  assert.match(css, /\.gallery-image-render img \{\s*inset: 0;\s*width: 100%;\s*height: 100%;\s*object-fit: contain;\s*\}/);
  assert.match(read("styles.css"), /\.gallery-image-crop-monster img \{\s*top: -157\.3%;\s*left: -11\.5%;\s*width: 123%;\s*\}/);
  assert.match(read("monsters.html"), /gallery\.css\?v=20261004-larry/);
  assert.doesNotMatch(read("index.html"), /gallery\.css/);
});
