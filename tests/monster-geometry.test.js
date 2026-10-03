'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { JSDOM } = require('jsdom');
const { deriveMonsterGeometry, trustedMonsterGeometry } = require('../lib/monster-geometry');
const { buildHalloweenProof, buildHalloweenProofWithGeometry } = require('../lib/halloween-proof');
const { composeReviewBook } = require('../lib/review-composition');
const { renderComposedBookPdf } = require('../lib/composed-book-pdf');
const { loadVerifiedReviewTemplates } = require('../lib/lulu-cover-templates');
const { getAdminMonsterAssets } = require('../lib/monster-submissions');
const ROOT = path.resolve(__dirname, '..'), sha = value => crypto.createHash('sha256').update(value).digest('hex');
const source = '/assets/frozen-monster/test.png', selectedPreviewId = 'geometry-test-preview';
const story = { id: 'geometry-test', title: 'Geometry review', pages: Array.from({ length: 32 }, () => ({ title: 'A monster', text: 'A friendly monster stands here.', monsterRequired: true })) };
const selection = { selectedPreviewId, childName: 'Sample Alex', monsterName: 'Moxie', childCharacter: 'none' };
async function fixture() {
  const raw = Buffer.alloc(64 * 80 * 4);
  for (let y = 12; y < 62; y++) for (let x = 10; x < 44; x++) { const i = (y * 64 + x) * 4; raw[i] = 173; raw[i + 1] = 82; raw[i + 2] = 209; raw[i + 3] = 255; }
  raw[(74 * 64 + 31) * 4 + 3] = 64; // Faint shadow is outside the alpha128 core.
  return sharp(raw, { raw: { width: 64, height: 80, channels: 4 } }).png().toBuffer();
}
function payload(bytes) { return { personalization: { childName: 'Sample Alex', monsterName: 'Moxie', childCharacter: 'none' }, selectedPreviewId, monsterImage: `data:image/png;base64,${bytes.toString('base64')}` }; }

test('alpha128 geometry measures exclusive bounds and preserves exact source bytes', async () => {
  const bytes = await fixture(), before = Buffer.from(bytes);
  const record = await deriveMonsterGeometry(bytes, { source, selectedPreviewId });
  assert.equal(record.available, true); assert.equal(record.alphaThreshold, 128);
  assert.deepEqual(record.bounds, { left: 10, top: 12, right: 44, bottom: 62 });
  assert.deepEqual(record.anchor, { x: .5, y: 62 / 80 });
  assert.equal(record.sourceSha256, sha(bytes)); assert.deepEqual(bytes, before);
  assert.ok(Object.isFrozen(record) && Object.isFrozen(record.bounds) && Object.isFrozen(record.anchor));
});

test('source, preview, byte hash, copied metadata and inherited metadata cannot forge server geometry', async () => {
  const bytes = await fixture(), record = await deriveMonsterGeometry(bytes, { source, selectedPreviewId });
  assert.equal(trustedMonsterGeometry(record, { source, selectedPreviewId, bytes }), record);
  for (const args of [{ source: '/assets/different.png', selectedPreviewId }, { source, selectedPreviewId: 'another' }, { source, selectedPreviewId, bytes: Buffer.concat([bytes, Buffer.from('changed')]) }]) assert.equal(trustedMonsterGeometry(record, args), null);
  for (const value of [{ ...record }, JSON.parse(JSON.stringify(record)), Object.create(record)]) assert.equal(trustedMonsterGeometry(value, { source, selectedPreviewId, bytes }), null);
  for (const assets of [{ selectedPreviewUrl: source, monsterGeometry: { ...record } }, Object.assign(Object.create({ monsterGeometry: record }), { selectedPreviewUrl: source })]) {
    const book = composeReviewBook(story, selection, assets);
    assert.deepEqual(book.pages[0].layers[0].anchor, { x: .5, y: 1 });
    assert.ok(book.warnings.some(warning => /baseline is unavailable/.test(warning)));
  }
});

