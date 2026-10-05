const fs = require("node:fs");
const path = require("node:path");
const { backgroundArtworkPrompt } = require("./story-art-direction");

const MANUSCRIPT_PATH = path.join(__dirname, "story-data", "halloween-monster-night.md");

function buildHalloweenMasterPages(manuscript = fs.readFileSync(MANUSCRIPT_PATH, "utf8")) {
  const spreads = [...manuscript.matchAll(/## Pages (\d+)–(\d+) — Spread \d+: ([^\n]+)\n\n\*\*Final story text:\*\*\s+([\s\S]*?)\n\n\*\*Illustration direction:\*\*\s+([\s\S]*?)\n\n\*\*Personalized characters:/g)];
  if (spreads.length !== 14) throw new Error(`Expected 14 Halloween story spreads; found ${spreads.length}.`);

  const pages = [
    page("Halloween Monster Night\nStarring {child_name} and {monster_name}\n\nThis book belongs to a one-of-a-kind monster maker.\n\nCopyright © MonstersNOW\nMade from an original drawing by {child_name}.", "Title, dedication, copyright, and source-credit background plate with a restrained border of stars, leaves, wrapped candy, and small pumpkin lanterns. Keep the layout airy. No child or monster appears on this page.", { x: 50, y: 82, scale: 20, facing: "neutral", layer: "behind" }, false, false),
    page("Every adventure starts with an idea…", "Gallery-mat background plate for the exact original uploaded drawing. Preserve the source pixels and aspect ratio; allow only an approved crop. Do not redraw, restyle, retouch, or add a sample child or monster.", { x: 50, y: 82, scale: 20, facing: "neutral", layer: "behind" }, false, false),
    page("Meet {monster_name}!", "Facing gallery-mat background plate for the exact customer-approved monster portrait and name. Preserve the approved portrait version and aspect ratio. Do not substitute a generated pose, sample child, or different monster.", { x: 50, y: 82, scale: 20, facing: "neutral", layer: "behind" }, false, false),
  ];

  spreads.forEach((match, spreadIndex) => {
    const startPage = Number(match[1]);
    const endPage = Number(match[2]);
    const title = cleanMarkdown(match[3]);
    const halves = splitSpreadText(cleanMarkdown(match[4]));
    const direction = cleanMarkdown(match[5]);
    pages.push(page(halves[0], `${title}. Left-page background plate. ${direction} Do not include a permanent child or story monster; keep both personalized character zones clear.`, placementFor(startPage, spreadIndex, "left"), true, true, childPlacementFor(startPage, spreadIndex, "left")));
    pages.push(page(halves[1], `${title}. Right-page background plate. ${direction} Do not include a permanent child or story monster; keep both personalized character zones clear.`, placementFor(endPage, spreadIndex, "right"), true, true, childPlacementFor(endPage, spreadIndex, "right")));
  });

  pages.push(page("Meet {monster_name}!\n\nCreated by {child_name}\n\nEvery great monster begins with a great imagination.", "Celebratory background plate with two empty frames labeled ‘My Drawing’ and ‘My Storybook Monster.’ The order renderer inserts the unchanged original drawing and exact approved monster portrait. Do not include a sample child or monster.", { x: 72, y: 78, scale: 34, facing: "left", layer: "front" }, false, false));

  if (pages.length !== 32 || pages.some((entry) => !entry.text || !entry.illustrationPrompt)) {
    throw new Error("The Halloween master manuscript did not produce 32 complete pages.");
  }
  return pages;
}

function page(text, illustrationPrompt, monsterPlacement, childRequired = false, monsterRequired = true, childPlacement = { x: 30, y: 82, scale: 34, facing: "right", layer: "front" }) {
  return {
    text,
    illustrationPrompt: backgroundArtworkPrompt(illustrationPrompt),
    artworkUrl: "",
    artworkPath: "",
    artworkName: "",
    artworkStatus: "missing",
    artworkUpdatedAt: null,
    artworkRole: "background_plate",
    backgroundPlateConfirmed: false,
    backgroundPlateVersion: 2,
    monsterRequired,
    monsterPlacement,
    childRequired,
    childPlacement,
  };
}

function childPlacementFor(pageNumber, spreadIndex, side) {
  const monster = placementFor(pageNumber, spreadIndex, side);
  return { x: monster.x < 50 ? 72 : 28, y: Math.min(90, monster.y + 2), scale: Math.max(24, monster.scale - 5), facing: monster.x < 50 ? "left" : "right", layer: "front" };
}

function splitSpreadText(text) {
  const paragraphs = text.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
  if (paragraphs.length < 2) return [text, text];
  const total = paragraphs.join(" ").length;
  let split = 1;
  while (split < paragraphs.length - 1 && paragraphs.slice(0, split).join(" ").length < total / 2) split += 1;
  return [paragraphs.slice(0, split).join("\n\n"), paragraphs.slice(split).join("\n\n")];
}

function placementFor(pageNumber, spreadIndex, side) {
  const pattern = [
    { x: 70, scale: 35 },
    { x: 30, scale: 34 },
    { x: 68, scale: 38 },
    { x: 34, scale: 36 },
  ][spreadIndex % 4];
  return {
    x: side === "left" ? 100 - pattern.x : pattern.x,
    y: pageNumber >= 22 && pageNumber <= 27 ? 78 : 82,
    scale: pattern.scale,
    facing: side === "left" ? "right" : "left",
    layer: pageNumber === 20 || pageNumber === 21 ? "behind" : "front",
  };
}

function cleanMarkdown(value) {
  return String(value || "")
    .replace(/\s{2,}\n/g, "\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

module.exports = { buildHalloweenMasterPages, splitSpreadText };
