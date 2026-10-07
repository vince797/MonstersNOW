const test = require("node:test");
const assert = require("node:assert/strict");
const { buildStorybookPosePlan, evaluatePoseJobReadiness } = require("../lib/storybook-pose-plan");
const { buildHalloweenMasterPages } = require("../lib/halloween-master-pages");
const { approvedPoseSet } = require("./pose-test-fixtures");

function story() {
  return {
    id: "story-1",
    slug: "halloween-monster-night",
    version: 3,
    pages: Array.from({ length: 32 }, (_, index) => ({
      text: `Page ${index + 1}`,
      monsterRequired: index >= 3,
      childRequired: index >= 3,
      monsterPlacement: { x: 30, y: 90, scale: 42, facing: "right", cameraDepth: index % 2 ? "foreground" : "midground" },
      childPlacement: { x: 70, y: 86, scale: 35, facing: "left", cameraDepth: "midground" },
    })),
  };
}

test("one exact portrait produces only the referenced bounded poses with page continuity gates", () => {
  const plan = buildStorybookPosePlan(story(), {
    selectedPreviewId: "portrait-v3",
    monsterIdentity: { anatomyTraits: ["exactly three visible legs", "one horn", "blue spots"], approvalStatus: "approved" },
    childCharacter: { id: "deep-braids-black", profileKey: "deep-braids-black:6-8:wheelchair", ageBand: "6-8", mobilityAid: "wheelchair", included: true },
    scaleContract: { monsterHeightToStandingChildHeight: 0.9, calibrationStatus: "approved", approvedBy: "Art lead" },
  });
  assert.equal(plan.sourcePreviewId, "portrait-v3");
  assert.equal(plan.baseAssets.filter((asset) => asset.subjectType === "monster").length, 4);
  assert.equal(plan.baseAssets.filter((asset) => asset.subjectType === "child").length, 3);
  assert.equal(plan.identityContract.child.anchorArtwork.publicPath, "assets/child-characters/deep-braids-black-wheelchair-v1.webp");
  assert.equal(plan.identityContract.child.ageBandLabel, "Ages 6–8");
  assert.ok(plan.baseAssets.filter((asset) => asset.subjectType === "child").every((asset) => asset.pageCount === asset.pageNumbers.length && asset.pageCount > 0));
  assert.equal(plan.baseAssets.filter((asset) => asset.subjectType === "child").reduce((total, asset) => total + asset.pageCount, 0), plan.scenes.filter((scene) => scene.child).length);
  const referencedKeys = new Set(plan.scenes.flatMap((scene) => [scene.monster?.assetKey, scene.child?.assetKey]).filter(Boolean));
  assert.deepEqual(new Set(plan.baseAssets.map((asset) => asset.key)), referencedKeys);
  assert.equal(plan.limits.maxAttemptsPerAsset, 2);
  assert.equal(plan.limits.costCapCents, 50);
  assert.equal(plan.scenes.length, 32);
  assert.ok(plan.scenes.every((scene) => scene.qa.relativeScale === false && scene.qa.cameraDepth === false && scene.qa.boundingBoxes === false));
  assert.ok(plan.scenes.filter((scene) => scene.child).every((scene) => scene.child.scaleBasis === "seated-eye-line-and-wheel-envelope"));
  assert.ok(plan.scenes.filter((scene) => scene.child).every((scene) => scene.child.mobilityEquivalent.startsWith("seated-")));
  assert.deepEqual(plan.identityContract.monster.anatomyTraits, ["exactly three visible legs", "one horn", "blue spots"]);
  assert.equal(plan.scaleContract.fixedPixelHeightForbidden, true);
  assert.ok(plan.scenes.slice(0, 3).every((scene) => scene.status === "not_required"));
});

test("an approved small page map reuses only the referenced families", () => {
  const mapped = story();
  mapped.pages = mapped.pages.map((page, index) => index < 3 ? page : {
    ...page,
    monsterPoseId: ["neutral_travel", "help_interact", "seated_rest"][index % 3],
    childPoseId: ["travel_observe", "reach_help", "celebrate"][index % 3],
  });
  const plan = buildStorybookPosePlan(mapped, {
    selectedPreviewId: "portrait-v3",
    childCharacter: { id: "deep-braids-black", ageBand: "6-8", mobilityAid: "wheelchair", included: true },
  });
  assert.deepEqual(plan.baseAssets.filter((asset) => asset.subjectType === "monster").map((asset) => asset.poseId), ["neutral_travel", "help_interact", "seated_rest"]);
  assert.deepEqual(plan.baseAssets.filter((asset) => asset.subjectType === "child").map((asset) => asset.poseId), ["travel_observe", "reach_help", "celebrate"]);
  assert.equal(plan.baseAssets.length, 6);
});

