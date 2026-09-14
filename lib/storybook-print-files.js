const {
  createPdfDocument,
  drawCircle,
  drawRect,
  drawStrokeRect,
} = require("./pdf-writer");
const {
  DEFAULT_STORYBOOK_PAGE_COUNT,
  getStorybookProductVariant,
  validateStorybookPageCount,
} = require("./lulu-products");

const POINTS_PER_INCH = 72;
const TRIM_SIZE_POINTS = 8.5 * POINTS_PER_INCH;
const DEFAULT_COVER_WIDTH_POINTS = 1252;
const DEFAULT_COVER_HEIGHT_POINTS = 630;

function createStorybookInteriorPdf(options = {}) {
  const normalized = normalizePrintFileOptions(options, "interior");
  const pages = Array.from({ length: normalized.pageCount }, (_, index) =>
    buildInteriorPage(normalized, index + 1),
  );

  return createPdfDocument({
    title: `${normalized.storyLabel} interior`,
    pages,
  });
}

function createStorybookCoverPdf(options = {}) {
  const normalized = normalizePrintFileOptions(options, "cover");

  return createPdfDocument({
    title: `${normalized.storyLabel} cover`,
    pages: [
      {
        width: normalized.coverWidth,
        height: normalized.coverHeight,
        content: buildCoverPage(normalized),
      },
    ],
  });
}

function normalizePrintFileOptions(options, type) {
  const variant = getStorybookProductVariant(options.format || options.cover_type || options.coverType);
  const pageCount = Number.parseInt(options.pageCount || options.page_count || DEFAULT_STORYBOOK_PAGE_COUNT, 10);

  validateStorybookPageCount(variant, pageCount);

  return {
    type,
    variant,
    submissionId: normalizeLabel(options.submissionId || options.submission_id, "MonstersNOW"),
    storyLabel: normalizeLabel(options.storyLabel || options.story_label, "My Monster Storybook"),
    styleLabel: normalizeLabel(options.styleLabel || options.style_label, "Soft 3D Storybook Monster"),
    pageCount,
    coverWidth: positiveNumber(options.coverWidth || options.cover_width || options.width_pt, DEFAULT_COVER_WIDTH_POINTS),
    coverHeight: positiveNumber(options.coverHeight || options.cover_height || options.height_pt, DEFAULT_COVER_HEIGHT_POINTS),
  };
}

function buildInteriorPage(options, pageNumber) {
  const width = TRIM_SIZE_POINTS;
  const height = TRIM_SIZE_POINTS;
  const margin = 54;
  const isTitlePage = pageNumber === 1;
  const isClosingPage = pageNumber === options.pageCount;
  const background = pageNumber % 2 === 0 ? [0.965, 0.992, 1] : [1, 0.982, 0.945];
  const accent = pageNumber % 3 === 0 ? [1, 0.38, 0.03] : [0, 0.52, 0.58];
  const content = [];

  content.push(drawRect(0, 0, width, height, background));
  content.push(drawRect(0, height - 20, width, 20, accent));
  content.push(drawRect(0, 0, width, 18, [0.02, 0.08, 0.18]));

  if (isTitlePage) {
    content.push(drawRect(margin, height - 112, 145, 16, [0, 0.52, 0.58]));
    content.push(drawRect(margin, height - 166, width - margin * 2, 18, [0.02, 0.08, 0.18]));
    content.push(drawRect(margin, height - 196, width - margin * 1.8, 18, [0.02, 0.08, 0.18]));
    content.push(drawRect(margin, height - 226, width * 0.46, 18, [1, 0.38, 0.03]));
    content.push(drawMonsterMark(width / 2, 230, 92, accent));
    content.push(drawProofBars(margin, 100, width - margin * 2, [0.28, 0.34, 0.44]));
  } else if (isClosingPage) {
    content.push(drawMonsterMark(width / 2, 338, 86, accent));
    content.push(drawRect(margin, 184, width - margin * 2, 20, [0.02, 0.08, 0.18]));
    content.push(drawRect(margin, 144, width * 0.5, 14, [0.28, 0.34, 0.44]));
    content.push(drawRect(margin, 118, width * 0.72, 14, [0.28, 0.34, 0.44]));
  } else {
    content.push(drawMonsterScene(width, height, pageNumber, accent));
    content.push(drawRect(margin, 224, width - margin * 2, 16, [0.02, 0.08, 0.18]));
    content.push(drawRect(margin, 196, width * (0.42 + (pageNumber % 4) * 0.07), 16, accent));
    content.push(drawProofBars(margin, 148, width - margin * 2, [0.28, 0.34, 0.44]));
  }

  content.push(drawRect(width - margin, 30, 16, 5, [0.52, 0.56, 0.64]));

  return {
    width,
    height,
    content: content.join("\n"),
  };
}

