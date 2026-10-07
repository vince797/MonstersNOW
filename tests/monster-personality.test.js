const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildMonsterCharacterPrompt } = require("../lib/monster-style");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "create.html"), "utf8");
const main = fs.readFileSync(path.join(root, "scripts/main.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("editor presents backend style ids as next-preview personalities under one master art style", () => {
  assert.match(html, /<details class="variation-controls preview-options" hidden>/);
  assert.match(html, /<span>Preview personality<\/span>/);
  assert.match(html, /Every option uses the same Soft 3D Storybook art style/);
  assert.ok(html.indexOf('class="upload-drop"') < html.indexOf('class="variation-controls preview-options"'), "upload should lead and personality options should follow");
  for (const [id, label] of [["storybook", "Classic"], ["cute", "Gentle"], ["silly", "Playful"], ["adventure", "Brave"]]) {
    assert.match(html, new RegExp(`data-monster-style="${id}"[\\s\\S]*?<strong>${label}</strong>`));
  }
  assert.match(main, /Selected preview · \$\{getPreviewPersonalityLabel\(preview\.style\)\}/);
  assert.match(main, /will be used when you create the next preview/);
  assert.doesNotMatch(main, /converterNote\.textContent = `\$\{getPreviewStyleLabel\(selectedMonsterStyle\)\} selected/);
});

test("all personality prompts preserve the shared rendering language while changing expression and pose", () => {
  const prompts = {
    storybook: buildMonsterCharacterPrompt({ style: "storybook" }),
    cute: buildMonsterCharacterPrompt({ style: "cute" }),
    silly: buildMonsterCharacterPrompt({ style: "silly" }),
    adventure: buildMonsterCharacterPrompt({ style: "adventure" }),
  };
  for (const prompt of Object.values(prompts)) {
    assert.match(prompt, /Default MonstersNOW brand style: soft 3D cinematic storybook illustration/);
    assert.match(prompt, /Preserve the number of eyes, horns, arms, legs/);
    assert.match(prompt, /solid pure white \(#FFFFFF\) background from edge to edge/);
    assert.match(prompt, /no scene, room, floor, horizon line, backdrop, gradient/);
    assert.match(prompt, /small, soft, neutral-gray contact shadow immediately beneath the monster/);
  }
  assert.match(prompts.cute, /gentle, open expression.*relaxed, welcoming pose/i);
  assert.match(prompts.silly, /playful, goofy energy.*asymmetrical pose/i);
  assert.match(prompts.adventure, /upright, confident pose.*no props or costume pieces/i);
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
