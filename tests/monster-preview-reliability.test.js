const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const api = fs.readFileSync(path.join(root, "api", "convert-monster.js"), "utf8");
const client = fs.readFileSync(path.join(root, "scripts", "main.js"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));

test("monster previews have enough runtime for provider latency and safe persistence", () => {
  assert.equal(vercel.functions["api/convert-monster.js"].maxDuration, 180);
  assert.match(api, /FUNCTION_TIME_BUDGET_MS\s*=\s*180\s*\*\s*1000/);
  assert.match(api, /FUNCTION_TIMEOUT_BUFFER_MS\s*=\s*15\s*\*\s*1000/);
  assert.match(api, /COLORING_PAGE_MIN_BUDGET_MS\s*=\s*35\s*\*\s*1000/);
});

test("main preview responses use compressed JPEG data instead of oversized PNG data", () => {
  assert.match(api, /MONSTER_OUTPUT_FORMAT\s*=\s*"jpeg"/);
  assert.match(api, /MONSTER_OUTPUT_COMPRESSION\s*=\s*85/);
  assert.match(api, /formData\.append\("output_compression", String\(outputCompression\)\)/);
  assert.match(api, /return `data:\$\{getOutputMimeType\(outputFormat\)\};base64,\$\{base64\}`/);
});

test("preview timeouts remain retryable and explain that no free preview was used", () => {
  assert.match(api, /code:\s*"openai_image_timeout"/);
  assert.match(client, /error\?\.code === "openai_image_timeout" \|\| error\?\.status === 504/);
  assert.match(client, /no free preview was used\. Please try again\./);
  assert.match(api, /elapsedMs:\s*Date\.now\(\) - startedAt/);
  assert.match(api, /stage,/);
});
