const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPersonalizedBook } = require("../lib/personalized-book");

test("master copy becomes a pinned order-specific render manifest", () => {
  const story = {
    id: "story-1",
    slug: "abc-monster-book",
    version: 7,
    title_template: "{monster_name}'s ABC Book",
    pages: Array.from({ length: 32 }, (_, index) => ({
      text: `Page ${index + 1} for {child_name} and {monster_name}`,
      artworkUrl: `https://assets.example/page-${index + 1}.jpg`,
      artworkStatus: "final",
      monsterPlacement: { x: 30, y: 80, scale: 35, facing: index % 2 ? "right" : "left", layer: "front" },
    })),
  };
  const book = buildPersonalizedBook(story, {
    childName: "Riley",
    monsterName: "Fizz",
    selectedPreviewId: "preview-1",
  }, { selectedPreviewUrl: "https://assets.example/fizz.png" });

  assert.equal(book.masterVersion, 7);
  assert.equal(book.pages.length, 32);
  assert.equal(book.pages[0].text, "Page 1 for Riley and Fizz");
  assert.equal(book.pages[1].monster.pose, "primary-mirrored");
  assert.deepEqual(book.readiness, { copyReady: true, artworkReady: true, monsterReady: true });
  assert.match(book.fingerprint, /^[a-f0-9]{64}$/);
});

test("a print manifest cannot be built without an approved monster image", () => {
  const story = { id: "story-1", pages: Array.from({ length: 32 }, () => ({ text: "Ready" })) };
  assert.throws(() => buildPersonalizedBook(story, { childName: "Riley", monsterName: "Fizz" }, {}), /approved monster image/i);
});
