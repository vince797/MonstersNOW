/*
 * Personalized storybook print compositor (renderer "personalized-composite-v1").
 *
 * Interior: one PDF page per book page at Lulu's full-bleed size
 * (8.5 x 8.5 in trim -> 8.75 x 8.75 in page). Each page is
 *   background plate -> child -> monster -> panels/frames
 * flattened into one opaque 300 PPI JPEG, with story text drawn on top as
 * vector type in embedded TrueType fonts. TrimBox/BleedBox are set.
 *
 * Cover: one-page back + spine + front spread sized by Lulu's published
 * formula (or Lulu's /cover-dimensions/ answer when it agrees), softcover
 * (0.125 in bleed) or hardcover casewrap (0.75 in wrap).
 *
 * The book layout is generic; per-title differences live in lib/print-books.
 */
const fs = require("node:fs");
const path = require("node:path");
const { createPrintPdfDocument, drawFontText, placeImage } = require("./pdf-writer");
const { measureText, parseTrueType, unsupportedCharacters } = require("./truetype-font");
const {
  PRINT_DPI,
  calculateCoverLayout,
  getInteriorSpec,
  interiorSafeBoxInches,
  reconcileCoverDimensions,
} = require("./lulu-print-specs");
const {
  decodeImage,
  drawCover,
  drawCutout,
  drawPlaceholderBackground,
  drawProofStamp,
  encodeJpeg,
  newCanvas,
  prepareCutout,
  roundedRectPath,
} = require("./print-raster");
const { getPrintBookConfig, templateForPage } = require("./print-books");
const { loadAssetSource } = require("./print-assets");
const {
  DEFAULT_STORYBOOK_PAGE_COUNT,
  getStorybookProductVariant,
  validateStorybookPageCount,
} = require("./lulu-products");

const RENDERER_VERSION = "personalized-composite-v1";
const { repoRoot } = require("./repo-root");

const ROOT = repoRoot();
const MIN_PPI = PRINT_DPI - 0.5;
const JPEG_QUALITY = 92;
const FONT_RESOURCES = { body: "FBody", bodyBold: "FBodyBold", display: "FDisplay" };
const fontCache = new Map();

function loadFonts(config) {
  const fonts = {};
  for (const [role, file] of Object.entries(config.fonts)) {
    const absolute = path.join(ROOT, file);
    if (!fontCache.has(absolute)) fontCache.set(absolute, parseTrueType(fs.readFileSync(absolute)));
    fonts[role] = fontCache.get(absolute);
  }
  return fonts;
}

/* ----------------------------- text layout ----------------------------- */

function wrapLines(font, text, size, maxWidthPt) {
  const lines = [];
  String(text).split(/\n/).forEach((rawLine) => {
    const words = rawLine.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || measureText(font, candidate, size) <= maxWidthPt) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  });
  return lines;
}

/** Lay out blocks of text (each block: {text, role, size, color}) centred or left-aligned. */
function layoutBlocks(fonts, blocks, maxWidthPt, { leading = 1.3, gap = 0.45 } = {}) {
  const laid = [];
  let height = 0;
  blocks.forEach((block, index) => {
    const font = fonts[block.role];
    const lines = wrapLines(font, block.text, block.size, maxWidthPt);
    if (index > 0) height += block.size * (block.gap ?? gap);
    lines.forEach((line) => {
      height += block.size * leading;
      laid.push({ ...block, line, baselineFromTop: height - block.size * (leading - 1) / 2 - block.size * 0.22 });
    });
  });
  return { lines: laid, heightPt: height };
}

function emitLines(fonts, laid, { leftPt, topPt, widthPt, pageHeightPt, align = "left" }) {
  return laid.lines.map((entry) => {
    const font = fonts[entry.role];
    const lineWidth = measureText(font, entry.line, entry.size);
    const x = align === "center" ? leftPt + (widthPt - lineWidth) / 2 : leftPt;
    const y = pageHeightPt - (topPt + entry.baselineFromTop);
    return drawFontText(FONT_RESOURCES[entry.role], font, entry.line, x, y, entry.size, hexToRgb(entry.color));
  }).join("\n");
}

