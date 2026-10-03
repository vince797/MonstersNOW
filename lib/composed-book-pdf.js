'use strict';
/** Local-only real-art review renderer. It never certifies, uploads, or submits print files. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const fontkit = require('@pdf-lib/fontkit');
const { PDFDocument, rgb } = require('pdf-lib');
const { validateTemplate } = require('./lulu-cover-templates');
const { optimizePdfImages } = require('./pdf-image-compression');

const VERSION = 'composed-book-pdf-review-v1';
const REVIEW_MARKER = 'REVIEW CANDIDATE - NOT FOR PRINT';
const PAGE_SIZE = 630;
const MIN_PPI = 300;
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
const SHA = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const INK = rgb(0.07, 0.16, 0.22);
const CREAM = rgb(1, 0.975, 0.93);
const TEAL = rgb(0.05, 0.33, 0.35);
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    if (value === undefined || typeof value === 'function' || typeof value === 'number' && !Number.isFinite(value)) throw new Error('Composition must contain only finite JSON values.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Composition must be plain JSON.');
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}
function fail(message, code = 'invalid_review_composition') { throw Object.assign(new Error(message), { code }); }
function round(n) { return Math.round(n * 1000) / 1000; }
function isContained(root, filename) { return filename === root || filename.startsWith(root + path.sep); }

/** Source strings never become network requests. Explicit bindings may map an inline
 * monster image or a logical ID to a local file; all files must remain under root. */
function createLocalAssetResolver({ root, bindings = {}, records = {} } = {}) {
  if (!root) fail('A trusted local asset root is required.');
  const rootPromise = fs.realpath(root);
  return async source => {
    const realRoot = await rootPromise;
    let local;
    if (Object.prototype.hasOwnProperty.call(bindings, source)) local = path.resolve(realRoot, bindings[source]);
    else if (typeof source === 'string' && /^\/assets\/[A-Za-z0-9_./-]+$/.test(source) && !source.includes('..')) local = path.join(realRoot, source);
    else fail('Asset is not bound to a trusted local file; network and inline URL fetching is disabled.', 'untrusted_asset_source');
    const real = await fs.realpath(local).catch(() => fail(`Required local asset is missing: ${path.basename(local)}`, 'missing_asset'));
    if (!isContained(realRoot, real)) fail('Asset escapes its trusted root.', 'untrusted_asset_source');
    const stat = await fs.stat(real);
    if (!stat.isFile() || stat.size > 24 * 1024 * 1024) fail('Asset must be a local file smaller than 24 MB.');
    return { bytes: await fs.readFile(real), provenance: { localPath: path.relative(realRoot, real).split(path.sep).join('/'), ...(records[source] || {}) } };
  };
}

function normalizeComposition(input) {
  const book = JSON.parse(canonicalJson(input));
  if (!Array.isArray(book.pages) || book.pages.length !== 32) fail('Exactly 32 composed pages are required.');
  if (typeof book.title !== 'string' || !book.title.trim()) fail('Book title is required.');
  let monsterIdentity;
  const sources = [];
  for (const [index, page] of book.pages.entries()) {
    if (page.number !== index + 1 || typeof page.text !== 'string' || !page.text.trim() || !Array.isArray(page.layers)) fail(`Page ${index + 1} needs ordered numbering, real text, and layers.`);
    if (page.text.length > 5000 || (page.title || '').length > 300) fail('Page copy exceeds the bounded layout input.');
    if (page.layers.filter(l => l.type === 'background').length > 1) fail('Each page supports one background plate.');
    for (const layer of page.layers) {
      if (!['background', 'monster', 'child', 'prop'].includes(layer.type) || typeof layer.src !== 'string' || !layer.src) fail(`Page ${page.number} has an invalid or missing layer.`);
      if (layer.type === 'background') {
        if (!['left', 'right', 'full'].includes(layer.crop)) fail('Background crop must be left, right, or full.');
      } else {
        if (layer.mirror !== false) fail('Character mirroring is forbidden: preserve the selected identity.');
        for (const name of ['x', 'y', 'scale']) if (!Number.isFinite(layer[name])) fail('Character placement must be explicit and finite.');
        if (layer.scale <= 0 || layer.scale > 100 || layer.x < 0 || layer.x > 100 || layer.y < 0 || layer.y > 100) fail('Character placement is out of range.');
      }
      if (layer.type === 'monster') {
        if (!layer.assetId) fail('The selected monster asset ID is required.');
        const id = `${layer.assetId}:${SHA(layer.src)}`;
        if (monsterIdentity && monsterIdentity !== id) fail('Every monster layer must reuse the exact selected monster asset.');
        monsterIdentity = id;
        if (book.selectedPreviewId && book.selectedPreviewId !== layer.assetId) fail('Selected preview ID differs from the rendered monster.');
      }
      sources.push(layer.src);
    }
  }
  if (!monsterIdentity) fail('The exact selected monster image is required.');
  return { book, sources: [...new Set(sources)] };
}

