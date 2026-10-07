const CHILD_CHARACTERS = Object.freeze({
  none: character("none", "Monster only", false),
  custom: character("custom", "Custom illustrated child", true, "medium", "dark-brown", "curly"),
  "warm-curly-dark": character("warm-curly-dark", "Curly dark", true, "warm", "dark-brown", "curly"),
  "deep-coils-black": character("deep-coils-black", "Coils", true, "deep", "black", "coils"),
  "medium-wavy-brown": character("medium-wavy-brown", "Wavy brown", true, "medium", "brown", "wavy"),
  "golden-straight-black": character("golden-straight-black", "Straight black", true, "golden", "black", "straight"),
  "light-short-brown": character("light-short-brown", "Short brown", true, "light", "brown", "short"),
  "light-wavy-blonde": character("light-wavy-blonde", "Wavy blonde", true, "light", "blonde", "wavy"),
  "medium-curly-auburn": character("medium-curly-auburn", "Curly auburn", true, "medium", "auburn", "curly"),
  "deep-braids-black": character("deep-braids-black", "Braids", true, "deep", "black", "braids"),
});

const CHILD_SKIN_TONES = Object.freeze({
  light: "Light",
  golden: "Golden",
  medium: "Medium",
  warm: "Warm brown",
  deep: "Deep",
});

const CHILD_PRESENTATIONS = Object.freeze({
  boy: "Boy",
  girl: "Girl",
});

const CHILD_HAIR_COLORS = Object.freeze({
  black: "Black",
  "dark-brown": "Dark brown",
  brown: "Brown",
  auburn: "Auburn",
  blonde: "Blonde",
});

const CHILD_HAIR_STYLES = Object.freeze({
  short: "Short",
  curly: "Curls",
  coils: "Coils",
  wavy: "Waves",
  straight: "Straight",
  braids: "Braids",
});

const CHILD_EYE_COLORS = Object.freeze({
  brown: "Brown",
  hazel: "Hazel",
  green: "Green",
  blue: "Blue",
  gray: "Gray",
});

const CHILD_OUTFIT_STYLES = Object.freeze({
  overalls: "Overalls",
  hoodie: "Hoodie",
  tee: "T-shirt",
  dress: "Dress",
});

const CHILD_OUTFIT_COLORS = Object.freeze({
  teal: "Teal",
  orange: "Orange",
  purple: "Purple",
  blue: "Blue",
  rose: "Rose",
  green: "Green",
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
  "forearm-crutches": "Forearm crutches",
});

const WHEELCHAIR_PROFILE_SUPPORT = Object.freeze({
  appearanceIds: Object.freeze(["custom", "warm-curly-dark", "deep-braids-black"]),
  ageBands: Object.freeze(["5-6", "7-8"]),
  relativeHeights: Object.freeze(["average", "taller"]),
});

const FOREARM_CRUTCH_PROFILE_SUPPORT = Object.freeze({
  appearanceIds: Object.freeze(["custom"]),
  ageBands: Object.freeze(["2-4", "5-6", "7-8"]),
  relativeHeights: Object.freeze(["shorter", "average", "taller"]),
});

function character(id, label, included, skinTone = "", hairColor = "", hairStyle = "") {
  return Object.freeze({ id, label, included, skinTone, hairColor, hairStyle });
}

