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
  "unrequested props",
  "text",
  "logo",
  "watermark",
  "background scenery",
  "cropped feet",
  "cropped wheelchair",
  "missing wheelchair wheel",
  "floating wheelchair wheel",
  "hospital wheelchair",
  "extra fingers",
  "hair bun",
  "top knot",
  "braided updo",
  "braided crown",
  "existing franchise character",
].join(", ");

const HAIR_RENDER_DIRECTIONS = {
  short: {
    girl: "The hairstyle silhouette must match an ear-length asymmetrical textured pixie-bob: a longer side-swept top, softly curled wisps, and both ears and the neckline visible. No long hair, ponytail, bun, shoulder-length bob, or straight blunt fringe.",
    boy: "The hairstyle silhouette must match a short tapered crop: closely shaped around the ears and neckline with a fuller tousled side-swept top. No long hair, bowl cut, shoulder-length hair, ponytail, or heavy straight fringe.",
  },
  curly: {
    girl: "The hairstyle silhouette must match a high gathered curly ponytail with large springy ringlets and a few long corkscrew curls framing both sides of the face. Keep individual ringlets clearly visible. No bun, dense coily halo, waves, braids, or straight hair.",
    boy: "The hairstyle silhouette must match a short rounded crop of broad springy ringlets with the ears and lower neckline visible. Keep individual curl loops clearly visible. No dense tiny coils, waves, braids, straight fringe, or long hair.",
  },
  coils: {
    girl: "The hairstyle silhouette must match a full shoulder-length rounded halo of dense small natural corkscrew coils with consistent tight texture from roots to ends. No high ponytail, loose ringlets, broad waves, braids, or straight sections.",
    boy: "The hairstyle silhouette must match a short close-shaped coily crop with dense small natural coils, a rounded top, and neatly tapered sides around the ears. No broad loose ringlets, waves, braids, straight fringe, or long hair.",
  },
  wavy: {
    girl: "The hairstyle silhouette must match full shoulder-length hair with a soft side part and broad flowing S-shaped waves from mid-length to the ends. No tight ringlets, small coils, braids, ponytail, or pin-straight sections.",
    boy: "The hairstyle silhouette must match an ear-length side-parted cut with broad swept S-shaped waves across the top and soft volume at the sides. No ringlets, tiny coils, braids, straight fringe, or shoulder-length hair.",
  },
  straight: {
    girl: "The hairstyle silhouette must match a smooth shoulder-length blunt lob with a clean center part, straight strands, and only a slight inward bend at the ends. No waves, curls, coils, braids, bangs, ponytail, or bun.",
    boy: "The hairstyle silhouette must match a short smooth layered crop with a side-swept straight fringe, clean shape around the ears, and a short neckline. No waves, curls, coils, braids, bowl cut, or long hair.",
  },
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
    ? "The child is seated naturally and confidently in a contemporary child-sized wheelchair with a manual frame. Show the complete wheelchair with accurate seated proportions: both large rear wheels and hand rims, both front casters, frame, seat, backrest, and footplate fully visible. Both feet rest naturally on the footplate, hands rest naturally near the wheel rims or lap, and every wheel touches the same ground plane. The wheelchair is part of the child’s consistent character design, never a hospital prop."
    : profile.mobilityAid === "forearm-crutches"
      ? "The child stands naturally and confidently using exactly two correctly fitted child-sized forearm crutches. Show one crutch on each side: both cuffs secured around the forearms, both hands resting naturally on the grips, straight shafts, and both rubber tips touching the ground. Keep both complete crutches fully visible. These are forearm crutches, never underarm crutches, canes, or a walker."
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
