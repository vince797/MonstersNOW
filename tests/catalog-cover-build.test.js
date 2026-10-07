const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { loadImage } = require("@napi-rs/canvas");
const {
  CATALOG_SIZE,
  LOGO,
  PRINT_FRONT_SIZE,
  covers,
} = require("../scripts/build-catalog-covers");

const root = path.join(__dirname, "..");
const catalogDir = path.join(root, "assets/storybook/cover-series/minimal-concepts");
const printFrontDir = path.join(root, "assets/storybook/cover-series/lulu-fronts");

test("all catalog covers share the smaller protected brand placement", () => {
  const fullBleedInches = 8.75;
  const hardcoverProtectedTopInches = 0.125 + 0.75;
  const protectedTopPixels = CATALOG_SIZE * hardcoverProtectedTopInches / fullBleedInches;

  assert.ok(LOGO.top >= protectedTopPixels);
  assert.equal(LOGO.width, 300);
  assert.equal(Object.keys(covers).length, 7);
});

test("every catalog cover has matching web and Lulu front-panel candidates", async () => {
  for (const definition of Object.values(covers)) {
    for (const suffix of [".png", "-web.jpg", "-640.webp"]) {
      assert.ok(fs.existsSync(path.join(catalogDir, `${definition.output}${suffix}`)));
    }

    const catalog = await loadImage(path.join(catalogDir, `${definition.output}.png`));
    assert.equal(catalog.width, CATALOG_SIZE);
    assert.equal(catalog.height, CATALOG_SIZE);

    const printFront = await loadImage(
      path.join(printFrontDir, `${definition.output}-front-8.5x8.5-300ppi.png`),
    );
    assert.equal(printFront.width, PRINT_FRONT_SIZE);
    assert.equal(printFront.height, PRINT_FRONT_SIZE);
  }
});
