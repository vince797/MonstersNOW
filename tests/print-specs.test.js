const test = require("node:test");
const assert = require("node:assert/strict");
const specs = require("../lib/lulu-print-specs");
const { getStorybookProductVariant } = require("../lib/lulu-products");

const softcover = getStorybookProductVariant("softcover");
const hardcover = getStorybookProductVariant("hardcover");

test("interior spec follows Lulu's 8.5 x 8.5 in full-bleed requirements", () => {
  const spec = specs.getInteriorSpec(softcover, 32);
  assert.equal(spec.trimWidthIn, 8.5);
  assert.equal(spec.pageWidthIn, 8.75);
  assert.equal(spec.pageWidthPt, 630);
  assert.equal(spec.pageHeightPt, 630);
  assert.equal(spec.pageWidthPx, 2625);
  assert.equal(spec.dpi, 300);
  assert.equal(spec.gutterExtraIn, 0);
  assert.deepEqual(spec.trimBox, { x: 0.125, y: 0.125, width: 8.5, height: 8.5 });
  const safe = specs.interiorSafeBoxInches(spec, 5);
  assert.equal(safe.x, 0.625);
  assert.equal(safe.width, 7.5);
  assert.equal(specs.gutterExtraInches(100), 0.125);
  assert.equal(specs.gutterExtraInches(300), 0.5);
});

test("spine widths use Lulu's paperback formula and hardcover table", () => {
  assert.ok(Math.abs(specs.paperbackSpineWidthInches(32) - (32 / 444 + 0.06)) < 1e-12);
  assert.equal(specs.hardcoverSpineWidthInches(24), 0.25);
  assert.equal(specs.hardcoverSpineWidthInches(84), 0.25);
  assert.equal(specs.hardcoverSpineWidthInches(85), 0.5);
  assert.equal(specs.hardcoverSpineWidthInches(800), 2.125);
  assert.throws(() => specs.hardcoverSpineWidthInches(23), /24-800/);
});

test("cover spreads match Lulu dimensions for both MonstersNOW bindings", () => {
  const soft = specs.calculateCoverLayout(softcover, 32);
  assert.equal(soft.binding, "paperback");
  assert.ok(Math.abs(soft.widthIn - (8.5 * 2 + 32 / 444 + 0.06 + 0.25)) < 1e-9);
  assert.equal(soft.heightPt, 630);
  assert.ok(Math.abs(soft.widthPt - 1251.509) < 0.01);
  assert.equal(soft.spineTextAllowed, false);
  assert.ok(soft.front.x > soft.spine.x && soft.spine.x > soft.back.x);

  const hard = specs.calculateCoverLayout(hardcover, 32);
  assert.equal(hard.binding, "hardcover-casewrap");
  assert.equal(hard.widthIn, 19);
  assert.equal(hard.heightIn, 10.25);
  assert.equal(hard.widthPt, 1368);
  assert.equal(hard.heightPt, 738);
  assert.equal(hard.spineIn, 0.25);
  // Front safe area stays inside the board, clear of wrap and hinge.
  assert.ok(hard.frontSafe.x >= hard.front.x + 0.5);
  assert.ok(hard.frontSafe.x + hard.frontSafe.width <= hard.widthIn - 0.75 - 0.5 + 1e-9);
});

test("formula agrees with published Lulu examples", () => {
  // Lulu OpenAPI example: 6 x 9 paperback, 210 pages -> 920 x 666 pt.
  const trade = specs.calculateCoverLayout({ podPackageId: "0600X0900.BW.STD.PB.060UW444.MXX" }, 210);
  assert.ok(Math.abs(trade.widthPt - 920) <= specs.COVER_DIMENSION_TOLERANCE_PT);
  assert.equal(trade.heightPt, 666);
  // Lulu-generated 6 x 9 casewrap template (spine 1.6875 in): 392.112 x 273.05 mm.
  const casewrap = specs.calculateCoverLayout({ podPackageId: "0600X0900.BW.STD.CW.060UW444.MXX" }, 620);
  assert.ok(Math.abs(casewrap.widthIn * 25.4 - 392.112) < 0.05);
  assert.ok(Math.abs(casewrap.heightIn * 25.4 - 273.05) < 0.05);
});

test("Lulu cover-dimension answers are accepted only when they agree", () => {
  const soft = specs.calculateCoverLayout(softcover, 32);
  const reconciled = specs.reconcileCoverDimensions(soft, { width: "1252.000", height: "630.000", unit: "pt" });
  assert.equal(reconciled.source, "lulu-cover-dimensions-endpoint");
  assert.equal(reconciled.widthPt, 1252);
  assert.ok(Math.abs(reconciled.spine.x + reconciled.spine.width / 2 - reconciled.widthIn / 2) < 1e-9);
  assert.throws(() => specs.reconcileCoverDimensions(soft, { width: "1300", height: "630", unit: "pt" }), /do not match/);
  assert.equal(specs.reconcileCoverDimensions(soft, null).source, "lulu-published-formula");
});
