/*
 * Lulu Print API file specifications for MonstersNOW storybooks.
 *
 * Sources (public Lulu documentation, checked 2026-10-08):
 * - Lulu Book Creation Guide: https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf
 *   (0.125 in bleed on all sides, 0.5 in safety margin, 300-600 PPI images,
 *   embedded fonts, flattened transparency, single-page PDF, no marks/security,
 *   8.5 x 8.5 in trim -> 8.75 x 8.75 in interior page, gutter table, paperback
 *   spine formula, hardcover spine table, no spine text at 80 pages or fewer).
 * - Lulu Print API "How is spine width calculated?":
 *   https://help.api.lulu.com/en/support/solutions/articles/64000254616
 * - Lulu Print API "PDF Creation Settings":
 *   https://help.api.lulu.com/en/support/solutions/articles/64000254609
 * - Lulu "Creating Your Hardcover Casewrap Cover":
 *   https://help.lulu.com/en/support/solutions/articles/64000308572
 *   (0.75 in wrap on every outside edge, 0.125 in board overhang on the three
 *   open edges, ~0.25 in hinge beside the spine).
 *
 * Lulu does not require PDF/X; it asks for a high-quality print PDF with
 * embedded fonts, sRGB (or GRACoL CMYK) colour, and flattened transparency.
 * The Lulu `/cover-dimensions/` endpoint remains the source of truth at order
 * time; `reconcileCoverDimensions` refuses to build a cover when Lulu and this
 * formula disagree by more than a couple of points.
 */
const POINTS_PER_INCH = 72;
const PRINT_DPI = 300;
const MAX_PRINT_DPI = 600;
const BLEED_IN = 0.125;
const INTERIOR_SAFETY_IN = 0.5;
const COVER_SAFETY_IN = 0.5;
const SPINE_TEXT_CLEARANCE_IN = 0.125;
const MIN_PAGES_FOR_SPINE_TEXT = 81;
const CASEWRAP_WRAP_IN = 0.75;
const CASEWRAP_OVERHANG_IN = 0.125;
const CASEWRAP_HINGE_IN = 0.25;
const COVER_DIMENSION_TOLERANCE_PT = 2;

// Lulu Book Creation Guide, "Gutter Additions" (added to the inside safety margin).
const GUTTER_TABLE = [
  { maxPages: 60, extraIn: 0 },
  { maxPages: 150, extraIn: 0.125 },
  { maxPages: 400, extraIn: 0.5 },
  { maxPages: 600, extraIn: 0.625 },
  { maxPages: Infinity, extraIn: 0.75 },
];

// Lulu hardcover (casewrap / linen) spine table. Ranges follow the Book
// Creation Guide, which removes the overlapping boundaries in the API article.
const HARDCOVER_SPINE_TABLE = [
  [24, 84, 0.25], [85, 140, 0.5], [141, 168, 0.625], [169, 194, 0.6875],
  [195, 222, 0.75], [223, 250, 0.8125], [251, 278, 0.875], [279, 306, 0.9375],
  [307, 334, 1], [335, 360, 1.0625], [361, 388, 1.125], [389, 416, 1.1875],
  [417, 444, 1.25], [445, 472, 1.3125], [473, 500, 1.375], [501, 528, 1.4375],
  [529, 556, 1.5], [557, 582, 1.5625], [583, 610, 1.625], [611, 638, 1.6875],
  [639, 666, 1.75], [667, 694, 1.8125], [695, 722, 1.875], [723, 750, 1.9375],
  [751, 778, 2], [779, 799, 2.0625], [800, 800, 2.125],
];

function inchesToPoints(inches) {
  return inches * POINTS_PER_INCH;
}

function inchesToPixels(inches, dpi = PRINT_DPI) {
  return Math.round(inches * dpi);
}

function parsePodPackageId(podPackageId) {
  const match = /^(\d{4})X(\d{4})\.(\w+)\.(\w+)\.(\w+)\.(\d{3})(\w{2})(\d{3})\.(\w)(\w)(\w)$/.exec(String(podPackageId || ""));
  if (!match) throw specError(`Unrecognised Lulu pod_package_id: ${podPackageId}`);
  return {
    trimWidthIn: Number(match[1]) / 100,
    trimHeightIn: Number(match[2]) / 100,
    color: match[3],
    quality: match[4],
    binding: match[5],
    paperWeight: Number(match[6]),
    paperType: match[7],
    paperPpi: Number(match[8]),
    coverFinish: match[9],
  };
}

function gutterExtraInches(pageCount) {
  return GUTTER_TABLE.find((row) => pageCount <= row.maxPages).extraIn;
}

