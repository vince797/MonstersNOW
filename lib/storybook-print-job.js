/*
 * Assemble print jobs (personalized book manifest + asset sources) for the
 * compositor, either from a real order (Supabase master story + pinned
 * monster preview) or from a built-in sample for pipeline testing.
 */
const path = require("node:path");
const { buildPersonalizedBook } = require("./personalized-book");
const { getPrintBookConfig } = require("./print-books");
const { localSampleSources, sourcesFromPersonalizedBook } = require("./print-assets");

// Must match lib/storybook-print-files.js; kept here so manifests can be
// built without loading the native canvas compositor.
const RENDERER_VERSION = "personalized-composite-v1";

const SAMPLE_HOST = "https://sample.monstersnow.invalid";
const ROUTE_SAMPLE_SOURCES = {
  monster: { path: "assets/storybook/halloween-monster-night/covers/demo-monster-cutout-v1.png", label: "demo monster (sample)" },
  child: { path: "assets/child-characters/warm-curly-dark-v1.webp", label: "child preset (sample)" },
};

function masterPagesForSlug(slug) {
  if (slug === "halloween-monster-night") return require("./halloween-master-pages").buildHalloweenMasterPages();
  const { CATALOG_BOOKS, catalogStoryPayload } = require("./catalog-books");
  const book = CATALOG_BOOKS.find((entry) => entry.slug === slug);
  if (!book) throw jobError(`Unknown story ${slug}.`);
  return catalogStoryPayload(book).pages;
}

/** Personalized manifest for a sample order of any configured story. */
function buildSamplePrintBook(slug = "halloween-monster-night", { childName, monsterName, childCharacter = { id: "warm-curly-dark" } } = {}) {
  const config = getPrintBookConfig(slug);
  const sample = config.localArt?.sample || {};
  const pages = masterPagesForSlug(slug).map((page, index) => ({
    ...page,
    // Placeholder https identities only; the compositor reads `sources`.
    artworkUrl: `${SAMPLE_HOST}/${slug}/page-${index + 1}.jpg`,
  }));
  return buildPersonalizedBook(
    { id: `sample-${slug}`, slug, version: 1, title_template: config.title, pages },
    { childName: childName || sample.childName || "Mia", monsterName: monsterName || sample.monsterName || "Moxie", childCharacter, selectedPreviewId: "sample-preview" },
    { selectedPreviewUrl: `${SAMPLE_HOST}/monster.png`, selectedPreviewId: "sample-preview" },
    { childImageUrl: `${SAMPLE_HOST}/child.png`, rendererVersion: RENDERER_VERSION },
  );
}

/** Strip sample https identities so only real sources are fetched. */
function withoutSampleUrls(book) {
  return {
    ...book,
    pages: book.pages.map((page) => ({
      ...page,
      backgroundUrl: page.backgroundUrl?.startsWith(SAMPLE_HOST) ? "" : page.backgroundUrl,
      monster: page.monster && { ...page.monster, imageUrl: page.monster.imageUrl?.startsWith(SAMPLE_HOST) ? "" : page.monster.imageUrl },
      child: page.child && { ...page.child, imageUrl: page.child.imageUrl?.startsWith(SAMPLE_HOST) ? "" : page.child.imageUrl },
    })),
  };
}

/** Sample job: repo art (local builds) or placeholders + bundled sample cut-outs (deployed route). */
function buildSamplePrintJob(slug, { useRepoArt = false, ...names } = {}) {
  const book = withoutSampleUrls(buildSamplePrintBook(slug, names));
  const config = getPrintBookConfig(slug);
  const sources = useRepoArt
    ? localSampleSources(config)
    : { backgrounds: {}, ...ROUTE_SAMPLE_SOURCES, originalDrawing: null, coverWrap: null, coverFront: null };
  if (!sources.monster) sources.monster = ROUTE_SAMPLE_SOURCES.monster;
  if (!sources.child) sources.child = ROUTE_SAMPLE_SOURCES.child;
  return { book, sources, config, sample: true };
}

/** Real order job from Supabase (master story + pinned monster preview). */
async function loadOrderPrintJob(fileRequest) {
  const { getStory, listStories } = require("./story-library");
  const { getAdminMonsterAssets } = require("./monster-submissions");
  const story = await getStory(fileRequest.storyId).catch(() => null)
    || (await listStories()).find((entry) => entry.slug === fileRequest.storyId || entry.id === fileRequest.storyId);
  if (!story) throw jobError("The order's master story could not be found.", 404);
  const assets = await getAdminMonsterAssets(fileRequest.monsterSubmissionId, fileRequest.selectedPreviewId);
  if (!assets?.selectedPreviewUrl) throw jobError("The order's selected monster preview is unavailable.", 409);
  const book = buildPersonalizedBook(story, {
    childName: fileRequest.childName,
    monsterName: fileRequest.monsterName,
    childCharacter: parseChildCharacter(fileRequest.childCharacter),
    selectedPreviewId: fileRequest.selectedPreviewId,
  }, assets, { rendererVersion: RENDERER_VERSION });
  return { book, sources: sourcesFromPersonalizedBook(book, { originalUrl: assets.originalUrl }), sample: false };
}

function parseChildCharacter(value) {
  if (!value) return { id: "none" };
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return { id: String(value) }; }
}

function hasOrderIdentity(fileRequest) {
  return Boolean(fileRequest.storyId && fileRequest.monsterSubmissionId && fileRequest.selectedPreviewId);
}

/** Render the PDF a signed Lulu print-file URL asks for. */
async function renderPrintFileForRequest(fileRequest, { mode = "proof" } = {}) {
  const { renderStorybookCoverPdf, renderStorybookInteriorPdf } = require("./storybook-print-files");
  const job = hasOrderIdentity(fileRequest)
    ? await loadOrderPrintJob(fileRequest)
    : buildSamplePrintJob(fileRequest.storyId || "halloween-monster-night", { childName: fileRequest.childName, monsterName: fileRequest.monsterName });
  const common = { book: job.book, sources: job.sources, format: fileRequest.format, pageCount: fileRequest.pageCount, mode, config: job.config };
  if (fileRequest.type === "cover") {
    const coverDimensions = fileRequest.coverWidth ? { width: fileRequest.coverWidth, height: fileRequest.coverHeight, unit: "pt" } : null;
    return renderStorybookCoverPdf({ ...common, coverDimensions, sources: { ...job.sources, coverWrap: job.sources.coverWrap, coverFront: job.sources.coverFront } });
  }
  return renderStorybookInteriorPdf(common);
}

function jobError(message, status = 400) {
  const error = new Error(message);
  error.name = "ProductionError";
  error.status = status;
  return error;
}

module.exports = {
  RENDERER_VERSION,
  ROUTE_SAMPLE_SOURCES,
  buildSamplePrintBook,
  buildSamplePrintJob,
  loadOrderPrintJob,
  renderPrintFileForRequest,
  repoRoot: require("./repo-root").repoRoot(),
};
