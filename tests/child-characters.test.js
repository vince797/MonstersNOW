const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { childProfileKey, isSupportedWheelchairProfile, resolveChildCharacter } = require("../lib/child-characters");
const { buildStorybookInterestSubmission } = require("../lib/storybook-interest");
const { buildHalloweenProof } = require("../lib/halloween-proof");

const root = path.resolve(__dirname, "..");
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";

test("launch profiles use two fixed age bands while legacy profiles stay explicit", () => {
  assert.deepEqual(resolveChildCharacter({ id: "medium-wavy-brown", ageBand: "6-8" }), {
    id: "medium-wavy-brown", label: "Brown waves", included: true, gender: "girl", skinTone: "medium", hairColor: "brown", hairStyle: "wavy",
    ageBand: "6-8", ageBandLabel: "Ages 6–8", relativeHeight: "standard", relativeHeightLabel: "Standard illustrated proportions",
    mobilityAid: "none", mobilityAidLabel: "No mobility aid", profileVersion: "launch-v2", legacyProfile: false, requiresAgeBandReselection: false,
  });
  const legacy = resolveChildCharacter({ id: "medium-wavy-brown", ageBand: "5-6", relativeHeight: "taller" });
  assert.equal(legacy.ageBand, "5-6");
  assert.equal(legacy.relativeHeight, "taller");
  assert.equal(legacy.requiresAgeBandReselection, true);
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
  assert.throws(() => buildStorybookInterestSubmission({ ...base, childCharacter: { id: "deep-coils-black", ageBand: "3-5", mobilityAid: "wheelchair" } }), /supported wheelchair appearance/i);
  assert.throws(() => buildStorybookInterestSubmission({ ...base, childCharacter: { id: "light-short-brown", ageBand: "5-6", relativeHeight: "average" } }), /older age range/i);
});

test("wheelchair support is bounded to approved launch profiles and preserves legacy keys", () => {
  const supported = resolveChildCharacter({ id: "deep-braids-black", ageBand: "6-8", mobilityAid: "wheelchair" });
  const unsupported = resolveChildCharacter({ id: "deep-braids-black", ageBand: "2-4", relativeHeight: "taller", mobilityAid: "wheelchair" });
  assert.equal(isSupportedWheelchairProfile(supported), true);
  assert.equal(isSupportedWheelchairProfile(unsupported), false);
  assert.equal(childProfileKey(supported), "deep-braids-black:6-8:wheelchair");
  assert.equal(childProfileKey(resolveChildCharacter({ id: "deep-braids-black", ageBand: "7-8", relativeHeight: "taller", mobilityAid: "wheelchair" })), "deep-braids-black:7-8:taller:wheelchair");
});

test("proof identity includes the launch child profile", () => {
  const proof = buildHalloweenProof({
    personalization: { childName: "Sam", monsterName: "Noodle", childCharacter: { id: "deep-braids-black", ageBand: "6-8", mobilityAid: "wheelchair" } },
    monsterImage: pixel,
    format: "softcover",
  });
  assert.equal(proof.childCharacter.hairStyle, "braids");
  assert.equal(proof.childCharacter.ageBand, "6-8");
  assert.equal(proof.childCharacter.relativeHeight, "standard");
  assert.equal(proof.childCharacter.mobilityAid, "wheelchair");
});