async function readAsset(source, resolver) {
  const resolved = await resolver(source);
  if (!resolved || !(Buffer.isBuffer(resolved.bytes) || resolved.bytes instanceof Uint8Array)) fail('Trusted asset resolver must return exact bytes.');
  const bytes = Buffer.from(resolved.bytes);
  const inline = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(source);
  if (inline && SHA(Buffer.from(inline[1], 'base64')) !== SHA(bytes)) fail('The trusted file does not match the exact selected inline monster bytes.', 'selected_asset_mismatch');
  if (bytes.length > 24 * 1024 * 1024) fail('Image asset exceeds 24 MB.');
  const rasterMagic = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 || bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!rasterMagic) {
    const xml = bytes.toString('utf8');
    if (!/<svg(?:\s|>)/i.test(xml) || /(?:href\s*=|url\s*\(|<!DOCTYPE|<!ENTITY|<script)/i.test(xml)) fail('SVG assets must be self-contained and have no external references or scripts.');
  }
  const meta = await sharp(bytes, { limitInputPixels: 64 * 1024 * 1024 }).metadata();
  if (!['png', 'jpeg', 'webp', 'svg'].includes(meta.format) || !meta.width || !meta.height || meta.pages > 1) fail('Use a single PNG, JPEG, WebP, or trusted local SVG image.');
  if (meta.format === 'svg' && /(?:href\s*=|url\s*\(|<!DOCTYPE|<!ENTITY|<script)/i.test(bytes.toString('utf8'))) fail('SVG assets must be self-contained and have no external references or scripts.');
  const isOpaque = !meta.hasAlpha || (await sharp(bytes).stats()).isOpaque;
  const provenance = resolved.provenance || {};
  const fixture = /(?:sample|fixture)/i.test(provenance.status || '') || /review-v\d+\.svg$/.test(provenance.localPath || '') || meta.format === 'svg' && /data-asset-status=["']sample["']/.test(bytes.toString('utf8'));
  const nativeWidth = Math.min(meta.width, Number(provenance.nativeWidth) || meta.width);
  const nativeHeight = Math.min(meta.height, Number(provenance.nativeHeight) || meta.height);
  if (nativeWidth <= 0 || nativeHeight <= 0) fail('Native source dimensions must be positive.');
  const sourceId = SHA(source);
  return { source, bytes, meta, isOpaque, nativeWidth, nativeHeight, sourceId, fixture,
    record: { sourceId, sourceSha256: SHA(bytes), byteLength: bytes.length, format: meta.format, measuredWidth: meta.width, measuredHeight: meta.height, nativeWidth, nativeHeight, hasAlpha: Boolean(meta.hasAlpha), isOpaque, fixture, status: fixture ? 'sample-fixture' : provenance.status || 'unapproved', provenance } };
}

function lineWrap(text, font, size, width) {
  const lines = [];
  for (const para of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    if (!para.trim()) { lines.push(''); continue; }
    let line = '';
    for (const word of para.trim().split(/\s+/)) {
      if (font.widthOfTextAtSize(word, size) > width) fail('An unbroken word does not fit the text-safe area.', 'text_overflow');
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > width) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
  }
  return lines;
}
function textLayout(text, font, { width, height, size = 18, minSize = 13, leading = 1.28 } = {}) {
  if (![width,height,size,minSize,leading].every(Number.isFinite) || width <= 0 || height <= 0 || minSize < 6 || size < minSize || size > 72 || leading < 1 || leading > 2) fail('Text layout parameters are invalid.', 'layout_out_of_bounds');
  for (let fittedSize = size; fittedSize >= minSize; fittedSize -= 0.5) {
    let lines;
    try { lines = lineWrap(text, font, fittedSize, width); } catch (err) { if (err.code === 'text_overflow' && fittedSize > minSize) continue; throw err; }
    const lineHeight = fittedSize * leading;
    const totalHeight = font.heightAtSize(fittedSize, { descender: true }) + lines.slice(0, -1).reduce((sum,line) => sum + lineHeight * (line ? 1 : 0.38), 0);
    if (totalHeight <= height) return { lines, size: fittedSize, lineHeight, height: totalHeight };
  }
  fail('Text does not fit the safe area at the minimum readable size. No PDF was exported.', 'text_overflow');
}
function drawTextBlock(page, text, font, area, report, label, options = {}) {
  const layout = textLayout(text, font, { width: area.widthPt, height: area.heightPt, ...options });
  const ascent = font.heightAtSize(layout.size, { descender: false });
  const fullHeight = font.heightAtSize(layout.size, { descender: true });
  let baseline = area.yPt + area.heightPt - ascent;
  for (const line of layout.lines) {
    if (line) {
      const width = font.widthOfTextAtSize(line, layout.size);
      const x = options.align === 'center' ? area.xPt + (area.widthPt - width) / 2 : area.xPt;
      const bottom = baseline - (fullHeight - ascent);
      if (bottom < area.yPt - 0.01 || x + width > area.xPt + area.widthPt + 0.01) fail('Text escaped its safe area.', 'text_overflow');
      page.drawText(line, { x, y: baseline, size: layout.size, font, color: options.color || INK });
      report.push({ label, text: line, fontSize: layout.size, xPt: round(x), yPt: round(bottom), widthPt: round(width), heightPt: round(fullHeight), safeArea: area });
    }
    baseline -= layout.lineHeight * (line ? 1 : 0.38);
  }
  return layout;
}
function verifyGlyphs(texts, fontBytes, role) {
  const font = fontkit.create(fontBytes);
  for (const text of texts) for (const character of text) {
    const codepoint = character.codePointAt(0);
    if (!/\s/.test(character) && !font.hasGlyphForCodePoint(codepoint)) fail(`The ${role} font does not support U+${codepoint.toString(16).toUpperCase()}; no missing-glyph PDF was exported.`, 'unsupported_glyph');
  }
}
async function documentWithFonts(fonts, title, fingerprint) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  document.setTitle(`${title} | ${REVIEW_MARKER}`);
  document.setAuthor('MonstersNOW');
  document.setCreator(VERSION);
  document.setProducer(`${VERSION}; ${fingerprint}`);
  document.setSubject(REVIEW_MARKER);
  document.setCreationDate(FIXED_DATE); document.setModificationDate(FIXED_DATE);
  const body = await document.embedFont(fonts.body, { subset: true });
  const heading = await document.embedFont(fonts.heading, { subset: true });
  return { document, body, heading, images: new Map() };
}
async function embeddedImage(ctx, asset, crop = 'full', role = 'character', status) {
  // Restrict this optimization to ordinary untagged 8-bit RGBA candidates;
  // other encodings retain their original path rather than color-convert samples.
  const candidate = ['child', 'prop'].includes(role) && (status || asset.record.status) === 'candidate' && asset.meta.format === 'png' && asset.meta.space === 'srgb' && asset.meta.depth === 'uchar' && !asset.meta.icc && crop === 'full';
  const cacheKey = `${asset.record.sourceSha256}:${crop}:${role}:${candidate}`;
  if (ctx.images.has(cacheKey)) return ctx.images.get(cacheKey);
  let pipeline = sharp(asset.bytes, { limitInputPixels: 64 * 1024 * 1024 });
  let width = asset.meta.width, height = asset.meta.height;
  if (crop === 'left' || crop === 'right') {
    width = Math.floor(width / 2);
    pipeline = pipeline.extract({ left: crop === 'right' ? asset.meta.width - width : 0, top: 0, width, height });
  }
  // Opaque background renditions use high-quality JPEG at native dimensions to
  // keep candidates inspectable. Exact source hashes are retained separately.
  // Selected JPEG monster bytes are embedded unchanged, never redrawn or cropped.
  const nativeWidth = asset.nativeWidth * width / asset.meta.width, nativeHeight = asset.nativeHeight;
  let rendition, image, encoding, pixelPreservation = null;
  if (candidate) {
    // Only discard RGB hidden by alpha=0. Every visible sample (including partial
    // alpha) is preserved for child art. Selected monster bytes never enter here.
    let { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const sourceDecodedRgbaSha256 = SHA(data);
    let normalizedPixels = 0;
    const normalizeTransparentRgb = pixels => {
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] === 0 && (pixels[i] || pixels[i + 1] || pixels[i + 2])) {
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 0; normalizedPixels++;
      }
    };
    normalizeTransparentRgb(data);
    const sourceVisibleRgbaSha256 = SHA(data);
    const downsampled = role === 'prop' && width > 768;
    if (downsampled) {
      ({ data, info } = await sharp(data, { raw: { width, height, channels: 4 } }).resize({ width: 768, kernel: sharp.kernel.lanczos3, withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true }));
      width = info.width; height = info.height;
      normalizeTransparentRgb(data);
    }
    rendition = await sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    const decoded = await sharp(rendition).ensureAlpha().raw().toBuffer();
    if (!decoded.equals(data)) fail('Candidate PNG encoding changed decoded pixels.', 'rendition_pixel_mismatch');
    image = await ctx.document.embedPng(rendition);
    encoding = downsampled ? 'png-lanczos3-prop-768-alpha-zero-rgb' : 'lossless-png-alpha-zero-rgb';
    pixelPreservation = { sourceDecodedRgbaSha256, sourceVisibleRgbaSha256, decodedRgbaSha256: SHA(data), alphaZeroRgbNormalizedPixels: normalizedPixels, visibleSourcePixelsPreserved: !downsampled, downsampled, resizeKernel: downsampled ? 'lanczos3' : null };
  } else if (role === 'background' && asset.isOpaque) {
    rendition = await pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
    image = await ctx.document.embedJpg(rendition); encoding = 'jpeg-95-native-resolution';
  } else if (crop === 'full' && asset.meta.format === 'jpeg') {
    rendition = asset.bytes; image = await ctx.document.embedJpg(rendition); encoding = 'original-jpeg';
  } else {
    rendition = asset.meta.format === 'png' && crop === 'full' ? asset.bytes : await pipeline.png().toBuffer();
    image = await ctx.document.embedPng(rendition); encoding = 'lossless-png';
  }
  const result = { image, width, height, nativeWidth, nativeHeight, rasterizedSha256: SHA(rendition), encoding, pixelPreservation };
  ctx.images.set(cacheKey, result);
  return result;
}
function useRecord(asset, image, box, page, role, crop = 'full') {
  const ppi = Math.min(image.nativeWidth / (box.widthPt / 72), image.nativeHeight / (box.heightPt / 72));
  const renditionPpi = Math.min(image.width / (box.widthPt / 72), image.height / (box.heightPt / 72));
  return { page, role, sourceId: asset.sourceId, sourceSha256: asset.record.sourceSha256, rasterizedSha256: image.rasterizedSha256, encoding: image.encoding, renditionWidth: image.width, renditionHeight: image.height, pixelPreservation: image.pixelPreservation, crop, box, effectiveNativePpi: round(ppi), effectiveRenditionPpi: round(renditionPpi), meets300Ppi: Math.min(ppi, renditionPpi) >= MIN_PPI, upscaledSource: asset.nativeWidth < asset.meta.width || asset.nativeHeight < asset.meta.height, mirror: false };
}
async function drawBackground(ctx, page, asset, crop, box, uses, pageId) {
  const image = await embeddedImage(ctx, asset, crop, 'background');
  // Preserve aspect ratio. Any outer edge overflow is clipped by the PDF page,
  // never stretched; the whole unmodified source remains pinned in the manifest.
  const factor = Math.max(box.widthPt / image.width, box.heightPt / image.height);
  const painted = { xPt: box.xPt + (box.widthPt - image.width * factor) / 2, yPt: box.yPt + (box.heightPt - image.height * factor) / 2, widthPt: image.width * factor, heightPt: image.height * factor };
  page.drawImage(image.image, { x: painted.xPt, y: painted.yPt, width: painted.widthPt, height: painted.heightPt });
  uses.push({ ...useRecord(asset, image, painted, pageId, 'background', crop), visibleBox: box });
}
async function drawCharacter(ctx, page, asset, layer, box, uses, pageId, options = {}) {
  const image = await embeddedImage(ctx, asset, 'full', layer.type, layer.status);
  const widthLimit = box.widthPt * layer.scale / 100;
  const anchor = layer.anchor || { x: 0.5, y: 1 };
  if (![anchor.x, anchor.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1) || anchor.y === 0) fail('Character anchor must be a normalized foot baseline.');
  const footY = box.yPt + box.heightPt * (1 - layer.y / 100);
  const copyHeightLimit = options.maxTopPt ? (options.maxTopPt - footY) / anchor.y : Infinity;
  const topHeightLimit = (box.yPt + box.heightPt - footY) / anchor.y;
  const bottomHeightLimit = anchor.y < 1 ? (footY - box.yPt) / (1 - anchor.y) : Infinity;
  const heightLimit = Math.min(box.heightPt * (options.maxHeightFraction || 0.64), copyHeightLimit, topHeightLimit, bottomHeightLimit);
  if (heightLimit < 30) fail('Copy leaves no usable character area.', 'art_overflow');
  const requestedScale = Math.min(widthLimit / image.width, box.heightPt * (options.maxHeightFraction || 0.64) / image.height);
  const copyLimitedScale = Math.min(requestedScale, copyHeightLimit / image.height);
  const scale = Math.min(widthLimit / image.width, heightLimit / image.height);
  const widthPt = image.width * scale, heightPt = image.height * scale;
  const rect = { xPt: box.xPt + box.widthPt * layer.x / 100 - widthPt * anchor.x, yPt: footY - (1 - anchor.y) * heightPt, widthPt, heightPt };
  if (rect.xPt < box.xPt - 0.01 || rect.yPt < box.yPt - 0.01 || rect.xPt + widthPt > box.xPt + box.widthPt + 0.01 || rect.yPt + heightPt > box.yPt + box.heightPt + 0.01) fail(`Character on ${pageId} would be clipped.`, 'art_overflow');
  page.drawImage(image.image, { x: rect.xPt, y: rect.yPt, width: widthPt, height: heightPt });
  uses.push({ ...useRecord(asset, image, rect, pageId, layer.type), assetId: layer.assetId, assetVersion: layer.assetVersion || null, requestedFacing: layer.facing || 'neutral', foregroundMaskPending: layer.layer === 'behind', anchor, adjustedToAvoidCopy: copyLimitedScale < requestedScale - 0.00001, adjustedToFitArtBox: scale < copyLimitedScale - 0.00001, adjustedForTransparencyPadding: bottomHeightLimit / image.height < Math.min(copyLimitedScale, topHeightLimit / image.height) - 0.00001, status: layer.status || asset.record.status, pose: layer.pose || null, requestedPlacement: { x: layer.x, y: layer.y, scale: layer.scale } });
  return rect;
}
function watermark(ctx, page, width, fontReport, suffix = '') {
  page.drawRectangle({ x: 0, y: 0, width, height: 23, color: INK });
  drawTextBlock(page, `${REVIEW_MARKER}${suffix}`, ctx.body, { xPt: 20, yPt: 6, widthPt: width - 40, heightPt: 13 }, fontReport, 'review-watermark', { size: 9, minSize: 8, color: rgb(1, 1, 1), align: 'center' });
}
async function renderInterior(book, assets, fonts, fingerprint) {
  const ctx = await documentWithFonts(fonts, `${book.title} interior`, fingerprint);
  const uses = [], pages = [];
  for (const entry of book.pages) {
    const page = ctx.document.addPage([PAGE_SIZE, PAGE_SIZE]);
    page.setBleedBox(0, 0, PAGE_SIZE, PAGE_SIZE); page.setTrimBox(9, 9, 612, 612);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_SIZE, height: PAGE_SIZE, color: CREAM });
    const textRuns = [], characterBoxes = [];
    const recipe = entry.renderLayout || {};
    const artBox = recipe.artBox || { xPt: 0, yPt: 0, widthPt: PAGE_SIZE, heightPt: PAGE_SIZE };
    const copyX = recipe.copyXPt ?? 48, copyWidth = recipe.copyWidthPt ?? 534, top = recipe.copyTopPt ?? 582;
    if (![artBox.xPt,artBox.yPt,artBox.widthPt,artBox.heightPt,copyX,copyWidth,top].every(Number.isFinite) || artBox.widthPt < 200 || artBox.heightPt < 200 || artBox.xPt < 0 || artBox.yPt < 0 || artBox.xPt+artBox.widthPt > PAGE_SIZE || artBox.yPt+artBox.heightPt > PAGE_SIZE || copyX < 45 || copyWidth < 130 || copyX+copyWidth > 585 || top > 590) fail('Invalid scene-aware review layout.', 'layout_out_of_bounds');
    for (const layer of entry.layers.filter(l => l.type === 'background')) await drawBackground(ctx, page, assets.get(layer.src), layer.crop, artBox, uses, entry.number);
    const title = entry.title || `Page ${entry.number}`;
    const titleFit = textLayout(title, ctx.heading, { width: copyWidth, height: 80, size: recipe.headingSize || 23, minSize: 16, leading: 1.15 });
    const bodyFit = textLayout(entry.text, ctx.body, { width: copyWidth, height: Math.min(recipe.maxBodyHeightPt || 216, top - 27 - titleFit.height - 14 - 10), size: recipe.bodySize || 18, minSize: 13, leading: 1.28 });
    const totalHeight = titleFit.height + bodyFit.height + 14;
    const panelBottom = top - totalHeight - 10;
    const copyPanel = { xPt: copyX-14, yPt: panelBottom, widthPt: copyWidth+28, heightPt: totalHeight+24 };
    if (panelBottom < 27) fail('Scene copy escaped its lower safe area.', 'text_overflow');
    for (const layer of entry.layers.filter(l => l.type !== 'background')) {
      const halfWidth = artBox.widthPt * layer.scale / 200, center = artBox.xPt + artBox.widthPt * layer.x / 100;
      const horizontalOverlap = center+halfWidth > copyPanel.xPt && center-halfWidth < copyPanel.xPt+copyPanel.widthPt;
      const overlapsArt = copyPanel.yPt + copyPanel.heightPt > artBox.yPt && copyPanel.yPt < artBox.yPt + artBox.heightPt;
      characterBoxes.push(await drawCharacter(ctx, page, assets.get(layer.src), layer, artBox, uses, entry.number, { maxTopPt: horizontalOverlap && overlapsArt ? panelBottom-12 : undefined }));
    }
    page.drawRectangle({ x: copyPanel.xPt, y: copyPanel.yPt, width: copyPanel.widthPt, height: copyPanel.heightPt, color: CREAM, opacity: 0.97 });
    drawTextBlock(page, title, ctx.heading, { xPt: copyX, yPt: top-titleFit.height, widthPt: copyWidth, heightPt: titleFit.height }, textRuns, 'title', { size: titleFit.size, minSize: titleFit.size, leading: 1.15 });
    drawTextBlock(page, entry.text, ctx.body, { xPt: copyX, yPt: top-titleFit.height-14-bodyFit.height, widthPt: copyWidth, heightPt: bodyFit.height }, textRuns, 'story', { size: bodyFit.size, minSize: bodyFit.size });
    drawTextBlock(page, `${entry.number} / 32`, ctx.body, { xPt: 550, yPt: 29, widthPt: 35, heightPt: 12 }, textRuns, 'folio', { size: 9, minSize: 9, color: TEAL });
    watermark(ctx, page, PAGE_SIZE, textRuns);
    pages.push({ pageNumber: entry.number, widthPt: PAGE_SIZE, heightPt: PAGE_SIZE, textRuns, copyPanel, artBox, possibleArtCopyOverlap: characterBoxes.some(box => box.xPt < copyPanel.xPt+copyPanel.widthPt && box.xPt+box.widthPt > copyPanel.xPt && box.yPt < copyPanel.yPt+copyPanel.heightPt && box.yPt+box.heightPt > copyPanel.yPt), missingBackground: !entry.layers.some(l => l.type === 'background') });
  }
  const compression = await optimizePdfImages(ctx.document);
  return { bytes: Buffer.from(await ctx.document.save({ useObjectStreams: false })), uses, pages, compression };
}