test('async proof rebuild derives geometry and ignores all client anchor/metadata claims', async () => {
  const bytes = await fixture(), input = payload(bytes), record = await deriveMonsterGeometry(bytes, { source: input.monsterImage, selectedPreviewId });
  const baseline = await buildHalloweenProofWithGeometry(input);
  assert.deepEqual(baseline.pages[0].layers[0].anchor, { x: .5, y: 62 / 80 });
  assert.equal(baseline.pages[0].layers[0].alphaGeometry.sourceSha256, sha(bytes));
  assert.equal(baseline.pages[0].layers[0].src, input.monsterImage);
  const forged = await buildHalloweenProofWithGeometry({ ...input, monsterGeometry: { ...record, anchor: { x: 0, y: .2 } }, anchor: { x: 0, y: .2 }, trustedAssets: { monsterGeometry: record } });
  assert.equal(forged.proofHash, baseline.proofHash);
  assert.equal(buildHalloweenProof(input, { monsterGeometry: record }).proofHash, baseline.proofHash);
  for (const assets of [{ monsterGeometry: { ...record } }, Object.create({ monsterGeometry: record })]) assert.deepEqual(buildHalloweenProof(input, assets).pages[0].layers[0].anchor, { x: .5, y: 1 });
  const changed = { ...input, selectedPreviewId: 'another-preview' };
  assert.deepEqual(buildHalloweenProof(changed, { monsterGeometry: record }).pages[0].layers[0].anchor, { x: .5, y: 1 });
});

test('opaque, empty, malformed and oversized legacy geometry falls back with a warning', async () => {
  const opaque = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#a758cc' } }).png().toBuffer();
  const empty = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  for (const bytes of [opaque, empty, Buffer.from('invalid image'), Buffer.alloc(12 * 1024 * 1024 + 1)]) {
    const result = await deriveMonsterGeometry(bytes, { source, selectedPreviewId });
    assert.equal(result.available, false); assert.equal(trustedMonsterGeometry(result, { source, selectedPreviewId }), null);
  }
  const badDimensions = Buffer.from(await fixture()); badDimensions.writeUInt32BE(65536, 16); badDimensions.writeUInt32BE(65536, 20);
  assert.equal((await deriveMonsterGeometry(badDimensions, { source, selectedPreviewId })).available, false);
  const legacy = await buildHalloweenProofWithGeometry(payload(opaque));
  assert.deepEqual(legacy.pages[0].layers[0].anchor, { x: .5, y: 1 });
  assert.ok(legacy.warnings.some(warning => /baseline is unavailable/.test(warning)));
  assert.equal(legacy.proofHash, buildHalloweenProof(payload(opaque)).proofHash);
});

