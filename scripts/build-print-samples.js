#!/usr/bin/env node
/*
 * Build sample print files with the production compositor.
 *
 *   node scripts/build-print-samples.js [story-slug] [--out samples] [--placeholders]
 *
 * Uses the story's configured repo art (lib/print-books) and sample
 * child/monster; anything missing becomes a labelled placeholder. Writes the
 * interior PDF, softcover + hardcover cover PDFs, and a JSON preflight report.
 * Sample output is stamped "PROOF" wherever it is not print-ready.
 */
const fs = require("node:fs");
const path = require("node:path");
const { buildSamplePrintJob } = require("../lib/storybook-print-job");
const { renderStorybookCoverPdf, renderStorybookInteriorPdf } = require("../lib/storybook-print-files");

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const slug = args.find((arg, index) => !arg.startsWith("--") && index !== outIndex + 1) || "halloween-monster-night";
  const out = path.resolve(outIndex >= 0 ? args[outIndex + 1] : path.join(__dirname, "..", "samples"));
  const useRepoArt = !args.includes("--placeholders");
  fs.mkdirSync(out, { recursive: true });
  const job = buildSamplePrintJob(slug, { useRepoArt });
  const creationDate = new Date("2026-10-08T00:00:00Z");
  const started = Date.now();
  const interior = await renderStorybookInteriorPdf({ book: job.book, sources: job.sources, format: "softcover", pageCount: 32, mode: "proof", creationDate });
  const interiorMs = Date.now() - started;
  fs.writeFileSync(path.join(out, `${slug}-interior-sample.pdf`), interior.pdf);
  const covers = {};
  for (const format of ["softcover", "hardcover"]) {
    const cover = await renderStorybookCoverPdf({ book: job.book, sources: job.sources, format, pageCount: 32, mode: "proof", creationDate });
    fs.writeFileSync(path.join(out, `${slug}-cover-${format}-sample.pdf`), cover.pdf);
    covers[format] = cover.report;
  }
  const report = { slug, generatedWith: "scripts/build-print-samples.js", interiorRenderMs: interiorMs, interior: interior.report, covers };
  fs.writeFileSync(path.join(out, `${slug}-preflight.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Interior: ${interior.report.pages.length} pages, ${(interior.pdf.length / 1048576).toFixed(1)} MB in ${interiorMs} ms`);
  console.log(`Interior blockers: ${interior.report.blockers.length}; warnings: ${interior.report.warnings.length}`);
  for (const [format, cover] of Object.entries(covers)) {
    console.log(`${format} cover: ${cover.layout.widthIn.toFixed(3)} x ${cover.layout.heightIn.toFixed(3)} in, spine ${cover.layout.spineIn.toFixed(4)} in, blockers ${cover.blockers.length}`);
  }
  console.log(`Wrote ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
