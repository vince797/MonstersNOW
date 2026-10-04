const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildPersonalizedBook } = require("../lib/personalized-book");

const root = path.resolve(__dirname, "..");

test("synthetic wheelchair reference proof keeps one device identity across four movement-neutral scenes", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs/wheelchair-reference-proof-manifest.json"), "utf8"));
  assert.equal(manifest.synthetic, true);
  assert.equal(manifest.status, "reference_only");
  assert.equal(manifest.productionSelectionEnabled, false);
  assert.equal(manifest.profile.mobilityAid, "wheelchair");
  assert.equal(manifest.asset.depiction, "seated-wheelchair");
  assert.equal(manifest.asset.composition, "child-and-wheelchair");
  assert.equal(manifest.asset.approved, false);
  assert.equal(manifest.asset.pageVerification, "reference-only");
  assert.equal(manifest.pages.length, 4);
  assert.equal(new Set(manifest.pages.map((page) => page.pose)).size, 4);
  assert.ok(manifest.pages.every((page) => /wheelchair|chair|casters|footplate|seated/i.test(page.guidance)));
  assert.ok(manifest.pages.every((page) => !/\b(?:stands?|walks?|runs?|jumps?|climbs?)\b/i.test(page.text)));
});

test("synthetic wheelchair proof runs through the real manifest contract but cannot pass production approval", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs/wheelchair-reference-proof-manifest.json"), "utf8"));
  const referencePageIndexes = new Set([3, 5, 23, 29]);
  const story = {
    id: "halloween-reference",
    slug: "halloween-monster-night",
    version: 1,
    title_template: "Halloween Monster Night",
    pages: Array.from({ length: 32 }, (_, index) => ({
      text: manifest.pages.find((_, pageIndex) => [...referencePageIndexes][pageIndex] === index)?.text || `Reference page ${index + 1}`,
      artworkUrl: `https://assets.example/reference-page-${index + 1}.jpg`,
      artworkStatus: "final",
      backgroundPlateConfirmed: true,
      backgroundPlateVersion: 2,
      childRequired: referencePageIndexes.has(index),
      childPlacement: { x: 55, y: 78, scale: 34, facing: "right", layer: "front" },
    })),
  };
  const book = buildPersonalizedBook(story, {
    childName: manifest.profile.name,
    monsterName: "Noodle",
    childCharacter: {
      id: manifest.profile.appearancePresetId,
      ageBand: manifest.profile.ageBand,
      relativeHeight: manifest.profile.relativeHeight,
      mobilityAid: manifest.profile.mobilityAid,
    },
    selectedPreviewId: "synthetic-monster-reference",
  }, {
    selectedPreviewId: "synthetic-monster-reference",
    selectedPreviewUrl: "https://assets.example/synthetic-monster.png",
  }, {
    childImageUrl: "https://assets.example/wheelchair-child-pose-sheet-v1.png",
    childProfileKey: manifest.asset.profileKey,
    childDepiction: manifest.asset.depiction,
    childAssetComposition: manifest.asset.composition,
    childAssetApproved: manifest.asset.approved,
    childPageVerification: manifest.asset.pageVerification,
    rendererVersion: "personalized-composite-v1",
  });
  const childPages = book.pages.filter((page) => page.child);
  assert.equal(childPages.length, 4);
  assert.ok(childPages.every((page) => page.child.expectedProfileKey === manifest.asset.profileKey));
  assert.ok(childPages.every((page) => page.child.pose === "seated-wheelchair" && page.child.preserveMobilityAid));
  assert.equal(book.readiness.mobilityAidReady, true);
  assert.equal(book.readiness.childApprovalReady, false);
  assert.equal(book.readiness.productionReady, false);
  assert.match(book.readiness.blockers.join(" "), /record successful composition review on every required child page/i);
});

test("wheelchair reference asset has transparent RGBA pixels and is wired into the review proof", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs/wheelchair-reference-proof-manifest.json"), "utf8"));
  const asset = path.join(root, manifest.asset.path);
  const png = fs.readFileSync(asset);
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(png.readUInt32BE(16), 1312);
  assert.equal(png.readUInt32BE(20), 1199);
  assert.equal(png[25], 6, "PNG color type must be RGBA");
  const html = fs.readFileSync(path.join(root, "docs/wheelchair-reference-proof.html"), "utf8");
  assert.equal((html.match(/wheelchair-child-pose-sheet-v1\.png/g) || []).length, 4);
  assert.match(html, /Not production artwork/);
  assert.match(html, /Remaining production gate/);
});
