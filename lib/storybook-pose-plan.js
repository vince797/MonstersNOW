const MONSTER_BASE_POSES = Object.freeze([
  { id: "neutral_travel", label: "Neutral / travel", direction: "Stand, wait, move alongside, lead, or observe through placement, facing, crop, gaze, and expression variants while preserving every observed anatomy trait." },
  { id: "active_reach_celebrate", label: "Active / reach / celebrate", direction: "Point, reach, react upward, cheer, or wave through bounded upper-body, gaze, and prop-anchor variants without redesigning the character." },
  { id: "help_interact", label: "Help / interact", direction: "Shelter candy, assist, or hold or pull a banner at a reviewed interaction anchor without inventing limbs or intersecting the child or mobility equipment." },
  { id: "seated_rest", label: "Seated / rest", direction: "Use a relaxed home-ending pose with the approved silhouette, exact anatomy, and physically coherent support." },
]);

const CHILD_BASE_POSES = Object.freeze([
  { id: "travel_observe", label: "Travel / observe" },
  { id: "reach_help", label: "Reach / help" },
  { id: "celebrate", label: "Celebrate" },
]);

const HALLOWEEN_MONSTER_POSE_PAGES = Object.freeze({
  neutral_travel: [4, 5, 6, 9, 10, 11, 13, 14, 15, 16, 19, 22, 24],
  active_reach_celebrate: [7, 8, 17, 18, 21, 23, 25, 26, 27, 28, 29, 30],
  help_interact: [12, 20],
  seated_rest: [31],
});

const HALLOWEEN_CHILD_POSE_PAGES = Object.freeze({
  travel_observe: [4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 22, 23, 24, 25, 26, 27, 31],
  reach_help: [12, 20],
  celebrate: [21, 28, 29, 30],
});

const CHILD_POSE_BY_MONSTER_POSE = Object.freeze({
  neutral_travel: "travel_observe",
  active_reach_celebrate: "celebrate",
  help_interact: "reach_help",
  seated_rest: "travel_observe",
});

const MAX_GENERATION_ATTEMPTS_PER_ASSET = 2;
const MAX_BASE_ASSETS = MONSTER_BASE_POSES.length + CHILD_BASE_POSES.length;
const DEFAULT_JOB_COST_CAP_CENTS = 50;

function buildStorybookPosePlan(story, options = {}) {
  if (!story?.id || !Array.isArray(story.pages) || story.pages.length !== 32) {
    throw posePlanError("A saved 32-page story is required to create a pose plan.");
  }
  const selectedPreviewId = requiredId(options.selectedPreviewId, "approved monster portrait version");
  const childCharacter = normalizeChildContract(options.childCharacter);
  const monsterIdentity = normalizeMonsterIdentity(options.monsterIdentity, selectedPreviewId);
  const scaleContract = normalizeScaleContract(options.scaleContract);
  const scenes = story.pages.map((page, index) => buildScenePlan(page, index + 1, story, childCharacter, scaleContract));
  const requiredMonsterPoses = new Set(scenes.map((scene) => scene.monster?.basePoseId).filter(Boolean));
  const requiredChildPoses = new Set(scenes.map((scene) => scene.child?.basePoseId).filter(Boolean));
  const baseAssets = [
    ...MONSTER_BASE_POSES.filter((pose) => requiredMonsterPoses.has(pose.id)).map((pose) => assetPlan("monster", pose.id, pose.label, pose.direction, pagesUsingPose(scenes, "monster", pose.id))),
    ...(childCharacter.included ? CHILD_BASE_POSES.filter((pose) => requiredChildPoses.has(pose.id)).map((pose) => assetPlan("child", pose.id, pose.label, childPoseDirection(pose.id, childCharacter), pagesUsingPose(scenes, "child", pose.id))) : []),
  ];
  if (baseAssets.length > MAX_BASE_ASSETS) throw posePlanError("The referenced base pose plan exceeded its fixed production cap.");
  return {
    schemaVersion: 1,
    storyId: story.id,
    storySlug: story.slug || null,
    storyVersion: Number(story.version || 1),
    sourcePreviewId: selectedPreviewId,
    identityContract: { monster: monsterIdentity, child: childCharacter },
    scaleContract,
    limits: {
      maxBaseAssets: MAX_BASE_ASSETS,
      maxAttemptsPerAsset: MAX_GENERATION_ATTEMPTS_PER_ASSET,
      costCapCents: boundedInteger(options.costCapCents, 1, 500, DEFAULT_JOB_COST_CAP_CENTS),
      generationMode: "one_asset_per_admin_action",
    },
    baseAssets,
    scenes,
  };
}