function storyBlocks(text, size, color) {
  return String(text).split(/\n\s*\n/).map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean)
    .map((paragraph) => ({ text: paragraph, role: "body", size, color }));
}

function frontMatterBlocks(text, styles) {
  const lines = String(text).split(/\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => ({ text: line, ...styles[Math.min(index, styles.length - 1)] }));
}

/* --------------------------- character placement --------------------------- */

function placeCharacter({ cutout, placement, kind, config, spec, limits }) {
  const trim = spec.trimBox;
  const aspect = config.characterZones[kind].aspect;
  const zoneW = trim.width * placement.scale / 100;
  const zoneH = zoneW / aspect;
  const cx = trim.x + trim.width * placement.x / 100;
  let baseline = Math.min(trim.y + trim.height * placement.y / 100, limits.bottom);
  let scale = Math.min(zoneW / cutout.width, zoneH / cutout.height);
  let width = cutout.width * scale;
  let height = cutout.height * scale;
  let fit = 1;
  const notes = [];
  if (baseline - height < limits.top) {
    fit = Math.max(0.05, (baseline - limits.top) / height);
    if (fit < config.minCharacterFit) notes.push(`${kind} shrunk to ${(fit * 100).toFixed(0)}% to clear the text card`);
    width *= fit;
    height *= fit;
  }
  let x = cx - width / 2;
  const minX = limits.left;
  const maxX = limits.right - width;
  if (x < minX || x > maxX) {
    notes.push(`${kind} shifted inside the safe area`);
    x = Math.min(Math.max(x, minX), Math.max(minX, maxX));
  }
  const mirror = placement.facing !== "neutral" && placement.facing !== config.sourceFacing[kind];
  return { box: { x, y: baseline - height, width, height }, fit, mirror, notes, layer: placement.layer || "front", kind };
}

/* ------------------------------ interior ------------------------------ */

/**
 * @param {object} options
 * @param {object} options.book   personalized manifest (buildPersonalizedBook) with pages[].text/monster/child
 * @param {object} options.sources asset sources: backgrounds{[page]}, monster, child, originalDrawing
 * @param {"production"|"proof"} options.mode production throws on any blocker
 */
