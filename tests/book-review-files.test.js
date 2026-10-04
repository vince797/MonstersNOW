const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BOOK_REVIEW_FILES,
  confirmBookReviewUpload,
  createBookReviewUpload,
  listBookReviewFiles,
} = require("../lib/book-review-files");

const originalFetch = global.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SECRET_KEY;

test.beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
});

test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = originalKey;
});

test("review manifest identifies the two exact Halloween PDFs honestly", () => {
  assert.equal(BOOK_REVIEW_FILES.length, 2);
  assert.deepEqual(BOOK_REVIEW_FILES.map((file) => file.size), [12933876, 14854554]);
  assert.deepEqual(BOOK_REVIEW_FILES.map((file) => file.sha256), [
    "56b30976ae88ae8bb498158219f19d573733ca81b89db9ea8ccc02dcd397309d",
    "9167c31db4f8cba0c41872ef5c1d06ce3d933658d99fae8d0cac6166556be955",
  ]);
  assert.ok(BOOK_REVIEW_FILES.every((file) => file.storySlug === "halloween-monster-night"));
  assert.match(BOOK_REVIEW_FILES[0].status, /Review required/);
  assert.match(BOOK_REVIEW_FILES[1].status, /Not print ready/);
});

test("missing private review files are listed as pending", async () => {
  global.fetch = async () => new Response(JSON.stringify({ message: "not found" }), { status: 404 });
  const files = await listBookReviewFiles("halloween-monster-night");
  assert.equal(files.length, 2);
  assert.ok(files.every((file) => file.uploaded === false));
  assert.ok(files.every((file) => !file.downloadUrl));
});

test("signed upload requires exact file identity and returns the storage URL", async () => {
  const file = BOOK_REVIEW_FILES[0];
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/object/info/")) return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    return new Response(JSON.stringify({ url: "/object/upload/sign/customer-proofs/editorial/file.pdf?token=signed" }), { status: 200 });
  };
  await assert.rejects(() => createBookReviewUpload({ ...file, name: "wrong.pdf", type: "application/pdf" }), /Choose halloween/);
  const result = await createBookReviewUpload({ id: file.id, name: file.fileName, type: "application/pdf", size: file.size, sha256: file.sha256 });
  assert.equal(result.signedUrl, "https://example.supabase.co/storage/v1/object/upload/sign/customer-proofs/editorial/file.pdf?token=signed");
  assert.match(calls.at(-1).url, /object\/upload\/sign\/customer-proofs/);
  assert.equal(calls.at(-1).options.headers["x-upsert"], "false");
});

test("confirmation checks stored size and returns a short-lived signed link", async () => {
  const file = BOOK_REVIEW_FILES[1];
  global.fetch = async (url) => {
    if (url.includes("/object/info/")) return new Response(JSON.stringify({ metadata: { size: file.size }, updated_at: "2026-10-04T00:00:00Z" }), { status: 200 });
    return new Response(JSON.stringify({ signedURL: "/object/sign/customer-proofs/editorial/file.pdf?token=download" }), { status: 200 });
  };
  const confirmed = await confirmBookReviewUpload(file.id);
  assert.equal(confirmed.uploaded, true);
  assert.equal(confirmed.storedSize, file.size);
  assert.equal(confirmed.downloadUrl, "https://example.supabase.co/storage/v1/object/sign/customer-proofs/editorial/file.pdf?token=download");
});