function assetPlan(subjectType, poseId, label, direction, pageNumbers = []) {
  return {
    key: `${subjectType}:base:${poseId}`,
    subjectType,
    kind: "base",
    poseId,
    label,
    direction,
    pageNumbers,
    pageCount: pageNumbers.length,
    status: "queued",
    maxAttempts: MAX_GENERATION_ATTEMPTS_PER_ASSET,
    requiresTransparentBackground: true,
    requiresIdentityApproval: true,
  };
}

function pagesUsingPose(scenes, subjectType, poseId) {
  return scenes.filter((scene) => scene[subjectType]?.basePoseId === poseId).map((scene) => scene.pageNumber);
}

function buildScenePlan(page = {}, pageNumber, story, childCharacter, scaleContract) {
  const monsterRequired = page.monsterRequired !== false;
  const childRequired = page.childRequired === true && childCharacter.included;
  const monsterPoseId = explicitPose(page.monsterPoseId, MONSTER_BASE_POSES) || poseForStoryPage(story.slug, pageNumber);
  const childPoseId = explicitPose(page.childPoseId, CHILD_BASE_POSES) || poseForChildStoryPage(story.slug, pageNumber) || CHILD_POSE_BY_MONSTER_POSE[monsterPoseId] || "travel_observe";
  return {
    pageNumber,
    status: monsterRequired || childRequired ? "review" : "not_required",
    monster: monsterRequired ? sceneSubject(page.monsterPlacement, monsterPoseId, "monster", scaleContract) : null,
    child: childRequired ? sceneSubject(page.childPlacement, childPoseId, "child", scaleContract, childCharacter) : null,
    interaction: {
      gazeTarget: cleanText(page.gazeTarget, 80),
      propAnchor: cleanText(page.propAnchor, 80),
      pairedInteraction: Boolean(monsterRequired && childRequired),
      eyelineReviewRequired: Boolean(monsterRequired && childRequired),
    },
    localLightVariant: cleanText(page.localLightVariant, 60),
    adaptation: {
      required: page.poseAdaptationRequired === true,
      reason: cleanText(page.poseAdaptationReason, 240),
      monsterAssetKey: null,
      childAssetKey: null,
    },
    qa: {
      identity: false,
      anatomy: false,
      relativeScale: false,
      cameraDepth: false,
      boundingBoxes: false,
      grounding: false,
      eyeline: !monsterRequired || !childRequired,
      interactionClearance: !monsterRequired || !childRequired,
      approved: false,
    },
  };
}

function sceneSubject(value = {}, basePoseId, subjectType, scaleContract, childCharacter = null) {
  const placement = normalizePlacement(value);
  return {
    basePoseId,
    assetKey: `${subjectType}:base:${basePoseId}`,
    facing: placement.facing,
    layer: placement.layer,
    anchor: { xPercent: placement.x, baselinePercent: placement.y },
    requestedScalePercent: placement.scale,
    cameraDepth: cleanEnum(value.cameraDepth, ["foreground", "midground", "background"], "midground"),
    perspective: cleanEnum(value.perspective, ["low", "eye_level", "high"], "eye_level"),
    visualBounds: normalizeBounds(value.visualBounds),
    scaleBasis: subjectType === "child" && childCharacter?.mobilityAid === "wheelchair"
      ? "seated-eye-line-and-wheel-envelope"
      : scaleContract.basis,
    mobilityEquivalent: subjectType === "child" ? mobilityEquivalent(basePoseId, childCharacter) : null,
  };
}

function normalizeMonsterIdentity(value = {}, selectedPreviewId) {
  const anatomyTraits = Array.isArray(value.anatomyTraits)
    ? value.anatomyTraits.map((trait) => cleanText(trait, 120)).filter(Boolean).slice(0, 24)
    : [];
  return {
    sourcePreviewId: selectedPreviewId,
    appearanceVersion: cleanText(value.appearanceVersion, 80) || selectedPreviewId,
    anatomyTraits,
    anatomyLockRequired: true,
    silhouetteLockRequired: true,
    colorsLockRequired: true,
    approvalProvenanceRequired: true,
    approvalStatus: value.approvalStatus === "approved" ? "approved" : "pending_review",
  };
}

