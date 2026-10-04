const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { childProfileKey, isSupportedWheelchairProfile, resolveChildCharacter } = require("../lib/child-characters");
const { buildStorybookInterestSubmission } = require("../lib/storybook-interest");
const { buildHalloweenProof } = require("../lib/halloween-proof");

const root = path.resolve(__dirname, "..");
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";

test("child profiles use canonical appearance data plus privacy-minimized age and height choices", () => {
  assert.deepEqual(resolveChildCharacter({ id: "medium-wavy-brown", ageBand: "7-8", relativeHeight: "taller" }), {
    id: "medium-wavy-brown", label: "Brown waves", included: true, gender: "girl", skinTone: "medium", hairColor: "brown", hairStyle: "wavy",
    ageBand: "7-8", ageBandLabel: "Ages 7–8", relativeHeight: "taller", relativeHeightLabel: "Taller than most children this age",
    mobilityAid: "none", mobilityAidLabel: "No mobility aid",
  });
  assert.deepEqual(resolveChildCharacter("none"), {
    id: "none", label: "Monster only", included: false, gender: "", skinTone: "", hairColor: "", hairStyle: "",
    ageBand: "", ageBandLabel: "", relativeHeight: "", relativeHeightLabel: "", mobilityAid: "", mobilityAidLabel: "",
  });
});

test("server validation rejects unsupported age or height values instead of silently ignoring them", () => {
  const base = { email: "parent@example.com", childName: "Sam", monsterName: "Noodle", childCharacter: { id: "light-short-brown" } };
  assert.throws(() => buildStorybookInterestSubmission({ ...base, childCharacter: { ...base.childCharacter, ageBand: "2017-03-02" } }), /valid age range/i);
  assert.throws(() => buildStorybookInterestSubmission({ ...base, childCharacter: { ...base.childCharacter, relativeHeight: "121cm" } }), /valid relative height/i);
  assert.throws(() => buildStorybookInterestSubmission({ ...base, childCharacter: { ...base.childCharacter, mobilityAid: "diagnosis-detail" } }), /supported mobility option/i);
  assert.throws(() => buildStorybookInterestSubmission({ ...base, childCharacter: { id: "deep-coils-black", ageBand: "7-8", relativeHeight: "taller", mobilityAid: "wheelchair" } }), /supported wheelchair appearance/i);
});

test("wheelchair support is an explicit eight-combination matrix with exact profile keys", () => {
  const supported = resolveChildCharacter({ id: "deep-braids-black", ageBand: "7-8", relativeHeight: "taller", mobilityAid: "wheelchair" });
  const unsupported = resolveChildCharacter({ id: "deep-braids-black", ageBand: "2-4", relativeHeight: "taller", mobilityAid: "wheelchair" });
  assert.equal(isSupportedWheelchairProfile(supported), true);
  assert.equal(isSupportedWheelchairProfile(unsupported), false);
  assert.equal(childProfileKey(supported), "deep-braids-black:7-8:taller:wheelchair");
});

test("proof identity includes the full canonical child profile", () => {
  const proof = buildHalloweenProof({
    personalization: { childName: "Sam", monsterName: "Noodle", childCharacter: { id: "deep-braids-black", ageBand: "7-8", relativeHeight: "taller", mobilityAid: "wheelchair" } },
    monsterImage: pixel,
    format: "softcover",
  });
  assert.equal(proof.childCharacter.hairStyle, "braids");
  assert.equal(proof.childCharacter.ageBand, "7-8");
  assert.equal(proof.childCharacter.relativeHeight, "taller");
  assert.equal(proof.childCharacter.mobilityAid, "wheelchair");
});

