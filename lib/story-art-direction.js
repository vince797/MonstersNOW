const BACKGROUND_ARTWORK_RULE = [
  "Create a reusable environment plate only.",
  "Do not render {child_name}, {monster_name}, or any substitute starring child, creature, silhouette, outline, or baked-in placeholder.",
  "Keep the specified child and monster zones clear, grounded, and naturally lit so both approved personalized characters can be composited there later.",
  "The admin placement guides are editor-only overlays and must never appear in uploaded artwork, customer previews, or print files.",
].join(" ");

function backgroundArtworkPrompt(scene) {
  return `${BACKGROUND_ARTWORK_RULE} ${String(scene || "").trim()}`.trim();
}

module.exports = { BACKGROUND_ARTWORK_RULE, backgroundArtworkPrompt };
