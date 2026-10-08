const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getPrintBookConfig } = require("../lib/print-books");
const { configCoverWraps, localSampleSources, withShippedPrintMasters } = require("../lib/print-assets");
const { buildSamplePrintJob } = require("../lib/storybook-print-job");
const { renderStorybookCoverPdf } = require("../lib/storybook-print-files");

const ROOT = path.join(__dirname, "..");
const config = getPrintBookConfig("halloween-monster-night");
const artPath = (file) => path.join(ROOT, config.localArt.dir, file);

// Width/height from a baseline or progressive JPEG's SOF marker.
function jpegSize(file) {
  const buffer = fs.readFileSync(file);
  let offset = 2;
  while (offset < buffer.length) {
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error(`no SOF in ${file}`);
}

test("Halloween print masters exist at 300 PPI incl. bleed", () => {
  for (const spread of config.localArt.spreads) {
    assert.deepEqual(jpegSize(artPath(spread.required)), { width: 5250, height: 2625 }, spread.required);
  }
  for (const single of config.localArt.singles) {
    assert.deepEqual(jpegSize(artPath(single.required)), { width: 2625, height: 2625 }, single.required);
  }
  assert.deepEqual(jpegSize(artPath(config.localArt.cover.softcoverRequired)), { width: 5215, height: 2625 });
  assert.deepEqual(jpegSize(artPath(config.localArt.cover.hardcoverRequired)), { width: 5700, height: 3075 });
});

test("sample sources prefer print masters and expose per-format cover wraps", () => {
  const sources = localSampleSources(config);
  for (let page = 1; page <= 32; page += 1) {
    assert.match(sources.backgrounds[page].path, /-print\.jpg$/, `page ${page}`);
  }
  assert.match(sources.coverWraps.softcover.path, /cover-softcover-wrap-print\.jpg$/);
  assert.match(sources.coverWraps.hardcover.path, /cover-hardcover-wrap-print\.jpg$/);
  // Real orders reuse the story's shipped wraps (cover art is not uploaded per page).
  assert.deepEqual(configCoverWraps(config), sources.coverWraps);
  assert.equal(configCoverWraps(getPrintBookConfig("bedtime-monster")), null);
  // Without preferring masters, the review plates are used and no wraps.
  const review = localSampleSources(config, { preferRequired: false });
  assert.match(review.backgrounds[4].path, /environment-v1\.png$/);
  assert.equal(review.coverWraps, null);
});

for (const format of ["softcover", "hardcover"]) {
  test(`${format} cover uses its own 300 PPI wrap and keeps the art's title`, async () => {
    const job = buildSamplePrintJob("halloween-monster-night", { useRepoArt: true });
    const { report } = await renderStorybookCoverPdf({ book: job.book, sources: job.sources, format, pageCount: 32, creationDate: new Date(0) });
    assert.match(report.wrap.origin, new RegExp(`cover-${format}-wrap-print\\.jpg$`));
    assert.ok(report.wrap.effectivePpi >= 299.5, `wrap ${report.wrap.effectivePpi} PPI`);
    assert.equal(report.title, "in cover art");
    assert.ok(!report.blockers.includes("placeholder cover wrap background"));
    assert.ok(!report.blockers.some((b) => /wrap art .* PPI/.test(b)));
    // Monster stands below the baked-in title.
    const titleBottom = report.layout.front.y + report.layout.front.height * config.coverArt.monsterTopFraction - 0.2;
    assert.ok(report.monster.boxIn.y >= titleBottom);
  });
}

test("real orders fall back to shipped print masters only where no art was uploaded", () => {
  const uploaded = { url: "https://example.supabase.co/storage/v1/object/sign/page-5.jpg", label: "page 5 background" };
  const sources = withShippedPrintMasters({ backgrounds: { 5: uploaded }, monster: null, child: null, coverWrap: null, coverWraps: null }, config);
  assert.equal(sources.backgrounds[5], uploaded);
  assert.match(sources.backgrounds[4].path, /pages-04-05-environment-print\.jpg$/);
  assert.match(sources.backgrounds[32].path, /page-32-meet-monster-background-print\.jpg$/);
  assert.match(sources.coverWraps.hardcover.path, /cover-hardcover-wrap-print\.jpg$/);
  // Books without shipped masters are unchanged (placeholders stay blockers).
  const other = withShippedPrintMasters({ backgrounds: {} }, getPrintBookConfig("bedtime-monster"));
  assert.deepEqual(other.backgrounds, {});
  assert.equal(other.coverWraps, null);
});
