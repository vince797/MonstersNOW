'use strict';
// Explicit geometry for these exact downloaded 32-page templates only.
// A different page count, stock, finish, binding, or template needs new verified geometry.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { PDFDocument } = require('pdf-lib');
const { getStorybookProductVariant } = require('./lulu-products');
const TEMPLATE_DIRECTORY = path.join(__dirname, '..', 'assets', 'lulu', 'templates');
const rect = (xPt, yPt, widthPt, heightPt) => ({ xPt, yPt, widthPt, heightPt });
const REVIEW_TEMPLATES = Object.freeze({
  softcover: {
    file: 'paperback-32-square-premium-matte-template.pdf',
    templateId: 'lulu-32-square-premium-matte-paperback-2026-10-03',
    sha256: '80971232a952f3f9ff835629cd4ff95ec228329571b34c45d22f0ffacb301db5',
    widthPt: 1251.51, heightPt: 630, bleedPt: 9, safetyInsetPt: 36,
    panels: { back: rect(9, 9, 612, 612), spine: rect(621, 9, 9.51, 612), front: rect(630.51, 9, 612, 612) },
    safeAreas: { back: rect(45, 45, 540, 540), front: rect(666.51, 45, 540, 540) },
  },
  hardcover: {
    file: 'hardcover-32-square-premium-matte-template.pdf',
    templateId: 'lulu-32-square-premium-matte-hardcover-2026-10-03',
    sha256: 'dd6befef1beb7963f740ebd581ab4dbd5eb45b51364020880d29a12d234d4a2c',
    widthPt: 1368, heightPt: 738, outerWrapPt: 45, safetyInsetPt: 45,
    panels: { back: rect(45, 45, 630, 648), spine: rect(675, 45, 18, 648), front: rect(693, 45, 630, 648) },
    safeAreas: { back: rect(90, 90, 540, 558), front: rect(738, 90, 540, 558) },
  },
});
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function loadVerifiedReviewTemplates(directory = TEMPLATE_DIRECTORY) {
  const result = {};
  for (const [format, reference] of Object.entries(REVIEW_TEMPLATES)) {
    const bytes = await fs.readFile(path.join(directory, reference.file));
    const variant = getStorybookProductVariant(format);
    const metadata = {
      ...structuredClone(reference), source: 'lulu-binding-specific-template', format,
      podPackageId: variant.podPackageId, binding: variant.binding, interiorPageCount: 32,
      provenance: { sourceUrl: 'https://www.lulu.com/pricing', downloadedAt: '2026-10-03', sourceDescription: 'Official Lulu calculator download; exact file retained unchanged.', geometryVerification: 'Local PDF MediaBox and printed template labels, plus panel coordinates verified against the template artwork.', approvalStatus: 'reference-only-not-production-approval' },
    };
    await validateTemplate({ bytes, metadata }, format);
    result[format] = { bytes, metadata };
  }
  return result;
}
function inside(box, outer) {
  return box && ['xPt', 'yPt', 'widthPt', 'heightPt'].every(key => Number.isFinite(box[key])) && box.widthPt > 0 && box.heightPt > 0 && box.xPt >= outer.xPt && box.yPt >= outer.yPt && box.xPt + box.widthPt <= outer.xPt + outer.widthPt + 0.001 && box.yPt + box.heightPt <= outer.yPt + outer.heightPt + 0.001;
}
async function validateTemplate(template, format) {
  const m = template?.metadata;
  const variant = getStorybookProductVariant(format);
  const fail = message => { throw new Error(`Verified ${format} template required: ${message}`); };
  if (!m || !Buffer.isBuffer(template.bytes) || m.source !== 'lulu-binding-specific-template') fail('exact PDF bytes and provenance are missing');
  if (m.format !== format || m.podPackageId !== variant.podPackageId || m.binding !== variant.binding || m.interiorPageCount !== 32) fail('binding, SKU, and page count must match');
  if (m.sha256 !== sha256(template.bytes)) fail('template SHA-256 mismatch');
  if (!m.provenance?.geometryVerification || !m.provenance?.sourceUrl || !m.templateId) fail('explicit verified geometry and source are required');
  const doc = await PDFDocument.load(template.bytes, { updateMetadata: false });
  if (doc.getPageCount() !== 1) fail('template must have one page');
  const size = doc.getPage(0).getSize();
  if (Math.abs(size.width - m.widthPt) > 0.001 || Math.abs(size.height - m.heightPt) > 0.001) fail('dimensions differ from actual PDF');
  const bounds = rect(0, 0, m.widthPt, m.heightPt);
  let previousRight = 0;
  for (const name of ['back', 'spine', 'front']) {
    const panel = m.panels?.[name];
    if (!inside(panel, bounds) || panel.xPt < previousRight - 0.001) fail(`${name} panel is missing, overlapping, or out of bounds`);
    previousRight = panel.xPt + panel.widthPt;
  }
  for (const name of ['back', 'front']) if (!inside(m.safeAreas?.[name], m.panels[name])) fail(`${name} safe area must lie within its panel`);
  return m;
}
module.exports = { loadVerifiedReviewTemplates, validateTemplate, REVIEW_TEMPLATES, TEMPLATE_DIRECTORY };