async function renderCover(book, assets, fonts, fingerprint, template) {
  const m = template.metadata;
  const ctx = await documentWithFonts(fonts, `${book.title} ${m.format} cover`, fingerprint);
  const page = ctx.document.addPage([m.widthPt, m.heightPt]);
  page.setBleedBox(0, 0, m.widthPt, m.heightPt);
  const uses = [], textRuns = [];
  page.drawRectangle({ x: 0, y: 0, width: m.widthPt, height: m.heightPt, color: CREAM });
  const background = book.pages.flatMap(p => p.layers).find(l => l.type === 'background');
  if (background) await drawBackground(ctx, page, assets.get(background.src), 'full', { xPt: 0, yPt: 0, widthPt: m.widthPt, heightPt: m.heightPt }, uses, `${m.format}-cover`);
  // Templates inform geometry only: guide PDF pages are never embedded or drawn.
  for (const key of ['back', 'front']) {
    const safe = m.safeAreas[key];
    page.drawRectangle({ x: safe.xPt - 8, y: safe.yPt - 8, width: safe.widthPt + 16, height: safe.heightPt + 16, color: CREAM, opacity: key === 'back' ? 0.94 : 0.86 });
  }
  const front = m.safeAreas.front, back = m.safeAreas.back;
  drawTextBlock(page, book.title, ctx.heading, { xPt: front.xPt + 14, yPt: front.yPt + front.heightPt - 156, widthPt: front.widthPt - 28, heightPt: 142 }, textRuns, 'cover-title', { size: 53, minSize: 32, leading: 1.05, align: 'center' });
  drawTextBlock(page, `Starring ${book.childName} and ${book.monsterName}`, ctx.body, { xPt: front.xPt + 15, yPt: front.yPt + front.heightPt - 209, widthPt: front.widthPt - 30, heightPt: 55 }, textRuns, 'cover-personalization', { size: 20, minSize: 14, align: 'center' });
  const monster = book.pages.flatMap(p => p.layers).find(l => l.type === 'monster');
  const child = book.pages.flatMap(p => p.layers).find(l => l.type === 'child');
  const personalizationBottom = Math.min(...textRuns.filter(run => run.label === 'cover-personalization').map(run => run.yPt));
  const coverArtOptions = { maxHeightFraction: 0.95, maxTopPt: personalizationBottom - 12 };
  const artBox = { xPt: front.xPt + 15, yPt: front.yPt + 40, widthPt: front.widthPt - 30, heightPt: front.heightPt - 240 };
  await drawCharacter(ctx, page, assets.get(monster.src), { ...monster, x: child ? 68 : 50, y: 94, scale: child ? 47 : 56 }, artBox, uses, `${m.format}-cover`, coverArtOptions);
  if (child) await drawCharacter(ctx, page, assets.get(child.src), { ...child, x: 27, y: 94, scale: 39 }, artBox, uses, `${m.format}-cover`, coverArtOptions);
  drawTextBlock(page, 'A MonstersNOW story', ctx.body, { xPt: front.xPt, yPt: front.yPt + 10, widthPt: front.widthPt, heightPt: 25 }, textRuns, 'cover-imprint', { size: 16, minSize: 16, align: 'center', color: TEAL });
  drawTextBlock(page, 'Big stories from little imaginations.', ctx.heading, { xPt: back.xPt + 22, yPt: back.yPt + back.heightPt - 140, widthPt: back.widthPt - 44, heightPt: 116 }, textRuns, 'back-heading', { size: 38, minSize: 28, leading: 1.12 });
  const excerpt = book.pages[3].text;
  drawTextBlock(page, excerpt, ctx.body, { xPt: back.xPt + 22, yPt: back.yPt + 140, widthPt: back.widthPt - 44, heightPt: back.heightPt - 310 }, textRuns, 'back-excerpt', { size: 19, minSize: 14 });
  drawTextBlock(page, `Made for ${book.childName}\nFeaturing the exact selected ${book.monsterName} artwork.`, ctx.body, { xPt: back.xPt + 22, yPt: back.yPt + 38, widthPt: back.widthPt - 44, heightPt: 75 }, textRuns, 'back-personalization', { size: 17, minSize: 13, color: TEAL });
  watermark(ctx, page, m.widthPt, textRuns, ` | ${m.format.toUpperCase()}`);
  const compression = await optimizePdfImages(ctx.document);
  return { bytes: Buffer.from(await ctx.document.save({ useObjectStreams: false })), uses, compression, pages: [{ pageNumber: 1, widthPt: m.widthPt, heightPt: m.heightPt, textRuns }] };
}

