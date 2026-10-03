const crypto = require("node:crypto");
const {
  createPdfDocument,
  drawCircle,
  drawRect,
  drawStrokeRect,
  drawText,
} = require("./pdf-writer");
const {
  DEFAULT_STORYBOOK_PAGE_COUNT,
  getStorybookProductVariant,
  validateStorybookPageCount,
} = require("./lulu-products");

const POINTS_PER_INCH = 72;
const TRIM_SIZE_POINTS = 8.5 * POINTS_PER_INCH;
const BLEED_SIZE_POINTS = 8.75 * POINTS_PER_INCH;
const DEMO_PURPOSE = "sandbox-demo";
const DEMO_MARKER = "SANDBOX DEMO - NOT AN APPROVED PRODUCTION FILE";
const DEFAULT_COVER_WIDTH_POINTS = 1252;
const DEFAULT_COVER_HEIGHT_POINTS = 630;

function createStorybookInteriorPdf(options = {}) {
  const normalized = normalizePrintFileOptions(options, "interior");
  const pages = Array.from({ length: normalized.pageCount }, (_, index) =>
    buildInteriorPage(normalized, index + 1),
  );

  return createPdfDocument({
    title: `${DEMO_MARKER}: interior`,
    pages,
  });
}

function createStorybookCoverPdf(options = {}) {
  const normalized = normalizePrintFileOptions(options, "cover");

  return createPdfDocument({
    title: `${DEMO_MARKER}: cover`,
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
  if (options.purpose !== DEMO_PURPOSE) {
    throw printArtifactError("Generic PDF generation is sandbox-demo only. Supply exact approved production artifacts instead.");
  }
  const variant = getStorybookProductVariant(options.format || options.cover_type || options.coverType);
  const pageCount = Number(options.pageCount || options.page_count || DEFAULT_STORYBOOK_PAGE_COUNT);
  if (!Number.isSafeInteger(pageCount)) throw printArtifactError("page_count must be an integer.");

  validateStorybookPageCount(variant, pageCount);

  return {
    type,
    purpose: DEMO_PURPOSE,
    variant,
    submissionId: normalizeLabel(options.submissionId || options.submission_id, "MonstersNOW"),
    storyLabel: normalizeLabel(options.storyLabel || options.story_label, "My Monster Storybook"),
    styleLabel: normalizeLabel(options.styleLabel || options.style_label, "Soft 3D Storybook Monster"),
    childName: normalizeLabel(options.childName || options.child_name, "Child"),
    monsterName: normalizeLabel(options.monsterName || options.monster_name, "Monster"),
    pageCount,
    coverWidth: positiveNumber(options.coverWidth || options.cover_width || options.width_pt, DEFAULT_COVER_WIDTH_POINTS),
    coverHeight: positiveNumber(options.coverHeight || options.cover_height || options.height_pt, DEFAULT_COVER_HEIGHT_POINTS),
  };
}

function buildInteriorPage(options, pageNumber) {
  const width = BLEED_SIZE_POINTS;
  const height = BLEED_SIZE_POINTS;
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
    content: `${content.join("\n")}\n${drawText(DEMO_MARKER, 26, 42, { size: 9 })}`,
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

  content.push(drawText(DEMO_MARKER, 30, 42, { size: 14 }));
  content.push(drawText("Generic shapes only. No binding-specific production template.", 30, 24, { size: 10 }));
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

// This is a local integrity contract, not an artwork renderer, PDF preflight
// engine, authentication check, upload path, or authorization to place an order.
// Only trusted server-side storage/preflight records may supply this manifest.
function validateApprovedPrintArtifacts({ order, manifest, artifacts, approvals } = {}) {
  requireCondition(order && manifest && artifacts && approvals, "Exact approved interior, cover, manifest, and approvals are required.");
  requireCondition(manifest.schemaVersion === "approved-print-artifacts-v1" && manifest.purpose === "production", "An approved production artifact manifest is required.");
  const format = order.format || order.format_id;
  requireCondition(format === "softcover" || format === "hardcover", "An explicit softcover or hardcover selection is required.");
  const variant = getStorybookProductVariant(format);
  requireCondition(manifest.format === variant.id && manifest.podPackageId === variant.podPackageId, "Artifact format and Lulu SKU must match the order.");
  requireCondition(manifest.pageCount === 32 && Number(order.pageCount ?? order.page_count) === 32, "This approved story requires exactly 32 single interior pages.");
  const identity = manifest.identity || {};
  const identityFields = {
    submissionId: order.submissionId ?? order.submission_id,
    storyId: order.storyId ?? order.story_id,
    monsterSubmissionId: order.monsterSubmissionId ?? order.monster_submission_id,
    selectedPreviewId: order.selectedPreviewId ?? order.selected_preview_id,
    childCharacterId: order.childCharacterId ?? order.child_character_id ?? order.childCharacter?.id ?? order.child_character?.id,
    childName: order.childName ?? order.child_name,
    monsterName: order.monsterName ?? order.monster_name,
    personalizationFingerprint: order.personalizationFingerprint ?? order.personalization_fingerprint,
  };
  for (const [key, expected] of Object.entries(identityFields)) {
    requireCondition(isNonemptyText(expected) && identity[key] === expected, `Approved ${key} must match the current order.`);
  }
  requireCondition(isSha256(identity.personalizationFingerprint), "A pinned personalized render fingerprint is required.");
  const masterVersion = Number(order.masterVersion ?? order.master_version ?? order.master_story_version);
  requireCondition(Number.isSafeInteger(masterVersion) && masterVersion > 0 && identity.masterVersion === masterVersion, "The approved master version must match the current order.");
  requireCondition(isNonemptyText(manifest.artifactSetId) && isNonemptyText(manifest.rendererVersion) && !/demo|placeholder/i.test(manifest.rendererVersion), "A versioned production renderer and immutable artifact set are required.");
  const readinessKeys = ["copyReady", "artworkReady", "monsterReady", "childReady", "rendererReady", "productionReady"];
  for (const key of readinessKeys) {
    requireCondition(manifest.readiness?.[key] === true, `Production readiness is blocked: ${key}.`);
  }
  requireCondition(Array.isArray(manifest.readiness.blockers) && manifest.readiness.blockers.length === 0, "All production readiness blockers must be cleared.");
  requireCondition(manifest.trim?.widthPt === TRIM_SIZE_POINTS && manifest.trim?.heightPt === TRIM_SIZE_POINTS, "The production trim must be 8.5 x 8.5 inches.");
  const interior = manifest.interior;
  const cover = manifest.cover;
  requireCondition(interior?.pageCount === 32 && interior.widthPt === BLEED_SIZE_POINTS && interior.heightPt === BLEED_SIZE_POINTS && interior.layout === "single-pages", "The interior must contain 32 single 630 x 630 pt bleed pages, not reader spreads.");
  requireCondition(cover?.pageCount === 1 && cover.layout === "back-spine-front", "A separate one-page back/spine/front cover is required.");
  validateArtifactBytes("interior", interior, artifacts.interior);
  validateArtifactBytes("cover", cover, artifacts.cover);
  requireCondition(interior.artifactId !== cover.artifactId && interior.sha256 !== cover.sha256, "Interior and cover must be distinct approved artifacts.");
  validateCoverTemplate(manifest.coverTemplate, variant, cover, artifacts.coverTemplate);
  validateArtifactPreflight("interior", interior);
  validateArtifactPreflight("cover", cover);

  const fingerprint = fingerprintApprovedPrintManifest(manifest);
  // A legacy combined customer proof hash cannot approve two replacement files.
  requireCondition((order.approvedArtifactFingerprint ?? order.approved_artifact_fingerprint) === fingerprint, "The order must pin this exact interior-and-cover artifact fingerprint.");
  for (const role of ["customer", "administrator"]) {
    const approval = approvals[role];
    requireCondition(approval?.status === "approved" && approval.fingerprint === fingerprint && isNonemptyText(approval.actorId) && validTimestamp(approval.approvedAt), `Current ${role} approval of the exact artifact fingerprint is required.`);
  }
  return {
    status: "artifact-integrity-verified",
    fingerprint,
    format: variant.id,
    podPackageId: variant.podPackageId,
    artifactSetId: manifest.artifactSetId,
    interiorSha256: interior.sha256,
    coverSha256: cover.sha256,
    readyForSubmission: false,
    blockers: ["Immutable approved-artifact hosting and the authenticated Lulu handoff are not implemented."],
  };
}

function validateCoverTemplate(template, variant, cover, bytes) {
  requireCondition(template?.source === "lulu-binding-specific-template" && isNonemptyText(template.templateId), "Use a versioned binding-specific Lulu cover template; generic cover dimensions are insufficient.");
  requireCondition(template.format === variant.id && template.podPackageId === variant.podPackageId && template.binding === variant.binding && template.interiorPageCount === 32, "The cover template must match this binding, SKU, and exact page count.");
  requireCondition(positiveFinite(template.widthPt) && positiveFinite(template.heightPt) && template.widthPt === cover.widthPt && template.heightPt === cover.heightPt, "Cover dimensions must exactly match the selected Lulu template.");
  requireCondition(isSha256(template.sha256) && isPdfBytes(bytes) && sha256(bytes) === template.sha256, "The exact cover-template PDF and SHA-256 are required.");
  let previousRight = 0;
  for (const name of ["back", "spine", "front"]) {
    const panel = template.panels?.[name];
    requireCondition(panel && Number.isFinite(panel.xPt) && panel.xPt >= previousRight && Number.isFinite(panel.yPt) && panel.yPt >= 0 && positiveFinite(panel.widthPt) && positiveFinite(panel.heightPt) && panel.xPt + panel.widthPt <= template.widthPt && panel.yPt + panel.heightPt <= template.heightPt, `The template needs valid, ordered ${name} panel geometry.`);
    previousRight = panel.xPt + panel.widthPt;
  }
}

function validateArtifactBytes(type, metadata, bytes) {
  requireCondition(metadata && isNonemptyText(metadata.artifactId) && isNonemptyText(metadata.versionId) && isSha256(metadata.sha256), `The ${type} needs an immutable artifact ID, version, and SHA-256.`);
  requireCondition(isPdfBytes(bytes) && bytes.byteLength === metadata.byteLength && sha256(bytes) === metadata.sha256, `The exact approved ${type} PDF bytes do not match their pinned length and SHA-256.`);
  requireCondition(!Buffer.from(bytes).includes(Buffer.from(DEMO_MARKER)), "Sandbox demonstration PDFs can never be production artifacts.");
}

function validateArtifactPreflight(type, artifact) {
  const preflight = artifact.preflight;
  requireCondition(preflight?.status === "passed" && preflight.artifactSha256 === artifact.sha256 && isNonemptyText(preflight.engine) && isNonemptyText(preflight.reportId) && isSha256(preflight.reportSha256) && validTimestamp(preflight.checkedAt), `A trusted passed preflight report for the exact ${type} bytes is required.`);
  for (const key of ["pageCount", "dimensions", "bleed", "fontsEmbedded", "images300Dpi", "noPrinterMarks", "contentMatchesApprovedRender"]) {
    requireCondition(preflight.checks?.[key] === true, `${type} preflight has not passed ${key}.`);
  }
}

function fingerprintApprovedPrintManifest(manifest) {
  requireCondition(manifest && typeof manifest === "object" && !Array.isArray(manifest), "A production artifact manifest is required.");
  return sha256(Buffer.from(canonicalJson(manifest)));
}

function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  requireCondition(value && Object.getPrototypeOf(value) === Object.prototype, "Artifact manifest must contain only JSON values.");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function isNonemptyText(value) { return typeof value === "string" && value.trim().length > 0; }
function isSha256(value) { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function positiveFinite(value) { return Number.isFinite(value) && value > 0; }
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function isPdfBytes(bytes) { return (Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) && bytes.byteLength > 5 && Buffer.from(bytes).subarray(0, 5).toString("ascii") === "%PDF-"; }
function validTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now(); }
function requireCondition(condition, message) { if (!condition) throw printArtifactError(message); }
function printArtifactError(message) {
  const error = new Error(message);
  error.name = "ValidationError";
  error.code = "approved_print_artifact_required";
  error.status = 409;
  return error;
}

module.exports = {
  TRIM_SIZE_POINTS,
  BLEED_SIZE_POINTS,
  DEMO_PURPOSE,
  DEMO_MARKER,
  fingerprintApprovedPrintManifest,
  validateApprovedPrintArtifacts,
  createStorybookCoverPdf,
  createStorybookInteriorPdf,
  normalizePrintFileOptions,
};
