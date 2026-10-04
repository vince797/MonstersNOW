const { buildStorybookPosePlan } = require("../lib/storybook-pose-plan");

function approvedPoseSet(story, options = {}) {
  const selectedPreviewId = options.selectedPreviewId || "preview-1";
  const plan = buildStorybookPosePlan(story, {
    selectedPreviewId,
    childCharacter: options.childCharacter || { included: false },
    monsterIdentity: { anatomyTraits: options.anatomyTraits || ["preserve exact observed anatomy"], approvalStatus: "approved" },
    scaleContract: { monsterHeightToStandingChildHeight: 0.9, calibrationStatus: "approved", approvedBy: "Fixture reviewer" },
  });
  const assets = plan.baseAssets.map((asset, index) => ({
    id: `pose-asset-${index + 1}`,
    key: asset.key,
    subjectType: asset.subjectType,
    kind: asset.kind,
    poseId: asset.poseId,
    status: "approved",
    transparent: true,
    identityApproved: true,
    anatomyApproved: true,
    url: `https://assets.example/poses/${asset.subjectType}-${asset.poseId}.png`,
  }));
  const scenes = plan.scenes.map((scene) => ({
    id: `scene-${scene.pageNumber}`,
    pageNumber: scene.pageNumber,
    status: scene.status === "not_required" ? "not_required" : "approved",
    monsterAssetKey: scene.monster?.assetKey || null,
    childAssetKey: scene.child?.assetKey || null,
    composition: scene,
    qa: { ...scene.qa, identity: true, anatomy: true, relativeScale: true, cameraDepth: true, boundingBoxes: true, grounding: true, eyeline: true, interactionClearance: true, approved: true },
  }));
  return {
    id: "pose-job-1",
    status: "approved",
    sourcePreviewId: selectedPreviewId,
    storyId: story.id,
    storyVersion: Number(story.version || 1),
    plan,
    assets,
    scenes,
  };
}

module.exports = { approvedPoseSet };
