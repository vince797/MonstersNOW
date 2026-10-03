/* Canonical browser/server character catalog. Review assets are never print-ready. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MonstersNOWCharacters = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CHILD_CHARACTER_ASSET_VERSION = "candidate-v2";
  const CHILD_CHARACTER_ASSET_LABEL = "Art candidate · awaiting approval";
  const STANDING_CANDIDATES = Object.freeze({
  "deep-coils-black": {
    "file": "standing-v2.png",
    "baseline": 0.9772135416666666
  },
  "medium-wavy-brown": {
    "file": "standing.png",
    "baseline": 0.9791666666666666
  },
  "golden-straight-black": {
    "file": "standing.png",
    "baseline": 0.982421875
  },
  "light-short-brown": {
    "file": "standing.png",
    "baseline": 0.9817708333333334
  },
  "light-wavy-blonde": {
    "file": "standing.png",
    "baseline": 0.9811197916666666
  },
  "medium-curly-auburn": {
    "file": "standing.png",
    "baseline": 0.9713541666666666
  },
  "deep-braids-black": {
    "file": "standing.png",
    "baseline": 0.97265625
  }
});
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

  function candidateAsset(id, pose, filename, baseline) {
    return Object.freeze({
      id: `${id}-${pose}-candidate-v1`,
      src: `/assets/characters/candidates/${id}-v1/${filename}`,
      pose, status: "candidate", version: "candidate-v1", label: CHILD_CHARACTER_ASSET_LABEL,
      style: "soft-3d-storybook-candidate", mimeType: "image/png", transparent: true, fullBody: true,
      width: 1024, height: 1536, anchor: Object.freeze({ x: 0.5, y: baseline }),
    });
  }

  function character(id, label, included, skinTone = "", hairColor = "", hairStyle = "") {
    let poses = null;
    if (id === "warm-curly-dark") {
      poses = Object.freeze(Object.fromEntries(Object.entries({ porch: 1503, garden: 1461, "garden-quiet": 1471, "seated-home": 1495 })
        .map(([pose, baseline]) => [pose, candidateAsset(id, pose, `${pose}.png`, baseline / 1536)])));
    } else if (included) {
      const source = STANDING_CANDIDATES[id];
      poses = Object.freeze({ standing: candidateAsset(id, "standing", source.file, source.baseline) });
    }
    const asset = poses?.porch || poses?.standing || null;
    return Object.freeze({ id, label, included, skinTone, hairColor, hairStyle, asset,
      availablePoses: Object.freeze(poses ? Object.keys(poses) : []), ...(poses ? { poses } : {}) });
  }

  function resolveChildCharacter(value = {}) {
    const requestedId = typeof value === "string" ? value : value?.id;
    const preset = typeof requestedId === "string" && Object.prototype.hasOwnProperty.call(CHILD_CHARACTERS, requestedId)
      ? CHILD_CHARACTERS[requestedId] : CHILD_CHARACTERS.none;
    // Caller-supplied labels, URLs, and readiness claims never override the catalog.
    return { ...preset };
  }

  function resolveChildRenderAsset(value, pose = "porch") {
    const preset = resolveChildCharacter(value);
    return preset.poses && Object.prototype.hasOwnProperty.call(preset.poses, pose) ? preset.poses[pose] : preset.asset;
  }

  function childCharacterIds() {
    return Object.keys(CHILD_CHARACTERS);
  }

  return Object.freeze({ CHILD_CHARACTERS, childCharacterIds, resolveChildCharacter, resolveChildRenderAsset, CHILD_CHARACTER_ASSET_VERSION, CHILD_CHARACTER_ASSET_LABEL });
});