async function renderStorybookInteriorPdf({ book, sources = {}, format, pageCount, mode = "proof", creationDate = new Date(0), config: configOverride } = {}) {
  const variant = getStorybookProductVariant(format);
  const count = Number.parseInt(pageCount || book?.pages?.length || DEFAULT_STORYBOOK_PAGE_COUNT, 10);
  validateStorybookPageCount(variant, count);
  if (!book || !Array.isArray(book.pages) || book.pages.length !== count) {
    throw productionError(`The personalized book must have exactly ${count} pages.`);
  }
  const config = configOverride || getPrintBookConfig(book.storySlug, { title: book.title });
  const spec = getInteriorSpec(variant, count);
  const fonts = loadFonts(config);
  const report = { renderer: RENDERER_VERSION, type: "interior", mode, storySlug: config.slug, spec, pages: [], warnings: [], blockers: [] };

  const allText = book.pages.map((page) => page.text).join("\n");
  const missingGlyphs = [...new Set(Object.values(fonts).flatMap((font) => unsupportedCharacters(font, allText)))];
  if (missingGlyphs.length) throw productionError(`The print font cannot render: ${missingGlyphs.join(" ")}`);

  const [monster, child, original] = await Promise.all([
    loadCutout(sources.monster, "monster", report),
    loadCutout(sources.child, "child", report),
    sources.originalDrawing ? loadAssetSource(sources.originalDrawing, "original drawing").then((asset) => decodeImage(asset.buffer, "original drawing")) : null,
  ]);
  const backgroundCache = new Map();

  const pdfPages = [];
  const images = {};
  for (const page of book.pages) {
    const pageReport = { number: page.number, template: templateForPage(config, page.number), notes: [] };
    const { canvas, ctx } = newCanvas(spec.pageWidthPx, spec.pageHeightPx);
    await paintBackground(ctx, page, sources.backgrounds?.[page.number], backgroundCache, spec, config, pageReport);
    const textOps = await composePage({ ctx, page, spec, config, fonts, monster, child, original, pageReport, report });
    collectPageIssues(pageReport, report, page.number);
    if (mode !== "production" && pageReport.issues.length) {
      const safe = interiorSafeBoxInches(spec, page.number);
      drawProofStamp(ctx, `PROOF · p${page.number}: ${pageReport.issues[0]}`, safe.x * PRINT_DPI, (safe.y + safe.height) * PRINT_DPI - 54, safe.width * PRINT_DPI);
    }
    const name = `Im${page.number}`;
    images[name] = { data: await encodeJpeg(canvas, JPEG_QUALITY), width: canvas.width, height: canvas.height, components: 3 };
    pageReport.imagePixels = [canvas.width, canvas.height];
    pdfPages.push({
      width: spec.pageWidthPt,
      height: spec.pageHeightPt,
      bleedBox: [0, 0, spec.pageWidthPt, spec.pageHeightPt],
      trimBox: boxToPdf(spec.trimBox, spec.pageHeightIn),
      content: [placeImage(name, 0, 0, spec.pageWidthPt, spec.pageHeightPt), textOps].filter(Boolean).join("\n"),
    });
    report.pages.push(pageReport);
  }

  if (mode === "production" && report.blockers.length) {
    const error = productionError(`Interior is not print-ready: ${report.blockers.slice(0, 5).join("; ")}${report.blockers.length > 5 ? "…" : ""}`);
    error.report = report;
    throw error;
  }
  const pdf = createPrintPdfDocument({
    pages: pdfPages,
    fonts: Object.fromEntries(Object.entries(fonts).map(([role, font]) => [FONT_RESOURCES[role], font])),
    images,
    creationDate,
    info: { title: `${book.title || config.title} — interior`, subject: `${count}-page ${spec.trimWidthIn} x ${spec.trimHeightIn} in interior with 0.125 in bleed (${variant.podPackageId})` },
  });
  report.bytes = pdf.length;
  return { pdf, report };
}

async function loadCutout(source, kind, report) {
  if (!source) return null;
  const asset = await loadAssetSource(source, kind);
  const image = await decodeImage(asset.buffer, kind);
  const cutout = prepareCutout(image, { label: kind });
  report[`${kind}Asset`] = { origin: asset.origin, ...cutout.report };
  if (cutout.report.warning) report.warnings.push(cutout.report.warning);
  return cutout;
}

async function paintBackground(ctx, page, source, cache, spec, config, pageReport) {
  const dest = { x: 0, y: 0, width: spec.pageWidthPx, height: spec.pageHeightPx };
  if (!source) {
    drawPlaceholderBackground(ctx, dest, {
      title: "PLACEHOLDER BACKGROUND",
      lines: [`Page ${page.number} needs a child-free, monster-free plate`, `${spec.pageWidthPx} x ${spec.pageHeightPx} px (8.75 in at 300 PPI) or half of a ${spec.pageWidthPx * 2} x ${spec.pageHeightPx} px spread`],
      palette: config.palette,
      // Story pages: between the text card and the characters. Front matter:
      // below the title/frame content.
      labelY: templateForPage(config, page.number) === "story" ? 0.3 : 0.8,
    });
    pageReport.background = { placeholder: true };
    return;
  }
  const key = source.path || source.url || source.label;
  if (!cache.has(key)) {
    const asset = await loadAssetSource(source, `page ${page.number} background`);
    cache.set(key, { image: await decodeImage(asset.buffer, `page ${page.number} background`), origin: asset.origin, label: asset.label });
  }
  const { image, origin, label } = cache.get(key);
  // Two-page spreads (≈2:1) are split: even pages are left-hand pages.
  const isSpread = image.width / image.height >= 1.8;
  const half = image.width / 2;
  const sourceRect = isSpread
    ? { x: page.number % 2 === 0 ? 0 : half, y: 0, width: half, height: image.height }
    : null;
  const placed = drawCover(ctx, image, dest, { sourceRect });
  pageReport.background = { placeholder: false, origin, label, spreadHalf: isSpread ? (page.number % 2 === 0 ? "left" : "right") : null, sourcePixels: [image.width, image.height], effectivePpi: placed.effectivePpi };
}

