const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const mainScript = fs.readFileSync(path.join(root, "scripts", "main.js"), "utf8");
const heicHandler = fs.readFileSync(path.join(root, "api", "convert-heic.js"), "utf8");

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
  assert.match(mainScript, /setUploadActionStatus\("Photo loaded\. Creating your preview now\."\)/);
  assert.doesNotMatch(mainScript, /setUploadActionStatus\([^\n]*HEIC/);
});

test("HEIC server conversion logs start, completion, rejection, and failure", () => {
  assert.match(heicHandler, /HEIC conversion request started/);
  assert.match(heicHandler, /HEIC conversion completed/);
  assert.match(heicHandler, /HEIC conversion request rejected/);
  assert.match(heicHandler, /HEIC conversion failed/);
});
