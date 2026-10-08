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

const crypto = require("node:crypto");

// Ten illustrated shades, lightest to deepest. The original five ids (light,
// golden, medium, warm, deep) are unchanged so saved profiles and orders stay valid.
const CHILD_SKIN_TONES = Object.freeze({
  porcelain: "Porcelain",
  light: "Light",
  peach: "Peach",
  golden: "Golden",
  olive: "Olive",
  medium: "Medium",
  tan: "Tan",
  warm: "Warm brown",
  deep: "Deep",
  rich: "Rich deep",
});

const CHILD_PRESENTATIONS = Object.freeze({
  boy: "Boy",
  girl: "Girl",
  neutral: "Kid",
});

const CHILD_HAIR_COLORS = Object.freeze({
  black: "Black",
  "dark-brown": "Dark brown",
  brown: "Brown",
  auburn: "Auburn",
  red: "Red / ginger",
  blonde: "Blonde",
  platinum: "Platinum",
});

const CHILD_HAIR_STYLES = Object.freeze({
  short: "Short",
  curly: "Curls",
  coils: "Coils",
  wavy: "Waves",
  straight: "Straight",
  braids: "Braids",
  locs: "Locs",
  ponytail: "Ponytail",
  puffs: "Puffs",
  buzz: "Buzz cut",
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
  sweater: "Sweater & jeans",
  jacket: "Rain jacket",
  shorts: "Shorts & tee",
  costume: "Halloween costume",
});

const CHILD_COSTUMES = Object.freeze({
  pumpkin: "Pumpkin",
  witch: "Witch or wizard",
  superhero: "Superhero",
  dinosaur: "Dinosaur",
  astronaut: "Astronaut",
  cat: "Black cat",
});

const CHILD_GLASSES = Object.freeze({
  none: "No glasses",
  round: "Round glasses",
  square: "Square glasses",
});

const CHILD_HEARING_AIDS = Object.freeze({
  none: "None",
  "hearing-aids": "Hearing aids",
  cochlear: "Cochlear implant",
});

const CHILD_HEADWEAR = Object.freeze({
  none: "None",
  hijab: "Hijab",
  patka: "Patka / turban",
  headwrap: "Head wrap",
  kippah: "Kippah",
  beanie: "Beanie",
  cap: "Baseball cap",
});

const CHILD_FACE_DETAILS = Object.freeze({
  none: "None",
  freckles: "Freckles",
  birthmark: "Birthmark",
  "freckles-birthmark": "Freckles + birthmark",
});

// Optional parent-written detail ("gap-toothed grin", "star hair clip").
const CHILD_DETAIL_MAX_LENGTH = 80;
const CHILD_DETAIL_MAX_BYTES = 150;

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
  "9-10": "Ages 9–10",
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
  walker: "Walker",
  "prosthetic-leg": "Prosthetic leg",
  "leg-braces": "Leg braces",
});

const WHEELCHAIR_PROFILE_SUPPORT = Object.freeze({
  appearanceIds: Object.freeze(["custom", "warm-curly-dark", "deep-braids-black"]),
  ageBands: Object.freeze(["2-4", "5-6", "7-8", "9-10"]),
  relativeHeights: Object.freeze(["shorter", "average", "taller"]),
});

const FOREARM_CRUTCH_PROFILE_SUPPORT = Object.freeze({
  appearanceIds: Object.freeze(["custom"]),
  ageBands: Object.freeze(["2-4", "5-6", "7-8", "9-10"]),
  relativeHeights: Object.freeze(["shorter", "average", "taller"]),
});

// Walker, prosthetic leg, and leg braces are custom-character only.
const STANDING_AID_PROFILE_SUPPORT = Object.freeze({
  appearanceIds: Object.freeze(["custom"]),
  aids: Object.freeze(["walker", "prosthetic-leg", "leg-braces"]),
});

