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
    id: "medium-wavy-brown", label: "Wavy brown", included: true, skinTone: "medium", hairColor: "brown", hairStyle: "wavy",
    ageBand: "7-8", ageBandLabel: "Ages 7–8", relativeHeight: "taller", relativeHeightLabel: "Taller than most children this age",
    mobilityAid: "none", mobilityAidLabel: "No mobility aid",
  });
  assert.deepEqual(resolveChildCharacter("none"), {
    id: "none", label: "Monster only", included: false, skinTone: "", hairColor: "", hairStyle: "",
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
  assert.match(html, /href="#child-editor-start">Explore the child creator/);
  assert.match(html, /id="result-book-offer" aria-labelledby="result-book-title">/);
  assert.match(html, /Explore the child creator now/);
  assert.match(html, /No diagnosis or medical details needed/);
  assert.match(html, /Curly dark or Braids/i);
  assert.match(html, /ages 5–8/i);
  assert.doesNotMatch(html, /type="date"|name="child-(?:birthdate|date-of-birth|height-(?:cm|in))"/i);
  assert.match(html, />Appearance<|>Basics<|>Accessibility/);
  assert.match(html, /id="child-editor-undo" disabled/);
  assert.match(html, /id="child-editor-reset"/);
  assert.match(html, /Walkers, canes, prostheses, glasses, hearing aids, eye details, and outfit colors stay unavailable/i);
  assert.match(script, /monstersnow_child_character_profile_v1/);
  assert.match(script, /localStorage\.setItem/);
  assert.match(script, /function undo\(/);
  assert.match(script, /function reset\(/);
  assert.match(script, /mobility-\$\{profile\.mobilityAid/);
  assert.match(script, /function supportsWheelchair/);
  assert.match(mainScript, /resultBookOffer\.hidden = false/);
  assert.match(css, /\.child-preview-stage\.mobility-wheelchair/);
  assert.match(css, /\.child-live-preview \{[\s\S]*position: sticky/);
});

test("Halloween story directions keep wheelchair participation consistent and movement neutral", () => {
  const manuscript = fs.readFileSync(path.join(root, "lib/story-data/halloween-monster-night.md"), "utf8");
  assert.match(manuscript, /same wheelchair visible with seated proportions on every child page/i);
  assert.match(manuscript, /step-free route/i);
  assert.match(manuscript, /move, join, follow, or lead/i);
  assert.doesNotMatch(manuscript, /\{child_name\}\s+(?:stands|walks|runs|jumps|climbs|hurried|marched)\b/i);
  assert.match(manuscript, /never frame disability as tragedy, pity, a lesson for others, or something to cure/i);
});
