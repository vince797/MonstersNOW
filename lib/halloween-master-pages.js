const fs = require("node:fs");
const path = require("node:path");

const MANUSCRIPT_PATH = path.join(__dirname, "story-data", "halloween-monster-night.md");

function buildHalloweenMasterPages(manuscript = fs.readFileSync(MANUSCRIPT_PATH, "utf8")) {
  const spreads = [...manuscript.matchAll(/## Pages (\d+)–(\d+) — Spread \d+: ([^\n]+)\n\n\*\*Final story text:\*\*\s+([\s\S]*?)\n\n\*\*Illustration direction:\*\*\s+([\s\S]*?)\n\n\*\*Personalized characters:/g)];
  if (spreads.length !== 14) throw new Error(`Expected 14 Halloween story spreads; found ${spreads.length}.`);

  const pages = [
    page("Halloween Monster Night", "A small five-pointed golden star glows above the title. Add a few curling autumn leaves and tiny pumpkin silhouettes. Leave generous negative space.", { x: 68, y: 72, scale: 30, facing: "left", layer: "front" }),
    page("Halloween Monster Night\nStarring {child_name} and {monster_name}\n\nThis book belongs to a one-of-a-kind monster maker.", "Title and dedication page with a framed miniature of the child's original uploaded monster drawing. Keep the layout airy and do not use the transformed story character yet.", { x: 70, y: 76, scale: 28, facing: "left", layer: "front" }),
    page("Copyright © MonstersNOW\n\nMade from a one-of-a-kind monster drawing.", "Copyright page with a restrained border of stars, leaves, wrapped treats, and small pumpkin lanterns. Leave generous room for publisher information.", { x: 72, y: 78, scale: 24, facing: "left", layer: "behind" }),
  ];

  spreads.forEach((match, spreadIndex) => {
    const startPage = Number(match[1]);
    const endPage = Number(match[2]);
    const title = cleanMarkdown(match[3]);
    const halves = splitSpreadText(cleanMarkdown(match[4]));
    const direction = cleanMarkdown(match[5]);
    pages.push(page(halves[0], `${title}. Left page of the spread. ${direction}`, placementFor(startPage, spreadIndex, "left")));
    pages.push(page(halves[1], `${title}. Right page of the spread. ${direction}`, placementFor(endPage, spreadIndex, "right")));
  });

  pages.push(page("Meet {monster_name}!\n\nCreated by {child_name}\n\nEvery great monster begins with a great imagination.", "Present the original uploaded drawing and transformed storybook character side by side. Label them ‘My Drawing’ and ‘My Storybook Monster.’ Use a celebratory border derived from the Monster Star and curling leaves.", { x: 72, y: 78, scale: 34, facing: "left", layer: "front" }));

  if (pages.length !== 32 || pages.some((entry) => !entry.text || !entry.illustrationPrompt)) {
    throw new Error("The Halloween master manuscript did not produce 32 complete pages.");
  }
  return pages;
}

function page(text, illustrationPrompt, monsterPlacement) {
  return {
    text,
    illustrationPrompt,
    artworkUrl: "",
    artworkPath: "",
    artworkName: "",
    artworkStatus: "missing",
    artworkUpdatedAt: null,
    monsterPlacement,
  };
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
