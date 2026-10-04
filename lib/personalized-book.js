const crypto = require("node:crypto");
const { childProfileKey: buildChildProfileKey, isSupportedWheelchairProfile, resolveChildCharacter } = require("./child-characters");

function buildPersonalizedBook(masterStory, order, monsterAssets = {}, renderAssets = {}) {
  if (!masterStory?.id || !Array.isArray(masterStory.pages) || masterStory.pages.length !== 32) {
    throw productionError("A saved 32-page master book is required.");
  }
  const childName = requiredText(order?.childName || order?.child_name, "Child name");
  const monsterName = requiredText(order?.monsterName || order?.monster_name, "Monster name");
  const childCharacter = normalizeChildCharacter(order?.childCharacter || order?.child_character);
  const monsterImageUrl = httpsUrl(monsterAssets.selectedPreviewUrl || monsterAssets.selected_preview_url);
  const originalDrawingUrl = httpsUrl(monsterAssets.originalUrl || monsterAssets.original_url);
  const originalDrawingAssetId = typeof (monsterAssets.originalPath || monsterAssets.original_path) === "string" ? String(monsterAssets.originalPath || monsterAssets.original_path) : null;
  if (!monsterImageUrl) throw productionError("The order needs one approved monster image.");
  const selectedPreviewId = requiredText(order?.selectedPreviewId || order?.selected_preview_id, "Selected monster preview");
  const resolvedPreviewId = monsterAssets.selectedPreviewId || monsterAssets.selected_preview_id || selectedPreviewId;
  if (resolvedPreviewId !== selectedPreviewId) throw productionError("The approved monster image does not match this order.");
  const poseSet = monsterAssets.poseSet || monsterAssets.pose_set || null;
  const poseAssets = new Map((poseSet?.assets || []).map((asset) => [asset.key || asset.asset_key, asset]));
  const poseScenes = new Map((poseSet?.scenes || []).map((scene) => [Number(scene.pageNumber || scene.page_number), scene]));
  const childImageUrl = httpsUrl(renderAssets.childImageUrl || renderAssets.child_image_url);
  const expectedChildProfileKey = buildChildProfileKey(childCharacter);
  const childProfileKey = typeof (renderAssets.childProfileKey || renderAssets.child_profile_key) === "string"
    ? String(renderAssets.childProfileKey || renderAssets.child_profile_key).trim()
    : "";
  const rendererVersion = typeof renderAssets.rendererVersion === "string" ? renderAssets.rendererVersion.trim() : "";
  const childDepiction = typeof (renderAssets.childDepiction || renderAssets.child_depiction) === "string"
    ? String(renderAssets.childDepiction || renderAssets.child_depiction).trim()
    : "";
  const childAssetComposition = typeof (renderAssets.childAssetComposition || renderAssets.child_asset_composition) === "string"
    ? String(renderAssets.childAssetComposition || renderAssets.child_asset_composition).trim()
    : "";
  const childAssetApproved = renderAssets.childAssetApproved === true || renderAssets.child_asset_approved === true;
  const childPageVerification = typeof (renderAssets.childPageVerification || renderAssets.child_page_verification) === "string"
    ? String(renderAssets.childPageVerification || renderAssets.child_page_verification).trim()
    : "";

  const pages = masterStory.pages.map((page, index) => {
    const isOpeningPage = index < 3;
    const placement = normalizePlacement(page.monsterPlacement);
    const scene = poseScenes.get(index + 1);
    const monsterPoseAsset = resolvePoseAsset(poseAssets, scene?.monsterAssetKey || scene?.monster_asset_key || scene?.composition?.monster?.assetKey);
    const childPoseAsset = resolvePoseAsset(poseAssets, scene?.childAssetKey || scene?.child_asset_key || scene?.composition?.child?.assetKey);
    return {
      number: index + 1,
      text: personalize(page.text, childName, monsterName),
      backgroundUrl: httpsUrl(page.artworkUrl),
      artworkStatus: page.artworkStatus || "missing",
      artworkRole: "background_plate",
      backgroundPlateConfirmed: page.backgroundPlateConfirmed === true,
      backgroundPlateVersion: Number(page.backgroundPlateVersion || 0),
      openingArtifact: index === 0 ? {
        role: "title_dedication_copyright_source_credit",
        imageUrl: null,
        withinExistingPage: true,
        sourceCreditRequired: true,
      } : index === 1 ? {
        role: "original_monster_drawing",
        imageUrl: originalDrawingUrl || null,
        preserveSourcePixels: true,
        preserveAspectRatio: true,
        aiRedrawForbidden: true,
        sourcePreviewId: null,
        assetId: originalDrawingAssetId,
      } : index === 2 ? {
        role: "approved_monster_portrait",
        imageUrl: monsterImageUrl,
        preserveAspectRatio: true,
        sourcePreviewId: selectedPreviewId,
        monsterName,
      } : null,
      monster: isOpeningPage || page.monsterRequired === false ? null : {
          imageUrl: monsterPoseAsset?.url || monsterImageUrl,
          assetId: monsterPoseAsset?.id || selectedPreviewId,
          assetKey: monsterPoseAsset?.key || null,
          poseJobId: poseSet?.id || null,
          pose: monsterPoseAsset?.poseId || poseForPlacement(placement),
          composition: scene?.composition?.monster || null,
          sceneQa: scene?.qa || null,
          ...placement,
        },
      child: !isOpeningPage && page.childRequired === true && childCharacter.included ? {
        preset: childCharacter,
        imageUrl: childPoseAsset?.url || childImageUrl || null,
        assetId: childPoseAsset?.id || null,
        assetKey: childPoseAsset?.key || null,
        poseJobId: poseSet?.id || null,
        composition: scene?.composition?.child || null,
        sceneQa: scene?.qa || null,
        assetProfileKey: childProfileKey || null,
        expectedProfileKey: expectedChildProfileKey,
        assetDepiction: childDepiction || null,
        assetComposition: childAssetComposition || null,
        assetApproved: childAssetApproved,
        pageVerification: childPageVerification || null,
        ...normalizeChildPlacement(page.childPlacement, childCharacter),
      } : null,
    };
  });

  const manifest = {
    storyId: masterStory.id,
    storySlug: masterStory.slug,
    masterVersion: Number(masterStory.version || 1),
    title: personalize(masterStory.title_template, childName, monsterName),
    childName,
    monsterName,
    childCharacter,
    selectedPreviewId,
    poseJobId: poseSet?.id || null,
    openingSequence: {
      pageCount: 3,
      withinExisting32Pages: true,
      addsPages: false,
      titleAndCreditsPage: 1,
      originalDrawingPage: 2,
      approvedPortraitPage: 3,
      storyStartsOnPage: 4,
      originalDrawingAvailable: Boolean(originalDrawingUrl),
      originalDrawingAssetId,
      approvedPortraitVersion: selectedPreviewId,
    },
    rendererVersion: rendererVersion || null,
    pages,
  };

  const requiredChildPages = pages.filter((page) => page.child);
  const childProfileCurrent = !childCharacter.included || childCharacter.requiresAgeBandReselection !== true;
  const requiredMonsterPages = pages.filter((page) => page.monster);
  const poseSetPinned = Boolean(poseSet && poseSet.status === "approved" && poseSet.sourcePreviewId === selectedPreviewId && poseSet.storyId === masterStory.id && Number(poseSet.storyVersion) === Number(masterStory.version || 1));
  const monsterPoseReady = poseSetPinned && requiredMonsterPages.every((page) => page.monster.assetKey && page.monster.sceneQa?.approved === true);
  const childPoseReady = requiredChildPages.length === 0 || (poseSetPinned && requiredChildPages.every((page) => page.child.assetKey && page.child.sceneQa?.approved === true));
  const wheelchairProfileSupported = childCharacter.mobilityAid !== "wheelchair" || isSupportedWheelchairProfile(childCharacter);
  const mobilityAidReady = childCharacter.mobilityAid !== "wheelchair" || (
    wheelchairProfileSupported && childDepiction === "seated-wheelchair" && childAssetComposition === "child-and-wheelchair"
  );
  const childApprovalReady = requiredChildPages.length === 0 || (
    childAssetApproved && childPageVerification === "all-required-pages"
  );
  const readiness = {
    copyReady: pages.every((page) => page.text),
    artworkReady: pages.every((page) => page.backgroundUrl && page.backgroundPlateConfirmed && page.backgroundPlateVersion >= 2 && ["approved", "final"].includes(page.artworkStatus)),
    monsterReady: Boolean(monsterImageUrl && selectedPreviewId),
    monsterPoseReady,
    openingSequenceReady: Boolean(originalDrawingUrl && monsterImageUrl && selectedPreviewId),
    childProfileCurrent,
    childPoseReady,
    childReady: childProfileCurrent && childPoseReady && mobilityAidReady && childApprovalReady && (requiredChildPages.length === 0 || requiredChildPages.every((page) => (
      page.child.imageUrl && page.child.assetProfileKey === page.child.expectedProfileKey
    ))),
    mobilityAidReady,
    wheelchairProfileSupported,
    childApprovalReady,
    rendererReady: rendererVersion === "personalized-composite-v1",
  };
  readiness.productionReady = Object.values(readiness).every(Boolean);

  return {
    ...manifest,
    fingerprint: fingerprintManifest(manifest),
    readiness: {
      ...readiness,
      blockers: productionBlockers(readiness),
    },
  };
}

