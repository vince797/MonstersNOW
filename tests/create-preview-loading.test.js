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
  assert.match(styles, /\.is-generating-preview \.preview-loading-details\s*\{[^}]*display:\s*grid/s);
  assert.match(styles, /\.is-generating-preview \.result-trust-points\s*\{[^}]*display:\s*none/s);
  assert.match(mainScript, /converterTool\?\.classList\.toggle\("is-generating-preview", isGeneratingPreview\)/);
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

test("desktop upload and preview cards share a row height without forcing the mobile stack", () => {
  assert.match(styles, /@media \(min-width: 981px\)[\s\S]*?\.converter-tool:not\(\.is-upload-only\)\s*\{[^}]*align-items:\s*stretch/s);
  assert.match(styles, /\.converter-tool:not\(\.is-upload-only\) > \.upload-panel,[\s\S]*?height:\s*100%/s);
});

test("completed preview gives the decision column enough room and keeps actions compact", () => {
  assert.match(styles, /\.result-panel\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)\s+minmax\(300px,1fr\)/s);
  assert.match(styles, /\.has-generated-preview \.preview-history\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(72px,\s*92px\)\)/s);
  assert.match(styles, /\.result-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.result-actions\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test("coloring page viewer keeps the printable and save controls visible across screen sizes", () => {
  assert.match(styles, /\.coloring-page-dialog-body\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(270px,\s*320px\)/s);
  assert.match(styles, /\.coloring-page-sheet img\s*\{[^}]*max-height:\s*calc\(100dvh - 190px\)/s);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.coloring-page-dialog-body\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.coloring-page-actions\s*\{[^}]*position:\s*sticky/s);
  assert.match(mainScript, /dialogBody\.scrollTop = 0/);
});
