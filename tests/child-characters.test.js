const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { childProfileKey, isSupportedForearmCrutchProfile, isSupportedWheelchairProfile, resolveChildCharacter } = require("../lib/child-characters");
const { buildChildCharacterRenderPrompt } = require("../lib/child-character-style");
const { buildStorybookInterestSubmission } = require("../lib/storybook-interest");
const { buildHalloweenProof } = require("../lib/halloween-proof");

const root = path.resolve(__dirname, "..");
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";

test("child profiles use canonical appearance data plus privacy-minimized age and height choices", () => {
  assert.deepEqual(resolveChildCharacter({ id: "medium-wavy-brown", ageBand: "7-8", relativeHeight: "taller" }), {
    id: "medium-wavy-brown", label: "Wavy brown", included: true, skinTone: "medium", hairColor: "brown", hairStyle: "wavy",
    ageBand: "7-8", ageBandLabel: "Ages 7–8", relativeHeight: "taller", relativeHeightLabel: "Taller than most children this age",
    mobilityAid: "none", mobilityAidLabel: "No mobility aid",
  });
  assert.deepEqual(resolveChildCharacter("none"), {
    id: "none", label: "Monster only", included: false, skinTone: "", hairColor: "", hairStyle: "", presentation: "", presentationLabel: "",
    ageBand: "", ageBandLabel: "", relativeHeight: "", relativeHeightLabel: "", mobilityAid: "", mobilityAidLabel: "",
  });
});

test("server validation rejects unsupported age or height values instead of silently ignoring them", () => {
  const base = { email: "parent@example.com", childName: "Sam", monsterName: "Noodle", childCharacter: { id: "light-short-brown" } };
  assert.throws(() => buildStorybookInterestSubmission({ ...base, childCharacter: { ...base.childCharacter, ageBand: "2017-03-02" } }), /valid age range/i);
  assert.throws(() => buildStorybookInterestSubmission({ ...base, childCharacter: { ...base.childCharacter, relativeHeight: "121cm" } }), /valid relative height/i);
  assert.throws(() => buildStorybookInterestSubmission({ ...base, childCharacter: { ...base.childCharacter, mobilityAid: "diagnosis-detail" } }), /supported mobility option/i);
  assert.throws(() => buildStorybookInterestSubmission({ ...base, childCharacter: { id: "deep-coils-black", ageBand: "7-8", relativeHeight: "taller", mobilityAid: "wheelchair" } }), /supported wheelchair appearance/i);
  assert.throws(() => buildStorybookInterestSubmission({ ...base, childCharacter: { id: "deep-coils-black", ageBand: "7-8", relativeHeight: "taller", mobilityAid: "forearm-crutches" } }), /supported forearm-crutch character/i);
});

test("forearm crutches are available across the custom child editor", () => {
  const profile = resolveChildCharacter({
    id: "custom", presentation: "boy", ageBand: "2-4", relativeHeight: "shorter", mobilityAid: "forearm-crutches",
  });
  assert.equal(isSupportedForearmCrutchProfile(profile), true);
  assert.equal(profile.mobilityAidLabel, "Forearm crutches");
  assert.equal(childProfileKey(profile), "custom:boy:medium:curly:dark-brown:brown:overalls:teal:2-4:shorter:forearm-crutches");
});

