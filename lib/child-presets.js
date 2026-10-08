const { createSignedUrl, listPrivateObjectEntries, uploadPrivateImage } = require("./monster-submissions");
const { resolveChildCharacter, childProfileKey } = require("./child-characters");

// "Quick start" looks for the Character Studio. Each is painted once with the
// exact same render pipeline and prompt as a customer's character (see
// scripts/generate-child-presets.js), so the editor's painted previews match
// the animated-film look of the book. Until a look has been generated the
// editor shows its live layered sketch instead.
const PRESET_PREFIX = "presets/child-editor-v2";
const CHILD_PRESETS = Object.freeze([
  { id: "maya", label: "Curls & overalls", profile: { presentation: "girl", skinTone: "medium", hairStyle: "curly", hairColor: "dark-brown", eyeColor: "brown", outfitStyle: "overalls", outfitColor: "teal" } },
  { id: "leo", label: "Short crop & hoodie", profile: { presentation: "boy", skinTone: "light", hairStyle: "short", hairColor: "brown", eyeColor: "blue", outfitStyle: "hoodie", outfitColor: "blue" } },
  { id: "amara", label: "Puffs & dress", profile: { presentation: "girl", skinTone: "deep", hairStyle: "puffs", hairColor: "black", eyeColor: "brown", outfitStyle: "dress", outfitColor: "rose" } },
  { id: "kai", label: "Locs & sweater", profile: { presentation: "boy", skinTone: "rich", hairStyle: "locs", hairColor: "black", eyeColor: "brown", outfitStyle: "sweater", outfitColor: "orange" } },
  { id: "noor", label: "Hijab & rain jacket", profile: { presentation: "girl", skinTone: "olive", hairStyle: "straight", hairColor: "dark-brown", eyeColor: "hazel", outfitStyle: "jacket", outfitColor: "purple", headwear: "hijab" } },
  { id: "finn", label: "Ginger & glasses", profile: { presentation: "boy", skinTone: "porcelain", hairStyle: "wavy", hairColor: "red", eyeColor: "green", outfitStyle: "tee", outfitColor: "green", glasses: "round", faceDetail: "freckles" } },
  { id: "sky", label: "Kid, buzz cut", profile: { presentation: "neutral", skinTone: "tan", hairStyle: "buzz", hairColor: "black", eyeColor: "brown", outfitStyle: "shorts", outfitColor: "teal" } },
  { id: "elsie", label: "Platinum ponytail", profile: { presentation: "girl", skinTone: "peach", hairStyle: "ponytail", hairColor: "platinum", eyeColor: "blue", outfitStyle: "overalls", outfitColor: "purple" } },
  { id: "arjun", label: "Patka & hoodie", profile: { presentation: "boy", skinTone: "golden", hairStyle: "short", hairColor: "black", eyeColor: "brown", outfitStyle: "hoodie", outfitColor: "orange", headwear: "patka" } },
  { id: "zuri", label: "Wheelchair & braids", profile: { presentation: "girl", skinTone: "warm", hairStyle: "braids", hairColor: "black", eyeColor: "brown", outfitStyle: "hoodie", outfitColor: "teal", mobilityAid: "wheelchair" } },
  { id: "theo", label: "Hearing aids & coils", profile: { presentation: "boy", skinTone: "deep", hairStyle: "coils", hairColor: "black", eyeColor: "brown", outfitStyle: "tee", outfitColor: "blue", hearingAid: "hearing-aids" } },
  { id: "pumpkin", label: "Pumpkin costume", profile: { presentation: "neutral", skinTone: "medium", hairStyle: "curly", hairColor: "auburn", eyeColor: "hazel", outfitStyle: "costume", outfitColor: "orange", costume: "pumpkin" } },
].map((preset) => Object.freeze({ ...preset, profile: Object.freeze({ id: "custom", ageBand: "5-6", relativeHeight: "average", mobilityAid: "none", ...preset.profile }) })));

const MANIFEST_TTL_MS = 5 * 60 * 1000;
let manifestCache = null;

function getPreset(id) {
  return CHILD_PRESETS.find((preset) => preset.id === id) || null;
}

function presetPath(id) {
  return `${PRESET_PREFIX}/${id}.webp`;
}

/** Public manifest: every look, with a short-lived image URL once painted. */
async function getPresetManifest({ now = Date.now() } = {}) {
  if (manifestCache && manifestCache.expires > now) return manifestCache.value;
  let available = new Set();
  try {
    const entries = await listPrivateObjectEntries(PRESET_PREFIX, { max: 100 });
    available = new Set(entries.map((entry) => entry.name.replace(/\.webp$/, "")));
  } catch (error) {
    if (error.code !== "monster_storage_not_configured") console.warn("Child preset manifest unavailable", { code: error.code, message: error.message });
  }
  const presets = await Promise.all(CHILD_PRESETS.map(async (preset) => ({
    id: preset.id,
    label: preset.label,
    profile: preset.profile,
    profileKey: childProfileKey(resolveChildCharacter(preset.profile)),
    imageUrl: available.has(preset.id) ? await createSignedUrl(presetPath(preset.id)).catch(() => null) : null,
  })));
  const value = { version: 2, presets };
  manifestCache = { value, expires: now + MANIFEST_TTL_MS };
  return value;
}

async function savePresetImage(id, displayBytes) {
  await uploadPrivateImage(presetPath(id), { contentType: "image/webp", bytes: displayBytes }, { upsert: true });
  manifestCache = null;
  return presetPath(id);
}

function resetPresetManifestCache() {
  manifestCache = null;
}

module.exports = { CHILD_PRESETS, PRESET_PREFIX, getPreset, getPresetManifest, presetPath, resetPresetManifestCache, savePresetImage };
