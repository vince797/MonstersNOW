const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createPdfDocument, drawText } = require("../lib/pdf-writer");
const { getStorybookProductVariant } = require("../lib/lulu-products");
const {
  createStorybookInteriorPdf,
  createStorybookCoverPdf,
  fingerprintApprovedPrintManifest,
  validateApprovedPrintArtifacts,
  DEMO_MARKER,
} = require("../lib/storybook-print-files");
const { buildSignedPrintFileUrl, verifySignedPrintFileQuery } = require("../lib/storybook-print-urls");
const { prepareLuluSandboxStorybookOrder } = require("../lib/storybook-lulu-order");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const FIXTURE_TIME = "2026-01-01T00:00:00.000Z";
// Synthetic contract fixtures, NOT preflighted production book artwork.
function fixture(format = "softcover") {
  const variant = getStorybookProductVariant(format);
  const dimensions = format === "hardcover" ? { width: 1368, height: 738 } : { width: 1251.504, height: 630 };
  const pdf = (count, width, height, label) => createPdfDocument({ title: `TEST FIXTURE ${label}`, pages: Array.from({ length: count }, () => ({ width, height, content: drawText(`TEST FIXTURE ${label}`, 20, 20) })) });
  const artifacts = {
    interior: pdf(32, 630, 630, "interior"),
    cover: pdf(1, dimensions.width, dimensions.height, `${format} cover`),
    coverTemplate: pdf(1, dimensions.width, dimensions.height, `${format} template`),
  };
  const descriptor = (type, pageCount, widthPt, heightPt, layout) => ({
    artifactId: `${format}-${type}-test-id`, versionId: "test-version-1", sha256: hash(artifacts[type]), byteLength: artifacts[type].length, pageCount, widthPt, heightPt, layout,
    preflight: {
      status: "passed", artifactSha256: hash(artifacts[type]), engine: "test-stub-only", reportId: `test-${type}-report`, reportSha256: hash(`test-${type}-report`), checkedAt: FIXTURE_TIME,
      checks: { pageCount: true, dimensions: true, bleed: true, fontsEmbedded: true, images300Dpi: true, noPrinterMarks: true, contentMatchesApprovedRender: true },
    },
  });
  const identity = { submissionId: "synthetic-order-1", storyId: "test-story", masterVersion: 7, monsterSubmissionId: "test-monster", selectedPreviewId: "test-preview", childCharacterId: "test-child", childName: "Demo", monsterName: "Demo Monster", personalizationFingerprint: hash("test-personalization") };
  const manifest = {
    schemaVersion: "approved-print-artifacts-v1", purpose: "production", artifactSetId: `test-artifacts-${format}`, format, podPackageId: variant.podPackageId, pageCount: 32, identity,
    rendererVersion: "test-fixture-compositor-v1", trim: { widthPt: 612, heightPt: 612 },
    readiness: { copyReady: true, artworkReady: true, monsterReady: true, childReady: true, rendererReady: true, productionReady: true, blockers: [] },
    interior: descriptor("interior", 32, 630, 630, "single-pages"),
    cover: descriptor("cover", 1, dimensions.width, dimensions.height, "back-spine-front"),
    coverTemplate: {
      source: "lulu-binding-specific-template", templateId: `test-template-${format}`, sha256: hash(artifacts.coverTemplate), format, podPackageId: variant.podPackageId, binding: variant.binding, interiorPageCount: 32, widthPt: dimensions.width, heightPt: dimensions.height,
      panels: { back: { xPt: 9, yPt: 9, widthPt: 612, heightPt: 612 }, spine: { xPt: 621, yPt: 9, widthPt: 10, heightPt: 612 }, front: { xPt: 631, yPt: 9, widthPt: 612, heightPt: 612 } },
    },
  };
  const input = { order: { ...identity, format, pageCount: 32 }, manifest, artifacts, approvals: {} };
  return repin(input);
}
function repin(input) {
  const fingerprint = fingerprintApprovedPrintManifest(input.manifest);
  input.order.approvedArtifactFingerprint = fingerprint;
  input.approvals = Object.fromEntries(["customer", "administrator"].map((role) => [role, { status: "approved", fingerprint, actorId: `test-${role}`, approvedAt: FIXTURE_TIME }]));
  return input;
}