function normalizeChildContract(value = {}) {
  if (!value || value.included === false || value.id === "none") return { included: false };
  const mobilityAid = value.mobilityAid === "wheelchair" ? "wheelchair" : "none";
  if (value.requiresAgeBandReselection === true || !["3-5", "6-8"].includes(value.ageBand)) {
    throw posePlanError("Reselect the child age as Ages 3–5 or Ages 6–8 before creating a pose plan.");
  }
  const ageBand = value.ageBand;
  const appearanceId = requiredId(value.id, "child appearance");
  const anchorArtwork = childArtworkDescriptor({ ...value, id: appearanceId, included: true, ageBand, mobilityAid });
  return {
    included: true,
    profileKey: requiredId(value.profileKey || value.childProfileKey || `${appearanceId}:${ageBand}${mobilityAid === "wheelchair" ? ":wheelchair" : ""}`, "child profile"),
    appearanceId,
    appearanceVersion: cleanText(value.appearanceVersion, 80) || "1",
    outfitVersion: cleanText(value.outfitVersion, 80) || "1",
    ageBand,
    ageBandLabel: ageBand === "3-5" ? "Ages 3–5" : "Ages 6–8",
    profileVersion: "launch-v2",
    fixedProportionBand: true,
    relativeHeightCustomization: false,
    mobilityAid,
    preserveMobilityAid: mobilityAid !== "none",
    seatedProportions: mobilityAid === "wheelchair",
    anchorArtwork,
    approvalProvenanceRequired: true,
  };
}

function normalizeScaleContract(value = {}) {
  const ratio = Number(value.monsterHeightToStandingChildHeight);
  return {
    basis: "standing-child-height",
    monsterHeightToStandingChildHeight: Number.isFinite(ratio) && ratio > 0.2 && ratio < 3 ? Number(ratio.toFixed(4)) : null,
    tolerancePercent: boundedInteger(value.tolerancePercent, 1, 30, 8),
    seatedChildReference: "eye-line-and-wheel-envelope",
    applyCameraDepth: true,
    fixedPixelHeightForbidden: true,
    calibrationStatus: value.calibrationStatus === "approved" && Number.isFinite(ratio) ? "approved" : "pending_review",
    approvedBy: cleanText(value.approvedBy, 120),
    approvedAt: cleanText(value.approvedAt, 80),
  };
}

function evaluatePoseJobReadiness(job = {}) {
  const plan = job.plan || job.pose_plan || {};
  const assets = Array.isArray(job.assets) ? job.assets : [];
  const scenes = Array.isArray(job.scenes) ? job.scenes : plan.scenes || [];
  const sourcePreviewId = job.sourcePreviewId || job.source_preview_id;
  const exactVersion = Boolean(sourcePreviewId && plan.sourcePreviewId === sourcePreviewId);
  const requiredAssetKeys = new Set((plan.baseAssets || []).map((asset) => asset.key));
  scenes.forEach((scene) => {
    const adaptation = scene?.adaptation || scene?.composition?.adaptation || {};
    const monsterAssetKey = scene?.monsterAssetKey || scene?.monster_asset_key || scene?.composition?.monster?.assetKey || adaptation.monsterAssetKey;
    const childAssetKey = scene?.childAssetKey || scene?.child_asset_key || scene?.composition?.child?.assetKey || adaptation.childAssetKey;
    if (monsterAssetKey) requiredAssetKeys.add(monsterAssetKey);
    if (childAssetKey) requiredAssetKeys.add(childAssetKey);
  });
  const assetsByKey = new Map(assets.map((asset) => [asset.key || asset.asset_key, asset]));
  const assetsReady = [...requiredAssetKeys].every((key) => {
    const asset = assetsByKey.get(key);
    return asset && (asset.status === "approved") && Boolean(asset.transparent ?? asset.has_transparency) && Boolean(asset.identityApproved ?? asset.identity_approved);
  });
  const scenesReady = scenes.every((scene) => scene.status === "not_required" || (scene.status === "approved" && scene.qa?.approved === true));
  const scaleReady = (plan.scaleContract || {}).calibrationStatus === "approved";
  const costWithinCap = Number(job.actualCostCents ?? job.actual_cost_cents ?? 0) <= Number(plan.limits?.costCapCents ?? DEFAULT_JOB_COST_CAP_CENTS);
  const attemptsWithinCap = assets.every((asset) => Number(asset.attempts || 0) <= Number(asset.maxAttempts || asset.max_attempts || MAX_GENERATION_ATTEMPTS_PER_ASSET));
  const blockers = [];
  if (!exactVersion) blockers.push("Pose assets are not pinned to the exact customer-approved monster portrait version.");
  if (!assetsReady) blockers.push("Approve every required transparent pose asset after identity and anatomy review.");
  if (!scenesReady) blockers.push("Approve character scale, camera depth, bounds, eyelines, and interactions on every required page proof.");
  if (!scaleReady) blockers.push("Approve the story's physical monster-to-child scale calibration; do not use one fixed pixel height across pages.");
  if (!costWithinCap) blockers.push("The pose job exceeded its approved cost cap.");
  if (!attemptsWithinCap) blockers.push("A pose asset exceeded the bounded retry limit.");
  return { exactVersion, assetsReady, scenesReady, scaleReady, costWithinCap, attemptsWithinCap, ready: blockers.length === 0, blockers };
}

