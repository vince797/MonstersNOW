const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

process.env.STORYBOOK_PRINT_FILE_SECRET = "test-print-file-secret-0123456789abcdef";
process.env.STORYBOOK_PRINT_FILE_BASE_URL = "https://preview.monstersnow.test";

const handler = require("../api/lulu-sandbox-storybook-order");
const { buildSignedPrintFileUrl, verifySignedPrintFileQuery } = require("../lib/storybook-print-urls");
const { getStorybookProductVariant } = require("../lib/lulu-products");

function mockResponse() {
  const response = new EventEmitter();
  response.headers = {};
  response.chunks = [];
  response.statusCode = 0;
  response.setHeader = (key, value) => { response.headers[key.toLowerCase()] = value; };
  response.status = (code) => { response.statusCode = code; return response; };
  response.json = (body) => { response.body = body; response.ended = true; return response; };
  response.write = (chunk) => { response.chunks.push(Buffer.from(chunk)); response.headersSent = true; return true; };
  response.end = (chunk) => { if (chunk) response.chunks.push(Buffer.from(chunk)); response.ended = true; return response; };
  response.send = (body) => response.end(body);
  return response;
}

function queryFromUrl(url) {
  return Object.fromEntries(new URL(url).searchParams.entries());
}

test("signed print URLs carry the child character into the render request", () => {
  const url = buildSignedPrintFileUrl({
    request: { headers: {} },
    type: "interior",
    submission: { submissionId: "s1", childName: "Mia", monsterName: "Moxie", childCharacter: { id: "warm-curly-dark", ageBand: "7-8", ignored: "x" } },
    variant: getStorybookProductVariant("softcover"),
    pageCount: 32,
    coverDimensions: null,
  });
  const verified = verifySignedPrintFileQuery(queryFromUrl(url));
  assert.deepEqual(JSON.parse(verified.childCharacter), { id: "warm-curly-dark", ageBand: "7-8" });
});

test("signed GET streams a real composited cover PDF (sample job, no order identity)", async () => {
  const url = buildSignedPrintFileUrl({
    request: { headers: {} },
    type: "cover",
    submission: { submissionId: "route-test", childName: "Ava", monsterName: "Blip" },
    variant: getStorybookProductVariant("hardcover"),
    pageCount: 32,
    coverDimensions: { width: 1368, height: 738 },
  });
  const response = mockResponse();
  await handler({ method: "GET", query: queryFromUrl(url), headers: {} }, response);
  const pdf = Buffer.concat(response.chunks);
  assert.equal(response.statusCode, 200, JSON.stringify(response.body || {}));
  assert.equal(response.headers["content-type"], "application/pdf");
  assert.equal(response.headers["x-monstersnow-renderer"], "personalized-composite-v1");
  assert.equal(Number(response.headers["content-length"]), pdf.length);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.match(pdf.toString("latin1"), /\/MediaBox \[0 0 1368 738\]/);
  assert.ok(Number(response.headers["x-monstersnow-print-blockers"]) > 0, "sample output reports its placeholders");
});

test("tampered print URLs are rejected before rendering", async () => {
  const url = buildSignedPrintFileUrl({
    request: { headers: {} },
    type: "interior",
    submission: { submissionId: "route-test" },
    variant: getStorybookProductVariant("softcover"),
    pageCount: 32,
    coverDimensions: null,
  });
  const query = queryFromUrl(url);
  query.child_name = "Mallory";
  const response = mockResponse();
  await handler({ method: "GET", query, headers: {} }, response);
  assert.equal(response.statusCode, 403);
  assert.equal(response.chunks.length, 0);
});

test("print modules keep the project root opaque to Vercel's file tracer", () => {
  // A constant root joined with a dynamic path makes nft bundle the whole repo
  // into the function (>250 MB). See lib/repo-root.js.
  const fs = require("node:fs");
  for (const file of ["print-assets.js", "print-raster.js", "storybook-print-files.js", "storybook-print-job.js"]) {
    const source = fs.readFileSync(require.resolve(`../lib/${file}`), "utf8");
    assert.doesNotMatch(source, /path\.(resolve|join)\(__dirname/, `${file} must use repoRoot()`);
  }
});