async function renderComposedBookPdf({ composition, assetResolver, fonts, templates, purpose } = {}) {
  if (purpose !== 'review-candidate') fail('Production export is closed. Verified final art, native 300 PPI sources, binding-specific geometry, trusted preflight, exact approvals, and immutable artifact storage are required; this renderer only exports review-candidate files.', 'production_export_blocked');
  if (typeof assetResolver !== 'function') fail('A trusted local asset resolver is required.');
  if (!fonts?.body || !fonts?.heading) fail('Local embeddable body and heading font bytes are required.');
  const { book, sources } = normalizeComposition(composition);
  verifyGlyphs([...book.pages.map(p => p.text), String(book.childName), String(book.monsterName), REVIEW_MARKER], fonts.body, 'body');
  verifyGlyphs([book.title, ...book.pages.map(p => p.title || `Page ${p.number}`)], fonts.heading, 'heading');
  for (const format of ['softcover', 'hardcover']) await validateTemplate(templates?.[format], format);
  const assets = new Map();
  for (const source of sources) assets.set(source, await readAsset(source, assetResolver));
  const records = [...assets.values()].map(a => a.record);
  const implementationSha256 = SHA(Buffer.concat([await fs.readFile(__filename), await fs.readFile(path.join(__dirname, 'pdf-image-compression.js'))]));
  const runtime = { node: process.version, pdfLib: require('pdf-lib/package.json').version, fontkit: require('@pdf-lib/fontkit/package.json').version, sharp: sharp.versions.sharp, vips: sharp.versions.vips };
  const input = { rendererVersion: VERSION, implementationSha256, runtime, purpose, compositionSha256: SHA(canonicalJson(book)), assets: records, fonts: { body: SHA(fonts.body), heading: SHA(fonts.heading) }, templates: Object.fromEntries(Object.entries(templates).map(([format, t]) => [format, t.metadata])) };
  const renderFingerprint = SHA(canonicalJson(input));
  const interior = await renderInterior(book, assets, fonts, renderFingerprint);
  const covers = {};
  for (const format of ['softcover', 'hardcover']) covers[format] = await renderCover(book, assets, fonts, renderFingerprint, templates[format]);
  const uses = [...interior.uses, ...covers.softcover.uses, ...covers.hardcover.uses];
  const blockers = [
    { code: 'review_only', detail: 'Candidate files are watermarked and cannot be approved or submitted as production artifacts.' },
    { code: 'unapproved_art', detail: 'Final character art, front matter, original drawing pages, scene poses, cover design, and background masters require art approval.' },
    { code: 'scene_layout_review', detail: 'Verify supporting faces, story clues, ground contact, and page-specific copy zones; geometric bounds alone do not prove clear storytelling.' },
    { code: 'trusted_preflight_missing', detail: 'No independent trusted prepress report for these exact PDF bytes.' },
    { code: 'exact_approvals_missing', detail: 'No customer or administrator approval of this exact interior-and-cover artifact set.' },
    { code: 'immutable_hosting_missing', detail: 'No trusted immutable artifact hosting or authenticated printer handoff.' },
  ];
  if (records.some(r => r.fixture)) blockers.push({ code: 'sample_fixture_art', detail: 'At least one selected asset is a labeled review fixture, never final child artwork.' });
  if (uses.some(use => use.adjustedForTransparencyPadding)) blockers.push({ code: 'character_padding_placement_review', detail: 'Transparent canvas padding required a smaller character placement to keep every source pixel inside the art box. Review its visible size and framing.', uses: uses.filter(use => use.adjustedForTransparencyPadding).map(use => ({ page: use.page, role: use.role, assetId: use.assetId })) });
  const missingPoses = book.pages.flatMap(page => page.layers.filter(layer => layer.type === 'child' && layer.requestedPose && layer.requestedPose !== layer.pose).map(layer => ({ page: page.number, requestedPose: layer.requestedPose, actualPose: layer.pose || null, assetId: layer.assetId })));
  if (missingPoses.length) blockers.push({ code: 'missing_scene_poses', detail: 'Selected child art falls back to a different candidate pose; the requested scene poses remain unapproved.', uses: missingPoses });
  const lowRes = uses.filter(u => !u.meets300Ppi);
  if (lowRes.length) blockers.push({ code: 'native_resolution_below_300_ppi', detail: 'The lower of native source detail and encoded rendition resolution must meet 300 PPI. Upsampling does not restore missing native detail.', uses: lowRes.map(u => ({ page: u.page, role: u.role, effectiveNativePpi: u.effectiveNativePpi, effectiveRenditionPpi: u.effectiveRenditionPpi })) });
  if (interior.pages.some(p => p.missingBackground)) blockers.push({ code: 'missing_frontmatter_backgrounds', pages: interior.pages.filter(p => p.missingBackground).map(p => p.pageNumber) });
  if (interior.pages.some(p => p.possibleArtCopyOverlap)) blockers.push({ code: 'art_copy_overlap_review', pages: interior.pages.filter(p => p.possibleArtCopyOverlap).map(p => p.pageNumber) });
  if (uses.some(u => u.foregroundMaskPending)) blockers.push({ code: 'foreground_masks_missing', detail: 'Behind-layer placements need approved occlusion masks; the original character remains intact.' });
  if ([...assets.values()].some(a => a.isOpaque && book.pages.some(p => p.layers.some(l => l.type !== 'background' && l.src === a.source)))) blockers.push({ code: 'character_cutout_missing', detail: 'Nontransparent character reference image is preserved exactly; approved transparent cutouts are still required.' });
  const artifactRecord = (result, filename) => ({ filename, sha256: SHA(result.bytes), byteLength: result.bytes.length, pageCount: result.pages.length, widthPt: result.pages[0].widthPt, heightPt: result.pages[0].heightPt });
  const manifest = { schemaVersion: 'composed-review-candidate-v1', purpose, reviewOnly: true, productionReady: false, readyForSubmission: false, rendererVersion: VERSION, implementationSha256, runtime, artifactSetId: `review-${renderFingerprint.slice(0, 24)}`, renderFingerprint, compositionSha256: input.compositionSha256,
    identity: { storyId: book.storyId || null, masterVersion: book.masterVersion || book.manuscriptVersion || null, selectedPreviewId: book.pages.flatMap(p => p.layers).find(l => l.type === 'monster').assetId, childCharacterId: book.childCharacter?.id || 'none', childName: book.childName, monsterName: book.monsterName },
    fonts: input.fonts, templates: input.templates, assets: records, assetUses: uses, blockers,
    artifacts: { interior: artifactRecord(interior, 'interior-review-candidate.pdf'), softcover: artifactRecord(covers.softcover, 'paperback-cover-review-candidate.pdf'), hardcover: artifactRecord(covers.hardcover, 'hardcover-cover-review-candidate.pdf') },
    losslessImageCompression: { interior: interior.compression, softcover: covers.softcover.compression, hardcover: covers.hardcover.compression },
    layout: { interior: interior.pages, softcover: covers.softcover.pages, hardcover: covers.hardcover.pages },
    verification: { scope: 'local-renderer-self-check-only', independentPrintPreflightPassed: false, embeddedFonts: true, textLayoutBounded: true, templateGuideArtworkIncluded: false, pdfDatesFixedForReproducibility: true },
  };
  manifest.manifestSha256 = SHA(canonicalJson(manifest));
  return { interior: interior.bytes, covers: { softcover: covers.softcover.bytes, hardcover: covers.hardcover.bytes }, manifest };
}
module.exports = { VERSION, REVIEW_MARKER, PAGE_SIZE, canonicalJson, createLocalAssetResolver, renderComposedBookPdf };
