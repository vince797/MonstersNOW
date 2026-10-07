const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const mainScript = fs.readFileSync(path.join(root, "scripts", "main.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("first preview generation replaces the example monster with a neutral loading state", () => {
  assert.match(mainScript, /const isCreatingFirstPreview = isGeneratingPreview && !hasPreview/);
  assert.match(mainScript, /classList\.toggle\("is-example-preview", !hasPreview && !isCreatingFirstPreview && !isFailedFirstPreview\)/);
  assert.match(mainScript, /classList\.toggle\("is-generating-preview", isCreatingFirstPreview\)/);
  assert.match(mainScript, /\? "Creating preview"/);
  assert.match(mainScript, /: "Example preview"/);
  assert.match(styles, /\.is-generating-preview \.monster-preview img\s*\{[^}]*opacity:\s*0/s);
  assert.match(styles, /content:\s*"Creating your monster"/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("a failed first preview shows the selected drawing instead of the green example monster", () => {
  assert.match(mainScript, /previewGenerationFailed = !hasPreview/);
  assert.match(mainScript, /const isFailedFirstPreview = previewGenerationFailed && !hasPreview && !isCreatingFirstPreview/);
  assert.match(mainScript, /monsterPreview\.src = drawingPreviewUrl/);
  assert.match(mainScript, /"Drawing still selected"/);
  assert.match(mainScript, /classList\.toggle\("is-preview-error", isFailedFirstPreview\)/);
  assert.match(styles, /\.is-preview-error \.monster-preview\s*\{[^}]*min-height:\s*clamp\(220px, 38vw, 320px\)/s);
  assert.match(styles, /\.is-preview-error \.monster-preview img\s*\{[^}]*mix-blend-mode:\s*normal/s);
});

test("a failed first preview offers one clear retry action without preview benefit clutter", () => {
  assert.match(mainScript, /const canRetryFailedPreview = previewGenerationFailed && previewRetryAvailable/);
  assert.match(mainScript, /regenerateButton\.hidden = !hasPreview && !canRetryFailedPreview/);
  assert.match(mainScript, /const shouldShowConvertButton = Boolean\(selectedDrawingFile\) && !hasPreview && !previewGenerationFailed/);
  assert.match(mainScript, /\? "Try Preview Again"/);
  assert.match(mainScript, /resultActions\.hidden = !hasPreview && !canRetryFailedPreview/);
  assert.match(mainScript, /"Preview needs another try\."/);
  assert.match(styles, /\.is-preview-error \.result-trust-points\s*\{[^}]*display:\s*none/s);
  assert.match(styles, /\.is-preview-error #regenerate-monster\s*\{[^}]*background:\s*var\(--orange\)/s);
});
