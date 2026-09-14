const {
  createPdfDocument,
  drawCircle,
  drawRect,
  drawStrokeRect,
  drawText,
  drawWrappedText,
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
  const headline = getInteriorHeadline(options, pageNumber);
  const body = getInteriorCopy(options, pageNumber);
  const content = [];

  content.push(drawRect(0, 0, width, height, background));
  content.push(drawRect(0, height - 20, width, 20, accent));
  content.push(drawRect(0, 0, width, 18, [0.02, 0.08, 0.18]));

  if (isTitlePage) {
    content.push(drawText("MonstersNOW", margin, height - 100, { size: 18, color: [0, 0.52, 0.58] }));
    content.push(drawWrappedText(options.storyLabel, margin, height - 155, width - margin * 2, {
      size: 34,
      lineHeight: 40,
      color: [0.02, 0.08, 0.18],
      maxLines: 3,
    }));
    content.push(drawMonsterMark(width / 2, 230, 92, accent));
    content.push(drawWrappedText(
      `A custom ${options.variant.label.toLowerCase()} proof file generated for Lulu sandbox validation.`,
      margin,
      112,
      width - margin * 2,
      { size: 13, lineHeight: 18, color: [0.28, 0.34, 0.44], maxLines: 3 },
    ));
  } else if (isClosingPage) {
    content.push(drawMonsterMark(width / 2, 338, 86, accent));
    content.push(drawWrappedText("The End", margin, 190, width - margin * 2, {
      size: 34,
      lineHeight: 42,
      color: [0.02, 0.08, 0.18],
      maxLines: 1,
    }));
    content.push(drawWrappedText(
      "Every monster story ends with a brave little artist and a page ready for the next adventure.",
      margin,
      146,
      width - margin * 2,
      { size: 16, lineHeight: 22, color: [0.28, 0.34, 0.44], maxLines: 4 },
    ));
  } else {
    content.push(drawMonsterScene(width, height, pageNumber, accent));
    content.push(drawWrappedText(headline, margin, 230, width - margin * 2, {
      size: 24,
      lineHeight: 30,
      color: [0.02, 0.08, 0.18],
      maxLines: 2,
    }));
    content.push(drawWrappedText(body, margin, 158, width - margin * 2, {
      size: 14,
      lineHeight: 20,
      color: [0.28, 0.34, 0.44],
      maxLines: 5,
    }));
  }

  content.push(drawText(String(pageNumber), width - margin, 30, { size: 10, color: [0.52, 0.56, 0.64] }));

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

  content.push(drawText("MonstersNOW", frontX + 58, height - 84, { size: 18, color: [0, 0.52, 0.58] }));
  content.push(drawWrappedText(options.storyLabel, frontX + 58, height - 142, panelWidth - 116, {
    size: 32,
    lineHeight: 38,
    color: [0.02, 0.08, 0.18],
    maxLines: 4,
  }));
  content.push(drawMonsterMark(frontX + panelWidth / 2, 210, 88, [1, 0.38, 0.03]));
  content.push(drawWrappedText(
    `${options.variant.label} - ${options.styleLabel}`,
    frontX + 58,
    102,
    panelWidth - 116,
    { size: 13, lineHeight: 18, color: [0.28, 0.34, 0.44], maxLines: 3 },
  ));

  content.push(drawWrappedText(
    "A custom monster storybook proof generated for Lulu sandbox validation.",
    backX + 48,
    height - 120,
    panelWidth - 96,
    { size: 18, lineHeight: 25, color: [0.02, 0.08, 0.18], maxLines: 5 },
  ));
  content.push(drawWrappedText(
    `Submission ${options.submissionId}`,
    backX + 48,
    96,
    panelWidth - 96,
    { size: 11, lineHeight: 16, color: [0.28, 0.34, 0.44], maxLines: 2 },
  ));

  content.push(drawText("MONSTERSNOW", spineX + spineWidth / 2 - 34, height / 2, {
    size: 8,
    color: [1, 1, 1],
  }));

  return content.join("\n");
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

function getInteriorHeadline(options, pageNumber) {
  const headlines = [
    "The drawing started with a brave line.",
    "The monster found its first big feeling.",
    "A tiny idea became a huge adventure.",
    "Every color had a job to do.",
    "The friendly monster practiced being bold.",
    "A surprise waited on the next page.",
    "The storybook world opened wide.",
    "The monster learned what made it special.",
  ];

  return headlines[(pageNumber - 2) % headlines.length] || options.storyLabel;
}

function getInteriorCopy(options, pageNumber) {
  const copies = [
    `This proof page keeps the ${options.styleLabel.toLowerCase()} look while Lulu checks trim size, page count, and print normalization.`,
    "In the final production flow, this page will be replaced with generated story art, parent-approved text, and the selected monster character.",
    "The layout uses a square 8.5 inch trim so the printed book can stay friendly, readable, and easy for children to hold.",
    "Each page is intentionally simple for the sandbox pass: consistent page size, clear margins, and artwork that stays inside the printable area.",
  ];

  return copies[(pageNumber - 2) % copies.length];
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
