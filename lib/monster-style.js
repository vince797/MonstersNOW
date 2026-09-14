const DEFAULT_MONSTER_STYLE_ID = "storybook";
const MONSTERSNOW_BRAND_STYLE_LABEL = "Soft 3D Storybook Monster";

// Default MonstersNOW brand style for generated monster characters, scenes,
// book art, product previews, and approval/revision previews.
const MONSTERSNOW_BRAND_STYLE_PROMPT = [
  "soft 3D cinematic storybook illustration",
  "friendly plush monster character",
  "rounded shapes",
  "expressive oversized eyes",
  "warm cozy lighting",
  "colorful but tasteful palette",
  "subtle fur or soft texture",
  "gentle shadows",
  "shallow depth of field",
  "whimsical children's book atmosphere",
  "premium animated family-film look",
  "high detail",
  "emotionally warm",
  "safe and cute for kids",
].join(", ");

const MONSTERSNOW_TRAIT_PRESERVATION_PROMPT = [
  "Keep the original monster's core shape, unusual proportions, childlike charm, and imperfections.",
  "Preserve the number of eyes, horns, arms, legs, teeth, spots, stripes, colors, expression, and other defining features.",
  "Do not turn the monster into a generic mascot or change the monster's identity too much.",
].join(" ");

const MONSTERSNOW_IMAGE_NEGATIVE_PROMPT = [
  "scary",
  "creepy",
  "horror",
  "gore",
  "weapons",
  "photorealistic humans",
  "anime",
  "flat vector art",
  "comic-book ink style",
  "harsh outlines",
  "overly realistic fur",
  "adult dark fantasy style",
  "extra limbs not present in the child's drawing",
  "distorted body parts",
  "generic mascot",
  "major identity changes",
].join(", ");

const MONSTERSNOW_COLORING_PAGE_NEGATIVE_PROMPT = [
  "scary",
  "creepy",
  "horror",
  "gore",
  "weapons",
  "anime",
  "comic-book ink style",
  "adult dark fantasy style",
  "extra limbs not present in the monster character",
  "text",
  "logo",
  "watermark",
].join(", ");

const MONSTERSNOW_STYLE_VARIANTS = {
  storybook: {
    label: MONSTERSNOW_BRAND_STYLE_LABEL,
    prompt: "Use the default MonstersNOW soft 3D storybook monster brand style exactly.",
  },
  cute: {
    label: "Soft 3D Cute Monster",
    prompt:
      "Stay within the default MonstersNOW soft 3D storybook style, with an extra gentle expression and sweet kid-friendly warmth.",
  },
  silly: {
    label: "Soft 3D Silly Monster",
    prompt:
      "Stay within the default MonstersNOW soft 3D storybook style, with a playful goofy expression and cheerful kid-friendly personality.",
  },
  adventure: {
    label: "Soft 3D Adventure Monster",
    prompt:
      "Stay within the default MonstersNOW soft 3D storybook style, with a brave cheerful pose and light storybook adventure energy.",
  },
};

const STYLE_ALIASES = {
  "soft-3d-storybook-monster": DEFAULT_MONSTER_STYLE_ID,
  "soft_3d_storybook_monster": DEFAULT_MONSTER_STYLE_ID,
};

function normalizeMonsterStyleId(style) {
  if (typeof style !== "string") {
    return DEFAULT_MONSTER_STYLE_ID;
  }

  const normalized = style.trim().toLowerCase();
  const styleId = STYLE_ALIASES[normalized] || normalized;

  return Object.prototype.hasOwnProperty.call(MONSTERSNOW_STYLE_VARIANTS, styleId)
    ? styleId
    : DEFAULT_MONSTER_STYLE_ID;
}

function getMonsterStyle(style) {
  return MONSTERSNOW_STYLE_VARIANTS[normalizeMonsterStyleId(style)];
}

function getMonsterStyleLabel(style) {
  return getMonsterStyle(style).label;
}

