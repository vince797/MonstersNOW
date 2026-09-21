const STORY_TABLE = "master_stories";

async function listStories() {
  return supabaseRequest(`/${STORY_TABLE}?select=*&order=updated_at.desc`);
}

async function getStory(id) {
  const rows = await supabaseRequest(`/${STORY_TABLE}?id=eq.${encodeURIComponent(id)}&select=*`);
  return rows[0] || null;
}

async function createStory(payload) {
  const story = normalizeStory(payload, { creating: true });
  const rows = await supabaseRequest(`/${STORY_TABLE}`, {
    method: "POST",
    body: [story],
    prefer: "return=representation",
  });
  return rows[0];
}

async function updateStory(id, payload) {
  const existing = await getStory(id);
  if (!existing) return null;

  const story = normalizeStory(payload, { creating: false, existing });
  const rows = await supabaseRequest(`/${STORY_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: story,
    prefer: "return=representation",
  });
  return rows[0] || null;
}

async function ensureCatalogStories() {
  const { CATALOG_BOOKS, catalogStoryPayload } = require("./catalog-books");
  let current = await listStories();
  const legacyGlowBook = current.find((story) => story.slug === "kindness-and-feelings");
  const glowBook = CATALOG_BOOKS.find((book) => book.slug === "the-monster-who-lost-their-glow");
  if (legacyGlowBook && glowBook && !current.some((story) => story.slug === glowBook.slug)) {
    await updateStory(legacyGlowBook.id, {
      ...legacyGlowBook,
      slug: glowBook.slug,
      title_template: glowBook.title_template,
      description: glowBook.description,
      pages: legacyGlowBook.pages || [],
    });
    current = await listStories();
  }
  const existingSlugs = new Set(current.map((story) => story.slug));
  const created = [];

  for (const book of CATALOG_BOOKS) {
    if (existingSlugs.has(book.slug)) continue;
    created.push(await createStory(catalogStoryPayload(book)));
  }

  return { created, stories: await listStories() };
}

function normalizeStory(payload = {}, { creating, existing = {} }) {
  const status = ["draft", "published", "archived"].includes(payload.status) ? payload.status : "draft";
  const titleTemplate = text(payload.title_template || payload.titleTemplate, 160);
  const slug = slugify(payload.slug || titleTemplate);
  const pages = normalizePages(payload.pages);

  if (!titleTemplate) throw validationError("Story title is required.");
  if (!slug) throw validationError("Story slug is required.");
  if (pages.length > 32) throw validationError("A master story can contain no more than 32 pages.");

  const normalized = {
    slug,
    title_template: titleTemplate,
    description: text(payload.description, 1000),
    status,
    is_seasonal: Boolean(payload.is_seasonal ?? payload.isSeasonal),
    available_from: nullableDate(payload.available_from ?? payload.availableFrom),
    available_until: nullableDate(payload.available_until ?? payload.availableUntil),
    page_count: 32,
    pages,
    updated_at: new Date().toISOString(),
    version: creating ? 1 : Number(existing.version || 1) + 1,
    published_at:
      status === "published" ? existing.published_at || new Date().toISOString() : existing.published_at || null,
  };

  if (normalized.available_from && normalized.available_until && normalized.available_until < normalized.available_from) {
    throw validationError("The availability end date must be on or after the start date.");
  }

  return normalized;
}

function normalizePages(value) {
  if (!Array.isArray(value)) throw validationError("Story pages must be an array.");
  return value.map((page, index) => {
    const artworkUrl = safeUrl(page?.artworkUrl);
    const artworkStatus = artworkUrl && ["draft", "approved", "final"].includes(page?.artworkStatus) ? page.artworkStatus : artworkUrl ? "draft" : "missing";
    return {
      page: index + 1,
      text: text(page?.text, 2000),
      illustrationPrompt: text(page?.illustrationPrompt || page?.illustration_prompt, 3000),
      artworkUrl,
      artworkPath: text(page?.artworkPath, 500),
      artworkName: text(page?.artworkName, 180),
      artworkStatus,
      artworkUpdatedAt: nullableTimestamp(page?.artworkUpdatedAt),
    };
  });
}

async function supabaseRequest(path, options = {}) {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw configurationError();

  const response = await fetch(`${url}/rest/v1${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(body?.message || "The story database request failed.");
    error.status = response.status;
    error.code = body?.code || "story_database_error";
    throw error;
  }

  return body || [];
}

function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function slugify(value) {
  return text(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

function nullableDate(value) {
  if (!value) return null;
  const normalized = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw validationError("Use a valid availability date.");
  return normalized;
}

function nullableTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function safeUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.toString().slice(0, 1000) : "";
  } catch { return ""; }
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = "invalid_story";
  return error;
}

function configurationError() {
  const error = new Error("The story database is not configured.");
  error.status = 503;
  error.code = "story_database_not_configured";
  return error;
}

module.exports = { createStory, ensureCatalogStories, getStory, listStories, supabaseRequest, updateStory };