for (const format of ["softcover", "hardcover"]) {
  test(`${format} verifies an exact artifact contract while remaining blocked from submission`, () => {
    const input = fixture(format);
    const result = validateApprovedPrintArtifacts(input);
    assert.equal(result.status, "artifact-integrity-verified");
    assert.equal(result.format, format);
    assert.equal(result.fingerprint, input.order.approvedArtifactFingerprint);
    assert.equal(result.readyForSubmission, false);
    assert.match(result.blockers.join(" "), /not implemented/);
  });
}
for (const key of ["submissionId", "storyId", "masterVersion", "monsterSubmissionId", "selectedPreviewId", "childCharacterId", "childName", "monsterName", "personalizationFingerprint"]) {
  test(`rejects a changed order ${key} after approval`, () => {
    const input = fixture();
    input.order[key] = key === "masterVersion" ? 8 : `changed-${input.order[key]}`;
    assert.throws(() => validateApprovedPrintArtifacts(input), /must match/);
  });
}
for (const key of ["copyReady", "artworkReady", "monsterReady", "childReady", "rendererReady", "productionReady"]) {
  test(`rejects an unready ${key} even when approval records are re-pinned`, () => {
    const input = fixture();
    input.manifest.readiness[key] = false;
    repin(input);
    assert.throws(() => validateApprovedPrintArtifacts(input), new RegExp(key));
  });
}
for (const type of ["interior", "cover", "coverTemplate"]) {
  test(`rejects changed ${type} bytes after approval`, () => {
    const input = fixture();
    input.artifacts[type] = Buffer.concat([input.artifacts[type], Buffer.from("changed")]);
    assert.throws(() => validateApprovedPrintArtifacts(input), /SHA-256|bytes/);
  });
}
test("a legacy combined proof fingerprint never substitutes for artifact-set approval", () => {
  const input = fixture();
  input.order.proofFingerprint = input.order.approvedArtifactFingerprint;
  delete input.order.approvedArtifactFingerprint;
  assert.throws(() => validateApprovedPrintArtifacts(input), /order must pin this exact/);
});
test("a changed manifest version invalidates both saved approvals", () => {
  const input = fixture();
  input.manifest.interior.versionId = "test-version-2";
  assert.throws(() => validateApprovedPrintArtifacts(input), /exact interior-and-cover artifact fingerprint/);
});
for (const role of ["customer", "administrator"]) {
  test(`requires a current exact-file ${role} approval`, () => {
    const input = fixture();
    input.approvals[role].fingerprint = hash("another-version");
    assert.throws(() => validateApprovedPrintArtifacts(input), new RegExp(role));
  });
}
test("binding, SKU, count, and source cannot use a generic or swapped template", () => {
  for (const change of [
    { format: "hardcover" }, { podPackageId: "other-sku" }, { binding: "other-binding" }, { interiorPageCount: 34 }, { source: "generic-dimensions" },
  ]) {
    const input = fixture();
    Object.assign(input.manifest.coverTemplate, change);
    repin(input);
    assert.throws(() => validateApprovedPrintArtifacts(input), /template/);
  }
});
test("rejects spreads, trim-only pages, incomplete preflight, and missing panels", () => {
  const changes = [
    (m) => { m.interior.layout = "reader-spreads"; },
    (m) => { m.interior.widthPt = 612; },
    (m) => { m.interior.pageCount = 16; },
    (m) => { m.cover.preflight.status = "processing"; },
    (m) => { m.interior.preflight.checks.fontsEmbedded = false; },
    (m) => { delete m.coverTemplate.panels.spine; },
    (m) => { m.cover.widthPt += 1; },
  ];
  for (const change of changes) {
    const input = fixture(); change(input.manifest); repin(input);
    assert.throws(() => validateApprovedPrintArtifacts(input));
  }
});
test("manifest hashes are stable for object key ordering and reject non-JSON values", () => {
  assert.equal(fingerprintApprovedPrintManifest({ b: 2, a: { z: 1, x: [1, 2] } }), fingerprintApprovedPrintManifest({ a: { x: [1, 2], z: 1 }, b: 2 }));
  assert.throws(() => fingerprintApprovedPrintManifest({ invalid: undefined }), /JSON/);
});
test("generic PDF creation is opt-in demo-only and visibly marked on all pages", () => {
  assert.throws(() => createStorybookInteriorPdf({}), /sandbox-demo only/);
  assert.throws(() => createStorybookCoverPdf({ purpose: "production" }), /sandbox-demo only/);
  const interior = createStorybookInteriorPdf({ purpose: "sandbox-demo" }).toString();
  assert.equal(interior.split("/MediaBox [0 0 630 630]").length - 1, 32);
  assert.equal(interior.split(`(${DEMO_MARKER}) Tj`).length - 1, 32);
  assert.ok(createStorybookCoverPdf({ purpose: "sandbox-demo" }).includes(Buffer.from(DEMO_MARKER)));
});
test("sandbox PDF bytes cannot be re-labeled as approved production artifacts", () => {
  const input = fixture();
  const bytes = createStorybookInteriorPdf({ purpose: "sandbox-demo" });
  input.artifacts.interior = bytes;
  input.manifest.interior.sha256 = hash(bytes);
  input.manifest.interior.byteLength = bytes.length;
  input.manifest.interior.preflight.artifactSha256 = hash(bytes);
  repin(input);
  assert.throws(() => validateApprovedPrintArtifacts(input), /demonstration PDFs can never/);
});