async function composePage({ ctx, page, spec, config, fonts, monster, child, original, pageReport }) {
  const template = pageReport.template;
  const safe = interiorSafeBoxInches(spec, page.number);
  const px = (inches) => inches * PRINT_DPI;
  const pal = config.palette;
  const typo = config.typography;
  const pad = typo.panelPaddingIn;
  const innerWidthPt = (safe.width - pad * 2) * 72;
  const limitsFor = (top) => ({ top, bottom: safe.y + safe.height, left: safe.x, right: safe.x + safe.width });

  const drawPanel = (box) => {
    ctx.fillStyle = pal.panel;
    roundedRectPath(ctx, px(box.x), px(box.y), px(box.width), px(box.height), px(0.18));
    ctx.fill();
  };
  const textAt = (laid, box, align) => emitLines(fonts, laid, {
    leftPt: (box.x + pad) * 72, topPt: (box.y + pad) * 72, widthPt: (box.width - pad * 2) * 72, pageHeightPt: spec.pageHeightPt, align,
  });
  const drawCharacters = (top) => {
    const placed = [];
    if (page.child) {
      if (child) placed.push(placeCharacter({ cutout: child, placement: page.child, kind: "child", config, spec, limits: limitsFor(top) }));
      else pageReport.notes.push("child asset missing");
    }
    if (page.monster) {
      if (monster) placed.push(placeCharacter({ cutout: monster, placement: page.monster, kind: "monster", config, spec, limits: limitsFor(top) }));
      else pageReport.notes.push("monster asset missing");
    }
    placed.sort((a, b) => (a.layer === "behind" ? 0 : 1) - (b.layer === "behind" ? 0 : 1));
    for (const item of placed) {
      const cutout = item.kind === "child" ? child : monster;
      const ppi = drawCutout(ctx, cutout, { x: px(item.box.x), y: px(item.box.y), width: px(item.box.width), height: px(item.box.height) }, { mirror: item.mirror });
      pageReport[item.kind] = { effectivePpi: ppi, boxIn: roundBox(item.box), fit: Number(item.fit.toFixed(3)), mirrored: item.mirror, layer: item.layer };
      pageReport.notes.push(...item.notes);
    }
  };

  if (template === "story") {
    let size = typo.storySize;
    let laid;
    const maxPanel = typo.panelMaxHeightIn;
    for (; size >= typo.storyMinSize; size -= 0.5) {
      laid = layoutBlocks(fonts, storyBlocks(page.text, size, pal.ink), innerWidthPt, { leading: typo.storyLeading, gap: typo.paragraphGap });
      if (laid.heightPt / 72 + pad * 2 <= maxPanel) break;
    }
    if (size < typo.storyMinSize) {
      size = typo.storyMinSize;
      pageReport.notes.push("story text overflows the text card at the minimum size");
    }
    const panelH = laid.heightPt / 72 + pad * 2;
    const atTop = config.textPanel.position !== "bottom";
    const panel = { x: safe.x, y: atTop ? safe.y : safe.y + safe.height - panelH, width: safe.width, height: panelH };
    if (!laid.lines.length) {
      drawCharacters(safe.y);
      pageReport.text = { fontSize: 0, lines: 0 };
      return "";
    }
    drawCharacters(atTop ? panel.y + panel.height + 0.1 : safe.y);
    drawPanel(panel);
    pageReport.text = { fontSize: size, lines: laid.lines.length, panelIn: roundBox(panel) };
    return textAt(laid, panel, "left");
  }

  const styles = {
    "half-title": [{ role: "display", size: 40, color: pal.ink }, { role: "bodyBold", size: 18, color: pal.accent }],
    "title-dedication": [{ role: "display", size: 32, color: pal.ink }, { role: "bodyBold", size: 19, color: pal.accent }, { role: "body", size: 16, color: pal.ink }],
    copyright: [{ role: "body", size: 13, color: pal.ink }],
    "meet-monster": [{ role: "display", size: 36, color: pal.ink }, { role: "bodyBold", size: 19, color: pal.accent }, { role: "body", size: 16, color: pal.ink }],
  }[template];
  if (!styles) throw productionError(`Unknown print template ${template}.`);
  const laid = layoutBlocks(fonts, frontMatterBlocks(page.text, styles), innerWidthPt, { leading: 1.28, gap: 0.5 });
  const panelH = laid.heightPt / 72 + pad * 2;
  const panel = { x: safe.x, y: template === "copyright" ? safe.y + (safe.height - panelH) / 2 : safe.y, width: safe.width, height: panelH };
  pageReport.text = { lines: laid.lines.length, panelIn: roundBox(panel) };
  let extraText = "";

  if (template === "half-title") {
    drawCharacters(panel.y + panel.height + 0.15);
  } else if (template === "title-dedication") {
    const frame = { width: 3.0, height: 3.4 };
    frame.x = safe.x + (safe.width - frame.width) / 2;
    frame.y = Math.min(safe.y + safe.height - frame.height, panel.y + panel.height + 0.35);
    pageReport.frame = drawFramedImage(ctx, original ? { image: original } : monster ? { cutout: monster } : null, frame, pal);
    if (!original) pageReport.notes.push("original drawing missing; framed the monster instead");
  } else if (template === "meet-monster") {
    const gap = 0.35;
    const labelH = 0.42;
    const frameW = (safe.width - gap) / 2;
    const frameTop = panel.y + panel.height + 0.3;
    const frameH = Math.min(frameW * 1.12, safe.y + safe.height - labelH - 0.1 - frameTop);
    const left = { x: safe.x, y: frameTop, width: frameW, height: frameH };
    const right = { x: safe.x + frameW + gap, y: frameTop, width: frameW, height: frameH };
    pageReport.frames = [
      drawFramedImage(ctx, original ? { image: original } : null, left, pal),
      drawFramedImage(ctx, monster ? { cutout: monster } : null, right, pal),
    ];
    if (!original) pageReport.notes.push("original drawing missing");
    const labels = [config.copy.meetDrawingLabel, config.copy.meetMonsterLabel];
    [left, right].forEach((frame, index) => {
      const label = { x: frame.x + frame.width * 0.12, y: frame.y + frame.height + 0.1, width: frame.width * 0.76, height: labelH };
      drawPanel(label);
      const labelLaid = layoutBlocks(fonts, [{ text: labels[index], role: "bodyBold", size: 15, color: pal.accent }], label.width * 72, { leading: 1.2 });
      extraText += `\n${emitLines(fonts, labelLaid, { leftPt: label.x * 72, topPt: (label.y + (labelH - labelLaid.heightPt / 72) / 2) * 72, widthPt: label.width * 72, pageHeightPt: spec.pageHeightPt, align: "center" })}`;
    });
  }
  drawPanel(panel);
  return textAt(laid, panel, "center") + extraText;
}

