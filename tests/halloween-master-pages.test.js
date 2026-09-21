const test = require("node:test");
const assert = require("node:assert/strict");
const { buildHalloweenMasterPages } = require("../lib/halloween-master-pages");

test("Halloween manuscript maps to 32 complete editable Admin pages", () => {
  const pages = buildHalloweenMasterPages();
  assert.equal(pages.length, 32);
  assert.ok(pages.every((page) => page.text && page.illustrationPrompt));
  assert.match(pages[3].text, /porch lights were on/i);
  assert.match(pages[30].text, /next Halloween/i);
  assert.match(pages[31].text, /Meet \{monster_name\}/);
  assert.ok(pages.every((page) => Number.isFinite(page.monsterPlacement.x)));
});
