const CHILD_CHARACTERS = Object.freeze({
  none: character("none", "Monster only", false),
  "warm-curly-dark": character("warm-curly-dark", "Dark curls", true, "boy", "warm-brown", "dark-brown", "curly"),
  "deep-coils-black": character("deep-coils-black", "Short coils", true, "boy", "deep", "black", "coils"),
  "medium-wavy-brown": character("medium-wavy-brown", "Brown waves", true, "girl", "medium", "brown", "wavy"),
  "golden-straight-black": character("golden-straight-black", "Straight black bob", true, "girl", "golden", "black", "straight"),
  "light-short-brown": character("light-short-brown", "Tousled brown", true, "boy", "light", "brown", "short"),
  "light-wavy-blonde": character("light-wavy-blonde", "Long blonde waves", true, "girl", "light", "blonde", "wavy"),
  "medium-curly-auburn": character("medium-curly-auburn", "Auburn curls", true, "girl", "medium", "auburn", "curly"),
  "deep-braids-black": character("deep-braids-black", "Long braids", true, "girl", "deep", "black", "braids"),
});

const CHILD_AGE_BANDS = Object.freeze({
  "3-5": "Ages 3–5",
  "6-8": "Ages 6–8",
});

// Retained only so existing orders and saved profiles remain readable. These
// values are never silently mapped to the launch bands because 5–6 crosses
// the new boundary and the older ranges do not describe the same asset set.
const LEGACY_CHILD_AGE_BANDS = Object.freeze({
  "2-4": "Legacy ages 2–4",
  "5-6": "Legacy ages 5–6",
  "7-8": "Legacy ages 7–8",
});

const CHILD_RELATIVE_HEIGHTS = Object.freeze({
  standard: "Standard illustrated proportions",
  shorter: "Shorter than most children this age",
  average: "About average height",
  taller: "Taller than most children this age",
});

const CHILD_MOBILITY_AIDS = Object.freeze({
  none: "No mobility aid",
  wheelchair: "Wheelchair",
});

const WHEELCHAIR_PROFILE_SUPPORT = Object.freeze({
  appearanceIds: Object.freeze(["warm-curly-dark", "deep-braids-black"]),
  ageBands: Object.freeze(["6-8"]),
  legacyAgeBands: Object.freeze(["5-6", "7-8"]),
  legacyRelativeHeights: Object.freeze(["average", "taller"]),
});

function character(id, label, included, gender = "", skinTone = "", hairColor = "", hairStyle = "") {
  return Object.freeze({ id, label, included, gender, skinTone, hairColor, hairStyle });
}

function resolveChildCharacter(value = {}) {
  const requestedId = typeof value === "string" ? value : value?.id;
  const preset = CHILD_CHARACTERS[requestedId] || CHILD_CHARACTERS.none;
  if (!preset.included) return { ...preset, ageBand: "", ageBandLabel: "", relativeHeight: "", relativeHeightLabel: "", mobilityAid: "", mobilityAidLabel: "" };
  const requestedAgeBand = value?.ageBand;
  const legacyProfile = Object.hasOwn(LEGACY_CHILD_AGE_BANDS, requestedAgeBand);
  const ageBand = Object.hasOwn(CHILD_AGE_BANDS, requestedAgeBand) || legacyProfile ? requestedAgeBand : "6-8";
  const relativeHeight = legacyProfile && Object.hasOwn(CHILD_RELATIVE_HEIGHTS, value?.relativeHeight)
    ? value.relativeHeight
    : "standard";
  const mobilityAid = Object.hasOwn(CHILD_MOBILITY_AIDS, value?.mobilityAid) ? value.mobilityAid : "none";
  return {
    ...preset,
    ageBand,
    ageBandLabel: CHILD_AGE_BANDS[ageBand] || LEGACY_CHILD_AGE_BANDS[ageBand],
    relativeHeight,
    relativeHeightLabel: CHILD_RELATIVE_HEIGHTS[relativeHeight],
    mobilityAid,
    mobilityAidLabel: CHILD_MOBILITY_AIDS[mobilityAid],
    profileVersion: legacyProfile ? "legacy-v1" : "launch-v2",
    legacyProfile,
    requiresAgeBandReselection: legacyProfile,
  };
}

function childCharacterIds() {
  return Object.keys(CHILD_CHARACTERS);
}

function childAgeBandIds() {
  return [...Object.keys(CHILD_AGE_BANDS), ...Object.keys(LEGACY_CHILD_AGE_BANDS)];
}

function childRelativeHeightIds() {
  return Object.keys(CHILD_RELATIVE_HEIGHTS);
}

function childMobilityAidIds() {
  return Object.keys(CHILD_MOBILITY_AIDS);
}

function childProfileKey(character = {}) {
  if (!character.included) return null;
  const base = character.legacyProfile || Object.hasOwn(LEGACY_CHILD_AGE_BANDS, character.ageBand)
    ? `${character.id}:${character.ageBand}:${character.relativeHeight || "average"}`
    : `${character.id}:${character.ageBand}`;
  return character.mobilityAid && character.mobilityAid !== "none" ? `${base}:${character.mobilityAid}` : base;
}

function isSupportedWheelchairProfile(character = {}) {
  if (character.mobilityAid !== "wheelchair" || !WHEELCHAIR_PROFILE_SUPPORT.appearanceIds.includes(character.id)) return false;
  if (WHEELCHAIR_PROFILE_SUPPORT.ageBands.includes(character.ageBand)) return true;
  return WHEELCHAIR_PROFILE_SUPPORT.legacyAgeBands.includes(character.ageBand)
    && WHEELCHAIR_PROFILE_SUPPORT.legacyRelativeHeights.includes(character.relativeHeight);
}

module.exports = {
  CHILD_AGE_BANDS,
  CHILD_CHARACTERS,
  CHILD_MOBILITY_AIDS,
  CHILD_RELATIVE_HEIGHTS,
  LEGACY_CHILD_AGE_BANDS,
  WHEELCHAIR_PROFILE_SUPPORT,
  childAgeBandIds,
  childCharacterIds,
  childMobilityAidIds,
  childProfileKey,
  childRelativeHeightIds,
  isSupportedWheelchairProfile,
  resolveChildCharacter,
};