test("every claimed production/sandbox submission fails before any network call", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected network call"); });
  const payloads = [
    { submit_print_job: true },
    { submitPrintJob: true, proof_fingerprint: "a".repeat(64), proof_approved_at: FIXTURE_TIME, story_id: "s", monster_submission_id: "m", selected_preview_id: "p" },
    { purpose: "sandbox-demo", synthetic_data: true, submit_print_job: true },
    { ...fixture(), submit_print_job: true },
  ];
  for (const payload of payloads) {
    await assert.rejects(() => prepareLuluSandboxStorybookOrder(payload, {}), (error) => error.code === "approved_artifact_handoff_unavailable");
  }
  assert.equal(fetchMock.mock.calls.length, 0);
});
test("demo preparation rejects identifying data and accidental calls before network", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected network call"); });
  for (const payload of [{}, { purpose: "sandbox-demo" }, { purpose: "sandbox-demo", synthetic_data: true, child_name: "Real Child" }, { purpose: "sandbox-demo", synthetic_data: true, page_count: "32garbage" }]) {
    await assert.rejects(() => prepareLuluSandboxStorybookOrder(payload, {}));
  }
  assert.equal(fetchMock.mock.calls.length, 0);
});

function demoUrlOptions(type = "interior") {
  return { request: { headers: { host: "attacker.example" } }, purpose: "sandbox-demo", type, variant: getStorybookProductVariant("softcover"), pageCount: 32, coverDimensions: { width: 1251.504, height: 630 } };
}
function setupUrls(t) {
  const previous = { ...process.env };
  process.env.STORYBOOK_PRINT_FILE_SECRET = "test-fixture-key";
  process.env.STORYBOOK_PRINT_FILE_BASE_URL = "https://example.invalid";
  t.after(() => { process.env = previous; });
}
test("version-2 URLs contain no personalization and bind demo, format and geometry", (t) => {
  setupUrls(t);
  const url = new URL(buildSignedPrintFileUrl({ ...demoUrlOptions("cover"), submission: { childName: "Private child", selectedPreviewId: "private-monster" } }));
  assert.equal(url.origin, "https://example.invalid");
  assert.equal(url.searchParams.get("v"), "2");
  assert.equal(url.searchParams.has("child_name"), false);
  assert.equal(url.searchParams.has("selected_preview_id"), false);
  const query = Object.fromEntries(url.searchParams);
  assert.equal(verifySignedPrintFileQuery(query).purpose, "sandbox-demo");
  assert.equal(verifySignedPrintFileQuery(query).submissionId, "synthetic-sandbox-demo");
  for (const changed of [{ format: "hardcover" }, { width_pt: "1000" }, { purpose: "production" }, { v: "1" }, { page_count: ["32", "99"] }, { child_name: "Private child" }, { expires: "1" }]) {
    assert.throws(() => verifySignedPrintFileQuery({ ...query, ...changed }));
  }
});
test("demo file hosting never trusts forwarded request hosts", (t) => {
  setupUrls(t);
  delete process.env.STORYBOOK_PRINT_FILE_BASE_URL;
  delete process.env.STORYBOOK_CHECKOUT_SITE_URL;
  delete process.env.SITE_URL;
  assert.throws(() => buildSignedPrintFileUrl(demoUrlOptions()), /trusted HTTPS site origin/);
  for (const url of ["http://example.invalid", "https://user:secret@example.invalid", "https://example.invalid/path", "https://example.invalid?child=secret"]) {
    process.env.STORYBOOK_PRINT_FILE_BASE_URL = url;
    assert.throws(() => buildSignedPrintFileUrl(demoUrlOptions()), /trusted HTTPS origin/);
  }
});
test("the sandbox endpoint cannot place a job even with a valid endpoint secret", async (t) => {
  setupUrls(t);
  process.env.LULU_SANDBOX_ENDPOINT_SECRET = "test-route-secret";
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected network call"); });
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await require("../api/lulu-sandbox-storybook-order")({ method: "POST", headers: { "x-lulu-sandbox-secret": "test-route-secret" }, body: { submit_print_job: true, proof_fingerprint: "a".repeat(64) } }, response);
  assert.equal(response.code, 409);
  assert.match(response.body.error, /exact approved interior/);
  assert.equal(fetchMock.mock.calls.length, 0);
});

