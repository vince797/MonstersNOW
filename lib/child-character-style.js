const { resolveChildCharacter } = require("./child-characters");

const CHILD_CHARACTER_NEGATIVE_PROMPT = [
  "flat vector art",
  "clip art",
  "stick limbs",
  "oversized circular eyes",
  "plastic toy proportions",
  "anime styling",
  "adult proportions",
  "photorealistic child",
  "monster",
  "props",
  "text",
  "logo",
  "watermark",
  "background scenery",
  "cropped feet",
  "extra fingers",
  "existing franchise character",
].join(", ");

function buildChildCharacterRenderPrompt(value) {
  const profile = resolveChildCharacter(value);
  if (!profile.included || profile.id !== "custom") {
    const error = new Error("Choose a custom child character before making the book-quality render.");
    error.status = 400;
    error.code = "child_character_required";
    throw error;
  }

  const mobility = profile.mobilityAid === "wheelchair"
    ? "The child is seated naturally in a contemporary child-sized wheelchair. Show the complete wheelchair with accurate seated proportions."
    : "The child is standing in a relaxed, confident full-body pose.";

  return [
    "Create exactly one original child character for a premium personalized picture book.",
    "Use the first supplied image as the character identity and proportion reference. Preserve that child’s recognizable face, expression, body proportions, and confident pose while applying the selected traits below.",
    "Use the second supplied image only for the sophisticated theatrical feature-animation visual language, dimensional facial anatomy, softly modeled cheeks and nose, expressive believable eyes, detailed hair, fabric materials, and warm studio lighting.",
    "Do not resemble any existing copyrighted or franchise character.",
    `The character is a ${profile.presentationLabel.toLowerCase()} in the ${profile.ageBandLabel.toLowerCase()} range with ${profile.relativeHeightLabel.toLowerCase()} proportions.`,
    `Match these selected traits exactly: ${profile.skinToneLabel.toLowerCase()} illustrated skin tone; ${profile.hairColorLabel.toLowerCase()} ${profile.hairStyleLabel.toLowerCase()} hair; ${profile.eyeColorLabel.toLowerCase()} eyes; ${profile.outfitColorLabel.toLowerCase()} ${profile.outfitStyleLabel.toLowerCase()}.`,
    mobility,
    "Friendly warm expression, natural child proportions, clean silhouette, complete full body and footwear visible, straight-on slight three-quarter view.",
    "Render as polished cinematic 3D storybook animation with subtle skin translucency, dimensional individual hair forms, gentle ambient occlusion, soft key light, and a delicate rim light.",
    "Isolate the character on a transparent background so the same design can be placed consistently into every book scene.",
  ].join(" ");
}

module.exports = {
  CHILD_CHARACTER_NEGATIVE_PROMPT,
  buildChildCharacterRenderPrompt,
};