test("selector UI exposes only supported controls and states the current rendering limit", () => {
  const html = fs.readFileSync(path.join(root, "create.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "scripts/child-selector.js"), "utf8");
  const mainScript = fs.readFileSync(path.join(root, "scripts/main.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "child-selector.css"), "utf8");
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  assert.match(html, /name="child-age-band"/);
  assert.doesNotMatch(html, /name="child-relative-height"/);
  assert.match(html, /value="3-5"/);
  assert.match(html, /value="6-8"/);
  assert.match(html, /name="child-mobility-aid" value="wheelchair" disabled/);
  assert.doesNotMatch(html, /href="#child-editor-start">Explore the child creator/);
  assert.equal((html.match(/data-monster-step-panel/g) || []).length, 2);
  assert.match(html, /id="result-book-offer" aria-labelledby="result-book-title" hidden/);
  assert.match(html, /id="back-to-monster"/);
  assert.match(html, /Step 3 · Optional child/);
  assert.match(html, /<details class="child-editor-section">\s*<summary><span>Basics<\/span>/);
  assert.match(html, /No diagnosis or medical details needed/);
  assert.match(html, /Dark curls or Long braids/i);
  assert.match(html, /Ages 6–8/i);
  assert.doesNotMatch(html, /type="date"|name="child-(?:birthdate|date-of-birth|height-(?:cm|in))"/i);
  assert.match(html, />Choose a story character<|>Basics<|>Accessibility/);
  assert.match(html, /name="child-gender" value="boy"/);
  assert.match(html, /name="child-gender" value="girl"/);
  assert.doesNotMatch(html, /name="child-skin-tone"/);
  assert.match(html, /data-child-filter="skinTone" data-filter-value="light"/);
  assert.match(html, /data-child-filter="skinTone" data-filter-value="deep"/);
  assert.match(html, /data-child-filter="hairColor"/);
  assert.match(html, /data-child-filter="hairStyle"/);
  assert.match(html, /Skin tone and hair filters work independently/);
  assert.match(html, /Eyes stay as illustrated in the selected look/);
  assert.match(html, /id="child-look-picker" hidden/);
  assert.match(html, /class="child-character-thumb"/);
  assert.match(html, /data-gender="boy"/);
  assert.match(html, /data-gender="girl"/);
  assert.match(html, /id="child-editor-undo" disabled/);
  assert.match(html, /id="child-editor-reset"/);
  assert.match(html, /Other mobility options will appear only after their complete book artwork is approved/i);
  assert.match(html, /id="child-current-choice"/);
  assert.match(html, /Mobility &amp; accessibility/);
  assert.match(html, /This choice only guides the artwork/);
  assert.match(script, /monstersnow_child_character_profile_v1/);
  assert.match(script, /localStorage\.setItem/);
  assert.match(script, /function undo\(/);
  assert.match(script, /function reset\(/);
  assert.match(script, /mobility-\$\{profile\.mobilityAid/);
  assert.match(script, /function supportsWheelchair/);
  assert.match(script, /const characterArt = \{/);
  assert.match(script, /function chooseFirstAppearanceForGender/);
  assert.match(script, /function matchesLookFilters/);
  assert.match(script, /const lookFilters = \{ skinTone: "all", hairColor: "all", hairStyle: "all" \}/);
  assert.match(script, /function syncAppearanceBuilder/);
  assert.match(script, /skinTone: profile\.skinTone/);
  assert.match(script, /const wheelchairCharacterArt = \{/);
  assert.match(script, /child-preview-character/);
  assert.match(html, /id="child-preview-monster"/);
  assert.match(mainScript, /function syncStorySceneMonster/);
  assert.match(html, /scripts\/monster-cutout\.js/);
  assert.match(mainScript, /MonstersNowCutout\?\.removeConnectedBackground/);
  assert.match(css, /storybook-forest-stage-v1\.webp/);
  assert.match(css, /@keyframes story-character-arrival/);
  assert.doesNotMatch(css, /@keyframes story-sparkle/);
  assert.doesNotMatch(html, /child-scene-sparkles/);
  assert.match(html, /child-monster-ground-shadow/);
  assert.match(mainScript, /resultBookOffer\.hidden = false/);
  assert.match(mainScript, /function showCharacterStep/);
  assert.match(mainScript, /function showMonsterStep/);
  assert.match(css, /\.child-preview-stage\.mobility-wheelchair/);
  assert.match(css, /CSS must not squash it/);
  assert.doesNotMatch(css, /age-scale-[xy]|\.age-3-5 \.child-preview-character[^{]*\{[^}]*scale/i);
  assert.match(html, /Choose the closest story age band/);
  assert.match(html, /preview keeps the character art at its original proportions/i);
  assert.match(html, /id="child-age-profile"/);
  assert.match(css, /\.child-live-preview \{[\s\S]*position: sticky/);
  assert.match(css, /\.child-character-option\.is-selected::after/);
  assert.match(css, /\.child-preview-character/);
  assert.match(html, /child-selector\.css\?v=20261007-child-editor-v4/);
  assert.match(html, /scripts\/child-selector\.js\?v=20261007-child-editor-v4/);
  assert.match(html, /1\. Character[\s\S]*2\. Find a complete illustrated look/);
  assert.match(html, /scripts\/main\.js\?v=20261007-upload-polish-v1/);
  assert.deepEqual(
    vercel.headers.find((entry) => entry.source === "/create")?.headers,
    [{ key: "Cache-Control", value: "private, no-store" }],
  );
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
