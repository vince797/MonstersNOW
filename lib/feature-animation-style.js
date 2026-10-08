// Shared "animated feature film" look for every OpenAI character render
// (monster previews in /api/convert-monster, the child in
// /api/render-child-character, and story/product/revision prompts).
//
// Describe the look in generic craft terms only. Never name a studio, film,
// franchise, or trademark here or in user-facing copy, and never ask the model
// to imitate an existing character: MonstersNOW characters are original and
// come from the child's own drawing / Character Studio choices.

const FEATURE_ANIMATION_LOOK_PROMPT = [
  "polished 3D animated feature-film character look",
  "warm, expressive, highly appealing character acting",
  "big expressive eyes with soft glossy catchlights",
  "appealing rounded shapes and a clear readable silhouette",
  "soft dimensional modeling with subtle subsurface translucency",
  "soft warm cinematic key light with gentle fill, soft bounce light, and a delicate rim light",
  "gentle ambient occlusion and soft contact shadows",
  "rich but tasteful color",
].join(", ");

const ORIGINAL_CHARACTER_GUARD = [
  "This is an original character.",
  "Do not imitate, reference, or resemble any existing studio, film, franchise, mascot, or trademarked character, and do not add any studio logo or signature.",
].join(" ");

const FEATURE_ANIMATION_NEGATIVE_TERMS = [
  "existing studio, film, or franchise character",
  "studio logo",
  "flat 2D cartoon shading",
  "low-poly or video-game render",
  "cheap plastic toy look",
  "dead or vacant eyes",
  "uncanny photorealism",
  "harsh flat lighting",
];

module.exports = {
  FEATURE_ANIMATION_LOOK_PROMPT,
  FEATURE_ANIMATION_NEGATIVE_TERMS,
  ORIGINAL_CHARACTER_GUARD,
};
