const CHILD_CHARACTERS = Object.freeze({
  none: character("none", "Monster only", false),
  "warm-curly-dark": character("warm-curly-dark", "Curly dark", true, "warm", "dark-brown", "curly"),
  "deep-coils-black": character("deep-coils-black", "Coils", true, "deep", "black", "coils"),
  "medium-wavy-brown": character("medium-wavy-brown", "Wavy brown", true, "medium", "brown", "wavy"),
  "golden-straight-black": character("golden-straight-black", "Straight black", true, "golden", "black", "straight"),
  "light-short-brown": character("light-short-brown", "Short brown", true, "light", "brown", "short"),
  "light-wavy-blonde": character("light-wavy-blonde", "Wavy blonde", true, "light", "blonde", "wavy"),
  "medium-curly-auburn": character("medium-curly-auburn", "Curly auburn", true, "medium", "auburn", "curly"),
  "deep-braids-black": character("deep-braids-black", "Braids", true, "deep", "black", "braids"),
});

const CHILD_AGE_BANDS = Object.freeze({
  "2-4": "Ages 2–4",
  "5-6": "Ages 5–6",
  "7-8": "Ages 7–8",
});

const CHILD_RELATIVE_HEIGHTS = Object.freeze({
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
  ageBands: Object.freeze(["5-6", "7-8"]),
  relativeHeights: Object.freeze(["average", "taller"]),
});

function character(id, label, included, skinTone = "", hairColor = "", hairStyle = "") {
  return Object.freeze({ id, label, included, skinTone, hairColor, hairStyle });
}

function resolveChildCharacter(value = {}) {
  const requestedId = typeof value === "string" ? value : value?.id;
  const preset = CHILD_CHARACTERS[requestedId] || CHILD_CHARACTERS.none;
  if (!preset.included) return { ...preset, ageBand: "", ageBandLabel: "", relativeHeight: "", relativeHeightLabel: "", mobilityAid: "", mobilityAidLabel: "" };
  const ageBand = Object.hasOwn(CHILD_AGE_BANDS, value?.ageBand) ? value.ageBand : "5-6";
  const relativeHeight = Object.hasOwn(CHILD_RELATIVE_HEIGHTS, value?.relativeHeight) ? value.relativeHeight : "average";
  const mobilityAid = Object.hasOwn(CHILD_MOBILITY_AIDS, value?.mobilityAid) ? value.mobilityAid : "none";
  return {
    ...preset,
    ageBand,
    ageBandLabel: CHILD_AGE_BANDS[ageBand],
    relativeHeight,
    relativeHeightLabel: CHILD_RELATIVE_HEIGHTS[relativeHeight],
    mobilityAid,
    mobilityAidLabel: CHILD_MOBILITY_AIDS[mobilityAid],
  };
}

function childCharacterIds() {
  return Object.keys(CHILD_CHARACTERS);
}

function childAgeBandIds() {
  return Object.keys(CHILD_AGE_BANDS);
}

function childRelativeHeightIds() {
  return Object.keys(CHILD_RELATIVE_HEIGHTS);
}

function childMobilityAidIds() {
  return Object.keys(CHILD_MOBILITY_AIDS);
}

function childProfileKey(character = {}) {
  if (!character.included) return null;
  const base = `${character.id}:${character.ageBand}:${character.relativeHeight}`;
  return character.mobilityAid && character.mobilityAid !== "none" ? `${base}:${character.mobilityAid}` : base;
}

function isSupportedWheelchairProfile(character = {}) {
  return character.mobilityAid === "wheelchair"
    && WHEELCHAIR_PROFILE_SUPPORT.appearanceIds.includes(character.id)
    && WHEELCHAIR_PROFILE_SUPPORT.ageBands.includes(character.ageBand)
    && WHEELCHAIR_PROFILE_SUPPORT.relativeHeights.includes(character.relativeHeight);
}

module.exports = {
  CHILD_AGE_BANDS,
  CHILD_CHARACTERS,
  CHILD_MOBILITY_AIDS,
  CHILD_RELATIVE_HEIGHTS,
  WHEELCHAIR_PROFILE_SUPPORT,
  childAgeBandIds,
  childCharacterIds,
  childMobilityAidIds,
  childProfileKey,
  childRelativeHeightIds,
  isSupportedWheelchairProfile,
  resolveChildCharacter,
};