function poseForStoryPage(storySlug, pageNumber) {
  if (storySlug === "halloween-monster-night" || storySlug === "halloween-adventure") {
    return Object.entries(HALLOWEEN_MONSTER_POSE_PAGES).find(([, pages]) => pages.includes(pageNumber))?.[0] || "neutral_travel";
  }
  return MONSTER_BASE_POSES[(Math.max(1, pageNumber) - 1) % MONSTER_BASE_POSES.length].id;
}

function poseForChildStoryPage(storySlug, pageNumber) {
  if (storySlug === "halloween-monster-night" || storySlug === "halloween-adventure") {
    return Object.entries(HALLOWEEN_CHILD_POSE_PAGES).find(([, pages]) => pages.includes(pageNumber))?.[0] || "travel_observe";
  }
  return "";
}

function childPoseDirection(poseId, childCharacter) {
  const age = `Keep the child clearly within the selected ${childCharacter.ageBandLabel || childCharacter.ageBand} story age band while preserving their exact face, hair, skin tone, outfit, and identity.`;
  const mobility = childCharacter.mobilityAid === "wheelchair"
    ? "Keep the child seated in the exact approved wheelchair with wheels, footrests, body support, and seated proportions visible. Never convert this into standing, walking, running, or climbing."
    : "Use age-appropriate standing or seated proportions without stretching the reference raster.";
  return `${poseId.replaceAll("_", " ")} action. ${age} ${mobility}`;
}

function mobilityEquivalent(poseId, childCharacter) {
  if (childCharacter?.mobilityAid !== "wheelchair") return poseId;
  const equivalents = { travel_observe: "seated-travel-observe", reach_help: "seated-reach-help", celebrate: "seated-celebrate" };
  return equivalents[poseId] || "seated-travel-observe";
}

function explicitPose(value, catalog) {
  return catalog.some((pose) => pose.id === value) ? value : "";
}

function normalizePlacement(value = {}) {
  return {
    x: boundedNumber(value.x, 0, 100, 50),
    y: boundedNumber(value.y ?? value.baseline, 0, 100, 85),
    scale: boundedNumber(value.scale, 5, 95, 35),
    facing: cleanEnum(value.facing, ["left", "right", "neutral"], "neutral"),
    layer: cleanEnum(value.layer, ["front", "behind"], "front"),
  };
}

function normalizeBounds(value = {}) {
  return {
    xPercent: boundedNumber(value.xPercent, 0, 100, null),
    yPercent: boundedNumber(value.yPercent, 0, 100, null),
    widthPercent: boundedNumber(value.widthPercent, 0, 100, null),
    heightPercent: boundedNumber(value.heightPercent, 0, 100, null),
    status: [value.xPercent, value.yPercent, value.widthPercent, value.heightPercent].every((item) => Number.isFinite(Number(item))) ? "measured" : "pending_review",
  };
}

function boundedNumber(value, min, max, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
function boundedInteger(value, min, max, fallback) { const number = Number.parseInt(value, 10); return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : fallback; }
function cleanEnum(value, allowed, fallback) { return allowed.includes(value) ? value : fallback; }
function cleanText(value, max) { return typeof value === "string" ? value.trim().slice(0, max) || null : null; }
function requiredId(value, label) { const text = cleanText(value, 160); if (!text) throw posePlanError(`Choose a valid ${label}.`); return text; }
function posePlanError(message) { const error = new Error(message); error.status = 400; error.code = "invalid_pose_plan"; return error; }

module.exports = {
  CHILD_BASE_POSES,
  DEFAULT_JOB_COST_CAP_CENTS,
  HALLOWEEN_CHILD_POSE_PAGES,
  HALLOWEEN_MONSTER_POSE_PAGES,
  MAX_BASE_ASSETS,
  MAX_GENERATION_ATTEMPTS_PER_ASSET,
  MONSTER_BASE_POSES,
  buildStorybookPosePlan,
  evaluatePoseJobReadiness,
  poseForStoryPage,
};
const { childArtworkDescriptor } = require("./child-artwork");