test("wheelchair support spans every age and height choice with exact profile keys", () => {
  const supported = resolveChildCharacter({ id: "deep-braids-black", ageBand: "7-8", relativeHeight: "taller", mobilityAid: "wheelchair" });
  const youngerShorter = resolveChildCharacter({ id: "deep-braids-black", ageBand: "2-4", relativeHeight: "shorter", mobilityAid: "wheelchair" });
  const unsupported = resolveChildCharacter({ id: "deep-coils-black", ageBand: "7-8", relativeHeight: "taller", mobilityAid: "wheelchair" });
  assert.equal(isSupportedWheelchairProfile(supported), true);
  assert.equal(isSupportedWheelchairProfile(youngerShorter), true);
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

test("custom child profiles preserve independently editable appearance choices", () => {
  const custom = resolveChildCharacter({
    id: "custom", presentation: "boy", skinTone: "deep", hairStyle: "braids", hairColor: "auburn",
    eyeColor: "green", outfitStyle: "hoodie", outfitColor: "purple",
    ageBand: "7-8", relativeHeight: "taller", mobilityAid: "wheelchair",
  });
  assert.equal(custom.id, "custom");
  assert.equal(custom.presentation, "boy");
  assert.equal(custom.skinTone, "deep");
  assert.equal(custom.hairStyle, "braids");
  assert.equal(custom.hairColor, "auburn");
  assert.equal(custom.eyeColor, "green");
  assert.equal(custom.outfitStyle, "hoodie");
  assert.equal(custom.outfitColor, "purple");
  assert.match(childProfileKey(custom), /custom:boy:deep:braids:auburn:green:hoodie:purple/);
  const submission = buildStorybookInterestSubmission({
    email: "parent@example.com", childName: "Sam", monsterName: "Noodle", childCharacter: custom,
  });
  assert.equal(submission.personalization.childCharacter.eyeColor, "green");
  assert.equal(submission.personalization.childCharacter.presentation, "boy");
  assert.equal(submission.personalization.childCharacter.outfitStyle, "hoodie");
  assert.throws(() => buildStorybookInterestSubmission({
    email: "parent@example.com", childName: "Sam", monsterName: "Noodle",
    childCharacter: { ...custom, eyeColor: "laser-red" },
  }), /valid child eye color/i);
  assert.throws(() => buildStorybookInterestSubmission({
    email: "parent@example.com", childName: "Sam", monsterName: "Noodle",
    childCharacter: { ...custom, presentation: "unknown" },
  }), /valid child presentation/i);
});

test("selector UI is a true layered character editor with a MonstersNOW storybook preview", () => {
  const html = fs.readFileSync(path.join(root, "create.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "scripts/child-selector.js"), "utf8");
  const mainScript = fs.readFileSync(path.join(root, "scripts/main.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "child-selector.css"), "utf8");
  assert.match(html, /name="child-age-band"/);
  assert.match(html, /name="child-relative-height"/);
  assert.match(html, /name="child-mobility-aid" value="wheelchair"/);
  assert.match(html, /name="child-mobility-aid" value="forearm-crutches"/);
  assert.doesNotMatch(html, /href="#child-editor-start">Explore the child creator/);
  assert.equal((html.match(/data-monster-step-panel/g) || []).length, 2);
  assert.match(html, /id="result-book-offer" aria-labelledby="result-book-title" hidden/);
  assert.match(html, /id="back-to-monster"/);
  assert.match(html, /No diagnosis or medical details needed/);
  assert.match(html, /Sized to their age and height/i);
  assert.doesNotMatch(html, /type="date"|name="child-(?:birthdate|date-of-birth|height-(?:cm|in))"/i);
  assert.match(html, />Face &amp; hair<|>Outfit<|>Age, height &amp; accessibility/);
  assert.match(html, /name="child-character" value="custom" checked/);
  assert.match(html, /name="child-presentation" value="boy"/);
  assert.match(html, /name="child-presentation" value="girl" checked/);
  assert.match(html, /name="child-skin-tone" value="light"/);
  assert.match(html, /name="child-hair-style" value="braids"/);
  assert.match(html, /name="child-hair-color" value="auburn"/);
  assert.match(html, /name="child-eye-color" value="green"/);
  assert.match(html, /name="child-outfit-style" value="hoodie"/);
  assert.match(html, /name="child-outfit-color" value="purple"/);
  assert.match(html, /data-editor-tab="appearance"/);
  assert.match(html, /data-editor-tab="outfit"/);
  assert.match(html, /data-editor-tab="build"/);
  assert.match(html, /id="child-editor-undo" disabled/);
  assert.match(html, /id="child-editor-reset"/);
  assert.match(script, /monstersnow_child_character_profile_v3/);
  assert.match(script, /dataset\.presentation/);
  assert.match(script, /localStorage\.setItem/);
  assert.match(script, /function undo\(/);
  assert.match(script, /function reset\(/);
  assert.match(script, /function supportsWheelchair/);
  assert.match(script, /function supportsForearmCrutches/);
  assert.match(script, /const customCharacterSvg/);
  assert.match(script, /dataset\.hairStyle/);
  assert.match(script, /dataset\.outfitStyle/);
  assert.match(script, /--skin/);
  assert.match(script, /--eye/);
  assert.match(script, /--outfit/);
  assert.match(script, /child-preview-character/);
  assert.match(html, /id="child-monster-only-preview"/);
  assert.doesNotMatch(html, /child-board-label-monster/);
  assert.match(html, /Premium character preview/);
  assert.match(html, /Book-quality avatar/);
  assert.match(html, /id="child-premium-default"/);
  assert.match(html, /default-girl-feature-animation-v1\.webp/);
  assert.match(html, /id="render-child-character"/);
  assert.match(html, /id="child-rendered-preview"/);
  assert.match(mainScript, /fetch\("\/api\/render-child-character"/);
  assert.match(mainScript, /childImage: personalization\.childCharacter/);
  assert.match(css, /\.child-preview-stage\.has-book-render/);
  assert.match(css, /height: 280px; min-height: 260px/);
  assert.match(css, /\.create-flow-section \.child-live-preview \{ grid-column: 1; grid-row: 1; \}/);
  assert.match(css, /\.create-flow-section \.child-editor-controls \{ grid-column: 1; grid-row: 2; \}/);
  assert.match(css, /\.child-preview-copy p \{[\s\S]*white-space: normal;[\s\S]*-webkit-line-clamp: 2;/);
  assert.match(mainScript, /function getSelectedMonsterImage\(\)/);
  assert.match(mainScript, /monsterPreview\?\.hasAttribute\("src"\)/);
  assert.doesNotMatch(css, /storybook-forest-stage-v1\.webp/);
  assert.match(css, /storybook-studio-stage-v1\.jpg/);
  assert.match(css, /radial-gradient\(ellipse at 70% 90%/);
  assert.match(css, /\.child-editor-tabs button\.is-active/);
  assert.match(css, /\.custom-child-svg\[data-hair-style="curly"\]/);
  assert.match(mainScript, /resultBookOffer\.hidden = false/);
  assert.match(mainScript, /function showCharacterStep/);
  assert.match(mainScript, /function showMonsterStep/);
  assert.match(mainScript, /classList\.add\("is-character-step"\)/);
  assert.match(css, /\.child-preview-stage\.mobility-wheelchair/);
  assert.match(css, /\.child-preview-stage\.mobility-forearm-crutches/);
  assert.match(css, /\.child-live-preview \{[\s\S]*position: sticky/);
  assert.match(css, /\.child-presence-toggle label\.is-selected::after/);
  assert.match(css, /\.child-preview-character/);
  assert.match(html, /child-selector\.css\?v=20261007-mobility-picker-v20/);
  assert.match(html, /scripts\/child-selector\.js\?v=20261007-wheelchair-editor-v11/);
  assert.match(html, /scripts\/main\.js\?v=20261007-mobile-studio-v20/);
  assert.match(html, /id="child-preview-stage"[\s\S]*id="child-preview-details"[\s\S]*id="render-child-character"/);
  assert.match(mainScript, /Ready when you are\. Every choice stays editable\./);
  assert.match(html, /id="child-character-details"[\s\S]*class="child-accessibility-section"[\s\S]*class="child-editor-tabs"/);
  assert.match(html, /Mobility &amp; positioning/);
  assert.match(html, /Fully customizable\./);
  assert.match(mainScript, /childMonsterOnlyPreview\.src = monsterImage/);
  assert.match(mainScript, /classList\.toggle\("has-monster-only", showMonster\)/);
  assert.match(css, /\.child-monster-only-preview/);
  assert.match(css, /\.child-premium-default[\s\S]*height: 84%/);
  assert.match(css, /\.child-rendered-preview[\s\S]*object-position: center bottom/);
  assert.match(css, /has-book-render \.child-premium-default/);
  assert.match(css, /\.create-flow-section \.interest-form > \*/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /overscroll-behavior-inline: contain/);
  assert.match(mainScript, /function markRenderedChildStale/);
  assert.match(mainScript, /previousChildImage/);
  assert.match(script, /Keep render lifecycle classes owned by main\.js/);
  assert.match(mainScript, /childRenderIsCurrent/);
  assert.match(html, /id="child-render-elapsed"/);
  assert.match(html, /data-child-render-step="3"/);
  assert.match(mainScript, /function showChildRenderProgress/);
  assert.match(mainScript, /elapsed >= 35 \? 3 : 2/);
  assert.match(css, /\.child-render-progress-track/);
  assert.match(css, /\.child-render-progress-spinner \{[\s\S]*conic-gradient\([\s\S]*var\(--brand-purple[\s\S]*var\(--brand-orange[\s\S]*var\(--brand-teal[\s\S]*var\(--brand-blue/);
  assert.doesNotMatch(mainScript, /syncStorySceneMonster/);
  assert.doesNotMatch(mainScript, /removeConnectedWhiteBackground/);
});

test("book render prompt preserves every independent editor choice", () => {
  const prompt = buildChildCharacterRenderPrompt({
    id: "custom", presentation: "boy", skinTone: "deep", hairStyle: "braids", hairColor: "auburn",
    eyeColor: "green", outfitStyle: "hoodie", outfitColor: "purple",
    ageBand: "7-8", relativeHeight: "taller", mobilityAid: "wheelchair",
  });
  assert.match(prompt, /boy/i);
  assert.match(prompt, /deep illustrated skin tone/i);
  assert.match(prompt, /auburn braids/i);
  assert.match(prompt, /green eyes/i);
  assert.match(prompt, /purple hoodie/i);
  assert.match(prompt, /child-sized wheelchair/i);
  assert.match(prompt, /transparent background/i);
  assert.match(prompt, /first supplied image as the character identity/i);
  assert.match(prompt, /Preserve.*recognizable face/i);
  assert.match(prompt, /short individual box braids/i);
  assert.match(prompt, /No bun, top knot, crown braid, braided updo/i);
});

test("girl braid renders require the two-braid thumbnail silhouette", () => {
  const prompt = buildChildCharacterRenderPrompt({
    id: "custom", presentation: "girl", skinTone: "light", hairStyle: "braids", hairColor: "blonde",
    eyeColor: "brown", outfitStyle: "dress", outfitColor: "rose",
    ageBand: "5-6", relativeHeight: "average", mobilityAid: "none",
  });
  assert.match(prompt, /two clearly separated, symmetrical shoulder-length three-strand braids/i);
  assert.match(prompt, /one woven braid hanging on each side of the face/i);
  assert.match(prompt, /selected hair color from root to tip/i);
  assert.match(prompt, /selected hair.*authoritative.*override/i);
});

test("forearm-crutch renders preserve two correctly fitted devices", () => {
  const prompt = buildChildCharacterRenderPrompt({
    id: "custom", presentation: "girl", skinTone: "warm", hairStyle: "curly", hairColor: "dark-brown",
    eyeColor: "hazel", outfitStyle: "hoodie", outfitColor: "teal",
    ageBand: "5-6", relativeHeight: "average", mobilityAid: "forearm-crutches",
  });
  assert.match(prompt, /exactly two correctly fitted child-sized forearm crutches/i);
  assert.match(prompt, /cuffs secured around the forearms/i);
  assert.match(prompt, /both hands resting naturally on the grips/i);
  assert.match(prompt, /both rubber tips touching the ground/i);
  assert.match(prompt, /never underarm crutches, canes, or a walker/i);
});

test("every boy and girl hairstyle has a thumbnail-specific render silhouette", () => {
  const cases = [
    ["girl", "short", /ear-length asymmetrical textured pixie-bob/i],
    ["boy", "short", /short tapered crop/i],
    ["girl", "curly", /high gathered curly ponytail with large springy ringlets/i],
    ["boy", "curly", /short rounded crop of broad springy ringlets/i],
    ["girl", "coils", /shoulder-length rounded halo of dense small natural corkscrew coils/i],
    ["boy", "coils", /short close-shaped coily crop with dense small natural coils/i],
    ["girl", "wavy", /shoulder-length hair with a soft side part and broad flowing S-shaped waves/i],
    ["boy", "wavy", /ear-length side-parted cut with broad swept S-shaped waves/i],
    ["girl", "straight", /shoulder-length blunt lob with a clean center part/i],
    ["boy", "straight", /short smooth layered crop with a side-swept straight fringe/i],
    ["girl", "braids", /two clearly separated, symmetrical shoulder-length three-strand braids/i],
    ["boy", "braids", /short individual box braids with a clean center part/i],
  ];
  for (const [presentation, hairStyle, expected] of cases) {
    const prompt = buildChildCharacterRenderPrompt({
      id: "custom", presentation, skinTone: "medium", hairStyle, hairColor: "brown",
      eyeColor: "brown", outfitStyle: "overalls", outfitColor: "teal",
      ageBand: "5-6", relativeHeight: "average", mobilityAid: "none",
    });
    assert.match(prompt, expected, `${presentation} ${hairStyle} should match its selector thumbnail`);
    assert.doesNotMatch(prompt, /Make the selected hairstyle visually unmistakable/i);
  }
});

test("mobile result history uses a full-width readable monster choice", () => {
  const css = fs.readFileSync(path.join(root, "monster-uploader.css"), "utf8");
  assert.match(css, /body \.preview-history \{ grid-template-columns: 1fr/);
  assert.match(css, /grid-template-columns: 72px minmax\(0, 1fr\)/);
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

test("premium editor defaults include optimized original feature-animation boy and girl artwork", () => {
  for (const filename of [
    "default-boy-feature-animation-v1.webp", "default-girl-feature-animation-v1.webp",
    "default-boy-forearm-crutches-feature-animation-v1.webp", "default-girl-forearm-crutches-feature-animation-v1.webp",
    "default-boy-wheelchair-feature-animation-v1.webp", "default-girl-wheelchair-feature-animation-v1.webp",
  ]) {
    const asset = path.join(root, "assets", "child-editor", filename);
    assert.equal(fs.existsSync(asset), true, `${filename} should exist`);
    assert.ok(fs.statSync(asset).size > 100_000, `${filename} should be a detailed rendered asset`);
    assert.ok(fs.statSync(asset).size < 500_000, `${filename} should be optimized for the editor`);
  }
});

test("hair selector includes premium boy and girl thumbnail sets", () => {
  const html = fs.readFileSync(path.join(root, "create.html"), "utf8");
  const selectorScript = fs.readFileSync(path.join(root, "scripts", "child-selector.js"), "utf8");
  assert.match(html, /data-hair-thumbnail="curly"/);
  assert.match(html, /Hair color is applied to the selected style in the premium avatar/);
  assert.match(selectorScript, /hair-style-boy/);
  assert.match(selectorScript, /--selected-hair-color/);
  for (const presentation of ["girl", "boy"]) {
    for (const style of ["short", "curls", "coils", "waves", "straight", "braids"]) {
      const prefix = presentation === "boy" ? "hair-style-boy" : "hair-style";
      const filename = `${prefix}-${style}-v1.webp`;
      const asset = path.join(root, "assets", "child-editor", filename);
      assert.equal(fs.existsSync(asset), true, `${filename} should exist`);
      assert.ok(fs.statSync(asset).size > 10_000, `${filename} should retain detailed hair texture`);
      assert.ok(fs.statSync(asset).size < 100_000, `${filename} should stay lightweight for the selector`);
    }
  }
});

test("Halloween story directions keep wheelchair participation consistent and movement neutral", () => {
  const manuscript = fs.readFileSync(path.join(root, "lib/story-data/halloween-monster-night.md"), "utf8");
  assert.match(manuscript, /same wheelchair visible with seated proportions on every child page/i);
  assert.match(manuscript, /same two correctly fitted forearm crutches visible on every child page/i);
  assert.match(manuscript, /never replace them with underarm crutches, canes, or a walker/i);
  assert.match(manuscript, /step-free route/i);
  assert.match(manuscript, /move, join, follow, or lead/i);
  assert.doesNotMatch(manuscript, /\{child_name\}\s+(?:stands|walks|runs|jumps|climbs|hurried|marched)\b/i);
  assert.match(manuscript, /never frame disability as tragedy, pity, a lesson for others, or something to cure/i);
});
