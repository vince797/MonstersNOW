const test = require("node:test");
const assert = require("node:assert/strict");

const story = require("../lib/story-data/abc-monster-book.json");

test("ABC master has a complete private 32-page editorial sequence", () => {
  assert.equal(story.pages.length, 32);
  assert.equal(story.pages[3].text, "Come learn the ABCs with {monster_name}!");
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((letter, index) => {
    assert.match(story.pages[index + 4].text, new RegExp(`^${letter} is for `));
  });
  assert.match(story.pages[30].text, /which letter do you love best\?/);
  assert.match(story.pages[31].text, /The end\./);
});

test("ABC master keeps every page reviewable and tokens constrained", () => {
  const allText = story.pages.map((page) => `${page.text} ${page.illustrationPrompt}`).join(" ");
  story.pages.forEach((page, index) => {
    assert.ok(page.text.trim(), `page ${index + 1} has story text`);
    assert.ok(page.illustrationPrompt.trim(), `page ${index + 1} has art direction`);
  });
  const tokens = [...new Set(allText.match(/\{[^}]+\}/g) || [])];
  assert.deepEqual(tokens.sort(), ["{child_name}", "{monster_name}"].sort());
});
