/*
 * Halloween Monster Night: first print config (pipeline test book).
 *
 * `localArt` lists the repo files used for local/sample builds and the exact
 * print masters still required. Production orders use each master page's
 * uploaded `artworkUrl` instead; the same pixel requirements apply.
 */
const ART_DIR = "assets/storybook/halloween-monster-night";

const SPREADS = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];

module.exports = {
  slug: "halloween-monster-night",
  title: "Halloween Monster Night",
  coverTitleLines: ["Halloween", "Monster Night"],
  palette: {
    ink: "#071d3d",
    accent: "#008995",
    highlight: "#ffc94a",
  },
  // The approved Books-page cover (assets/storybook/cover-series/minimal-concepts/
  // halloween-monster-night-v5) already carries the imprint and title, so the
  // compositor keeps them and places the monster on the street below.
  coverArt: {
    titleInArt: true,
    // Monster area starts below the baked title, as a fraction of trim height.
    monsterTopFraction: 0.56,
  },
  copy: {
    backCover:
      "On Halloween night the Monster Star blows away, and only {child_name} and {monster_name} can follow the golden trail to bring it home.",
  },
  localArt: {
    dir: ART_DIR,
    // Print masters the book needs (300 PPI incl. 0.125 in bleed on every side).
    // `required` files are the print masters (see docs/PRINT_PIPELINE.md, built
    // by scripts/build_halloween_print_masters.py); `available` are the 1774 x 887
    // (≈101 PPI) review plates used only when a master is missing.
    spreads: SPREADS.map((start) => ({
      pages: [start, start + 1],
      required: `pages-${pad(start)}-${pad(start + 1)}-environment-print.jpg`,
      available: `pages-${pad(start)}-${pad(start + 1)}-environment-v1.png`,
    })),
    singles: [
      { page: 1, required: "page-01-half-title-background-print.jpg", available: null },
      { page: 2, required: "page-02-title-dedication-background-print.jpg", available: null },
      { page: 3, required: "page-03-copyright-background-print.jpg", available: null },
      { page: 32, required: "page-32-meet-monster-background-print.jpg", available: null },
    ],
    cover: {
      softcoverRequired: "cover-softcover-wrap-print.jpg",
      hardcoverRequired: "cover-hardcover-wrap-print.jpg",
      // Front-panel fallback when a wrap is missing (web-resolution Books cover).
      frontAvailable: "../cover-series/minimal-concepts/halloween-monster-night-v5-web.jpg",
    },
    sample: {
      monster: "assets/master-references/soft-3d-storybook-monster-01.png",
      child: "assets/child-characters/warm-curly-dark-v1.webp",
      originalDrawing: "assets/master-references/input-drawing-purple.jpg",
      childName: "Mia",
      monsterName: "Moxie",
    },
  },
};

function pad(value) {
  return String(value).padStart(2, "0");
}