function fingerprintManifest(manifest) {
  const stableManifest = {
    ...manifest,
    pages: manifest.pages.map((page) => ({
      ...page,
      monster: page.monster ? { ...page.monster, imageUrl: undefined } : null,
      child: page.child ? { ...page.child, imageUrl: undefined } : null,
      openingArtifact: page.openingArtifact ? { ...page.openingArtifact, imageUrl: undefined } : null,
    })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(stableManifest)).digest("hex");
}

function normalizeChildCharacter(value = {}) {
  return resolveChildCharacter(value);
}

function productionBlockers(readiness) {
  const blockers = [];
  if (!readiness.copyReady) blockers.push("Complete all 32 personalized story pages.");
  if (!readiness.artworkReady) blockers.push("Approve clean child-free and monster-free background plates for all 32 pages.");
  if (!readiness.monsterReady) blockers.push("Select and save the approved customer monster preview.");
  if (!readiness.monsterPoseReady) blockers.push("Approve an exact-version transparent monster pose set and page continuity mapping for every monster page.");
  if (!readiness.openingSequenceReady) blockers.push("Attach the unchanged original drawing and exact approved monster portrait to the three-page opening sequence without adding pages.");
  if (!readiness.childProfileCurrent) blockers.push("Reselect the saved legacy child age as Ages 3–5 or Ages 6–8 before creating a new production proof.");
  if (!readiness.childReady) blockers.push("Create an approved transparent render asset that matches the selected child appearance and age profile.");
  if (!readiness.childPoseReady) blockers.push("Approve the bounded child pose set and page-specific mobility-aware mappings for every required child page.");
  if (!readiness.mobilityAidReady) blockers.push("Approve a seated child-and-wheelchair render asset that preserves the selected wheelchair and seated proportions on every child page.");
  if (!readiness.wheelchairProfileSupported) blockers.push("Choose a supported wheelchair appearance and current age band.");
  if (!readiness.childApprovalReady) blockers.push("Approve the exact child asset and record successful composition review on every required child page.");
  if (!readiness.rendererReady) blockers.push("Enable the personalized background, child, and monster compositor before print export.");
  return blockers;
}

function personalize(value, childName, monsterName) {
  return String(value || "").replaceAll("{child_name}", childName).replaceAll("{monster_name}", monsterName).trim();
}

function normalizePlacement(value = {}) {
  return {
    x: bounded(value.x, 5, 95, 68),
    y: bounded(value.y, 10, 95, 72),
    scale: bounded(value.scale, 15, 70, 36),
    facing: ["left", "right", "neutral"].includes(value.facing) ? value.facing : "left",
    layer: ["front", "behind"].includes(value.layer) ? value.layer : "front",
  };
}

function normalizeChildPlacement(value = {}, character = {}) {
  const placement = normalizePlacement(value);
  if (character.mobilityAid === "wheelchair") {
    return {
      ...placement,
      pose: "seated-wheelchair",
      mobilityAid: "wheelchair",
      preserveMobilityAid: true,
      seatedProportions: true,
      bodyScale: 1,
      actionGuidance: "Keep the child actively participating in a seated pose with the same wheelchair visible; use move, join, lead, or follow rather than assuming standing, walking, running, or climbing.",
    };
  }
  return {
    ...placement,
    scale: placement.scale,
    pose: "primary",
    mobilityAid: "none",
    preserveMobilityAid: false,
    seatedProportions: false,
    bodyScale: 1,
    actionGuidance: "Keep the child actively participating without inferring abilities or medical details.",
  };
}

function poseForPlacement(placement) {
  if (placement.facing === "right") return "primary-mirrored";
  if (placement.facing === "neutral") return "primary-front";
  return "primary";
}

function bounded(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function requiredText(value, label) {
  const text = typeof value === "string" ? value.trim().slice(0, 40) : "";
  if (!text) throw productionError(`${label} is required.`);
  return text;
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch { return ""; }
}

function resolvePoseAsset(assets, key) {
  if (!key) return null;
  const asset = assets.get(key);
  return asset && asset.status === "approved" && httpsUrl(asset.url) ? asset : null;
}

function productionError(message) {
  const error = new Error(message);
  error.name = "ProductionError";
  error.status = 400;
  return error;
}

module.exports = { buildPersonalizedBook, normalizeChildCharacter, normalizeChildPlacement, normalizePlacement, personalize, poseForPlacement, productionBlockers };