function getInteriorSpec(variant, pageCount) {
  const pkg = parsePodPackageId(variant.podPackageId);
  const pageWidthIn = pkg.trimWidthIn + BLEED_IN * 2;
  const pageHeightIn = pkg.trimHeightIn + BLEED_IN * 2;
  const gutterIn = gutterExtraInches(pageCount);
  return {
    podPackageId: variant.podPackageId,
    pageCount,
    trimWidthIn: pkg.trimWidthIn,
    trimHeightIn: pkg.trimHeightIn,
    bleedIn: BLEED_IN,
    safetyIn: INTERIOR_SAFETY_IN,
    gutterExtraIn: gutterIn,
    pageWidthIn,
    pageHeightIn,
    pageWidthPt: inchesToPoints(pageWidthIn),
    pageHeightPt: inchesToPoints(pageHeightIn),
    pageWidthPx: inchesToPixels(pageWidthIn),
    pageHeightPx: inchesToPixels(pageHeightIn),
    dpi: PRINT_DPI,
    maxDpi: MAX_PRINT_DPI,
    // Boxes are in points from the bottom-left of the full-bleed page.
    trimBox: rect(BLEED_IN, BLEED_IN, pkg.trimWidthIn, pkg.trimHeightIn),
    bleedBox: rect(0, 0, pageWidthIn, pageHeightIn),
  };
}

/** Safe content box for a page, in inches from the page's top-left (bleed edge). */
function interiorSafeBoxInches(spec, pageNumber) {
  // Page 1 is a right-hand (recto) page; odd pages are bound on their left edge.
  const bindsOnLeft = pageNumber % 2 === 1;
  const inside = spec.safetyIn + spec.gutterExtraIn;
  const outside = spec.safetyIn;
  const left = spec.bleedIn + (bindsOnLeft ? inside : outside);
  const right = spec.bleedIn + (bindsOnLeft ? outside : inside);
  const top = spec.bleedIn + spec.safetyIn;
  const bottom = spec.bleedIn + spec.safetyIn;
  return { x: left, y: top, width: spec.pageWidthIn - left - right, height: spec.pageHeightIn - top - bottom };
}

function paperbackSpineWidthInches(pageCount, paperPpi = 444) {
  return pageCount / paperPpi + 0.06;
}

function hardcoverSpineWidthInches(pageCount) {
  const row = HARDCOVER_SPINE_TABLE.find(([min, max]) => pageCount >= min && pageCount <= max);
  if (!row) throw specError(`Lulu hardcover books need 24-800 interior pages; received ${pageCount}.`);
  return row[2];
}

/**
 * Full cover spread geometry (back + spine + front, one page) in inches,
 * measured from the top-left of the PDF page.
 */
function calculateCoverLayout(variant, pageCount) {
  const pkg = parsePodPackageId(variant.podPackageId);
  if (pkg.binding === "PB") {
    const spineIn = paperbackSpineWidthInches(pageCount, pkg.paperPpi);
    const panelW = pkg.trimWidthIn;
    const widthIn = BLEED_IN * 2 + panelW * 2 + spineIn;
    const heightIn = BLEED_IN * 2 + pkg.trimHeightIn;
    const back = rect(BLEED_IN, BLEED_IN, panelW, pkg.trimHeightIn);
    const spine = rect(BLEED_IN + panelW, BLEED_IN, spineIn, pkg.trimHeightIn);
    const front = rect(BLEED_IN + panelW + spineIn, BLEED_IN, panelW, pkg.trimHeightIn);
    return finishCoverLayout({
      binding: "paperback", pkg, podPackageId: variant.podPackageId, pageCount, spineIn, widthIn, heightIn, back, spine, front,
      outerMarginIn: BLEED_IN,
      frontSafe: insetPanel(front, COVER_SAFETY_IN, { spineSide: "left", spineExtraIn: SPINE_TEXT_CLEARANCE_IN }),
      backSafe: insetPanel(back, COVER_SAFETY_IN, { spineSide: "right", spineExtraIn: SPINE_TEXT_CLEARANCE_IN }),
    });
  }
  if (pkg.binding === "CW") {
    const spineIn = hardcoverSpineWidthInches(pageCount);
    const boardW = pkg.trimWidthIn + CASEWRAP_OVERHANG_IN;
    const boardH = pkg.trimHeightIn + CASEWRAP_OVERHANG_IN * 2;
    const widthIn = CASEWRAP_WRAP_IN * 2 + boardW * 2 + spineIn;
    const heightIn = CASEWRAP_WRAP_IN * 2 + boardH;
    const back = rect(CASEWRAP_WRAP_IN, CASEWRAP_WRAP_IN, boardW, boardH);
    const spine = rect(CASEWRAP_WRAP_IN + boardW, CASEWRAP_WRAP_IN, spineIn, boardH);
    const front = rect(CASEWRAP_WRAP_IN + boardW + spineIn, CASEWRAP_WRAP_IN, boardW, boardH);
    const hingeClear = CASEWRAP_HINGE_IN + SPINE_TEXT_CLEARANCE_IN;
    return finishCoverLayout({
      binding: "hardcover-casewrap", pkg, podPackageId: variant.podPackageId, pageCount, spineIn, widthIn, heightIn, back, spine, front,
      outerMarginIn: CASEWRAP_WRAP_IN,
      frontSafe: insetPanel(front, COVER_SAFETY_IN, { spineSide: "left", spineExtraIn: Math.max(0, hingeClear - COVER_SAFETY_IN) }),
      backSafe: insetPanel(back, COVER_SAFETY_IN, { spineSide: "right", spineExtraIn: Math.max(0, hingeClear - COVER_SAFETY_IN) }),
      hingeIn: CASEWRAP_HINGE_IN,
    });
  }
  throw specError(`Cover generation is not supported for Lulu binding ${pkg.binding}.`);
}

