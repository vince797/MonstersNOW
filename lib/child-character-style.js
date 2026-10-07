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
  "hair bun",
  "top knot",
  "braided updo",
  "braided crown",
  "existing franchise character",
].join(", ");

const HAIR_RENDER_DIRECTIONS = {
  short: "Keep the haircut visibly short around the ears and neckline with a softly shaped top.",
  curly: "Show clearly defined springy curls with dimensional individual curl clusters, not waves or straight hair.",
  coils: "Show dense, clearly defined natural coils with a rounded silhouette and visible small coil texture.",
  wavy: "Show loose, flowing S-shaped waves with a soft side-to-side rhythm, not tight curls.",
  straight: "Keep the hair unmistakably straight and smooth with clean individual strands and no curls.",
  braids: {
    girl: "The hairstyle silhouette must match two clearly separated, symmetrical shoulder-length three-strand braids: a clean center part, one woven braid hanging on each side of the face, visible interlaced segments from roots to tied tips, and the selected hair color from root to tip. No bun, top knot, crown braid, braided updo, cornrows, loose ponytail, or mostly unbraided curls.",
    boy: "The hairstyle silhouette must match multiple clearly separated short individual box braids with a clean center part, visible woven segments falling naturally forward and to both sides, and the selected hair color from root to tip. No bun, top knot, crown braid, braided updo, loose ponytail, or mostly unbraided curls.",
  },
};

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
  const hairDirection = typeof HAIR_RENDER_DIRECTIONS[profile.hairStyle] === "string"
    ? HAIR_RENDER_DIRECTIONS[profile.hairStyle]
    : HAIR_RENDER_DIRECTIONS[profile.hairStyle]?.[profile.presentation] || "Make the selected hairstyle visually unmistakable.";

  return [
    "Create exactly one original child character for a premium personalized picture book.",
    "Use the first supplied image as the character identity and proportion reference. Preserve that child’s recognizable face, expression, body proportions, and confident pose while applying the selected traits below.",
    "The selected hair, eyes, skin tone, and outfit are authoritative and must override those features in the identity reference when they differ.",
    "Use the second supplied image only for the sophisticated theatrical feature-animation visual language, dimensional facial anatomy, softly modeled cheeks and nose, expressive believable eyes, detailed hair, fabric materials, and warm studio lighting.",
    "Do not resemble any existing copyrighted or franchise character.",
    `The character is a ${profile.presentationLabel.toLowerCase()} in the ${profile.ageBandLabel.toLowerCase()} range with ${profile.relativeHeightLabel.toLowerCase()} proportions.`,
    `Match these selected traits exactly: ${profile.skinToneLabel.toLowerCase()} illustrated skin tone; ${profile.hairColorLabel.toLowerCase()} ${profile.hairStyleLabel.toLowerCase()} hair; ${profile.eyeColorLabel.toLowerCase()} eyes; ${profile.outfitColorLabel.toLowerCase()} ${profile.outfitStyleLabel.toLowerCase()}.`,
    hairDirection,
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
