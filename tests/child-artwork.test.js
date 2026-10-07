const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { CHILD_ARTWORK, childArtworkDescriptor, loadChildArtwork } = require("../lib/child-artwork");

const root = path.resolve(__dirname, "..");

test("every selectable child has an exact approved library anchor", () => {
  assert.equal(Object.keys(CHILD_ARTWORK).length, 8);
  for (const [id, artwork] of Object.entries(CHILD_ARTWORK)) {
    assert.equal(fs.existsSync(path.join(root, artwork.standingPath)), true, `${id} standing anchor must exist`);
    const loaded = loadChildArtwork({ id, included: true, ageBand: "6-8", mobilityAid: "none" });
    assert.equal(loaded.contentType, "image/webp");
    assert.ok(loaded.bytes.length > 1_000);
  }
});

test("wheelchair pose anchors use the exact selected seated artwork", () => {
  const descriptor = childArtworkDescriptor({ id: "deep-braids-black", included: true, ageBand: "6-8", mobilityAid: "wheelchair" });
  assert.equal(descriptor.variant, "seated-wheelchair");
  assert.equal(descriptor.publicPath, "assets/child-characters/deep-braids-black-wheelchair-v1.webp");
  assert.equal(fs.existsSync(path.join(root, descriptor.publicPath)), true);
  assert.throws(
    () => childArtworkDescriptor({ id: "light-short-brown", included: true, ageBand: "6-8", mobilityAid: "wheelchair" }),
    /does not have approved artwork for this mobility choice/i,
  );
});

test("the pose function bundles the approved child artwork library", () => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const poseFunction = vercelConfig.functions["api/storybook-interest.js"];

  assert.match(poseFunction.includeFiles, /assets\/child-characters\/\*\*/);
});