function resolveChildCharacter(value = {}) {
  const requestedId = typeof value === "string" ? value : value?.id;
  const preset = CHILD_CHARACTERS[requestedId] || CHILD_CHARACTERS.none;
  if (!preset.included) return { ...preset, presentation: "", presentationLabel: "", ageBand: "", ageBandLabel: "", relativeHeight: "", relativeHeightLabel: "", mobilityAid: "", mobilityAidLabel: "" };
  const ageBand = Object.hasOwn(CHILD_AGE_BANDS, value?.ageBand) ? value.ageBand : "5-6";
  const relativeHeight = Object.hasOwn(CHILD_RELATIVE_HEIGHTS, value?.relativeHeight) ? value.relativeHeight : "average";
  const mobilityAid = Object.hasOwn(CHILD_MOBILITY_AIDS, value?.mobilityAid) ? value.mobilityAid : "none";
  const resolved = {
    ...preset,
    ageBand,
    ageBandLabel: CHILD_AGE_BANDS[ageBand],
    relativeHeight,
    relativeHeightLabel: CHILD_RELATIVE_HEIGHTS[relativeHeight],
    mobilityAid,
    mobilityAidLabel: CHILD_MOBILITY_AIDS[mobilityAid],
  };
  if (preset.id !== "custom") return resolved;
  const presentation = supportedValue(CHILD_PRESENTATIONS, value?.presentation, "girl");
  const skinTone = supportedValue(CHILD_SKIN_TONES, value?.skinTone, "medium");
  const hairColor = supportedValue(CHILD_HAIR_COLORS, value?.hairColor, "dark-brown");
  const hairStyle = supportedValue(CHILD_HAIR_STYLES, value?.hairStyle, "curly");
  const eyeColor = supportedValue(CHILD_EYE_COLORS, value?.eyeColor, "brown");
  const outfitStyle = supportedValue(CHILD_OUTFIT_STYLES, value?.outfitStyle, "overalls");
  const outfitColor = supportedValue(CHILD_OUTFIT_COLORS, value?.outfitColor, "teal");
  return {
    ...resolved,
    presentation,
    presentationLabel: CHILD_PRESENTATIONS[presentation],
    skinTone,
    skinToneLabel: CHILD_SKIN_TONES[skinTone],
    hairColor,
    hairColorLabel: CHILD_HAIR_COLORS[hairColor],
    hairStyle,
    hairStyleLabel: CHILD_HAIR_STYLES[hairStyle],
    eyeColor,
    eyeColorLabel: CHILD_EYE_COLORS[eyeColor],
    outfitStyle,
    outfitStyleLabel: CHILD_OUTFIT_STYLES[outfitStyle],
    outfitColor,
    outfitColorLabel: CHILD_OUTFIT_COLORS[outfitColor],
  };
}

function supportedValue(options, value, fallback) {
  return Object.hasOwn(options, value) ? value : fallback;
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

function childCustomizationIds() {
  return {
    presentations: Object.keys(CHILD_PRESENTATIONS),
    skinTones: Object.keys(CHILD_SKIN_TONES),
    hairColors: Object.keys(CHILD_HAIR_COLORS),
    hairStyles: Object.keys(CHILD_HAIR_STYLES),
    eyeColors: Object.keys(CHILD_EYE_COLORS),
    outfitStyles: Object.keys(CHILD_OUTFIT_STYLES),
    outfitColors: Object.keys(CHILD_OUTFIT_COLORS),
  };
}

function childProfileKey(character = {}) {
  if (!character.included) return null;
  const customization = character.id === "custom"
    ? `:${character.presentation}:${character.skinTone}:${character.hairStyle}:${character.hairColor}:${character.eyeColor}:${character.outfitStyle}:${character.outfitColor}`
    : "";
  const base = `${character.id}${customization}:${character.ageBand}:${character.relativeHeight}`;
  return character.mobilityAid && character.mobilityAid !== "none" ? `${base}:${character.mobilityAid}` : base;
}

function isSupportedWheelchairProfile(character = {}) {
  return character.mobilityAid === "wheelchair"
    && WHEELCHAIR_PROFILE_SUPPORT.appearanceIds.includes(character.id)
    && WHEELCHAIR_PROFILE_SUPPORT.ageBands.includes(character.ageBand)
    && WHEELCHAIR_PROFILE_SUPPORT.relativeHeights.includes(character.relativeHeight);
}

function isSupportedForearmCrutchProfile(character = {}) {
  return character.mobilityAid === "forearm-crutches"
    && FOREARM_CRUTCH_PROFILE_SUPPORT.appearanceIds.includes(character.id)
    && FOREARM_CRUTCH_PROFILE_SUPPORT.ageBands.includes(character.ageBand)
    && FOREARM_CRUTCH_PROFILE_SUPPORT.relativeHeights.includes(character.relativeHeight);
}

module.exports = {
  CHILD_AGE_BANDS,
  CHILD_CHARACTERS,
  CHILD_MOBILITY_AIDS,
  CHILD_EYE_COLORS,
  CHILD_HAIR_COLORS,
  CHILD_HAIR_STYLES,
  CHILD_OUTFIT_COLORS,
  CHILD_OUTFIT_STYLES,
  CHILD_PRESENTATIONS,
  CHILD_RELATIVE_HEIGHTS,
  CHILD_SKIN_TONES,
  FOREARM_CRUTCH_PROFILE_SUPPORT,
  WHEELCHAIR_PROFILE_SUPPORT,
  childAgeBandIds,
  childCharacterIds,
  childCustomizationIds,
  childMobilityAidIds,
  childProfileKey,
  childRelativeHeightIds,
  isSupportedForearmCrutchProfile,
  isSupportedWheelchairProfile,
  resolveChildCharacter,
};
