const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const manifest = require("../assets/master-references/master-monsters.json");
const api = fs.readFileSync(path.join(root, "api", "convert-monster.js"), "utf8");
const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const script = fs.readFileSync(path.join(root, "scripts", "admin.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "admin-books.css"), "utf8");

test("master monster manifest contains the exact active generator references", () => {
  assert.equal(manifest.status, "active");
  assert.equal(manifest.characterReferences.length, 5);
  assert.equal(new Set(manifest.characterReferences.map((reference) => reference.id)).size, 5);
  for (const reference of [...manifest.characterReferences, manifest.coloringPageReference]) {
    assert.equal(fs.existsSync(path.join(root, reference.src)), true, `${reference.src} should exist`);
  }
});

test("preview generation and Admin use the same master monster manifest", () => {
  assert.match(api, /require\("\.\.\/assets\/master-references\/master-monsters\.json"\)/);
  assert.match(api, /masterMonsterReferences\.characterReferences\.map\(\(reference\) => reference\.src\)/);
  assert.match(api, /masterMonsterReferences\.coloringPageReference\.src/);
  assert.doesNotMatch(api, /const characterReferenceImages = \[/);
  assert.match(script, /fetch\("assets\/master-references\/master-monsters\.json"/);
});

test("Admin exposes a responsive visual Master Monsters library", () => {
  assert.match(html, /data-admin-view="masters"[\s\S]*Master Monsters/);
  assert.match(html, /id="master-monsters-admin"/);
  assert.match(html, /These are not animated rigs or customer characters/);
  assert.match(script, /function renderMasterMonsters\(\)/);
  assert.match(script, /function createMasterMonsterCard\(/);
  assert.match(script, /All \$\{references\.length\} are sent with every monster preview/);
  assert.match(styles, /\.master-monsters-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3/s);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.master-monsters-grid\s*\{\s*grid-template-columns:\s*1fr/s);
});
