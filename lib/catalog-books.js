const CATALOG_BOOKS = [
  {
    slug: "halloween-monster-night",
    title_template: "Halloween Monster Night",
    description: "A cozy trick-or-treat mystery about courage, friendship, and bringing the Monster Star home.",
    is_seasonal: true,
    available_from: "2026-09-15",
    available_until: "2026-10-31",
  },
  {
    slug: "big-adventure",
    title_template: "Big Adventure",
    description: "A magical journey where the child's monster explores a new world and discovers courage.",
  },
  {
    slug: "bedtime-monster",
    title_template: "Bedtime Monster",
    description: "A gentle read-aloud story for cozy nights and quiet moments.",
  },
  {
    slug: "abc-monster-book",
    title_template: "ABC Monster Book",
    description: "Letters and playful scenes built around the child's monster for early learning.",
  },
  {
    slug: "counting-with-my-monster",
    title_template: "Counting with My Monster",
    description: "A number story that turns counting practice into a playful monster hunt.",
  },
  {
    slug: "the-monster-who-lost-their-glow",
    title_template: "The Monster Who Lost Their Glow",
    description: "A heartfelt story about a monster whose light returns through friendship, courage, and small acts of kindness.",
  },
  {
    slug: "birthday-monster-adventure",
    title_template: "Birthday Monster Adventure",
    description: "A personalized celebration that makes the child's monster the guest of honor.",
  },
];

function starterPages(book) {
  return Array.from({ length: 32 }, (_, index) => ({
    page: index + 1,
    text: index === 0 ? book.title_template : "",
    illustrationPrompt: index === 0
      ? `Title page for ${book.title_template}. Keep the composition simple, warm, and consistent with the approved cover direction.`
      : "",
    artworkUrl: "",
    artworkPath: "",
    artworkName: "",
    artworkStatus: "missing",
    artworkUpdatedAt: null,
  }));
}

function catalogStoryPayload(book) {
  return {
    ...book,
    status: "draft",
    pages: starterPages(book),
  };
}

module.exports = { CATALOG_BOOKS, catalogStoryPayload };
