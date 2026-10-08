/*
 * Resolve image sources for the print compositor.
 * Sources: { path } (repo-relative, read-only), { url } (https only), or { buffer }.
 */
const fs = require("node:fs");
const path = require("node:path");

const { repoRoot } = require("./repo-root");

const ROOT = repoRoot();
const MAX_REMOTE_BYTES = 40 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20000;

async function loadAssetSource(source, label = "asset") {
  if (!source) return null;
  if (Buffer.isBuffer(source.buffer)) return { buffer: source.buffer, label: source.label || label, origin: source.origin || "buffer" };
  if (source.path) {
    const absolute = path.resolve(ROOT, source.path);
    if (!absolute.startsWith(`${ROOT}${path.sep}`)) throw assetError(`${label} path escapes the project.`);
    return { buffer: await fs.promises.readFile(absolute), label: source.label || path.basename(absolute), origin: source.path };
  }
  if (source.url) return { buffer: await fetchImage(source.url, label), label: source.label || label, origin: redactUrl(source.url) };
  throw assetError(`${label} has no usable source.`);
}

async function fetchImage(url, label) {
  let parsed;
  try { parsed = new URL(url); } catch { throw assetError(`${label} URL is invalid.`); }
  if (parsed.protocol !== "https:") throw assetError(`${label} must be served over HTTPS.`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(parsed, { signal: controller.signal, redirect: "follow" });
    if (!response.ok) throw assetError(`${label} could not be downloaded (HTTP ${response.status}).`, 502);
    const type = response.headers.get("content-type") || "";
    if (type && !/^image\//i.test(type) && !/octet-stream/i.test(type)) throw assetError(`${label} is not an image (${type}).`, 502);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_REMOTE_BYTES) throw assetError(`${label} is larger than ${MAX_REMOTE_BYTES} bytes.`, 413);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_REMOTE_BYTES) throw assetError(`${label} is larger than ${MAX_REMOTE_BYTES} bytes.`, 413);
    return buffer;
  } catch (error) {
    if (error.name === "AbortError") throw assetError(`${label} download timed out.`, 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Collect sources for a personalized book manifest (from buildPersonalizedBook).
 * Each page's `backgroundUrl` is its uploaded print plate; the selected
 * monster/child image URLs are pinned by the manifest.
 */
function sourcesFromPersonalizedBook(book, extra = {}) {
  const backgrounds = {};
  book.pages.forEach((page) => {
    if (page.backgroundUrl) backgrounds[page.number] = { url: page.backgroundUrl, label: `page ${page.number} background` };
  });
  const monsterPage = book.pages.find((page) => page.monster?.imageUrl);
  const childPage = book.pages.find((page) => page.child?.imageUrl);
  return {
    backgrounds,
    monster: monsterPage ? { url: monsterPage.monster.imageUrl, label: "selected monster" } : extra.monster || null,
    child: childPage ? { url: childPage.child.imageUrl, label: "approved child asset" } : extra.child || null,
    originalDrawing: extra.originalUrl ? { url: extra.originalUrl, label: "original drawing" } : extra.originalDrawing || null,
    coverWrap: extra.coverWrap || null,
    coverWraps: extra.coverWraps || null,
    coverFront: extra.coverFront || null,
  };
}

/**
 * Per-format cover wraps shipped with the repo for a configured book
 * ({ softcover, hardcover }), or null when none exist yet.
 */
function configCoverWraps(config) {
  const art = config?.localArt;
  if (!art?.cover) return null;
  const wraps = {};
  for (const [format, key] of [["softcover", "softcoverRequired"], ["hardcover", "hardcoverRequired"]]) {
    const file = art.cover[key];
    if (file && fs.existsSync(path.join(ROOT, art.dir, file))) wraps[format] = { path: path.posix.join(art.dir, file), label: path.basename(file) };
  }
  return Object.keys(wraps).length ? wraps : null;
}

/**
 * Fill pages that have no uploaded print background with the story's shipped
 * 300 PPI print masters (never the low-res review plates). Uploaded artwork
 * always wins.
 */
function withShippedPrintMasters(sources, config) {
  const shipped = localSampleSources(config, { useAvailableArt: false }).backgrounds;
  const backgrounds = { ...shipped, ...(sources.backgrounds || {}) };
  return { ...sources, backgrounds, coverWraps: sources.coverWraps || configCoverWraps(config) };
}

/** Repo-art sources for sample builds of a configured book. */
function localSampleSources(config, { useAvailableArt = true, preferRequired = true } = {}) {
  const art = config.localArt;
  if (!art) return { backgrounds: {}, monster: null, child: null, originalDrawing: null, coverWrap: null, coverFront: null };
  const pick = (required, available) => {
    if (preferRequired && required && fs.existsSync(path.join(ROOT, art.dir, required))) return path.posix.join(art.dir, required);
    if (useAvailableArt && available && fs.existsSync(path.join(ROOT, art.dir, available))) return path.posix.join(art.dir, available);
    return null;
  };
  const backgrounds = {};
  for (const spread of art.spreads || []) {
    const file = pick(spread.required, spread.available);
    if (file) spread.pages.forEach((page) => { backgrounds[page] = { path: file, label: path.basename(file) }; });
  }
  for (const single of art.singles || []) {
    const file = pick(single.required, single.available);
    if (file) backgrounds[single.page] = { path: file, label: path.basename(file) };
  }
  const sample = art.sample || {};
  return {
    backgrounds,
    monster: sample.monster ? { path: sample.monster } : null,
    child: sample.child ? { path: sample.child } : null,
    originalDrawing: sample.originalDrawing ? { path: sample.originalDrawing } : null,
    coverWrap: null,
    coverWraps: preferRequired ? configCoverWraps(config) : null,
    coverFront: art.cover?.frontAvailable && useAvailableArt ? { path: path.posix.join(art.dir, art.cover.frontAvailable) } : null,
    coverWrapRequired: art.cover || null,
  };
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "url";
  }
}

function assetError(message, status = 400) {
  const error = new Error(message);
  error.name = "ProductionError";
  error.status = status;
  return error;
}

module.exports = { configCoverWraps, loadAssetSource, localSampleSources, sourcesFromPersonalizedBook, withShippedPrintMasters };