function buildMonsterCharacterPrompt({ style = DEFAULT_MONSTER_STYLE_ID, variationNumber = 1 } = {}) {
  const styleConfig = getMonsterStyle(style);

  return [
    "Transform the child's monster drawing into a finished MonstersNOW character.",
    `Default MonstersNOW brand style: ${MONSTERSNOW_BRAND_STYLE_PROMPT}.`,
    "Use any reference monsters only as brand style examples; the uploaded child's drawing is the source of truth for identity.",
    MONSTERSNOW_TRAIT_PRESERVATION_PROMPT,
    styleConfig.prompt,
    `Make this preview distinct from prior previews while staying faithful to the drawing. Preview number ${variationNumber} of 3.`,
    "White background. No text. No logo. Kid-friendly.",
  ].join(" ");
}

function buildStoryScenePrompt(sceneDescription = "") {
  return [
    "Create a MonstersNOW story scene starring the provided monster character.",
    `Use the default MonstersNOW brand style: ${MONSTERSNOW_BRAND_STYLE_PROMPT}.`,
    MONSTERSNOW_TRAIT_PRESERVATION_PROMPT,
    sceneDescription ? `Scene direction: ${sceneDescription}` : "",
    "No text. No logo. Kid-friendly.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildBookPageIllustrationPrompt(pageDescription = "") {
  return [
    "Create a MonstersNOW children's book page illustration starring the provided monster character.",
    `Use the default MonstersNOW brand style: ${MONSTERSNOW_BRAND_STYLE_PROMPT}.`,
    MONSTERSNOW_TRAIT_PRESERVATION_PROMPT,
    pageDescription ? `Page direction: ${pageDescription}` : "",
    "Leave room for story layout when requested. No generated body text unless explicitly requested. Kid-friendly.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildBedtimeStoryImagePrompt(sceneDescription = "") {
  return buildStoryScenePrompt(
    [
      "Bedtime story image with especially cozy lighting, calm expression, gentle composition, and soothing colors.",
      sceneDescription,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function buildProductPreviewPrompt(productDescription = "") {
  return [
    "Create a MonstersNOW product preview image featuring the provided monster character.",
    `Use the default MonstersNOW brand style: ${MONSTERSNOW_BRAND_STYLE_PROMPT}.`,
    MONSTERSNOW_TRAIT_PRESERVATION_PROMPT,
    productDescription ? `Product direction: ${productDescription}` : "",
    "Kid-friendly. No logo unless explicitly provided.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildApprovalRevisionPreviewPrompt(revisionDescription = "") {
  return [
    "Create a MonstersNOW approval or revision preview featuring the provided monster character.",
    `Use the default MonstersNOW brand style: ${MONSTERSNOW_BRAND_STYLE_PROMPT}.`,
    MONSTERSNOW_TRAIT_PRESERVATION_PROMPT,
    revisionDescription ? `Revision direction: ${revisionDescription}` : "",
    "Kid-friendly. No text. No logo unless explicitly provided.",
  ]
    .filter(Boolean)
    .join(" ");
}

module.exports = {
  DEFAULT_MONSTER_STYLE_ID,
  MONSTERSNOW_BRAND_STYLE_LABEL,
  MONSTERSNOW_BRAND_STYLE_PROMPT,
  MONSTERSNOW_TRAIT_PRESERVATION_PROMPT,
  MONSTERSNOW_IMAGE_NEGATIVE_PROMPT,
  MONSTERSNOW_COLORING_PAGE_NEGATIVE_PROMPT,
  MONSTERSNOW_STYLE_VARIANTS,
  buildApprovalRevisionPreviewPrompt,
  buildBedtimeStoryImagePrompt,
  buildBookPageIllustrationPrompt,
  buildMonsterCharacterPrompt,
  buildProductPreviewPrompt,
  buildStoryScenePrompt,
  getMonsterStyle,
  getMonsterStyleLabel,
  normalizeMonsterStyleId,
};
