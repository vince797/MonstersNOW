const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminStoryProof } = require("../lib/admin-story-proof");

test("editorial proof contains 32 pages and personalized saved copy", () => {
  const story = {
    title_template: "Test Monster Story",
    pages: Array.from({ length: 32 }, (_, index) => ({
      text: `Page ${index + 1} for {child_name} and {monster_name}`,
      illustrationPrompt: `Scene ${index + 1} with {monster_name}`,
      artworkStatus: index === 0 ? "approved" : "missing",
      monsterPlacement: { x: 62, y: 78, scale: 34, facing: "right", layer: "behind" },
    })),
  };
  const pdf = createAdminStoryProof(story, { childName: "Riley", monsterName: "Glow" });
  const source = pdf.toString("latin1");

  assert.equal((source.match(/\/Type \/Page\b/g) || []).length, 32);
  assert.match(source, /Page 1 for Riley and Glow/);
  assert.match(source, /REVIEW ONLY - NOT A LULU PRINT FILE/);
  assert.match(source, /Monster zone: x 62% .* baseline 78% .* scale 34% .* faces right .* behind/);
});
