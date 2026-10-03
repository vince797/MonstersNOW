'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { PDFDocument, PDFRawStream, PDFName } = require('pdf-lib');
const zlib = require('node:zlib');
const sharp = require('sharp');
const { predict, unPredict } = require('../lib/pdf-image-compression');
const { buildHalloweenProof, buildHalloweenProofWithGeometry } = require('../lib/halloween-proof');
const { renderComposedBookPdf, createLocalAssetResolver, canonicalJson, REVIEW_MARKER } = require('../lib/composed-book-pdf');
const { loadVerifiedReviewTemplates, validateTemplate } = require('../lib/lulu-cover-templates');
const ROOT = path.resolve(__dirname, '..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const normalize = s => s.replace(/\s+/g, ' ').trim();
let optionsPromise, resultPromise;
async function options() {
  if (!optionsPromise) optionsPromise = (async () => {
    const file = 'assets/master-references/character-purple-storybook-style.jpg';
    const image = `data:image/jpeg;base64,${(await fs.readFile(path.join(ROOT, file))).toString('base64')}`;
    const composition = buildHalloweenProof({ personalization: { childName: 'Sample Alex', monsterName: 'Moxie', childCharacter: 'deep-braids-black' }, selectedPreviewId: 'test-exact-monster', monsterImage: image, format: 'softcover' });
    // Keep an explicit legacy fixture in this test book as the live catalog evolves.
    for (const page of composition.pages) for (const layer of page.layers) if (layer.type === 'child') Object.assign(layer, { src: '/assets/characters/deep-braids-black-review-v1.svg', assetId: 'explicit-test-fixture', status: 'sample', pose: 'fixture', anchor: { x: .5, y: 1 } });
    return { composition, purpose: 'review-candidate', assetResolver: createLocalAssetResolver({ root: ROOT, bindings: { [image]: file } }), templates: await loadVerifiedReviewTemplates(), fonts: { body: await fs.readFile(path.join(ROOT, 'assets/fonts/fredoka/Fredoka-Print-Regular.ttf')), heading: await fs.readFile(path.join(ROOT, 'assets/fonts/chewy/Chewy-Regular.ttf')) } };
  })();
  return optionsPromise;
}
async function result() { return resultPromise ||= renderComposedBookPdf(await options()); }
async function tempFile(bytes, name = 'candidate.pdf') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'composed-pdf-'));
  const filename = path.join(dir, name); await fs.writeFile(filename, bytes); return { filename, dir };
}
function decodedPdfRgbaImages(doc) {
  const decode = stream => {
    const width = stream.dict.lookup(PDFName.of('Width')).asNumber(), height = stream.dict.lookup(PDFName.of('Height')).asNumber();
    const colors = stream.dict.get(PDFName.of('ColorSpace')).toString() === '/DeviceRGB' ? 3 : 1;
    const raw = zlib.inflateSync(stream.getContents());
    return stream.dict.has(PDFName.of('DecodeParms')) ? unPredict(raw, width, height, colors) : raw;
  };
  return doc.context.enumerateIndirectObjects().flatMap(([, stream]) => {
    if (!(stream instanceof PDFRawStream) || stream.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image' || stream.dict.get(PDFName.of('Filter'))?.toString() !== '/FlateDecode' || stream.dict.get(PDFName.of('ColorSpace'))?.toString() !== '/DeviceRGB') return [];
    const rgb = decode(stream), mask = stream.dict.lookup(PDFName.of('SMask')), alpha = mask ? decode(mask) : null, rgba = Buffer.alloc(rgb.length / 3 * 4);
    for (let i = 0; i < rgb.length / 3; i++) { rgb.copy(rgba, i * 4, i * 3, i * 3 + 3); rgba[i * 4 + 3] = alpha ? alpha[i] : 255; }
    return [{ rgba, width: stream.dict.lookup(PDFName.of('Width')).asNumber(), height: stream.dict.lookup(PDFName.of('Height')).asNumber() }];
  });
}

test('actual PDFs have 32 square bleed/trim pages and distinct template-exact cover sizes', async () => {
  const r = await result();
  const doc = await PDFDocument.load(r.interior);
  assert.equal(doc.getPageCount(), 32);
  for (const p of doc.getPages()) {
    assert.deepEqual(p.getSize(), { width: 630, height: 630 });
    assert.deepEqual(p.getTrimBox(), { x: 9, y: 9, width: 612, height: 612 });
    assert.deepEqual(p.getBleedBox(), { x: 0, y: 0, width: 630, height: 630 });
  }
  for (const [format, width, height] of [['softcover', 1251.51, 630], ['hardcover', 1368, 738]]) {
    const cover = await PDFDocument.load(r.covers[format]);
    assert.equal(cover.getPageCount(), 1);
    assert.deepEqual(cover.getPage(0).getSize(), { width, height });
    assert.equal(r.manifest.artifacts[format].sha256, sha(r.covers[format]));
  }
  assert.equal(r.manifest.artifacts.interior.sha256, sha(r.interior));
  assert.equal(r.manifest.artifacts.interior.byteLength, r.interior.length);
  assert.notEqual(sha(r.covers.softcover), sha(r.covers.hardcover));
});

test('actual PDF text includes every manuscript page, embedded fonts, and candidate marker', async t => {
  const r = await result(), opts = await options();
  const { filename, dir } = await tempFile(r.interior);
  try {
    let actual, fonts;
    try { actual = execFileSync('pdftotext', ['-layout', filename, '-'], { encoding: 'utf8' }); fonts = execFileSync('pdffonts', [filename], { encoding: 'utf8' }); }
    catch (error) { if (error.code === 'ENOENT') return t.skip('Install Poppler for independent text/font verification.'); throw error; }
    const pages = actual.split('\f');
    assert.equal(pages.length, 33);
    for (const [i, page] of opts.composition.pages.entries()) {
      assert.ok(normalize(pages[i]).includes(normalize(page.text)), `All copy must remain on page ${i + 1}`);
      assert.ok(pages[i].includes(REVIEW_MARKER));
    }
    assert.match(fonts, /Fredoka/); assert.match(fonts, /Chewy/);
    const rows = fonts.split('\n').filter(line => /Fredoka|Chewy/.test(line));
    assert.equal(rows.length, 2);
    for (const row of rows) assert.match(row, /yes\s+(?:yes|no)\s+yes/); // embedded and Unicode; Poppler may not recognize pdf-lib's subset font name
    const bbox = execFileSync('pdftotext', ['-bbox', filename, '-'], { encoding: 'utf8' });
    const words = [...bbox.matchAll(/<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)"/g)];
    assert.ok(words.length > 900);
    for (const word of words) { const [x1, y1, x2, y2] = word.slice(1).map(Number); assert.ok(x1 >= 0 && y1 >= 0 && x2 <= 630 && y2 <= 630, `Actual PDF text clipped: ${word[0]}`); }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('layout reports bounded readable text, no art under copy, and preserves exact monster pixels', async () => {
  const r = await result(), opts = await options();
  for (const page of r.manifest.layout.interior) {
    assert.equal(page.possibleArtCopyOverlap, false);
    for (const run of page.textRuns) {
      assert.ok(run.fontSize >= (run.label === 'story' ? 13 : 8));
      assert.ok(run.xPt >= run.safeArea.xPt - .01);
      assert.ok(run.yPt >= run.safeArea.yPt - .01);
      assert.ok(run.xPt + run.widthPt <= run.safeArea.xPt + run.safeArea.widthPt + .01);
      assert.ok(run.yPt + run.heightPt <= run.safeArea.yPt + run.safeArea.heightPt + .01);
    }
  }
  const expected = sha((await opts.assetResolver(opts.composition.monsterImage)).bytes);
  for (const use of r.manifest.assetUses.filter(u => u.role === 'monster')) {
    assert.equal(use.sourceSha256, expected);
    assert.equal(use.rasterizedSha256, expected, 'JPEG selected monster bytes are embedded unchanged');
    assert.equal(use.mirror, false); assert.equal(use.crop, 'full');
  }
});

test('low native resolution and fixture assets are blockers, never falsely certified', async () => {
  const r = await result();
  for (const name of ['reviewOnly']) assert.equal(r.manifest[name], true);
  for (const name of ['productionReady', 'readyForSubmission']) assert.equal(r.manifest[name], false);
  const codes = r.manifest.blockers.map(b => b.code);
  for (const code of ['sample_fixture_art', 'native_resolution_below_300_ppi', 'missing_frontmatter_backgrounds', 'foreground_masks_missing', 'character_cutout_missing', 'trusted_preflight_missing']) assert.ok(codes.includes(code));
  const backgrounds = r.manifest.assets.filter(a => a.provenance.localPath?.includes('-environment-v1.png'));
  assert.equal(backgrounds.length, 14);
  for (const asset of backgrounds) assert.deepEqual([asset.nativeWidth, asset.nativeHeight], [1774, 887]);
  for (const use of r.manifest.assetUses.filter(u => u.role === 'background' && typeof u.page === 'number')) {
    assert.equal(use.effectiveNativePpi, Math.round(887 / (use.box.widthPt / 72) * 1000) / 1000); assert.equal(use.meets300Ppi, false);
  }
  assert.equal(r.manifest.verification.independentPrintPreflightPassed, false);
});

test('byte hashes are deterministic; a manuscript change invalidates every artifact and fingerprint', async () => {
  const opts = await options(), first = await result();
  const second = await renderComposedBookPdf(opts);
  assert.equal(second.manifest.renderFingerprint, first.manifest.renderFingerprint);
  assert.equal(second.manifest.manifestSha256, first.manifest.manifestSha256);
  assert.equal(sha(second.interior), sha(first.interior));
  assert.equal(sha(second.covers.softcover), sha(first.covers.softcover));
  assert.equal(sha(second.covers.hardcover), sha(first.covers.hardcover));
  const changed = structuredClone(opts.composition); changed.pages[10].text += '\nA new ending.';
  const next = await renderComposedBookPdf({ ...opts, composition: changed });
  assert.notEqual(next.manifest.renderFingerprint, first.manifest.renderFingerprint);
  assert.notEqual(sha(next.interior), sha(first.interior));
  assert.notEqual(sha(next.covers.softcover), sha(first.covers.softcover));
  assert.notEqual(sha(next.covers.hardcover), sha(first.covers.hardcover));
  const { manifestSha256, ...body } = first.manifest;
  assert.equal(manifestSha256, sha(canonicalJson(body)));
});

test('missing assets, network URLs, traversal and out-of-root symlinks fail closed', async () => {
  const opts = await options();
  const resolver = createLocalAssetResolver({ root: ROOT });
  await assert.rejects(resolver('https://example.com/child.png'), /trusted local/);
  await assert.rejects(resolver('/assets/../../secret'), /trusted local/);
  await assert.rejects(resolver('/assets/no-such-image.png'), /missing/);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-resolver-'));
  const elsewhere = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-asset-'));
  try {
    await fs.mkdir(path.join(dir, 'assets')); await fs.writeFile(path.join(elsewhere, 'image.png'), 'x');
    await fs.symlink(path.join(elsewhere, 'image.png'), path.join(dir, 'assets/escape.png'));
    await assert.rejects(createLocalAssetResolver({ root: dir })('/assets/escape.png'), /escapes/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); await fs.rm(elsewhere, { recursive: true, force: true }); }
  const missing = structuredClone(opts.composition); missing.pages[3].layers[0].src = '/assets/no-such-background.png';
  await assert.rejects(renderComposedBookPdf({ ...opts, composition: missing }), /missing/);
});

test('production claims, altered monster identity, mirror, invalid page count, and overflowing text are rejected', async () => {
  const opts = await options();
  await assert.rejects(renderComposedBookPdf({ ...opts, purpose: 'production', approvals: { customer: true, administrator: true }, productionReady: true }), /Production export is closed/);
  await assert.rejects(renderComposedBookPdf({ ...opts, purpose: undefined }), /Production export is closed/);
  for (const change of [
    b => b.pages.pop(),
    b => { b.pages[4].layers.find(l => l.type === 'monster').assetId = 'different-monster'; },
    b => { b.pages[4].layers.find(l => l.type === 'monster').mirror = true; },
    b => { b.pages[3].text = 'Enormouslylongword'.repeat(30); },
  ]) {
    const composition = structuredClone(opts.composition); change(composition);
    await assert.rejects(renderComposedBookPdf({ ...opts, composition }), /32 composed|exact selected|mirroring|fit the text-safe/);
  }
});

test('cover geometry and template hashes are verified and template guides are not printed', async t => {
  const opts = await options(), r = await result();
  for (const format of ['softcover', 'hardcover']) {
    const original = opts.templates[format];
    for (const mutate of [m => { m.widthPt += 1; }, m => { m.sha256 = '0'.repeat(64); }, m => { delete m.safeAreas; }, m => { m.panels.front.xPt = -1; }, m => { m.podPackageId = 'wrong'; }]) {
      const metadata = structuredClone(original.metadata); mutate(metadata);
      await assert.rejects(validateTemplate({ bytes: original.bytes, metadata }, format), /template required/);
    }
    const { filename, dir } = await tempFile(r.covers[format]);
    try {
      let actual;
      try { actual = execFileSync('pdftotext', [filename, '-'], { encoding: 'utf8' }); }
      catch (error) { if (error.code === 'ENOENT') return t.skip('Poppler is required for independent guide exclusion check.'); throw error; }
      assert.ok(actual.includes('Halloween Monster'));
      assert.ok(actual.includes(REVIEW_MARKER));
      assert.doesNotMatch(actual, /SAFETY MARGIN|TOTAL DOCUMENT SIZE|BARCODE AREA|BOOK TRIM SIZE/);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  }
  assert.deepEqual(r.manifest.templates.hardcover.panels.spine, { xPt: 675, yPt: 45, widthPt: 18, heightPt: 648 });
  assert.deepEqual(r.manifest.templates.hardcover.safeAreas.front, { xPt: 738, yPt: 90, widthPt: 540, heightPt: 558 });
});

test('candidate poses, prop renditions, and exact foot anchors preserve verified pixels within the storage cap', async t => {
  const opts = await options();
  const monsterFile = 'assets/characters/candidates/sample-monster-v1/purple-wave-candidate.png';
  const monsterBytes = await fs.readFile(path.join(ROOT, monsterFile)), monsterImage = `data:image/png;base64,${monsterBytes.toString('base64')}`;
  const composition = await buildHalloweenProofWithGeometry({ personalization: { childName: 'Sample Alex', monsterName: 'Moxie', childCharacter: 'warm-curly-dark' }, selectedPreviewId: 'test-exact-monster', monsterImage, format: 'softcover' });
  const assetResolver = createLocalAssetResolver({ root: ROOT, bindings: { [monsterImage]: monsterFile } });
  const r = await renderComposedBookPdf({ ...opts, composition, assetResolver });
  assert.ok(r.interior.length <= 20 * 1024 * 1024, 'The candidate must fit the existing 20 MiB customer-proof limit without changing that limit');
  t.diagnostic(`Actual warm-curly-dark interior with quiet pose, prop, and exact transparent monster: ${r.interior.length} bytes`);
  assert.ok(r.manifest.losslessImageCompression.interior.totalSavedBytes > 500000);
  const doc = await PDFDocument.load(r.interior);
  for (const [ref, stream] of doc.context.enumerateIndirectObjects()) {
    const report = r.manifest.losslessImageCompression.interior.images.find(i => i.objectNumber === ref.objectNumber);
    if (!report) continue;
    assert.ok(stream instanceof PDFRawStream);
    assert.equal(stream.dict.lookup(PDFName.of('DecodeParms')).lookup(PDFName.of('Predictor')).asNumber(), 15);
    const pixels = unPredict(zlib.inflateSync(stream.getContents()), report.width, report.height, report.colors);
    assert.equal(sha(pixels), report.decodedPixelSha256, 'Serialized PDF image decodes to the exact verified pixels');
  }
  const children = r.manifest.assetUses.filter(u => u.role === 'child' && typeof u.page === 'number');
  assert.equal(children.length, 28);
  assert.deepEqual([...new Set(children.map(u => u.pose))], ['porch', 'garden', 'garden-quiet', 'seated-home']);
  for (const child of children) {
    const input = composition.pages[child.page - 1].layers.find(l => l.type === 'child');
    assert.deepEqual(child.anchor, input.anchor); assert.equal(child.status, 'candidate');
    const actualFoot = child.box.yPt + child.box.heightPt * (1 - child.anchor.y);
    const art = r.manifest.layout.interior[child.page - 1].artBox;
    assert.ok(Math.abs(actualFoot - (art.yPt + art.heightPt * (1 - input.y / 100))) < 0.001);
    assert.equal(child.mirror, false);
  }
  assert.ok(!r.manifest.blockers.some(b => b.code === 'sample_fixture_art'));
  assert.ok(r.manifest.blockers.some(b => b.code === 'unapproved_art'));
  assert.equal(r.manifest.productionReady, false);
  const decodedImages = decodedPdfRgbaImages(doc);
  const uniqueChildren = [...new Map(children.map(use => [use.sourceSha256, use])).values()];
  for (const use of uniqueChildren) {
    const layer = composition.pages[use.page - 1].layers.find(l => l.type === 'child');
    const source = (await assetResolver(layer.src)).bytes;
    const { data: original, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const embedded = decodedImages.find(image => sha(image.rgba) === use.pixelPreservation.decodedRgbaSha256);
    assert.ok(embedded, `The PDF contains the exact reported ${use.pose} RGBA samples`);
    assert.equal(use.sourceSha256, sha(source));
    assert.equal(use.pixelPreservation.sourceDecodedRgbaSha256, sha(original));
    assert.deepEqual([use.renditionWidth, use.renditionHeight], [info.width, info.height]);
    assert.equal(use.effectiveNativePpi, use.effectiveRenditionPpi);
    assert.equal(use.pixelPreservation.visibleSourcePixelsPreserved, true);
    assert.equal(use.pixelPreservation.downsampled, false);
    assert.ok(use.pixelPreservation.alphaZeroRgbNormalizedPixels > 0);
    const expected = Buffer.from(original);
    for (let i = 0; i < expected.length; i += 4) if (expected[i + 3] === 0) expected[i] = expected[i + 1] = expected[i + 2] = 0;
    assert.deepEqual(embedded.rgba, expected, 'Every alpha and visible RGB sample is exact; only RGB beneath alpha=0 may change');
    assert.equal(use.pixelPreservation.sourceVisibleRgbaSha256, sha(expected));
  }
  const prop = r.manifest.assetUses.find(use => use.role === 'prop');
  assert.equal(prop.page, 31); assert.equal(prop.assetId, 'home-two-treats-prop-candidate-v1');
  assert.deepEqual([prop.renditionWidth, prop.renditionHeight], [768, 512]);
  assert.equal(prop.pixelPreservation.downsampled, true); assert.equal(prop.pixelPreservation.resizeKernel, 'lanczos3');
  assert.equal(prop.pixelPreservation.visibleSourcePixelsPreserved, false, 'A downsample is never called lossless against its source');
  assert.equal(prop.effectiveRenditionPpi, Math.round(Math.min(768 / (prop.box.widthPt / 72), 512 / (prop.box.heightPt / 72)) * 1000) / 1000);
  assert.ok(prop.effectiveRenditionPpi > 300); assert.ok(prop.meets300Ppi);
  assert.ok(Math.abs(prop.effectiveNativePpi - 2 * prop.effectiveRenditionPpi) < .002);
  const propLayer = composition.pages[30].layers.find(l => l.type === 'prop');
  const propBytes = (await assetResolver(propLayer.src)).bytes;
  assert.equal(prop.sourceSha256, sha(propBytes)); assert.notEqual(prop.rasterizedSha256, prop.sourceSha256);
  const propRaw = await sharp(propBytes).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < propRaw.length; i += 4) if (propRaw[i + 3] === 0) propRaw[i] = propRaw[i + 1] = propRaw[i + 2] = 0;
  const renditionRaw = await sharp(propRaw, { raw: { width: 1536, height: 1024, channels: 4 } }).resize({ width: 768, kernel: 'lanczos3', withoutEnlargement: true }).raw().toBuffer();
  for (let i = 0; i < renditionRaw.length; i += 4) if (renditionRaw[i + 3] === 0) renditionRaw[i] = renditionRaw[i + 1] = renditionRaw[i + 2] = 0;
  const propEmbedded = decodedImages.find(image => sha(image.rgba) === prop.pixelPreservation.decodedRgbaSha256);
  assert.deepEqual(propEmbedded?.rgba, renditionRaw, 'PDF encoding is lossless against the explicit deterministic prop rendition');
  const renditionPng = await sharp(renditionRaw, { raw: { width: 768, height: 512, channels: 4 } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  assert.equal(prop.rasterizedSha256, sha(renditionPng));
  const monsterRaw = await sharp(monsterBytes).ensureAlpha().raw().toBuffer();
  assert.ok(decodedImages.some(image => image.rgba.equals(monsterRaw)), 'Selected monster RGBA samples, including hidden RGB, remain exact');
  for (const use of r.manifest.assetUses.filter(use => use.role === 'monster')) {
    assert.equal(use.sourceSha256, sha(monsterBytes)); assert.equal(use.rasterizedSha256, sha(monsterBytes));
    assert.equal(use.pixelPreservation, null);
  }
});

test('enlarged prop reports its insufficient encoded resolution even when native source detail exceeds 300 PPI', async () => {
  const opts = await options(), composition = structuredClone(opts.composition);
  Object.assign(composition.pages[30].layers.find(layer => layer.type === 'prop'), { x: 50, y: 75, scale: 70 });
  const r = await renderComposedBookPdf({ ...opts, composition });
  const prop = r.manifest.assetUses.find(use => use.role === 'prop');
  assert.ok(prop.effectiveNativePpi > 300); assert.ok(prop.effectiveRenditionPpi < 300); assert.equal(prop.meets300Ppi, false);
  const blocker = r.manifest.blockers.find(item => item.code === 'native_resolution_below_300_ppi');
  assert.match(blocker.detail, /encoded rendition/);
  assert.deepEqual(blocker.uses.find(use => use.role === 'prop'), { page: 31, role: 'prop', effectiveNativePpi: prop.effectiveNativePpi, effectiveRenditionPpi: prop.effectiveRenditionPpi });
});

test('resolver byte substitution, unsupported glyphs, and unknown native resolution never pass silently', async () => {
  const opts = await options();
  const replacement = await fs.readFile(path.join(ROOT, 'assets/master-references/standalone-purple-monster.jpg'));
  await assert.rejects(renderComposedBookPdf({ ...opts, assetResolver: async source => source === opts.composition.monsterImage ? { bytes: replacement } : opts.assetResolver(source) }), /exact selected inline monster bytes/);
  const unsupported = structuredClone(opts.composition); unsupported.pages[0].text += ' 🚀';
  await assert.rejects(renderComposedBookPdf({ ...opts, composition: unsupported }), /does not support/);
  const r = await renderComposedBookPdf({ ...opts, assetResolver: async source => {
    const record = await opts.assetResolver(source);
    return source.includes('-environment-v1.png') ? { ...record, provenance: { ...record.provenance, nativeWidth: 887, nativeHeight: 443 } } : record;
  } });
  const bgs = r.manifest.assetUses.filter(u => u.role === 'background');
  assert.ok(bgs.every(u => u.upscaledSource && u.effectiveNativePpi < 85 && !u.meets300Ppi));
  for (const u of bgs) {
    const expected = Math.round(Math.min((u.crop === "full" ? 887 : 443.5) / (u.box.widthPt / 72), 443 / (u.box.heightPt / 72)) * 1000) / 1000;
    assert.equal(u.effectiveNativePpi, expected);
  }
  assert.notEqual(r.manifest.renderFingerprint, (await result()).manifest.renderFingerprint);
});

test('lossless prediction round-trips RGB and alpha scanlines exactly', () => {
  for (const colors of [1, 3]) {
    const pixels = Buffer.alloc(17 * 11 * colors);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 19 + Math.floor(i / 7)) & 255;
    assert.deepEqual(unPredict(predict(pixels, 17, 11, colors), 17, 11, colors), pixels);
  }
});

test('SVG external references are rejected before any rasterizer sees the content', async () => {
  const opts = await options();
  const malicious = Buffer.from('<!--' + 'x'.repeat(3000) + '--><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="https://example.com/external.png" /></svg>');
  const source = opts.composition.pages[3].layers.find(l => l.type === 'child').src;
  await assert.rejects(renderComposedBookPdf({ ...opts, assetResolver: async value => value === source ? { bytes: malicious } : opts.assetResolver(value) }), /self-contained/);
});

test('scene-aware copy does not cover protected faces or the story clues',async()=>{
 const r=await result();
 const protectedZones={12:[[42,34,28,22]],14:[[18,2,27,25],[43,24,24,26]],16:[[20,30,28,28]],17:[[56,2,29,27],[26,30,29,26]],18:[[30,14,19,26],[40,34,51,27]],22:[[4,25,26,25],[43,25,27,25]],23:[[68,35,26,28]],25:[[67,33,28,29]],30:[[10,28,24,23],[28,42,70,24],[70,1,19,17]],31:[[67,1,22,20]]};
 const overlaps=(a,b)=>a.xPt<b.xPt+b.widthPt&&a.xPt+a.widthPt>b.xPt&&a.yPt<b.yPt+b.heightPt&&a.yPt+a.heightPt>b.yPt;
 for(const[number,zones]of Object.entries(protectedZones)){
  const page=r.manifest.layout.interior[Number(number)-1],art=page.artBox;
  for(const[x,y,w,h]of zones){const zone={xPt:art.xPt+x/100*art.widthPt,yPt:art.yPt+(1-(y+h)/100)*art.heightPt,widthPt:w/100*art.widthPt,heightPt:h/100*art.heightPt};assert.equal(overlaps(page.copyPanel,zone),false,`Page ${number} copy protects its face/clue zone`);}
 }
});

test('unbounded layout inputs fail rather than entering an excessive font-fit loop',async()=>{
 const opts=await options(),composition=structuredClone(opts.composition);
 composition.pages[0].renderLayout={bodySize:1e12};
 await assert.rejects(renderComposedBookPdf({...opts,composition}),/layout parameters/);
});