test("explicit synthetic demo queues validation but never creates a print-job request", async (t) => {
  setupUrls(t);
  process.env.LULU_SANDBOX_CLIENT_KEY = "test-local-client";
  process.env.LULU_SANDBOX_CLIENT_SECRET = "test-local-secret";
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const path = new URL(url).pathname;
    urls.push(path);
    let result;
    if (path.endsWith("/token")) result = { access_token: "test-token", expires_in: 3600 };
    else if (path === "/cover-dimensions/") result = { width: "1368", height: "738", unit: "pt" };
    else if (["/validate-cover/", "/validate-interior/"].includes(path)) {
      const source = new URL(JSON.parse(options.body).source_url);
      assert.equal(source.searchParams.get("purpose"), "sandbox-demo");
      assert.equal(source.searchParams.has("child_name"), false);
      result = { id: "test-validation", status: "PROCESSING" };
    } else throw new Error(`Unexpected network request: ${path}`);
    return { ok: true, status: 200, text: async () => JSON.stringify(result) };
  });
  const result = await prepareLuluSandboxStorybookOrder({ purpose: "sandbox-demo", synthetic_data: true, format: "hardcover" }, {});
  assert.equal(result.productionReady, false);
  assert.equal(result.submittedPrintJob, false);
  assert.equal(result.printJobRequest, null);
  assert.equal(result.validations.productionApproval, false);
  assert.equal(result.validations.cover.status, "PROCESSING");
  assert.equal(urls.includes("/print-jobs/"), false);
  assert.equal(result.order.variant, "hardcover");
});

test('legacy direct print endpoint cannot bypass approved-artifact safety', async () => {
  const handler = require('../api/lulu-sandbox-print-job');
  const previous = process.env.LULU_SANDBOX_ENDPOINT_SECRET;
  const originalFetch = global.fetch;
  const calls = [];
  process.env.LULU_SANDBOX_ENDPOINT_SECRET = 'local-print-guard-test';
  global.fetch = async (...args) => { calls.push(args); throw new Error('No network allowed'); };
  try {
    const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; }, setHeader() {} };
    await handler({ method:'POST', headers:{ 'x-lulu-sandbox-secret':'local-print-guard-test' }, body:{ line_items:[] } }, response);
    assert.equal(response.code, 409);
    assert.equal(response.body.code, 'approved_artifact_handoff_unavailable');
    assert.deepEqual(calls, []);
  } finally {
    global.fetch = originalFetch;
    if (previous === undefined) delete process.env.LULU_SANDBOX_ENDPOINT_SECRET;
    else process.env.LULU_SANDBOX_ENDPOINT_SECRET = previous;
  }
});
