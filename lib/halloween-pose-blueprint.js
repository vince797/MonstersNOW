const HALLOWEEN_BLUEPRINT_VERSION = "halloween-existing-art-v1";

const HALLOWEEN_CHILD_POSES = Object.freeze([
  pose("doorway", "Doorway ready", "Ready beside the open doorway with an eager, calm expression and the treat bucket visible when appropriate."),
  pose("square", "Town-square watch", "Watch the town-square ceremony with clear anticipation and a readable eyeline toward the Monster Star."),
  pose("star_look", "Look to the star", "Look upward in surprised wonder at the moving or newly discovered Monster Star; energetic but never frightened."),
  pose("window_clue", "Study the clue", "Notice and study a reflected or distant clue with a clear investigative eyeline."),
  pose("candy_help", "Candy helper", "Actively help gather scattered wrapped treats while keeping the selected mobility aid, outfit, and body proportions coherent."),
  pose("trail_clue", "Follow the trail", "Follow the golden trail or return route with purposeful attention and the bucket controlled safely."),
  pose("welcome", "Welcome a friend", "Offer warm reassurance to another child through expression, eyeline, and an open age-appropriate gesture."),
  pose("ribbon_help", "Ribbon helper", "Help release the tangled banner at a reviewed hand or reach anchor without intersecting another character or mobility equipment."),
  pose("garden", "Garden courage", "Move into or pause within the quiet garden with gentle courage, clear attention, and grounded body or wheelchair contact."),
  pose("celebrate", "Lantern celebration", "Celebrate the restored light with a proud joyful reaction while preserving the exact child identity."),
  pose("parade", "Lead the parade", "Take an active parade-leading pose with rhythmic energy, a clean silhouette, and no baked-in background characters."),
  pose("sleepy_home", "Sleepy at home", "Use a relaxed, satisfied end-of-night pose with a small yawn or sleepy expression and physically coherent support."),
]);

const HALLOWEEN_MONSTER_POSES = Object.freeze([
  pose("doorway_companion", "Doorway companion", "Stand ready beside the child at the open doorway, friendly and eager, with the approved silhouette fully readable."),
  pose("square_watch", "Watch the ceremony", "Watch the Monster Star ceremony with a clear upward eyeline and calm anticipation."),
  pose("wind_react", "Wind reaction", "React to the sweeping gust and flying star with surprised wonder, a stable grounded silhouette, and no frightened expression."),
  pose("trail_lead", "Lead the trail", "Lead the search along the golden trail with purposeful forward attention; imply travel without inventing anatomy."),
  pose("candy_shelter", "Shelter the treats", "Take a protective position beside scattered treats, angled against the breeze without grasping candy or adding props."),
  pose("clue_observe", "Notice the clue", "Study the star-patterned clue with a precise eyeline and attentive expression, without requiring pointing or grasping."),
  pose("welcome_companion", "Encourage a friend", "Stay visibly close as a reassuring companion with a warm expression and open, non-contact body language."),
  pose("window_clue", "Lead from the window clue", "Notice the reflected clue and orient confidently toward the garden lane without touching the window or adding scenery."),
  pose("banner_guide", "Guide the banner repair", "Occupy the reviewed interaction anchor beside the snag as an attentive guide without pulling, grasping, or intersecting the banner."),
  pose("garden_threshold", "Garden threshold", "Pause just inside the safe garden, quietly attentive to the distant star with a tender, readable silhouette."),
  pose("garden_brave_lead", "Brave garden lead", "Lead forward into the widening golden light with gentle confidence, arms or limbs naturally supported and no contact with the star."),
  pose("star_return", "Return with the star", "Travel proudly back toward the square while the star floats independently above and behind; never carry or touch it."),
  pose("lantern_hero", "Lantern-light hero", "Hold the visual hero position in the restored golden light with a proud joyful reaction and no medal, crown, or added costume."),
  pose("parade_lead", "Lead the Pumpkin Parade", "Lead the parade with joyful rhythmic energy, preserving the exact anatomy and a clean transparent silhouette."),
  pose("sleepy_home", "Sleepy home companion", "Use a relaxed home-ending pose beside the child with a satisfied sleepy expression and physically coherent support."),
]);

const HALLOWEEN_CHILD_POSE_PAGES = Object.freeze({
  doorway: [4, 11, 16],
  square: [5, 6, 17, 19],
  star_look: [7, 8, 15, 23, 27],
  window_clue: [9, 10, 18],
  candy_help: [12, 13],
  trail_clue: [14, 26],
  welcome: [29],
  ribbon_help: [20, 21],
  garden: [22, 24, 25],
  celebrate: [28],
  parade: [30],
  sleepy_home: [31],
});

