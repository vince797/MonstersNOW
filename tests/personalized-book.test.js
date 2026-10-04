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
    childCharacter: { id: "deep-braids-black", ageBand: "7-8", relativeHeight: "taller" },
    selectedPreviewId: "preview-1",
  }, { selectedPreviewUrl: "https://assets.example/fizz.png", selectedPreviewId: "preview-1" }, {
    childImageUrl: "https://assets.example/children/deep-braids-black.png",
    childProfileKey: "deep-braids-black:7-8:taller",
    childAssetApproved: true,
    childPageVerification: "all-required-pages",
    rendererVersion: "personalized-composite-v1",
  });

  assert.equal(book.masterVersion, 7);
  assert.equal(book.pages.length, 32);
  assert.equal(book.pages[0].text, "Page 1 for Riley and Fizz");
  assert.equal(book.pages[1].monster.pose, "primary-mirrored");
  assert.equal(book.pages[2].monster, null);
  assert.equal(book.pages[0].child.preset.id, "deep-braids-black");
  assert.equal(book.pages[0].child.imageUrl, "https://assets.example/children/deep-braids-black.png");
  assert.equal(book.pages[0].child.assetProfileKey, "deep-braids-black:7-8:taller");
  assert.equal(book.pages[0].child.scale, 33);
  assert.equal(book.pages[1].child, null);
  assert.deepEqual(book.childCharacter, {
    id: "deep-braids-black", label: "Braids", included: true, skinTone: "deep", hairColor: "black", hairStyle: "braids",
    ageBand: "7-8", ageBandLabel: "Ages 7–8", relativeHeight: "taller", relativeHeightLabel: "Taller than most children this age",
    mobilityAid: "none", mobilityAidLabel: "No mobility aid",
  });
  assert.ok(book.pages.every((page) => page.artworkRole === "background_plate"));
  assert.deepEqual(book.readiness, { copyReady: true, artworkReady: true, monsterReady: true, childReady: true, mobilityAidReady: true, wheelchairProfileSupported: true, childApprovalReady: true, rendererReady: true, productionReady: true, blockers: [] });
  assert.match(book.fingerprint, /^[a-f0-9]{64}$/);
});

test("proof fingerprints remain stable when signed asset URLs rotate", () => {
  const story = {
    id: "story-1", version: 1, title_template: "Story",
    pages: Array.from({ length: 32 }, (_, index) => ({
      text: `Page ${index + 1}`,
      artworkUrl: `https://assets.example/page-${index + 1}.jpg`,
      artworkStatus: "final",
      backgroundPlateConfirmed: true,
      backgroundPlateVersion: 2,
    })),
  };
  const order = { childName: "Riley", monsterName: "Fizz", selectedPreviewId: "preview-1" };
  const first = buildPersonalizedBook(story, order, { selectedPreviewId: "preview-1", selectedPreviewUrl: "https://assets.example/fizz.png?token=one" });
  const second = buildPersonalizedBook(story, order, { selectedPreviewId: "preview-1", selectedPreviewUrl: "https://assets.example/fizz.png?token=two" });
  assert.equal(first.fingerprint, second.fingerprint);
});

test("an order cannot silently switch to another saved monster preview", () => {
  const story = { id: "story-1", pages: Array.from({ length: 32 }, () => ({ text: "Ready" })) };
  assert.throws(() => buildPersonalizedBook(story, {
    childName: "Riley", monsterName: "Fizz", selectedPreviewId: "preview-1",
  }, { selectedPreviewId: "preview-2", selectedPreviewUrl: "https://assets.example/fizz.png" }), /does not match/i);
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

test("wheelchair profiles require an exact seated child-and-wheelchair asset on every child page", () => {
  const story = {
    id: "story-1",
    pages: Array.from({ length: 32 }, (_, index) => ({
      text: "{child_name} and {monster_name} lead the parade.",
      artworkUrl: `https://assets.example/page-${index + 1}.jpg`,
      artworkStatus: "final",
      backgroundPlateConfirmed: true,
      backgroundPlateVersion: 2,
      childRequired: true,
      childPlacement: { x: 60, y: 78, scale: 30, facing: "right", layer: "front" },
    })),
  };
  const order = {
    childName: "Riley",
    monsterName: "Fizz",
    childCharacter: { id: "deep-braids-black", ageBand: "7-8", relativeHeight: "taller", mobilityAid: "wheelchair" },
    selectedPreviewId: "preview-1",
  };
  const monster = { selectedPreviewUrl: "https://assets.example/fizz.png", selectedPreviewId: "preview-1" };
  const incomplete = buildPersonalizedBook(story, order, monster, {
    childImageUrl: "https://assets.example/children/riley.png",
    childProfileKey: "deep-braids-black:7-8:taller:wheelchair",
    rendererVersion: "personalized-composite-v1",
  });
  assert.equal(incomplete.readiness.productionReady, false);
  assert.equal(incomplete.readiness.mobilityAidReady, false);
  assert.match(incomplete.readiness.blockers.join(" "), /seated child-and-wheelchair render asset/i);

  const ready = buildPersonalizedBook(story, order, monster, {
    childImageUrl: "https://assets.example/children/riley-wheelchair.png",
    childProfileKey: "deep-braids-black:7-8:taller:wheelchair",
    childDepiction: "seated-wheelchair",
    childAssetComposition: "child-and-wheelchair",
    childAssetApproved: true,
    childPageVerification: "all-required-pages",
    rendererVersion: "personalized-composite-v1",
  });
  assert.equal(ready.readiness.productionReady, true);
  assert.ok(ready.pages.every((page) => page.child.pose === "seated-wheelchair"));
  assert.ok(ready.pages.every((page) => page.child.preserveMobilityAid && page.child.seatedProportions));
  assert.ok(ready.pages.every((page) => page.child.scale === 30 && page.child.bodyScale === 1));
  assert.ok(ready.pages.every((page) => /actively participating.*seated pose/i.test(page.child.actionGuidance)));
});

test("unsupported wheelchair combinations remain blocked even with an otherwise complete asset contract", () => {
  const story = {
    id: "story-1",
    pages: Array.from({ length: 32 }, (_, index) => ({
      text: "Ready", artworkUrl: `https://assets.example/page-${index + 1}.jpg`, artworkStatus: "final",
      backgroundPlateConfirmed: true, backgroundPlateVersion: 2, childRequired: index === 0,
    })),
  };
  const book = buildPersonalizedBook(story, {
    childName: "Riley", monsterName: "Fizz", selectedPreviewId: "preview-1",
    childCharacter: { id: "deep-coils-black", ageBand: "7-8", relativeHeight: "shorter", mobilityAid: "wheelchair" },
  }, { selectedPreviewUrl: "https://assets.example/fizz.png", selectedPreviewId: "preview-1" }, {
    childImageUrl: "https://assets.example/children/riley-wheelchair.png",
    childProfileKey: "deep-coils-black:7-8:shorter:wheelchair",
    childDepiction: "seated-wheelchair", childAssetComposition: "child-and-wheelchair",
    childAssetApproved: true, childPageVerification: "all-required-pages", rendererVersion: "personalized-composite-v1",
  });
  assert.equal(book.readiness.wheelchairProfileSupported, false);
  assert.equal(book.readiness.productionReady, false);
  assert.match(book.readiness.blockers.join(" "), /supported wheelchair appearance/i);
});
