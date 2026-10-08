const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const monsterStyle = require("../lib/monster-style");
const { buildChildCharacterRenderPrompt, CHILD_CHARACTER_NEGATIVE_PROMPT } = require("../lib/child-character-style");
const { FEATURE_ANIMATION_LOOK_PROMPT, ORIGINAL_CHARACTER_GUARD } = require("../lib/feature-animation-style");

const root = path.join(__dirname, "..");
const TRADEMARKS = /disney|pixar|dreamworks|illumination entertainment/i;

const childPrompt = () => buildChildCharacterRenderPrompt({
  id: "custom", presentation: "boy", skinTone: "warm", hairStyle: "curly", hairColor: "dark-brown",
  eyeColor: "brown", outfitStyle: "overalls", outfitColor: "teal",
  ageBand: "5-6", relativeHeight: "average", mobilityAid: "none",
});

const allMonsterPrompts = () => [
  ...Object.keys(monsterStyle.MONSTERSNOW_STYLE_VARIANTS).map((style) => monsterStyle.buildMonsterCharacterPrompt({ style, variationNumber: 2 })),
  monsterStyle.buildStoryScenePrompt("porch"),
  monsterStyle.buildBookPageIllustrationPrompt("page"),
  monsterStyle.buildBedtimeStoryImagePrompt("bed"),
  monsterStyle.buildProductPreviewPrompt("mug"),
  monsterStyle.buildApprovalRevisionPreviewPrompt("bigger horns"),
];

test("monster and child renders ask for the animated feature-film look", () => {
  for (const prompt of [...allMonsterPrompts(), childPrompt()]) {
    assert.match(prompt, /3D animated feature-film/i);
    assert.match(prompt, /big expressive eyes/i);
    assert.match(prompt, /soft warm cinematic key light/i);
    assert.ok(prompt.includes(ORIGINAL_CHARACTER_GUARD), "original-character guard present");
  }
});

test("monster prompt keeps the child's drawing recognizable", () => {
  const prompt = monsterStyle.buildMonsterCharacterPrompt({ style: "storybook" });
  assert.match(prompt, /drawing is the design.*do not redesign/i);
  assert.match(prompt, /silhouette/i);
  assert.match(prompt, /number of eyes, horns, arms, legs/i);
  assert.match(prompt, /only within the drawing's own eye count/i);
  assert.match(prompt, /uploaded child's drawing is the source of truth/i);
});

test("child eyes are big but the negative prompt no longer fights the style", () => {
  assert.doesNotMatch(CHILD_CHARACTER_NEGATIVE_PROMPT, /(^|, )oversized circular eyes/);
  assert.match(CHILD_CHARACTER_NEGATIVE_PROMPT, /existing studio, film, or franchise character/);
  assert.match(childPrompt(), /believable, recognizable child/i);
});

test("no studio trademark in prompts, negatives, or user-facing copy", () => {
  const texts = [
    FEATURE_ANIMATION_LOOK_PROMPT, ...allMonsterPrompts(), childPrompt(), CHILD_CHARACTER_NEGATIVE_PROMPT,
    monsterStyle.MONSTERSNOW_IMAGE_NEGATIVE_PROMPT,
    ...Object.values(monsterStyle.MONSTERSNOW_STYLE_VARIANTS).map((v) => v.label),
  ];
  for (const text of texts) assert.doesNotMatch(text, TRADEMARKS);
  const pages = fs.readdirSync(root).filter((f) => /\.(html|css)$/.test(f)).map((f) => path.join(root, f));
  const scripts = fs.readdirSync(path.join(root, "scripts")).filter((f) => f.endsWith(".js")).map((f) => path.join(root, "scripts", f));
  for (const file of [...pages, ...scripts]) assert.doesNotMatch(fs.readFileSync(file, "utf8"), TRADEMARKS, file);
});
