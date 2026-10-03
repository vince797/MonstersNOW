#!/usr/bin/env node
'use strict';
// Preview only the frozen PDF files, never recompute a separate HTML composition.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { PDFDocument } = require('pdf-lib');
const { canonicalJson } = require('../lib/composed-book-pdf');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main(argv = process.argv.slice(2)) {
  const dir = path.resolve(argv[0] || path.join(__dirname, '..', 'output/pdf/composed-review'));
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'review-candidate-manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 'composed-review-candidate-v1' || manifest.purpose !== 'review-candidate') throw new Error('A review candidate manifest is required.');
  const { manifestSha256, ...manifestBody } = manifest;
  if (sha(canonicalJson(manifestBody)) !== manifestSha256) throw new Error('Candidate manifest checksum does not match.');
  const previewDir = path.join(dir, 'previews'); await fs.mkdir(previewDir, { recursive: true });
  const report = { schemaVersion: 'pdf-byte-derived-previews-v1', artifactSetId: manifest.artifactSetId, renderFingerprint: manifest.renderFingerprint, reviewOnly: true, source: 'Poppler rasterization of the exact hashed PDF artifacts', previews: [] };
  for (const type of ['interior', 'softcover', 'hardcover']) {
    const artifact = manifest.artifacts[type];
    if (path.basename(artifact.filename) !== artifact.filename) throw new Error('Unsafe artifact filename.');
    const input = path.join(dir, artifact.filename), bytes = await fs.readFile(input);
    if (sha(bytes) !== artifact.sha256 || bytes.length !== artifact.byteLength) throw new Error(`Frozen ${type} PDF no longer matches its manifest.`);
    const doc = await PDFDocument.load(bytes);
    if (doc.getPageCount() !== artifact.pageCount) throw new Error('PDF page count mismatch.');
    const prefix = path.join(previewDir, type);
    await execFile('pdftoppm', ['-scale-to', '900', '-png', input, prefix], { maxBuffer: 1024 * 1024 });
    const files = (await fs.readdir(previewDir)).filter(f => new RegExp(`^${type}-\\d+\\.png$`).test(f)).sort();
    if (files.length !== artifact.pageCount) throw new Error(`Unexpected preview count for ${type}.`);
    for (const filename of files) {
      const png = await fs.readFile(path.join(previewDir, filename));
      report.previews.push({ artifact: type, pageNumber: Number(filename.match(/-(\d+)\.png$/)[1]), pdfSha256: artifact.sha256, filename: `previews/${filename}`, pngSha256: sha(png), byteLength: png.length });
    }
  }
  await fs.writeFile(path.join(dir, 'pdf-preview-manifest.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Verified and rasterized ${report.previews.length} PDF pages in ${previewDir}.`);
  return report;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
