const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPersonalizedBook } = require("../lib/personalized-book");
const { buildHalloweenMasterPages } = require("../lib/halloween-master-pages");
const { approvedPoseSet } = require("./pose-test-fixtures");

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
    childCharacter: { id: "deep-braids-black", ageBand: "6-8" },
    selectedPreviewId: "preview-1",
  }, { selectedPreviewUrl: "https://assets.example/fizz.png", selectedPreviewId: "preview-1", originalUrl: "https://assets.example/original.png", originalPath: "submission/original.png", poseSet: approvedPoseSet(story, { childCharacter: { id: "deep-braids-black", ageBand: "6-8", profileKey: "deep-braids-black:6-8", included: true } }) }, {
    childImageUrl: "https://assets.example/children/deep-braids-black.png",
    childProfileKey: "deep-braids-black:6-8",
    childAssetApproved: true,
    childPageVerification: "all-required-pages",
    rendererVersion: "personalized-composite-v1",
  });

  assert.equal(book.masterVersion, 7);
  assert.equal(book.pages.length, 32);
  assert.equal(book.pages[0].openingArtifact.role, "title_dedication_copyright_source_credit");
  assert.equal(book.pages[1].openingArtifact.role, "original_monster_drawing");
  assert.equal(book.pages[1].openingArtifact.aiRedrawForbidden, true);
  assert.equal(book.pages[2].openingArtifact.role, "approved_monster_portrait");
  assert.equal(book.pages[2].openingArtifact.sourcePreviewId, "preview-1");
  assert.equal(book.openingSequence.storyStartsOnPage, 4);
  assert.equal(book.openingSequence.addsPages, false);
  assert.equal(book.pages[0].text, "Page 1 for Riley and Fizz");
  assert.ok(book.pages.slice(0, 3).every((page) => page.monster === null && page.child === null));
  assert.ok(book.pages.slice(3).some((page) => page.monster?.assetKey));
  assert.deepEqual(book.childCharacter, {
    id: "deep-braids-black", label: "Long braids", included: true, gender: "girl", skinTone: "deep", hairColor: "black", hairStyle: "braids",
    ageBand: "6-8", ageBandLabel: "Ages 6–8", relativeHeight: "standard", relativeHeightLabel: "Standard illustrated proportions",
    mobilityAid: "none", mobilityAidLabel: "No mobility aid", profileVersion: "launch-v2", legacyProfile: false, requiresAgeBandReselection: false,
  });
  assert.ok(book.pages.every((page) => page.artworkRole === "background_plate"));
  assert.equal(book.readiness.productionReady, true);
  assert.equal(book.readiness.openingSequenceReady, true);
  assert.equal(book.readiness.monsterPoseReady, true);
  assert.equal(book.readiness.childPoseReady, true);
  assert.deepEqual(book.readiness.blockers, []);
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

