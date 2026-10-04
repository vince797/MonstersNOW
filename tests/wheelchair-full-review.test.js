const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PNG } = require("pngjs");
const { buildHalloweenMasterPages } = require("../lib/halloween-master-pages");
const { buildPersonalizedBook } = require("../lib/personalized-book");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "output/wheelchair-full-review");

test("approved wheelchair direction renders a complete crop-safe 32-page reference book", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/build-wheelchair-full-review.js")], { cwd: root });
  const report = JSON.parse(fs.readFileSync(path.join(output, "render-report.json"), "utf8"));
  assert.equal(report.status, "full_review_complete");
  assert.equal(report.productionSelectionEnabled, false);
  assert.deepEqual(report.approval, { visualDirectionApproved: true, printReadyApproved: false });
  assert.deepEqual(report.output.fullBleedPixels, [2625, 2625]);
  assert.deepEqual(report.output.trimPixels, { x: 38, y: 38, width: 2550, height: 2550 });
  assert.equal(report.output.bleedInchesPerEdge, 0.125);
  assert.deepEqual(report.checks, {
    pageCount: 32,
    requiredChildPages: 28,
    distinctPosesUsed: 12,
    allCropSafe: true,
    allTextFits: true,
    movementNeutral: true,
  });
  for (const page of report.pages) {
    const png = PNG.sync.read(fs.readFileSync(path.join(root, page.outputPath)));
    assert.deepEqual([png.width, png.height], [2625, 2625]);
  }
  assert.match(report.remainingProductionGate.join(" "), /final background plates/i);
  assert.match(report.remainingProductionGate.join(" "), /physical proof/i);
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
    childProfileKey: "warm-curly-dark:5-6:wheelchair",
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
