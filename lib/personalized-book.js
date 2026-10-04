const crypto = require("node:crypto");
const { childProfileKey: buildChildProfileKey, resolveChildCharacter } = require("./child-characters");

function buildPersonalizedBook(masterStory, order, monsterAssets = {}, renderAssets = {}) {
  if (!masterStory?.id || !Array.isArray(masterStory.pages) || masterStory.pages.length !== 32) {
    throw productionError("A saved 32-page master book is required.");
  }
  const childName = requiredText(order?.childName || order?.child_name, "Child name");
  const monsterName = requiredText(order?.monsterName || order?.monster_name, "Monster name");
  const childCharacter = normalizeChildCharacter(order?.childCharacter || order?.child_character);
  const monsterImageUrl = httpsUrl(monsterAssets.selectedPreviewUrl || monsterAssets.selected_preview_url);
  if (!monsterImageUrl) throw productionError("The order needs one approved monster image.");
  const selectedPreviewId = requiredText(order?.selectedPreviewId || order?.selected_preview_id, "Selected monster preview");
  const resolvedPreviewId = monsterAssets.selectedPreviewId || monsterAssets.selected_preview_id || selectedPreviewId;
  if (resolvedPreviewId !== selectedPreviewId) throw productionError("The approved monster image does not match this order.");
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

  const pages = masterStory.pages.map((page, index) => {
    const placement = normalizePlacement(page.monsterPlacement);
    return {
      number: index + 1,
      text: personalize(page.text, childName, monsterName),
      backgroundUrl: httpsUrl(page.artworkUrl),
      artworkStatus: page.artworkStatus || "missing",
      artworkRole: "background_plate",
      backgroundPlateConfirmed: page.backgroundPlateConfirmed === true,
      backgroundPlateVersion: Number(page.backgroundPlateVersion || 0),
      monster: page.monsterRequired === false ? null : {
          imageUrl: monsterImageUrl,
          pose: poseForPlacement(placement),
          ...placement,
        },
      child: page.childRequired === true && childCharacter.included ? {
        preset: childCharacter,
        imageUrl: childImageUrl || null,
        assetProfileKey: childProfileKey || null,
        expectedProfileKey: expectedChildProfileKey,
        assetDepiction: childDepiction || null,
        assetComposition: childAssetComposition || null,
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
    rendererVersion: rendererVersion || null,
    pages,
  };

  const requiredChildPages = pages.filter((page) => page.child);
  const mobilityAidReady = childCharacter.mobilityAid !== "wheelchair" || (
    childDepiction === "seated-wheelchair" && childAssetComposition === "child-and-wheelchair"
  );
  const readiness = {
    copyReady: pages.every((page) => page.text),
    artworkReady: pages.every((page) => page.backgroundUrl && page.backgroundPlateConfirmed && page.backgroundPlateVersion >= 2 && ["approved", "final"].includes(page.artworkStatus)),
    monsterReady: Boolean(monsterImageUrl && selectedPreviewId),
    childReady: mobilityAidReady && (requiredChildPages.length === 0 || requiredChildPages.every((page) => (
      page.child.imageUrl && page.child.assetProfileKey === page.child.expectedProfileKey
    ))),
    mobilityAidReady,
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
      monster: page.monster ? { ...page.monster, imageUrl: undefined, assetId: manifest.selectedPreviewId } : null,
      child: page.child ? { ...page.child, imageUrl: undefined } : null,
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
  if (!readiness.childReady) blockers.push("Create an approved transparent render asset that matches the selected child appearance and age profile.");
  if (!readiness.mobilityAidReady) blockers.push("Approve a seated child-and-wheelchair render asset that preserves the selected wheelchair and seated proportions on every child page.");
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
  const heightScale = { shorter: 0.9, average: 1, taller: 1.1 }[character.relativeHeight] || 1;
  if (character.mobilityAid === "wheelchair") {
    return {
      ...placement,
      pose: "seated-wheelchair",
      mobilityAid: "wheelchair",
      preserveMobilityAid: true,
      seatedProportions: true,
      bodyScale: heightScale,
      actionGuidance: "Keep the child actively participating in a seated pose with the same wheelchair visible; use move, join, lead, or follow rather than assuming standing, walking, running, or climbing.",
    };
  }
  return {
    ...placement,
    scale: bounded(placement.scale * heightScale, 15, 70, placement.scale),
    pose: "primary",
    mobilityAid: "none",
    preserveMobilityAid: false,
    seatedProportions: false,
    bodyScale: heightScale,
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

function productionError(message) {
  const error = new Error(message);
  error.name = "ProductionError";
  error.status = 400;
  return error;
}

module.exports = { buildPersonalizedBook, normalizeChildCharacter, normalizeChildPlacement, normalizePlacement, personalize, poseForPlacement, productionBlockers };
