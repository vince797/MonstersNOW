const { DEFAULT_PRINT_BOOK } = require("./defaults");

const BOOKS = {
  "halloween-monster-night": require("./halloween-monster-night"),
};

/**
 * Print config for a story slug. Unknown slugs get the shared 32-page
 * defaults, so any published master story can render; add a file here only
 * to override palette, copy, templates, or local art.
 */
function getPrintBookConfig(slug, { title } = {}) {
  const book = BOOKS[slug] || { slug: slug || "storybook", title: title || "My Monster Storybook" };
  return {
    ...DEFAULT_PRINT_BOOK,
    ...book,
    fonts: { ...DEFAULT_PRINT_BOOK.fonts, ...(book.fonts || {}) },
    palette: { ...DEFAULT_PRINT_BOOK.palette, ...(book.palette || {}) },
    typography: { ...DEFAULT_PRINT_BOOK.typography, ...(book.typography || {}) },
    textPanel: { ...DEFAULT_PRINT_BOOK.textPanel, ...(book.textPanel || {}) },
    characterZones: { ...DEFAULT_PRINT_BOOK.characterZones, ...(book.characterZones || {}) },
    sourceFacing: { ...DEFAULT_PRINT_BOOK.sourceFacing, ...(book.sourceFacing || {}) },
    templates: { ...DEFAULT_PRINT_BOOK.templates, ...(book.templates || {}) },
    copy: { ...DEFAULT_PRINT_BOOK.copy, ...(book.copy || {}) },
    coverTitleLines: book.coverTitleLines || splitTitle(book.title || title || "My Monster Storybook"),
  };
}

function templateForPage(config, pageNumber) {
  return config.templates[pageNumber] || config.defaultTemplate;
}

function listPrintBookSlugs() {
  return Object.keys(BOOKS);
}

function splitTitle(title) {
  const words = String(title).split(/\s+/);
  if (words.length < 3) return [String(title)];
  const middle = Math.ceil(words.length / 2);
  return [words.slice(0, middle).join(" "), words.slice(middle).join(" ")];
}

module.exports = { getPrintBookConfig, listPrintBookSlugs, templateForPage };
