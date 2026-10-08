/*
 * Shared print-layout defaults for every 32-page MonstersNOW storybook.
 * A book config (see halloween-monster-night.js) overrides only what differs.
 *
 * Page templates
 *   half-title       title + monster on page 1
 *   title-dedication title, starring line, dedication, framed original drawing
 *   copyright        text only
 *   story            full-bleed background plate + child + monster + story text panel
 *   meet-monster     "Meet {monster}" closing page with drawing and monster frames
 */
const DEFAULT_PRINT_BOOK = {
  pageCount: 32,
  fonts: {
    body: "assets/fonts/fredoka/print/FredokaPrint-Medium.ttf",
    bodyBold: "assets/fonts/fredoka/print/FredokaPrint-SemiBold.ttf",
    display: "assets/fonts/lilita-one/LilitaOne-Regular.ttf",
  },
  palette: {
    ink: "#071d3d",
    accent: "#008995",
    highlight: "#ffc94a",
    paper: "#fff7e8",
    panel: "rgba(255,247,232,0.93)",
    frame: "#ffffff",
    coverBand: "rgba(7,29,61,0.86)",
    coverTitle: "#ffffff",
    coverAccent: "#ffc94a",
    placeholderTop: "#2a3566",
    placeholderBottom: "#5a3f78",
  },
  typography: {
    storySize: 17,
    storyMinSize: 13,
    storyLeading: 1.34,
    paragraphGap: 0.45,
    panelMaxHeightIn: 2.7,
    panelPaddingIn: 0.22,
  },
  // Where the story text card sits on story pages. "top" keeps it clear of the
  // grounded child/monster zones (baselines are ~78-84% down the page).
  textPanel: { position: "top" },
  // Admin zone shapes (styles.css .monster-zone / .child-zone aspect-ratio).
  characterZones: { monster: { aspect: 0.72 }, child: { aspect: 0.58 } },
  // Direction the approved source art faces; a page placement facing the other
  // way mirrors the layer (matches Admin's scaleX(-1) preview).
  sourceFacing: { monster: "left", child: "left" },
  // Characters may shrink (baseline fixed) to stay clear of the text card.
  minCharacterFit: 0.6,
  templates: {
    1: "half-title",
    2: "title-dedication",
    3: "copyright",
    32: "meet-monster",
  },
  defaultTemplate: "story",
  copy: {
    imprint: "A MonstersNOW Original",
    starring: "Starring {child_name} and {monster_name}",
    meetDrawingLabel: "My Drawing",
    meetMonsterLabel: "My Storybook Monster",
    backCover: "Every great monster begins with a great imagination.",
    backCoverCredit: "Made with MonstersNOW · monstersnow.com",
  },
  localArt: null,
};

module.exports = { DEFAULT_PRINT_BOOK };