const HALLOWEEN_MONSTER_POSE_PAGES = Object.freeze({
  doorway_companion: [4, 5],
  square_watch: [6, 7],
  wind_react: [8, 9],
  trail_lead: [10, 11, 15],
  candy_shelter: [12, 13],
  clue_observe: [14],
  welcome_companion: [16, 17],
  window_clue: [18, 19],
  banner_guide: [20, 21],
  garden_threshold: [22, 23],
  garden_brave_lead: [24, 25],
  star_return: [26, 27],
  lantern_hero: [28, 29],
  parade_lead: [30],
  sleepy_home: [31],
});

const HALLOWEEN_SPREADS = Object.freeze([
  spread(4, 5, "A special Halloween", 1),
  spread(6, 7, "The Monster Star", 1),
  spread(8, 9, "Whoosh!", 1),
  spread(10, 11, "The golden trail", 2),
  spread(12, 13, "Treats everywhere", 2),
  spread(14, 15, "One more searcher", 2),
  spread(16, 17, "A brave hello", 1),
  spread(18, 19, "A clue in the window", 2),
  spread(20, 21, "The tangled sign", 1),
  spread(22, 23, "The quiet garden", 1),
  spread(24, 25, "One kind act", 1),
  spread(26, 27, "Bringing back the light", 1),
  spread(28, 29, "Monster of the Night", 1),
  spread(30, 31, "The parade and homecoming", 1),
]);

function pose(id, label, direction) {
  return Object.freeze({ id, label, direction });
}

function spread(startPage, endPage, label, masterVersion) {
  const stem = `pages-${String(startPage).padStart(2, "0")}-${String(endPage).padStart(2, "0")}`;
  return Object.freeze({
    startPage,
    endPage,
    label,
    masterPath: `assets/storybook/halloween-monster-night/${stem}-master-v${masterVersion}.png`,
    environmentPath: `assets/storybook/halloween-monster-night/${stem}-environment-v1.png`,
  });
}

function isHalloweenStory(slug) {
  return slug === "halloween-monster-night" || slug === "halloween-adventure";
}

function halloweenPoseForPage(subjectType, pageNumber) {
  const map = subjectType === "child" ? HALLOWEEN_CHILD_POSE_PAGES : HALLOWEEN_MONSTER_POSE_PAGES;
  return Object.entries(map).find(([, pages]) => pages.includes(pageNumber))?.[0] || "";
}

function halloweenSpreadForPage(pageNumber) {
  return HALLOWEEN_SPREADS.find((item) => pageNumber >= item.startPage && pageNumber <= item.endPage) || null;
}

function halloweenArtReference(subjectType, poseId, pageNumbers = []) {
  const spreadRecord = halloweenSpreadForPage(pageNumbers[0]);
  return spreadRecord ? {
    status: "visual_direction_approved",
    source: "existing_halloween_art",
    subjectType,
    poseId,
    masterPath: spreadRecord.masterPath,
    environmentPath: spreadRecord.environmentPath,
    spreadLabel: spreadRecord.label,
  } : null;
}

function halloweenArtBlueprint() {
  return {
    version: HALLOWEEN_BLUEPRINT_VERSION,
    status: "existing_art_connected",
    label: "Existing Halloween production art",
    spreadCount: HALLOWEEN_SPREADS.length,
    childPoseCount: HALLOWEEN_CHILD_POSES.length,
    monsterPoseCount: HALLOWEEN_MONSTER_POSES.length,
    environmentPlateCount: HALLOWEEN_SPREADS.length,
    referenceStartPath: HALLOWEEN_SPREADS[0].masterPath,
    environmentStartPath: HALLOWEEN_SPREADS[0].environmentPath,
    generateMissingCharacterLayersOnly: true,
  };
}

module.exports = {
  HALLOWEEN_BLUEPRINT_VERSION,
  HALLOWEEN_CHILD_POSES,
  HALLOWEEN_CHILD_POSE_PAGES,
  HALLOWEEN_MONSTER_POSES,
  HALLOWEEN_MONSTER_POSE_PAGES,
  HALLOWEEN_SPREADS,
  halloweenArtBlueprint,
  halloweenArtReference,
  halloweenPoseForPage,
  halloweenSpreadForPage,
  isHalloweenStory,
};
