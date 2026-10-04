const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const mainScript = fs.readFileSync(path.join(root, "scripts", "main.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("first preview generation replaces the example monster with a neutral loading state", () => {
  assert.match(mainScript, /const isCreatingFirstPreview = isGeneratingPreview && !hasPreview/);
  assert.match(mainScript, /classList\.toggle\("is-example-preview", !hasPreview && !isCreatingFirstPreview\)/);
  assert.match(mainScript, /classList\.toggle\("is-generating-preview", isCreatingFirstPreview\)/);
  assert.match(mainScript, /\? "Creating preview"\s*: "Example preview"/);
  assert.match(styles, /\.is-generating-preview \.monster-preview img\s*\{[^}]*opacity:\s*0/s);
  assert.match(styles, /content:\s*"Creating your monster"/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
