const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const mainScript = fs.readFileSync(path.join(root, "scripts", "main.js"), "utf8");
const heicHandler = fs.readFileSync(path.join(root, "api", "convert-heic.js"), "utf8");
const createPage = fs.readFileSync(path.join(root, "create.html"), "utf8");

test("HEIC conversion cannot leave the upload UI waiting forever", () => {
  assert.match(mainScript, /heicConverterLoadTimeoutMs\s*=\s*8000/);
  assert.match(mainScript, /heicBrowserConversionTimeoutMs\s*=\s*15000/);
  assert.match(mainScript, /heicServerConversionTimeoutMs\s*=\s*25000/);
  assert.match(mainScript, /withTimeout\(\s*convertHeicToJpegInBrowser\(file\)/);
  assert.match(mainScript, /fetchWithTimeout\([\s\S]*?"\/api\/convert-heic"/);
  assert.match(mainScript, /controller\.abort\(\)/);
  assert.match(mainScript, /HEIC conversion took too long/);
});

test("upload progress stays customer-friendly while HEIC handling remains internal", () => {
  assert.match(mainScript, /setUploadActionStatus\("Loading your photo\.\.\."\)/);
  assert.match(mainScript, /setUploadActionStatus\("Still loading your photo\.\.\."\)/);
  assert.match(mainScript, /setUploadActionStatus\("Ready to create your first monster preview\."\)/);
  assert.doesNotMatch(mainScript, /setUploadActionStatus\([^\n]*HEIC/);
});

test("create flow cache-busts the corrected upload script", () => {
  assert.match(createPage, /scripts\/main\.js\?v=20261007-upload-polish-v1/);
  assert.match(createPage, /styles\.css\?v=20261007-clean-preview-v3/);
  assert.doesNotMatch(createPage, /scripts\/main\.js\?v=20261004-upload-timeout-v7/);
});

test("upload step presents one primary action and a review-before-generation state", () => {
  assert.match(createPage, /<strong>Upload your monster drawing<\/strong>/);
  assert.match(createPage, /id="selected-drawing"[\s\S]*id="replace-selected-drawing"[\s\S]*Continue to monster preview/);
  assert.match(createPage, /Best results:[\s\S]*bright, straight-on photo/);
  assert.match(mainScript, /if \(file\) selectDrawingFile\(file\)/);
  assert.match(mainScript, /if \(resultPanel\) resultPanel\.hidden = false/);
});

test("HEIC server conversion logs start, completion, rejection, and failure", () => {
  assert.match(heicHandler, /HEIC conversion request started/);
  assert.match(heicHandler, /HEIC conversion completed/);
  assert.match(heicHandler, /HEIC conversion request rejected/);
  assert.match(heicHandler, /HEIC conversion failed/);
});
