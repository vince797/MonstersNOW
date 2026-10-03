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

function character(id, label, included, skinTone = "", hairColor = "", hairStyle = "") {
  return Object.freeze({ id, label, included, skinTone, hairColor, hairStyle });
}

function resolveChildCharacter(value = {}) {
  const requestedId = typeof value === "string" ? value : value?.id;
  const preset = CHILD_CHARACTERS[requestedId] || CHILD_CHARACTERS.none;
  return { ...preset };
}

function childCharacterIds() {
  return Object.keys(CHILD_CHARACTERS);
}

module.exports = { CHILD_CHARACTERS, childCharacterIds, resolveChildCharacter };