test("Halloween uses the authoritative four-monster and three-child family map", () => {
  const plan = buildStorybookPosePlan({
    id: "halloween-story",
    slug: "halloween-monster-night",
    version: 4,
    pages: buildHalloweenMasterPages(),
  }, {
    selectedPreviewId: "portrait-v4",
    childCharacter: { id: "deep-braids-black", ageBand: "6-8", mobilityAid: "wheelchair", included: true },
  });
  assert.deepEqual(plan.baseAssets.filter((asset) => asset.subjectType === "monster").map((asset) => asset.poseId), [
    "neutral_travel", "active_reach_celebrate", "help_interact", "seated_rest",
  ]);
  assert.deepEqual(plan.baseAssets.filter((asset) => asset.subjectType === "child").map((asset) => asset.poseId), [
    "travel_observe", "reach_help", "celebrate",
  ]);
  assert.match(plan.baseAssets.find((asset) => asset.key === "child:base:travel_observe").direction, /Ages 6–8.*exact approved wheelchair/i);
  assert.deepEqual(plan.scenes.filter((scene) => scene.status === "not_required").map((scene) => scene.pageNumber), [1, 2, 3, 32]);
  assert.equal(plan.baseAssets.length, 7);
});

test("legacy child ages cannot be silently remapped into a new pose plan", () => {
  assert.throws(() => buildStorybookPosePlan(story(), {
    selectedPreviewId: "portrait-v3",
    childCharacter: { id: "deep-braids-black", ageBand: "7-8", relativeHeight: "taller", mobilityAid: "wheelchair", included: true, requiresAgeBandReselection: true },
  }), /Reselect the child age/i);
});

test("fixtures exercise orchestration but remain blocked until real assets and page QA are approved", () => {
  const plan = buildStorybookPosePlan(story(), { selectedPreviewId: "portrait-v3", childCharacter: { included: false } });
  const pending = evaluatePoseJobReadiness({ sourcePreviewId: "portrait-v3", plan, assets: [], scenes: plan.scenes });
  assert.equal(pending.ready, false);
  assert.match(pending.blockers.join(" "), /transparent pose asset/i);
  assert.match(pending.blockers.join(" "), /physical monster-to-child scale/i);

  const fixture = approvedPoseSet(story(), { selectedPreviewId: "portrait-v3" });
  const ready = evaluatePoseJobReadiness({ sourcePreviewId: "portrait-v3", plan: fixture.plan, assets: fixture.assets, scenes: fixture.scenes, actualCostCents: 0 });
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.blockers, []);
  assert.notEqual(fixture.status, "real_provider_run");
});

test("a different approved portrait version invalidates an otherwise complete pose set", () => {
  const fixture = approvedPoseSet(story(), { selectedPreviewId: "portrait-v3" });
  const readiness = evaluatePoseJobReadiness({ sourcePreviewId: "portrait-v4", plan: fixture.plan, assets: fixture.assets, scenes: fixture.scenes });
  assert.equal(readiness.exactVersion, false);
  assert.equal(readiness.ready, false);
});

test("a page adaptation cannot pass readiness until its exact replacement asset is approved", () => {
  const fixture = approvedPoseSet(story(), { selectedPreviewId: "portrait-v3" });
  const scene = fixture.scenes.find((item) => item.status === "approved");
  scene.monsterAssetKey = `monster:scene:${scene.pageNumber}:neutral_travel`;
  scene.composition.adaptation = { required: true, monsterAssetKey: scene.monsterAssetKey };
  scene.composition.monster.assetKey = scene.monsterAssetKey;
  const missing = evaluatePoseJobReadiness({ sourcePreviewId: "portrait-v3", plan: fixture.plan, assets: fixture.assets, scenes: fixture.scenes });
  assert.equal(missing.assetsReady, false);
  assert.equal(missing.ready, false);
  fixture.assets.push({ key: scene.monsterAssetKey, status: "approved", transparent: true, identityApproved: true });
  const ready = evaluatePoseJobReadiness({ sourcePreviewId: "portrait-v3", plan: fixture.plan, assets: fixture.assets, scenes: fixture.scenes });
  assert.equal(ready.ready, true);
});
