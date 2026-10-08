const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { PNG } = require("pngjs");
const { PDFParse } = require("pdf-parse");
const { renderStorybookCoverPdf, renderStorybookInteriorPdf, RENDERER_VERSION } = require("../lib/storybook-print-files");
const { buildSamplePrintJob, RENDERER_VERSION: JOB_RENDERER_VERSION } = require("../lib/storybook-print-job");
const { decodeImage, prepareCutout } = require("../lib/print-raster");
const { parseTrueType, encodeWinAnsi } = require("../lib/truetype-font");
const { getPrintBookConfig, templateForPage } = require("../lib/print-books");
const fs = require("node:fs");

const FIXED_DATE = new Date("2026-10-08T00:00:00Z");
let interiorPromise;
function sampleInterior() {
  interiorPromise ||= (async () => {
    const job = buildSamplePrintJob("halloween-monster-night");
    return renderStorybookInteriorPdf({ book: job.book, sources: job.sources, format: "softcover", pageCount: 32, creationDate: FIXED_DATE });
  })();
  return interiorPromise;
}

function pdfStructure(pdf) {
  const text = pdf.toString("latin1");
  const pages = [...text.matchAll(/\/Type \/Page \//g)].length;
  const mediaBoxes = [...text.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((m) => m[1].trim().split(/\s+/).map(Number));
  const trimBoxes = [...text.matchAll(/\/TrimBox \[([^\]]+)\]/g)].map((m) => m[1].trim().split(/\s+/).map(Number));
  const images = [...text.matchAll(/\/Subtype \/Image \/Width (\d+) \/Height (\d+) \/ColorSpace \/(\w+)/g)].map((m) => ({ width: Number(m[1]), height: Number(m[2]), colorSpace: m[3] }));
  const fontFiles = [...text.matchAll(/\/FontFile2 \d+ 0 R/g)].length;
  const fontsDeclared = [...text.matchAll(/\/Type \/Font \/Subtype \/(\w+)/g)].map((m) => m[1]);
  return { text, pages, mediaBoxes, trimBoxes, images, fontFiles, fontsDeclared };
}

function makePng(width, height, paint) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a = 255] = paint(x, y);
      const offset = (y * width + x) * 4;
      png.data[offset] = r; png.data[offset + 1] = g; png.data[offset + 2] = b; png.data[offset + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

async function alphaAt(cutout, x, y) {
  return cutout.canvas.getContext("2d").getImageData(x, y, 1, 1).data[3];
}

test("compositor and manifest agree on the renderer version Admin gates on", () => {
  assert.equal(RENDERER_VERSION, "personalized-composite-v1");
  assert.equal(JOB_RENDERER_VERSION, RENDERER_VERSION);
  const job = buildSamplePrintJob("halloween-monster-night");
  assert.equal(job.book.rendererVersion, RENDERER_VERSION);
});

test("white-background monsters are keyed from the edges without punching out white eyes", async () => {
  // Purple disc with a white "eye" on a flat white studio background.
  const buffer = makePng(200, 200, (x, y) => {
    const d = Math.hypot(x - 100, y - 100);
    if (Math.hypot(x - 100, y - 80) < 18) return [255, 255, 255];
    return d < 70 ? [120, 70, 190] : [254, 254, 254];
  });
  const cutout = prepareCutout(await decodeImage(buffer), { label: "monster" });
  assert.equal(cutout.report.method, "keyed-flat-background");
  assert.ok(cutout.width <= 142 && cutout.height <= 142, "trimmed to the character bounds");
  assert.equal(await alphaAt(cutout, 0, 0), 0, "corner background removed");
  const cx = Math.round(cutout.width / 2);
  assert.equal(await alphaAt(cutout, cx, Math.round(cutout.height / 2) - 20), 255, "enclosed white eye stays opaque");
  assert.equal(await alphaAt(cutout, cx, cutout.height - 20), 255, "body opaque");
});

test("transparent child renders keep their alpha; busy opaque art is reported instead of guessed", async () => {
  const child = await decodeImage(fs.readFileSync("assets/child-characters/warm-curly-dark-v1.webp"));
  const prepared = prepareCutout(child, { label: "child" });
  assert.equal(prepared.report.method, "existing-alpha");
  assert.ok(prepared.height < 768 && prepared.width < 512, "transparent margins trimmed");

  const noisy = makePng(120, 120, (x, y) => [(x * 37 + y * 11) % 255, (x * 7) % 255, (y * 13) % 255]);
  const result = prepareCutout(await decodeImage(noisy), { label: "monster" });
  assert.equal(result.report.method, "opaque");
  assert.match(result.report.warning, /transparent PNG/);
});

test("embedded fonts refuse characters they cannot print", () => {
  const font = parseTrueType(fs.readFileSync("assets/fonts/fredoka/print/FredokaPrint-Medium.ttf"));
  assert.deepEqual(encodeWinAnsi(font, "“Hi” — ©"), [0x93, 0x48, 0x69, 0x94, 0x20, 0x97, 0x20, 0xa9]);
  assert.throws(() => encodeWinAnsi(font, "Zoë 李"), /cannot render: 李/);
  assert.throws(() => parseTrueType(fs.readFileSync("assets/fonts/fredoka/Fredoka-Variable.ttf")), /Variable fonts/);
});

test("interior PDF: 32 full-bleed pages, trim boxes, one 300 PPI image per page, embedded fonts", async () => {
  const { pdf, report } = await sampleInterior();
  const structure = pdfStructure(pdf);
  assert.equal(structure.pages, 32);
  assert.equal(structure.mediaBoxes.length, 32);
  assert.ok(structure.mediaBoxes.every((box) => box.join(" ") === "0 0 630 630"), "8.75 x 8.75 in pages (8.5 in trim + 0.125 in bleed)");
  assert.ok(structure.trimBoxes.every((box) => box.join(" ") === "9 9 621 621"), "trim box inset by 0.125 in");
  assert.equal(structure.images.length, 32);
  for (const image of structure.images) {
    assert.equal(image.colorSpace, "DeviceRGB");
    assert.ok(image.width / 8.75 >= 300 && image.width / 8.75 <= 600, `image ${image.width}px over 8.75 in is 300-600 PPI`);
    assert.equal(image.width, image.height);
  }
  assert.equal(structure.fontFiles, 3, "every font is embedded");
  assert.ok(structure.fontsDeclared.every((type) => type === "TrueType"));
  assert.doesNotMatch(structure.text, /\/SMask|\/Encrypt|\/BM \//, "no transparency groups or security");
  assert.equal(report.pages.length, 32);
  assert.ok(report.pages.every((page) => page.imagePixels[0] === 2625));

  const parser = new PDFParse({ data: pdf });
  try {
    const parsed = await parser.getText();
    assert.equal(parsed.pages.length, 32);
    assert.match(parsed.text, /porch lights were on/);
    assert.match(parsed.text, /Meet Moxie!/);
    assert.match(parsed.text, /Mia/);
  } finally {
    await parser.destroy().catch(() => {});
  }
});

test("interior report places one child + monster pair per story spread and blocks placeholders/low resolution", async () => {
  const { report } = await sampleInterior();
  const storyPages = report.pages.filter((page) => page.template === "story");
  assert.equal(storyPages.length, 28);
  for (let left = 4; left <= 30; left += 2) {
    const spread = storyPages.filter((page) => page.number === left || page.number === left + 1);
    assert.equal(spread.filter((page) => page.child).length, 1, `spread ${left}-${left + 1} shows the child once`);
    assert.equal(spread.filter((page) => page.monster).length, 1, `spread ${left}-${left + 1} shows the monster once`);
  }
  for (const page of storyPages.filter((p) => p.monster || p.child)) {
    assert.ok(page.monster && page.child, `page ${page.number} composites child and monster together`);
    assert.ok(page.monster.effectivePpi > 0 && page.child.effectivePpi > 0);
    const textBottom = page.text.panelIn.y + page.text.panelIn.height;
    for (const kind of ["monster", "child"]) {
      const box = page[kind].boxIn;
      assert.ok(box.y >= textBottom, `page ${page.number} ${kind} clears the text card`);
      assert.ok(box.x >= 0.625 - 1e-6 && box.x + box.width <= 8.125 + 1e-6, `page ${page.number} ${kind} inside the 0.5 in safety margin`);
    }
  }
  assert.ok(report.pages.every((page) => page.background.placeholder), "route sample uses labelled placeholder backgrounds");
  assert.ok(report.blockers.some((blocker) => /placeholder background/.test(blocker)));
  assert.equal(report.monsterAsset.method, "existing-alpha");
  assert.equal(report.childAsset.method, "existing-alpha");
});

test("production mode refuses to emit a book with placeholder or sub-300 PPI art", async () => {
  const job = buildSamplePrintJob("halloween-monster-night", { useRepoArt: true });
  await assert.rejects(
    renderStorybookInteriorPdf({ book: job.book, sources: job.sources, format: "softcover", pageCount: 32, mode: "production" }),
    // Repo print masters are 300 PPI; the 512x768 child preset still is not.
    (error) => /not print-ready/.test(error.message) && error.report.blockers.some((b) => /child \d+(\.\d)? PPI \(< 300\)/.test(b)),
  );
});

for (const format of ["softcover", "hardcover"]) {
  test(`${format} cover PDF is one spread at Lulu's size with ≥300 PPI raster`, async () => {
    const job = buildSamplePrintJob("halloween-monster-night");
    const { pdf, report } = await renderStorybookCoverPdf({ book: job.book, sources: job.sources, format, pageCount: 32, creationDate: FIXED_DATE });
    const structure = pdfStructure(pdf);
    assert.equal(structure.pages, 1);
    const [, , width, height] = structure.mediaBoxes[0];
    assert.ok(Math.abs(width - report.layout.widthPt) < 0.01 && Math.abs(height - report.layout.heightPt) < 0.01);
    if (format === "softcover") assert.ok(Math.abs(width - 1251.509) < 0.01 && height === 630);
    else assert.ok(width === 1368 && height === 738);
    assert.equal(structure.images.length, 1);
    assert.ok(structure.images[0].width / (width / 72) >= 299.9);
    assert.ok(structure.images[0].height / (height / 72) >= 299.9);
    assert.equal(structure.fontFiles, 3);
    assert.match(report.spineText, /omitted/);
    // The cover hero monster is ~62% of the panel height; low-res sources must be flagged.
    assert.ok(report.monster.effectivePpi > 0);
    if (report.monster.effectivePpi < 300) assert.ok(report.blockers.some((b) => /cover monster .* PPI/.test(b)));
    assert.ok(report.blockers.includes("placeholder cover wrap background"));
  });
}

test("cover honours Lulu's reported dimensions and output is deterministic", async () => {
  const job = buildSamplePrintJob("halloween-monster-night");
  const options = { book: job.book, sources: job.sources, format: "softcover", pageCount: 32, creationDate: FIXED_DATE, coverDimensions: { width: "1252.000", height: "630.000", unit: "pt" } };
  const first = await renderStorybookCoverPdf(options);
  const second = await renderStorybookCoverPdf(options);
  assert.equal(pdfStructure(first.pdf).mediaBoxes[0].join(" "), "0 0 1252 630");
  assert.equal(crypto.createHash("sha256").update(first.pdf).digest("hex"), crypto.createHash("sha256").update(second.pdf).digest("hex"));
  await assert.rejects(renderStorybookCoverPdf({ ...options, coverDimensions: { width: "1400", height: "630", unit: "pt" } }), /do not match/);
});

test("other catalog stories use the same pipeline through shared defaults", async () => {
  const config = getPrintBookConfig("bedtime-monster", { title: "Bedtime Monster" });
  assert.equal(templateForPage(config, 1), "half-title");
  assert.equal(templateForPage(config, 10), "story");
  assert.deepEqual(config.coverTitleLines, ["Bedtime Monster"]);
  const job = buildSamplePrintJob("bedtime-monster");
  assert.equal(job.book.pages.length, 32);
  const { report } = await renderStorybookCoverPdf({ book: job.book, sources: job.sources, format: "hardcover", pageCount: 32, creationDate: FIXED_DATE });
  assert.equal(report.storySlug, "bedtime-monster");
});

test("planSpreadCharacters keeps one pair per spread and applies per-spread overrides", () => {
  const { planSpreadCharacters } = require("../lib/storybook-print-files");
  const pages = [4, 5, 6, 7, 32].map((number) => ({
    number,
    child: { x: 28, y: 84, scale: 30, facing: "left" },
    monster: { x: 70, y: 82, scale: 35, facing: "left" },
  }));
  const config = {
    defaultTemplate: "story",
    templates: { 32: "meet-monster" },
    spreadCharacters: { 4: { page: 4, child: { x: 60, facing: "right" }, layer: "front" } },
  };
  const plan = planSpreadCharacters(pages, config);
  assert.deepEqual(plan.get(5), { child: null, monster: null });
  assert.equal(plan.get(4).child.x, 60);
  assert.equal(plan.get(4).child.facing, "right");
  assert.equal(plan.get(4).child.scale, 30, "Admin scale kept");
  assert.equal(plan.get(4).monster.x, 70);
  assert.equal(plan.get(4).monster.layer, "front");
  assert.deepEqual(plan.get(6), { child: null, monster: null }, "default carrier is the right page");
  assert.equal(plan.get(7).monster.x, 70);
  assert.equal(plan.has(32), false, "non-story pages untouched");
  assert.equal(planSpreadCharacters(pages, { ...config, charactersPerSpread: false }).size, 0);
});
