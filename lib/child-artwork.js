const fs = require("node:fs");
const path = require("node:path");

const CHILD_ARTWORK = Object.freeze({
  "light-short-brown": artwork("Tousled brown", "assets/child-characters/light-short-brown-v1.webp"),
  "warm-curly-dark": artwork("Dark curls", "assets/child-characters/warm-curly-dark-v1.webp", "assets/child-characters/warm-curly-dark-wheelchair-v1.webp"),
  "deep-coils-black": artwork("Short coils", "assets/child-characters/deep-coils-black-v1.webp"),
  "light-wavy-blonde": artwork("Long blonde waves", "assets/child-characters/light-wavy-blonde-v1.webp"),
  "golden-straight-black": artwork("Straight black bob", "assets/child-characters/golden-straight-black-v1.webp"),
  "medium-wavy-brown": artwork("Brown waves", "assets/child-characters/medium-wavy-brown-v1.webp"),
  "medium-curly-auburn": artwork("Auburn curls", "assets/child-characters/medium-curly-auburn-v1.webp"),
  "deep-braids-black": artwork("Long braids", "assets/child-characters/deep-braids-black-v1.webp", "assets/child-characters/deep-braids-black-wheelchair-v1.webp"),
});

function artwork(label, standingPath, wheelchairPath = "") {
  return Object.freeze({ label, standingPath, wheelchairPath, version: "v1" });
}

function childArtworkDescriptor(character = {}) {
  if (!character?.included || character.id === "none") return null;
  const record = CHILD_ARTWORK[character.id];
  if (!record) throw childArtworkError("The selected child does not have approved anchor artwork.", "child_anchor_unknown");
  const mobilityAid = character.mobilityAid === "wheelchair" ? "wheelchair" : "none";
  const publicPath = mobilityAid === "wheelchair" ? record.wheelchairPath : record.standingPath;
  if (!publicPath) throw childArtworkError("The selected child does not have approved artwork for this mobility choice.", "child_anchor_mobility_unavailable");
  return {
    appearanceId: character.id,
    label: record.label,
    ageBand: character.ageBand,
    mobilityAid,
    variant: mobilityAid === "wheelchair" ? "seated-wheelchair" : "standing",
    version: record.version,
    publicPath,
    contentType: "image/webp",
  };
}

function loadChildArtwork(character = {}) {
  const descriptor = childArtworkDescriptor(character);
  if (!descriptor) return null;
  const absolutePath = path.join(__dirname, "..", descriptor.publicPath);
  let bytes;
  try {
    bytes = fs.readFileSync(absolutePath);
  } catch (error) {
    throw childArtworkError("The approved child anchor file is unavailable.", "child_anchor_file_missing", error);
  }
  return { ...descriptor, bytes };
}

function childArtworkError(message, code, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.status = 409;
  return error;
}

module.exports = { CHILD_ARTWORK, childArtworkDescriptor, loadChildArtwork };
