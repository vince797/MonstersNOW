const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");
const BOOKS = ["bedtime-monster", "the-monster-who-lost-their-glow"];

function pngDimensions(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 24);
  assert.equal(header.toString("ascii", 1, 4), "PNG");
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  };
}

for (const slug of BOOKS) {
  test(`${slug} starter artwork manifest references valid background plates`, () => {
    const directory = path.join(ROOT, "assets", "storybook", slug);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "production-status.json"), "utf8"));

    assert.equal(manifest.status, "artwork_in_review");
    assert.equal(manifest.artwork_role, "background_plate");
    assert.equal(manifest.spreads.length, 2);

    for (const spread of manifest.spreads) {
      const assetPath = path.join(ROOT, spread.asset);
      assert.ok(fs.existsSync(assetPath), `${spread.asset} should exist`);
      assert.deepEqual(pngDimensions(assetPath), manifest.output_dimensions && {
        width: manifest.output_dimensions.width,
        height: manifest.output_dimensions.height,
      });
      assert.equal(spread.status, "draft");
      assert.equal(spread.backgroundPlateConfirmed, false);
      assert.ok(Number.isFinite(spread.childPlacement.x));
      assert.ok(Number.isFinite(spread.monsterPlacement.x));
    }
  });
}