test("Halloween page 32 compares the immutable original with the exact approved monster", () => {
  const story = {
    id: "halloween-story",
    slug: "halloween-monster-night",
    version: 5,
    title_template: "Halloween Monster Night",
    pages: buildHalloweenMasterPages().map((page, index) => ({
      ...page,
      artworkUrl: `https://assets.example/halloween/page-${index + 1}.jpg`,
      artworkStatus: "final",
      backgroundPlateConfirmed: true,
    })),
  };
  const order = { childName: "Riley", monsterName: "Fizz", selectedPreviewId: "preview-32" };
  const poseSet = approvedPoseSet(story, { selectedPreviewId: "preview-32" });
  const monsterAssets = {
    selectedPreviewId: "preview-32",
    selectedPreviewUrl: "https://assets.example/fizz.png?token=one",
    originalUrl: "https://assets.example/original.png?token=one",
    originalPath: "submissions/original-immutable.png",
    poseSet,
  };
  const book = buildPersonalizedBook(story, order, monsterAssets, { rendererVersion: "personalized-composite-v1" });
  const comparison = book.pages[31].comparisonArtifact;

  assert.deepEqual(book.pages.slice(0, 3).map((page) => page.openingArtifact?.role), [
    "title_dedication_copyright_source_credit", "original_monster_drawing", "approved_monster_portrait",
  ]);
  assert.equal(book.pages[1].openingArtifact.assetId, "submissions/original-immutable.png");
  assert.equal(book.pages[2].openingArtifact.sourcePreviewId, "preview-32");
  assert.equal(comparison.role, "original_and_storybook_monster_comparison");
  assert.equal(comparison.originalDrawing.assetId, "submissions/original-immutable.png");
  assert.equal(comparison.originalDrawing.aiRedrawForbidden, true);
  assert.equal(comparison.approvedMonster.sourcePreviewId, "preview-32");
  assert.equal(comparison.originalDrawing.imageUrl, monsterAssets.originalUrl);
  assert.equal(comparison.approvedMonster.imageUrl, monsterAssets.selectedPreviewUrl);
  assert.equal(book.pages[31].monster, null, "page 32 uses the exact approved portrait, not a generated pose");
  assert.deepEqual(book.closingComparison, {
    page: 32,
    withinExisting32Pages: true,
    addsPages: false,
    originalDrawingAvailable: true,
    originalDrawingAssetId: "submissions/original-immutable.png",
    approvedPortraitVersion: "preview-32",
  });
  assert.equal(book.readiness.closingComparisonReady, true);

  const rotated = buildPersonalizedBook(story, order, {
    ...monsterAssets,
    selectedPreviewUrl: "https://assets.example/fizz.png?token=two",
    originalUrl: "https://assets.example/original.png?token=two",
  }, { rendererVersion: "personalized-composite-v1" });
  assert.equal(rotated.fingerprint, book.fingerprint, "signed URL rotation must not change exact-asset approval identity");

  const missingImmutableOriginal = buildPersonalizedBook(story, order, { ...monsterAssets, originalPath: "" }, { rendererVersion: "personalized-composite-v1" });
  assert.equal(missingImmutableOriginal.readiness.closingComparisonReady, false);
  assert.match(missingImmutableOriginal.readiness.blockers.join(" "), /page 32 comparison/i);
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
    childCharacter: { id: "deep-braids-black", ageBand: "6-8", mobilityAid: "wheelchair" },
    selectedPreviewId: "preview-1",
  };
  const poseSet = approvedPoseSet(story, { childCharacter: { id: "deep-braids-black", ageBand: "6-8", profileKey: "deep-braids-black:6-8:wheelchair", mobilityAid: "wheelchair", included: true } });
  const monster = { selectedPreviewUrl: "https://assets.example/fizz.png", selectedPreviewId: "preview-1", originalUrl: "https://assets.example/original.png", originalPath: "submission/original.png", poseSet };
  const incomplete = buildPersonalizedBook(story, order, monster, {
    childImageUrl: "https://assets.example/children/riley.png",
    childProfileKey: "deep-braids-black:6-8:wheelchair",
    rendererVersion: "personalized-composite-v1",
  });
  assert.equal(incomplete.readiness.productionReady, false);
  assert.equal(incomplete.readiness.mobilityAidReady, false);
  assert.match(incomplete.readiness.blockers.join(" "), /seated child-and-wheelchair render asset/i);

  const ready = buildPersonalizedBook(story, order, monster, {
    childImageUrl: "https://assets.example/children/riley-wheelchair.png",
    childProfileKey: "deep-braids-black:6-8:wheelchair",
    childDepiction: "seated-wheelchair",
    childAssetComposition: "child-and-wheelchair",
    childAssetApproved: true,
    childPageVerification: "all-required-pages",
    rendererVersion: "personalized-composite-v1",
  });
  assert.equal(ready.readiness.productionReady, true);
  assert.ok(ready.pages.slice(0, 3).every((page) => page.child === null));
  const childPages = ready.pages.filter((page) => page.child);
  assert.ok(childPages.every((page) => page.child.pose === "seated-wheelchair"));
  assert.ok(childPages.every((page) => page.child.preserveMobilityAid && page.child.seatedProportions));
  assert.ok(childPages.every((page) => page.child.scale === 30 && page.child.bodyScale === 1));
  assert.ok(childPages.every((page) => /actively participating.*seated pose/i.test(page.child.actionGuidance)));
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