function buildCoverPage(options) {
  const { coverWidth: width, coverHeight: height } = options;
  const spineWidth = Math.max(14, width - TRIM_SIZE_POINTS * 2 - 36);
  const bleed = 18;
  const panelWidth = (width - spineWidth) / 2;
  const backX = bleed;
  const spineX = panelWidth;
  const frontX = panelWidth + spineWidth;
  const content = [];

  content.push(drawRect(0, 0, width, height, [0.965, 0.992, 1]));
  content.push(drawRect(frontX, 0, panelWidth, height, [1, 0.982, 0.945]));
  content.push(drawRect(spineX, 0, spineWidth, height, [0, 0.52, 0.58]));
  content.push(drawStrokeRect(bleed, bleed, width - bleed * 2, height - bleed * 2, [0.8, 0.86, 0.9], 1));

  content.push(drawRect(frontX + 58, height - 92, 144, 15, [0, 0.52, 0.58]));
  content.push(drawRect(frontX + 58, height - 154, panelWidth - 116, 20, [0.02, 0.08, 0.18]));
  content.push(drawRect(frontX + 58, height - 190, panelWidth * 0.72, 20, [0.02, 0.08, 0.18]));
  content.push(drawRect(frontX + 58, height - 226, panelWidth * 0.48, 20, [1, 0.38, 0.03]));
  content.push(drawMonsterMark(frontX + panelWidth / 2, 210, 88, [1, 0.38, 0.03]));
  content.push(drawProofBars(frontX + 58, 94, panelWidth - 116, [0.28, 0.34, 0.44]));

  content.push(drawRect(backX + 48, height - 122, panelWidth - 96, 18, [0.02, 0.08, 0.18]));
  content.push(drawRect(backX + 48, height - 154, panelWidth * 0.58, 18, [0.02, 0.08, 0.18]));
  content.push(drawProofBars(backX + 48, 124, panelWidth - 96, [0.28, 0.34, 0.44]));
  content.push(drawRect(spineX + spineWidth / 2 - 3, 78, 6, height - 156, [1, 1, 1]));

  return content.join("\n");
}

function drawProofBars(x, y, width, color) {
  return [
    drawRect(x, y, width, 9, color),
    drawRect(x, y - 20, width * 0.82, 9, color),
    drawRect(x, y - 40, width * 0.64, 9, color),
  ].join("\n");
}

function drawMonsterScene(width, height, pageNumber, accent) {
  const x = width / 2 + Math.sin(pageNumber) * 44;
  const y = height - 250 + Math.cos(pageNumber) * 18;
  const content = [];

  content.push(drawCircle(x, y, 86, [0.68, 0.86, 0.12]));
  content.push(drawCircle(x - 28, y + 24, 22, [1, 1, 1]));
  content.push(drawCircle(x + 28, y + 24, 22, [1, 1, 1]));
  content.push(drawCircle(x - 22, y + 22, 9, [0.02, 0.08, 0.18]));
  content.push(drawCircle(x + 34, y + 22, 9, [0.02, 0.08, 0.18]));
  content.push(drawCircle(x - 60, y + 68, 18, accent));
  content.push(drawCircle(x + 60, y + 68, 18, accent));
  content.push(drawRect(x - 42, y - 38, 84, 10, [0.02, 0.08, 0.18]));
  content.push(drawCircle(122, height - 126, 20, [0, 0.52, 0.58]));
  content.push(drawCircle(width - 118, height - 128, 14, [1, 0.38, 0.03]));

  return content.join("\n");
}

function drawMonsterMark(cx, cy, radius, accent) {
  const content = [];

  content.push(drawCircle(cx, cy, radius, [0.68, 0.86, 0.12]));
  content.push(drawCircle(cx, cy + 20, radius * 0.32, [1, 1, 1]));
  content.push(drawCircle(cx + 9, cy + 24, radius * 0.12, [0.02, 0.08, 0.18]));
  content.push(drawCircle(cx - radius * 0.56, cy + radius * 0.54, radius * 0.18, accent));
  content.push(drawCircle(cx + radius * 0.56, cy + radius * 0.54, radius * 0.18, accent));
  content.push(drawRect(cx - radius * 0.36, cy - radius * 0.25, radius * 0.72, radius * 0.1, [0.02, 0.08, 0.18]));

  return content.join("\n");
}

function normalizeLabel(value, fallback) {
  const normalized = typeof value === "string" ? value.trim().slice(0, 140) : "";
  return normalized || fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  TRIM_SIZE_POINTS,
  createStorybookCoverPdf,
  createStorybookInteriorPdf,
  normalizePrintFileOptions,
};