function drawFramedImage(ctx, content, frame, pal) {
  const px = (inches) => inches * PRINT_DPI;
  const border = 0.12;
  ctx.save();
  ctx.fillStyle = pal.frame;
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = px(0.08);
  roundedRectPath(ctx, px(frame.x), px(frame.y), px(frame.width), px(frame.height), px(0.16));
  ctx.fill();
  ctx.restore();
  const inner = { x: px(frame.x + border), y: px(frame.y + border), width: px(frame.width - border * 2), height: px(frame.height - border * 2) };
  if (!content) {
    ctx.fillStyle = "#e9e3d6";
    ctx.fillRect(inner.x, inner.y, inner.width, inner.height);
    return { placeholder: true };
  }
  const source = content.cutout ? content.cutout.canvas : content.image;
  const scale = Math.min(inner.width / source.width, inner.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  ctx.drawImage(source, inner.x + (inner.width - width) / 2, inner.y + (inner.height - height) / 2, width, height);
  return { effectivePpi: Math.round(PRINT_DPI / scale * 10) / 10 };
}

function collectPageIssues(pageReport, report, number) {
  const issues = [];
  if (pageReport.background?.placeholder) issues.push("placeholder background");
  else if (pageReport.background && pageReport.background.effectivePpi < MIN_PPI) issues.push(`background ${pageReport.background.effectivePpi} PPI (< 300)`);
  for (const kind of ["child", "monster"]) {
    if (pageReport[kind] && pageReport[kind].effectivePpi < MIN_PPI) issues.push(`${kind} ${pageReport[kind].effectivePpi} PPI (< 300)`);
  }
  for (const frame of [pageReport.frame, ...(pageReport.frames || [])].filter(Boolean)) {
    if (frame.placeholder) issues.push("empty frame");
    else if (frame.effectivePpi < MIN_PPI) issues.push(`framed image ${frame.effectivePpi} PPI (< 300)`);
  }
  for (const note of pageReport.notes) if (/missing|overflows/.test(note)) issues.push(note);
  pageReport.issues = issues;
  issues.forEach((issue) => report.blockers.push(`page ${number}: ${issue}`));
  pageReport.notes.filter((note) => !/missing|overflows/.test(note)).forEach((note) => report.warnings.push(`page ${number}: ${note}`));
}

/* -------------------------------- cover -------------------------------- */

async function renderStorybookCoverPdf({ book, sources = {}, format, pageCount, coverDimensions = null, mode = "proof", creationDate = new Date(0), config: configOverride } = {}) {
  const variant = getStorybookProductVariant(format);
  const count = Number.parseInt(pageCount || DEFAULT_STORYBOOK_PAGE_COUNT, 10);
  validateStorybookPageCount(variant, count);
  const config = configOverride || getPrintBookConfig(book?.storySlug, { title: book?.title });
  const layout = reconcileCoverDimensions(calculateCoverLayout(variant, count), coverDimensions);
  const fonts = loadFonts(config);
  const pal = config.palette;
  const report = { renderer: RENDERER_VERSION, type: "cover", mode, storySlug: config.slug, layout, warnings: [], blockers: [] };
  const childName = book?.childName || "Child";
  const monsterName = book?.monsterName || "Monster";
  const personalize = (value) => String(value || "").replaceAll("{child_name}", childName).replaceAll("{monster_name}", monsterName);
  const px = (inches) => inches * PRINT_DPI;

  const { canvas, ctx } = newCanvas(layout.widthPx, layout.heightPx);
  const full = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  if (sources.coverWrap) {
    const asset = await loadAssetSource(sources.coverWrap, "cover wrap art");
    const placed = drawCover(ctx, await decodeImage(asset.buffer, "cover wrap art"), full);
    report.wrap = { origin: asset.origin, effectivePpi: placed.effectivePpi };
    if (placed.effectivePpi < MIN_PPI) report.blockers.push(`cover wrap art ${placed.effectivePpi} PPI (< 300)`);
  } else {
    drawPlaceholderBackground(ctx, full, {
      title: "PLACEHOLDER COVER WRAP",
      lines: [`${layout.binding}: full back + spine + front art needed`, `${layout.widthPx} x ${layout.heightPx} px (${layout.widthIn.toFixed(3)} x ${layout.heightIn.toFixed(3)} in at 300 PPI)`],
      palette: pal,
      // Label the back panel, below the blurb card (front art covers the front).
      labelX: (layout.back.x + layout.back.width / 2) / layout.widthIn,
      labelY: 0.78,
    });
    report.blockers.push("placeholder cover wrap background");
    if (sources.coverFront) {
      const asset = await loadAssetSource(sources.coverFront, "front cover art");
      const frontArea = { x: px(layout.front.x), y: 0, width: canvas.width - px(layout.front.x), height: canvas.height };
      const placed = drawCover(ctx, await decodeImage(asset.buffer, "front cover art"), frontArea);
      report.front = { origin: asset.origin, effectivePpi: placed.effectivePpi };
      if (placed.effectivePpi < MIN_PPI) report.blockers.push(`front cover art ${placed.effectivePpi} PPI (< 300)`);
    }
  }

  const safe = layout.frontSafe;
  const titleSize = fitSize(fonts.display, config.coverTitleLines, safe.width * 72 * 0.94, 60, 30);
  const titleBlocks = [
    { text: config.copy.imprint, role: "bodyBold", size: 13, color: pal.coverAccent },
    ...config.coverTitleLines.map((line, index) => ({ text: line, role: "display", size: titleSize, color: pal.coverTitle, gap: index === 0 ? 0.35 : 0 })),
  ];
  const titleLaid = layoutBlocks(fonts, titleBlocks, safe.width * 72, { leading: 1.12, gap: 0.35 });
  const bandBottom = safe.y + titleLaid.heightPt / 72 + 0.2;
  ctx.fillStyle = pal.coverBand;
  ctx.fillRect(px(layout.front.x), 0, canvas.width - px(layout.front.x), px(bandBottom));

  const starring = personalize(config.copy.starring);
  const starLaid = layoutBlocks(fonts, [{ text: starring, role: "bodyBold", size: 20, color: pal.coverTitle }], safe.width * 72 - 40, { leading: 1.2 });
  const pillH = starLaid.heightPt / 72 + 0.24;
  const pill = { x: safe.x, y: safe.y + safe.height - pillH, width: safe.width, height: pillH };
  const monsterArea = { top: bandBottom + 0.2, bottom: pill.y - 0.15 };

  if (sources.monster) {
    const cutout = await loadCutout(sources.monster, "monster", report);
    const targetH = Math.min(layout.front.height * 0.62, monsterArea.bottom - monsterArea.top);
    const scale = Math.min(targetH / cutout.height, (safe.width * 0.92) / cutout.width);
    const box = { width: cutout.width * scale, height: cutout.height * scale };
    box.x = safe.x + (safe.width - box.width) / 2;
    box.y = monsterArea.bottom - box.height;
    const ppi = drawCutout(ctx, cutout, { x: px(box.x), y: px(box.y), width: px(box.width), height: px(box.height) });
    report.monster = { effectivePpi: ppi, boxIn: roundBox(box) };
    if (ppi < MIN_PPI) report.blockers.push(`cover monster ${ppi} PPI (< 300)`);
  } else {
    report.blockers.push("cover monster missing");
  }
  ctx.fillStyle = pal.coverBand;
  roundedRectPath(ctx, px(pill.x), px(pill.y), px(pill.width), px(pill.height), px(pill.height / 2));
  ctx.fill();

  const back = layout.backSafe;
  const backLaid = layoutBlocks(fonts, [
    { text: personalize(config.copy.backCover), role: "body", size: 17, color: pal.ink },
    { text: config.copy.backCoverCredit, role: "bodyBold", size: 11, color: pal.accent, gap: 1.2 },
  ], (back.width - 0.6) * 72, { leading: 1.36 });
  const backPanel = { x: back.x, y: back.y + (back.height - (backLaid.heightPt / 72 + 0.5)) / 2, width: back.width, height: backLaid.heightPt / 72 + 0.5 };
  ctx.fillStyle = pal.panel;
  roundedRectPath(ctx, px(backPanel.x), px(backPanel.y), px(backPanel.width), px(backPanel.height), px(0.2));
  ctx.fill();

  if (mode !== "production" && report.blockers.length) {
    drawProofStamp(ctx, `PROOF · ${report.blockers[0]}`, px(back.x), px(back.y), px(back.width));
  }
  const image = await encodeJpeg(canvas, JPEG_QUALITY);
  const heightPt = layout.heightPt;
  const textOps = [
    emitLines(fonts, titleLaid, { leftPt: safe.x * 72, topPt: safe.y * 72, widthPt: safe.width * 72, pageHeightPt: heightPt, align: "center" }),
    emitLines(fonts, starLaid, { leftPt: pill.x * 72, topPt: (pill.y + 0.12) * 72, widthPt: pill.width * 72, pageHeightPt: heightPt, align: "center" }),
    emitLines(fonts, backLaid, { leftPt: (backPanel.x + 0.3) * 72, topPt: (backPanel.y + 0.25) * 72, widthPt: (backPanel.width - 0.6) * 72, pageHeightPt: heightPt, align: "center" }),
  ];
  report.spineText = layout.spineTextAllowed ? "allowed" : `omitted (Lulu: no spine text at ${layout.pageCount} pages)`;

  if (mode === "production" && report.blockers.length) {
    const error = productionError(`Cover is not print-ready: ${report.blockers.join("; ")}`);
    error.report = report;
    throw error;
  }
  const outer = layout.outerMarginIn;
  const pdf = createPrintPdfDocument({
    pages: [{
      width: layout.widthPt,
      height: heightPt,
      bleedBox: [0, 0, layout.widthPt, heightPt],
      trimBox: [outer * 72, outer * 72, layout.widthPt - outer * 72, heightPt - outer * 72],
      content: [placeImage("ImCover", 0, 0, layout.widthPt, heightPt), ...textOps].join("\n"),
    }],
    fonts: Object.fromEntries(Object.entries(fonts).map(([role, font]) => [FONT_RESOURCES[role], font])),
    images: { ImCover: { data: image, width: canvas.width, height: canvas.height, components: 3 } },
    creationDate,
    info: { title: `${book?.title || config.title} — ${layout.binding} cover`, subject: `${layout.binding} cover, ${layout.pageCount} pages, spine ${layout.spineIn.toFixed(4)} in (${variant.podPackageId})` },
  });
  report.bytes = pdf.length;
  report.imagePixels = [canvas.width, canvas.height];
  return { pdf, report };
}

function fitSize(font, lines, maxWidthPt, max, min) {
  let size = max;
  while (size > min && lines.some((line) => measureText(font, line, size) > maxWidthPt)) size -= 1;
  return size;
}

/* ------------------------------- helpers ------------------------------- */

function boxToPdf(box, pageHeightIn) {
  return [box.x * 72, (pageHeightIn - box.y - box.height) * 72, (box.x + box.width) * 72, (pageHeightIn - box.y) * 72];
}

function roundBox(box) {
  return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 1000) / 1000]));
}

function hexToRgb(color) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(color));
  if (!match) return [0, 0, 0];
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function productionError(message) {
  const error = new Error(message);
  error.name = "ProductionError";
  error.status = 400;
  return error;
}

module.exports = {
  RENDERER_VERSION,
  renderStorybookCoverPdf,
  renderStorybookInteriorPdf,
  wrapLines,
};
