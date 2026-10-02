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
  assert.ok(pages.every((page) => page.artworkRole === "background_plate"));
  assert.ok(pages.every((page) => page.backgroundPlateConfirmed === false));
  assert.ok(pages.filter((page) => page.monsterRequired).every((page) => /background plate|background/i.test(page.illustrationPrompt)));
  assert.equal(pages[2].monsterRequired, false);
  assert.match(pages[3].illustrationPrompt, /do not include a permanent story monster/i);
});
