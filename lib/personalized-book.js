const crypto = require("node:crypto");

function buildPersonalizedBook(masterStory, order, monsterAssets = {}) {
  if (!masterStory?.id || !Array.isArray(masterStory.pages) || masterStory.pages.length !== 32) {
    throw productionError("A saved 32-page master book is required.");
  }
  const childName = requiredText(order?.childName || order?.child_name, "Child name");
  const monsterName = requiredText(order?.monsterName || order?.monster_name, "Monster name");
  const monsterImageUrl = httpsUrl(monsterAssets.selectedPreviewUrl || monsterAssets.selected_preview_url);
  if (!monsterImageUrl) throw productionError("The order needs one approved monster image.");

  const pages = masterStory.pages.map((page, index) => {
    const placement = normalizePlacement(page.monsterPlacement);
    return {
      number: index + 1,
      text: personalize(page.text, childName, monsterName),
      backgroundUrl: httpsUrl(page.artworkUrl),
      artworkStatus: page.artworkStatus || "missing",
      monster: {
        imageUrl: monsterImageUrl,
        pose: poseForPlacement(placement),
        ...placement,
      },
    };
  });

  const manifest = {
    storyId: masterStory.id,
    storySlug: masterStory.slug,
    masterVersion: Number(masterStory.version || 1),
    title: personalize(masterStory.title_template, childName, monsterName),
    childName,
    monsterName,
    selectedPreviewId: order?.selectedPreviewId || order?.selected_preview_id || null,
    pages,
  };

  return {
    ...manifest,
    fingerprint: crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
    readiness: {
      copyReady: pages.every((page) => page.text),
      artworkReady: pages.every((page) => page.backgroundUrl && ["approved", "final"].includes(page.artworkStatus)),
      monsterReady: true,
    },
  };
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

module.exports = { buildPersonalizedBook, normalizePlacement, personalize, poseForPlacement };
