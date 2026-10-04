const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PNG } = require("pngjs");
const { buildHalloweenMasterPages } = require("../lib/halloween-master-pages");
const { buildPersonalizedBook } = require("../lib/personalized-book");

const root = path.resolve(__dirname, "..");
const outputRoot = path.join(root, "output/wheelchair-customization-v1");
const output = path.join(outputRoot, "warm-curly-dark-5-6-average");

test("approved wheelchair direction renders a complete native-resolution 32-page production candidate", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/build-wheelchair-full-review.js")], { cwd: root });
  const report = JSON.parse(fs.readFileSync(path.join(output, "render-report.json"), "utf8"));
  assert.equal(report.status, "digital_production_candidate_complete");
  assert.equal(report.productionSelectionEnabled, false);
  assert.deepEqual(report.approval, { visualDirectionApproved: true, editableVariationsApproved: true, printReadyApproved: false });
  assert.equal(report.profile.key, "warm-curly-dark:5-6:average:wheelchair");
  assert.equal(report.checks.supportedWheelchairProfile, true);
  assert.deepEqual(report.output.fullBleedPixels, [2625, 2625]);
  assert.deepEqual(report.output.trimPixels, { x: 38, y: 38, width: 2550, height: 2550 });
  assert.equal(report.output.bleedInchesPerEdge, 0.125);
  assert.equal(report.checks.pageCount, 32);
  assert.equal(report.checks.requiredChildPages, 28);
  assert.equal(report.checks.distinctPosesUsed, 12);
  assert.equal(report.checks.allCropSafe, true);
  assert.equal(report.checks.allTextFits, true);
  assert.equal(report.checks.movementNeutral, true);
  assert.equal(report.checks.allBackgroundsNative300Dpi, true);
  assert.equal(report.checks.allPlacedRasterAssetsAtLeast300EffectiveDpi, true);
  assert.equal(report.checks.originalDrawingAspectRatioPreserved, true);
  for (const page of report.pages) {
    const png = PNG.sync.read(fs.readFileSync(path.join(root, page.outputPath)));
    assert.deepEqual([png.width, png.height], [2625, 2625]);
  }
  assert.ok(report.pages.every((page) => page.backgroundPlate.sourcePixels.join("x") === "2625x2625"));
  assert.ok(report.pages.every((page) => [page.childBox, page.monsterBox, page.drawingBox].filter(Boolean).every((box) => box.effectiveDpi >= 300)));
  assert.match(report.remainingProductionGate.join(" "), /background candidates/i);
  assert.match(report.remainingProductionGate.join(" "), /physical proof/i);
});

test("a second appearance and larger age-height choice use exact matching assets without enlarging rasters", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/build-wheelchair-full-review.js"), "--appearance", "deep-braids-black", "--age-band", "7-8", "--relative-height", "taller"], { cwd: root });
  const curly = JSON.parse(fs.readFileSync(path.join(output, "render-report.json"), "utf8"));
  const braidsOutput = path.join(outputRoot, "deep-braids-black-7-8-taller");
  const braids = JSON.parse(fs.readFileSync(path.join(braidsOutput, "render-report.json"), "utf8"));
  assert.equal(braids.profile.key, "deep-braids-black:7-8:taller:wheelchair");
  assert.equal(braids.profile.renderScale, 1);
  assert.ok(curly.profile.renderScale < braids.profile.renderScale);
  assert.equal(new Set(Object.values(braids.poseAssets)).size, 12);
  assert.ok(Object.values(braids.poseAssets).every((asset) => asset.includes("wheelchair-profile-deep-braids-black-v1")));
  assert.ok(braids.pages.every((page) => [page.childBox, page.monsterBox, page.drawingBox].filter(Boolean).every((box) => box.rasterScale <= 1 && box.effectiveDpi >= 300)));
  assert.ok(braids.pages.every((page) => page.cropSafe && page.textFits));
});

test("the full single-profile render contract stays blocked until print-ready approval", () => {
  const pages = buildHalloweenMasterPages().map((page, index) => ({
    ...page,
    artworkUrl: `https://assets.example/background-${index + 1}.jpg`,
    artworkStatus: "final",
    backgroundPlateConfirmed: true,
  }));
  const story = { id: "halloween-wheelchair-review", slug: "halloween-monster-night", version: 1, title_template: "Halloween Monster Night", pages };
  const book = buildPersonalizedBook(story, {
    childName: "Maya",
    monsterName: "Larry",
    childCharacter: { id: "warm-curly-dark", ageBand: "5-6", relativeHeight: "average", mobilityAid: "wheelchair" },
    selectedPreviewId: "larry-review",
  }, {
    selectedPreviewId: "larry-review",
    selectedPreviewUrl: "https://assets.example/larry.png",
  }, {
    childImageUrl: "https://assets.example/wheelchair-profile-v1.png",
    childProfileKey: "warm-curly-dark:5-6:average:wheelchair",
    childDepiction: "seated-wheelchair",
    childAssetComposition: "child-and-wheelchair",
    childAssetApproved: false,
    childPageVerification: "all-required-pages",
    rendererVersion: "personalized-composite-v1",
  });
  assert.equal(book.pages.filter((page) => page.child).length, 28);
  assert.equal(book.readiness.mobilityAidReady, true);
  assert.equal(book.readiness.childReady, false);
  assert.equal(book.readiness.childApprovalReady, false);
  assert.equal(book.readiness.rendererReady, true);
  assert.equal(book.readiness.productionReady, false);
  assert.match(book.readiness.blockers.join(" "), /approv/i);
});