// Optional extras default to "none" and are left out of profile keys when
// unset, so keys for existing profiles and orders do not change.
const CHILD_EXTRA_FIELDS = Object.freeze([
  ["glasses", CHILD_GLASSES, "none"],
  ["hearingAid", CHILD_HEARING_AIDS, "none"],
  ["headwear", CHILD_HEADWEAR, "none"],
  ["faceDetail", CHILD_FACE_DETAILS, "none"],
]);

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
    ...resolveExtras(value, outfitStyle),
  };
}

function resolveExtras(value = {}, outfitStyle) {
  const extras = {};
  for (const [field, options, fallback] of CHILD_EXTRA_FIELDS) {
    const selected = supportedValue(options, value?.[field], fallback);
    extras[field] = selected;
    extras[`${field}Label`] = options[selected];
  }
  const costume = outfitStyle === "costume" ? supportedValue(CHILD_COSTUMES, value?.costume, "pumpkin") : "";
  extras.costume = costume;
  extras.costumeLabel = costume ? CHILD_COSTUMES[costume] : "";
  extras.detail = sanitizeChildDetail(value?.detail);
  return extras;
}

/**
 * Parent-written detail: plain text only, one line, at most 80 characters.
 * Anything that is not a letter, number, space, or basic punctuation is
 * dropped, so it cannot carry markup, URLs, or prompt syntax. At most 150
 * UTF-8 bytes (it is stored in the render's file name).
 */
function sanitizeChildDetail(value) {
  if (typeof value !== "string") return "";
  const detail = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+/gi, " ")
    .replace(/[^\p{L}\p{N} ,.'!?&()-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHILD_DETAIL_MAX_LENGTH)
    .replace(/\p{Cs}/gu, "")
    .trim();
  // Also cap the UTF-8 size (it is stored in a file name); only affects long non-Latin text.
  let capped = detail;
  while (Buffer.byteLength(capped, "utf8") > CHILD_DETAIL_MAX_BYTES) capped = Array.from(capped).slice(0, -1).join("");
  return capped.trim();
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
    costumes: Object.keys(CHILD_COSTUMES),
    glasses: Object.keys(CHILD_GLASSES),
    hearingAids: Object.keys(CHILD_HEARING_AIDS),
    headwear: Object.keys(CHILD_HEADWEAR),
    faceDetails: Object.keys(CHILD_FACE_DETAILS),
  };
}

function childProfileKey(character = {}) {
  if (!character.included) return null;
  const customization = character.id === "custom"
    ? `:${character.presentation}:${character.skinTone}:${character.hairStyle}:${character.hairColor}:${character.eyeColor}:${character.outfitStyle}:${character.outfitColor}`
    : "";
  const base = `${character.id}${customization}:${character.ageBand}:${character.relativeHeight}`;
  const withMobility = character.mobilityAid && character.mobilityAid !== "none" ? `${base}:${character.mobilityAid}` : base;
  if (character.id !== "custom") return withMobility;
  const extras = [];
  for (const [field, , fallback] of CHILD_EXTRA_FIELDS) {
    if (character[field] && character[field] !== fallback) extras.push(`${field}=${character[field]}`);
  }
  if (character.outfitStyle === "costume" && character.costume) extras.push(`costume=${character.costume}`);
  if (character.detail) extras.push(`detail=${crypto.createHash("sha256").update(character.detail).digest("hex").slice(0, 12)}`);
  return extras.length ? `${withMobility}+${extras.join("+")}` : withMobility;
}

function isSupportedStandingAidProfile(character = {}) {
  return STANDING_AID_PROFILE_SUPPORT.aids.includes(character.mobilityAid)
    && STANDING_AID_PROFILE_SUPPORT.appearanceIds.includes(character.id);
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
  CHILD_COSTUMES,
  CHILD_DETAIL_MAX_LENGTH,
  CHILD_EXTRA_FIELDS,
  CHILD_FACE_DETAILS,
  CHILD_GLASSES,
  CHILD_HEADWEAR,
  CHILD_HEARING_AIDS,
  STANDING_AID_PROFILE_SUPPORT,
  isSupportedStandingAidProfile,
  sanitizeChildDetail,
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