function finishCoverLayout(layout) {
  const { pkg, ...rest } = layout;
  return {
    ...rest,
    trimWidthIn: pkg.trimWidthIn,
    trimHeightIn: pkg.trimHeightIn,
    widthPt: inchesToPoints(layout.widthIn),
    heightPt: inchesToPoints(layout.heightIn),
    widthPx: inchesToPixels(layout.widthIn),
    heightPx: inchesToPixels(layout.heightIn),
    spineTextAllowed: layout.pageCount >= MIN_PAGES_FOR_SPINE_TEXT,
    spineSafe: insetRect(layout.spine, SPINE_TEXT_CLEARANCE_IN, COVER_SAFETY_IN),
    dpi: PRINT_DPI,
  };
}

/**
 * Accept Lulu's `/cover-dimensions/` answer when it agrees with the published
 * formula; otherwise refuse, because a silent mismatch would misplace the spine.
 */
function reconcileCoverDimensions(layout, reported) {
  if (!reported || reported.width === undefined || reported.width === null || reported.width === "") {
    return { ...layout, source: "lulu-published-formula" };
  }
  const unit = String(reported.unit || "pt").toLowerCase();
  const factor = unit === "pt" ? 1 : unit === "mm" ? POINTS_PER_INCH / 25.4 : unit === "inch" || unit === "in" ? POINTS_PER_INCH : NaN;
  const widthPt = Number.parseFloat(reported.width) * factor;
  const heightPt = Number.parseFloat(reported.height) * factor;
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt)) throw specError("Lulu cover dimensions are not numeric.");
  const dw = Math.abs(widthPt - layout.widthPt);
  const dh = Math.abs(heightPt - layout.heightPt);
  if (dw > COVER_DIMENSION_TOLERANCE_PT || dh > COVER_DIMENSION_TOLERANCE_PT) {
    throw specError(
      `Lulu cover dimensions ${widthPt.toFixed(2)} x ${heightPt.toFixed(2)} pt do not match the ${layout.binding} formula ` +
      `${layout.widthPt.toFixed(2)} x ${layout.heightPt.toFixed(2)} pt for ${layout.pageCount} pages. Re-check the SKU before printing.`,
    );
  }
  // Use Lulu's exact media size and keep the spine centred on it.
  const shiftIn = (widthPt - layout.widthPt) / POINTS_PER_INCH / 2;
  const shiftYIn = (heightPt - layout.heightPt) / POINTS_PER_INCH / 2;
  const move = (box) => box && { ...box, x: box.x + shiftIn, y: box.y + shiftYIn };
  return {
    ...layout,
    source: "lulu-cover-dimensions-endpoint",
    widthIn: widthPt / POINTS_PER_INCH,
    heightIn: heightPt / POINTS_PER_INCH,
    widthPt,
    heightPt,
    widthPx: inchesToPixels(widthPt / POINTS_PER_INCH),
    heightPx: inchesToPixels(heightPt / POINTS_PER_INCH),
    back: move(layout.back),
    spine: move(layout.spine),
    front: move(layout.front),
    frontSafe: move(layout.frontSafe),
    backSafe: move(layout.backSafe),
    spineSafe: move(layout.spineSafe),
  };
}

function insetPanel(panel, safetyIn, { spineSide, spineExtraIn = 0 }) {
  const left = safetyIn + (spineSide === "left" ? spineExtraIn : 0);
  const right = safetyIn + (spineSide === "right" ? spineExtraIn : 0);
  return rect(panel.x + left, panel.y + safetyIn, panel.width - left - right, panel.height - safetyIn * 2);
}

function insetRect(box, dx, dy) {
  return rect(box.x + dx, box.y + dy, Math.max(0, box.width - dx * 2), Math.max(0, box.height - dy * 2));
}

function rect(x, y, width, height) {
  return { x, y, width, height };
}

function specError(message) {
  const error = new Error(message);
  error.name = "ValidationError";
  error.status = 400;
  return error;
}

module.exports = {
  BLEED_IN,
  CASEWRAP_HINGE_IN,
  CASEWRAP_OVERHANG_IN,
  CASEWRAP_WRAP_IN,
  COVER_DIMENSION_TOLERANCE_PT,
  COVER_SAFETY_IN,
  INTERIOR_SAFETY_IN,
  MAX_PRINT_DPI,
  POINTS_PER_INCH,
  PRINT_DPI,
  calculateCoverLayout,
  getInteriorSpec,
  gutterExtraInches,
  hardcoverSpineWidthInches,
  inchesToPixels,
  inchesToPoints,
  interiorSafeBoxInches,
  paperbackSpineWidthInches,
  parsePodPackageId,
  reconcileCoverDimensions,
};
