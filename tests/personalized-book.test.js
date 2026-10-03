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
      artworkRole: "background_plate",
      backgroundPlateConfirmed: true,
      backgroundPlateVersion: 2,
      monsterRequired: index !== 2,
      childRequired: index === 0,
      childPlacement: { x: 72, y: 82, scale: 30, facing: "left", layer: "front" },
      monsterPlacement: { x: 30, y: 80, scale: 35, facing: index % 2 ? "right" : "left", layer: "front" },
    })),
  };
  const book = buildPersonalizedBook(story, {
    childName: "Riley",
    monsterName: "Fizz",
    childCharacter: { id: "deep-braids-black", label: "Black braids", included: true },
    selectedPreviewId: "preview-1",
  }, { selectedPreviewUrl: "https://assets.example/fizz.png" }, {
    childImageUrl: "https://assets.example/children/deep-braids-black.png",
    rendererVersion: "personalized-composite-v1",
  });

  assert.equal(book.masterVersion, 7);
  assert.equal(book.pages.length, 32);
  assert.equal(book.pages[0].text, "Page 1 for Riley and Fizz");
  assert.equal(book.pages[1].monster.pose, "primary-mirrored");
  assert.equal(book.pages[2].monster, null);
  assert.equal(book.pages[0].child.preset.id, "deep-braids-black");
  assert.equal(book.pages[0].child.imageUrl, "https://assets.example/children/deep-braids-black.png");
  assert.equal(book.pages[1].child, null);
  assert.deepEqual(book.childCharacter, { id: "deep-braids-black", label: "Braids", included: true, skinTone: "deep", hairColor: "black", hairStyle: "braids" });
  assert.ok(book.pages.every((page) => page.artworkRole === "background_plate"));
  assert.deepEqual(book.readiness, { copyReady: true, artworkReady: true, monsterReady: true, childReady: true, rendererReady: true, productionReady: true, blockers: [] });
  assert.match(book.fingerprint, /^[a-f0-9]{64}$/);
});

test("a print manifest cannot be built without an approved monster image", () => {
  const story = { id: "story-1", pages: Array.from({ length: 32 }, () => ({ text: "Ready" })) };
  assert.throws(() => buildPersonalizedBook(story, { childName: "Riley", monsterName: "Fizz" }, {}), /approved monster image/i);
});

test("production stays blocked while child art or the personalized compositor is missing", () => {
  const story = {
    id: "story-1",
    pages: Array.from({ length: 32 }, (_, index) => ({
      text: "Ready",
      artworkUrl: `https://assets.example/page-${index + 1}.jpg`,
      artworkStatus: "final",
      backgroundPlateConfirmed: true,
      backgroundPlateVersion: 2,
      childRequired: index === 3,
    })),
  };
  const book = buildPersonalizedBook(story, {
    childName: "Riley",
    monsterName: "Fizz",
    childCharacter: { id: "light-short-brown" },
    selectedPreviewId: "preview-1",
  }, { selectedPreviewUrl: "https://assets.example/fizz.png" });

  assert.equal(book.readiness.productionReady, false);
  assert.equal(book.readiness.childReady, false);
  assert.equal(book.readiness.rendererReady, false);
  assert.match(book.readiness.blockers.join(" "), /transparent render asset/i);
  assert.match(book.readiness.blockers.join(" "), /compositor/i);
});