test('admin measures only its owned saved selected storage bytes and returns a matching display binding', async () => {
  const originalFetch = global.fetch, originalUrl = process.env.SUPABASE_URL, originalKey = process.env.SUPABASE_SECRET_KEY;
  const submissionId = '11111111-1111-4111-8111-111111111111', previewId = '22222222-2222-4222-8222-222222222222';
  const bytes = await fixture(), calls = [];
  let previewPath = `${submissionId}/previews/${previewId}.png`;
  process.env.SUPABASE_URL = 'https://project.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_local_test';
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/rest/v1/monster_submissions?')) return Response.json([{ id: submissionId, selected_preview_id: previewId }]);
    if (url.includes('/rest/v1/monster_previews?')) return Response.json([{ id: previewId, submission_id: submissionId, status: 'complete', preview_path: previewPath, preview_url: 'https://attacker.example/ignored.png' }]);
    if (url.includes('/object/sign/')) return Response.json({ signedURL: `/object/sign/monster-submissions/${previewPath}?token=local-test` });
    if (url.includes('/object/authenticated/')) return new Response(bytes);
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const assets = await getAdminMonsterAssets(submissionId, previewId);
    assert.equal(assets.selectedPreviewSha256, sha(bytes)); assert.equal(assets.monsterGeometry.selectedPreviewId, previewId);
    const book = composeReviewBook(story, { ...selection, selectedPreviewId: previewId }, assets);
    assert.deepEqual(book.pages[0].layers[0].anchor, { x: .5, y: 62 / 80 });
    const reads = calls.filter(call => call.url.includes('/object/authenticated/'));
    assert.equal(reads.length, 1); assert.ok(reads[0].url.endsWith(`/monster-submissions/${previewPath}`));
    assert.equal(reads[0].options.redirect, 'error'); assert.equal(reads[0].options.headers.apikey, 'sb_secret_local_test');
    assert.equal(reads[0].options.headers.Authorization, undefined);
    calls.length = 0; previewPath = 'another-submission/previews/image.png';
    await assert.rejects(getAdminMonsterAssets(submissionId, previewId), /path is invalid/);
    assert.equal(calls.filter(call => call.url.includes('/storage/')).length, 0);
  } finally { global.fetch = originalFetch; if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl; if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = originalKey; }
});

test('browser display and actual PDF use the same trusted opacity baseline without changing monster bytes', async () => {
  const bytes = await fixture(), record = await deriveMonsterGeometry(bytes, { source, selectedPreviewId });
  const assets = { selectedPreviewId, selectedPreviewUrl: source, selectedPreviewSha256: sha(bytes), monsterGeometry: record };
  const composition = composeReviewBook(story, selection, assets);
  const dom = new JSDOM('<main></main>', { runScripts: 'outside-only' });
  try {
    for (const file of ['lib/child-characters.js', 'lib/halloween-review-layouts.js', 'lib/review-composition.js', 'scripts/page-compositor.js']) dom.window.eval(await fs.readFile(path.join(ROOT, file), 'utf8'));
    dom.window.eval(`window.geometryAssets = ${JSON.stringify(assets)}`);
    const browserBook = dom.window.MonstersNOWComposition.composeReviewBook(story, selection, dom.window.geometryAssets);
    const browserAnchor = browserBook.pages[0].layers[0].anchor;
    assert.deepEqual(JSON.parse(JSON.stringify(browserAnchor)), record.anchor);
    const page = dom.window.MonstersNOWPageCompositor.renderReviewPage(browserBook.pages[0], browserBook);
    assert.equal(page.querySelector('.composition-monster img').style.transform, `translate(0%, ${(1 - record.anchor.y) * 100}%)`);
    const r = await renderComposedBookPdf({ composition, purpose: 'review-candidate', assetResolver: async () => ({ bytes }), templates: await loadVerifiedReviewTemplates(), fonts: { body: await fs.readFile(path.join(ROOT, 'assets/fonts/fredoka/Fredoka-Print-Regular.ttf')), heading: await fs.readFile(path.join(ROOT, 'assets/fonts/chewy/Chewy-Regular.ttf')) } });
    for (const use of r.manifest.assetUses.filter(use => use.role === 'monster')) {
      assert.deepEqual(use.anchor, record.anchor); assert.equal(use.sourceSha256, sha(bytes)); assert.equal(use.rasterizedSha256, sha(bytes));
      if (typeof use.page === 'number') { const foot = use.box.yPt + use.box.heightPt * (1 - use.anchor.y); assert.ok(Math.abs(foot - 630 * (1 - .88)) < .001); }
    }
    const covers = r.manifest.assetUses.filter(use => use.role === 'monster' && typeof use.page === 'string');
    assert.ok(covers.every(use => use.adjustedForTransparencyPadding && use.adjustedToFitArtBox));
    assert.ok(r.manifest.blockers.some(blocker => blocker.code === 'character_padding_placement_review'));
  } finally { dom.window.close(); }
});