test("selector UI exposes only supported controls and states the current rendering limit", () => {
  const html = fs.readFileSync(path.join(root, "create.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "scripts/child-selector.js"), "utf8");
  const mainScript = fs.readFileSync(path.join(root, "scripts/main.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "child-selector.css"), "utf8");
  assert.match(html, /name="child-age-band"/);
  assert.match(html, /name="child-relative-height"/);
  assert.match(html, /name="child-mobility-aid" value="wheelchair" disabled/);
  assert.doesNotMatch(html, /href="#child-editor-start">Explore the child creator/);
  assert.equal((html.match(/data-monster-step-panel/g) || []).length, 2);
  assert.match(html, /id="result-book-offer" aria-labelledby="result-book-title" hidden/);
  assert.match(html, /id="back-to-monster"/);
  assert.match(html, /No diagnosis or medical details needed/);
  assert.match(html, /Dark curls or Long braids/i);
  assert.match(html, /ages 5–8/i);
  assert.doesNotMatch(html, /type="date"|name="child-(?:birthdate|date-of-birth|height-(?:cm|in))"/i);
  assert.match(html, />Choose a story character<|>Basics<|>Accessibility/);
  assert.match(html, /name="child-gender" value="boy"/);
  assert.match(html, /name="child-gender" value="girl"/);
  assert.match(html, /id="child-look-picker" hidden/);
  assert.match(html, /class="child-character-thumb"/);
  assert.match(html, /data-gender="boy"/);
  assert.match(html, /data-gender="girl"/);
  assert.match(html, /id="child-editor-undo" disabled/);
  assert.match(html, /id="child-editor-reset"/);
  assert.match(html, /Walkers, canes, prostheses, glasses, hearing aids, eye details, and outfit colors stay unavailable/i);
  assert.match(script, /monstersnow_child_character_profile_v1/);
  assert.match(script, /localStorage\.setItem/);
  assert.match(script, /function undo\(/);
  assert.match(script, /function reset\(/);
  assert.match(script, /mobility-\$\{profile\.mobilityAid/);
  assert.match(script, /function supportsWheelchair/);
  assert.match(script, /const characterArt = \{/);
  assert.match(script, /function chooseFirstAppearanceForGender/);
  assert.match(script, /function syncAppearanceBuilder/);
  assert.match(script, /const wheelchairCharacterArt = \{/);
  assert.match(script, /child-preview-character/);
  assert.match(html, /id="child-preview-monster"/);
  assert.match(mainScript, /function syncStorySceneMonster/);
  assert.match(mainScript, /function removeConnectedWhiteBackground/);
  assert.match(mainScript, /cornerDistance/);
  assert.match(mainScript, /transparentNeighbors/);
  assert.match(css, /storybook-forest-stage-v1\.webp/);
  assert.match(css, /@keyframes story-character-arrival/);
  assert.doesNotMatch(css, /@keyframes story-sparkle/);
  assert.doesNotMatch(html, /child-scene-sparkles/);
  assert.match(html, /child-monster-ground-shadow/);
  assert.match(mainScript, /resultBookOffer\.hidden = false/);
  assert.match(mainScript, /function showCharacterStep/);
  assert.match(mainScript, /function showMonsterStep/);
  assert.match(css, /\.child-preview-stage\.mobility-wheelchair/);
  assert.match(css, /Age changes proportions; relative height only fine-tunes/);
  assert.match(css, /\.child-preview-stage\.age-2-4 \.child-preview-character \{ --age-scale-x: 1\.12; --age-scale-y: \.9; \}/);
  assert.match(css, /\.child-preview-stage\.age-7-8 \.child-preview-character \{ --age-scale-x: \.94; --age-scale-y: 1\.08; \}/);
  assert.match(html, /Changes the character's illustrated proportions and stance—not just their size/);
  assert.match(html, /id="child-age-profile"/);
  assert.match(css, /\.child-live-preview \{[\s\S]*position: sticky/);
  assert.match(css, /\.child-character-option\.is-selected::after/);
  assert.match(css, /\.child-preview-character/);
  assert.match(html, /child-selector\.css\?v=20261004-age-profiles-v10/);
  assert.match(html, /scripts\/child-selector\.js\?v=20261004-age-profiles-v8/);
  assert.match(html, /scripts\/main\.js\?v=20261004-scene-blend-v10/);
});

test("character studio includes lightweight changing storybook previews", () => {
  const required = [
    "warm-curly-dark", "deep-coils-black", "medium-wavy-brown", "golden-straight-black",
    "light-short-brown", "light-wavy-blonde", "medium-curly-auburn", "deep-braids-black",
    "warm-curly-dark-wheelchair", "deep-braids-black-wheelchair",
  ];
  for (const id of required) {
    const asset = path.join(root, "assets", "child-characters", `${id}-v1.webp`);
    assert.equal(fs.existsSync(asset), true, `${id} preview art should exist`);
    assert.ok(fs.statSync(asset).size < 100_000, `${id} preview art should stay under 100KB`);
  }
});

test("Halloween story directions keep wheelchair participation consistent and movement neutral", () => {
  const manuscript = fs.readFileSync(path.join(root, "lib/story-data/halloween-monster-night.md"), "utf8");
  assert.match(manuscript, /same wheelchair visible with seated proportions on every child page/i);
  assert.match(manuscript, /step-free route/i);
  assert.match(manuscript, /move, join, follow, or lead/i);
  assert.doesNotMatch(manuscript, /\{child_name\}\s+(?:stands|walks|runs|jumps|climbs|hurried|marched)\b/i);
  assert.match(manuscript, /never frame disability as tragedy, pity, a lesson for others, or something to cure/i);
});
