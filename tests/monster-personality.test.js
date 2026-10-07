const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildMonsterCharacterPrompt } = require("../lib/monster-style");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "create.html"), "utf8");
const main = fs.readFileSync(path.join(root, "scripts/main.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("editor keeps one master style and does not encourage extra personality generations", () => {
  assert.doesNotMatch(html, /Preview personality|data-monster-style|selected-preview-personality/);
  assert.doesNotMatch(main, /getPreviewPersonalityLabel|previewPersonalityLabels|styleButtons/);
  assert.match(main, /const selectedMonsterStyle = defaultPreviewStyle/);
  assert.match(main, /label\.textContent = `Version \$\{index \+ 1\}`/);
  assert.match(main, /converterStatus\.textContent = "Your monster preview is ready\."/);
  assert.match(main, /setUploadActionStatus\("Monster preview selected\. Continue with this version or return to another preview\."\)/);
});

test("the master preview prompt preserves the shared rendering language", () => {
  const prompt = buildMonsterCharacterPrompt({ style: "storybook" });
  assert.match(prompt, /Default MonstersNOW brand style: soft 3D cinematic storybook illustration/);
  assert.match(prompt, /Preserve the number of eyes, horns, arms, legs/);
  assert.match(prompt, /solid pure white \(#FFFFFF\) background from edge to edge/);
  assert.match(prompt, /no scene, room, floor, horizon line, backdrop, gradient/);
  assert.match(prompt, /small, soft, neutral-gray contact shadow immediately beneath the monster/);
});

test("completed monster previews use a clean white presentation without blending in a decorative stage", () => {
  assert.match(styles, /\.result-panel\.has-generated-preview \.monster-preview\s*\{[^}]*background:\s*#fff/s);
  assert.match(styles, /\.result-panel\.has-generated-preview \.monster-preview img,[\s\S]*?mix-blend-mode:\s*normal/s);
  assert.match(styles, /\.has-generated-preview \.preview-badge\s*\{[^}]*color:\s*#fff/s);
});

test("generation is blocked when persistence is unavailable instead of sending missing credentials", () => {
  assert.match(main, /error\.code = persistenceUnavailable \? "monster_persistence_unavailable"/);
  assert.match(main, /if \(!savedSubmission\?\.id \|\| !savedSubmission\?\.token\)/);
  assert.match(main, /submissionId: savedSubmission\.id/);
  assert.match(main, /submissionToken: savedSubmission\.token/);
  assert.doesNotMatch(main, /continuing with the existing in-session preview flow/);
  assert.match(main, /the generator was not called/i);
});
