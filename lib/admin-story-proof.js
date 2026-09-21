const { createPdfDocument, drawRect, drawStrokeRect, drawText, drawWrappedText } = require("./pdf-writer");

const PAGE_SIZE = 8.5 * 72;

function createAdminStoryProof(story, options = {}) {
  if (!story || !Array.isArray(story.pages)) throw proofError("The master book could not be opened.");
  const childName = clean(options.childName, 40) || "Alex";
  const monsterName = clean(options.monsterName, 40) || "Milo";
  const pages = Array.from({ length: 32 }, (_, index) => buildProofPage(story, story.pages[index], index + 1, childName, monsterName));

  return createPdfDocument({ title: `${story.title_template} editorial proof`, pages });
}

function buildProofPage(story, page = {}, pageNumber, childName, monsterName) {
  const margin = 46;
  const text = personalize(page.text || "", childName, monsterName);
  const artDirection = personalize(page.illustrationPrompt || "", childName, monsterName);
  const artStatus = page.artworkStatus || "missing";
  const placement = page.monsterPlacement || { x: 68, y: 72, scale: 36, facing: "left", layer: "front" };
  const content = [
    drawRect(0, 0, PAGE_SIZE, PAGE_SIZE, pageNumber % 2 ? [1, .985, .95] : [.96, .99, 1]),
    drawRect(0, PAGE_SIZE - 18, PAGE_SIZE, 18, [0, .52, .58]),
    drawText(`${story.title_template}  |  Editorial proof`, margin, PAGE_SIZE - 48, { size: 9, color: [.05, .14, .25] }),
    drawText(`Page ${pageNumber} of 32`, PAGE_SIZE - 104, PAGE_SIZE - 48, { size: 9, color: [.34, .4, .48] }),
    drawText("STORY TEXT", margin, PAGE_SIZE - 88, { size: 9, color: [0, .42, .48] }),
    drawWrappedText(text || "No story text yet.", margin, PAGE_SIZE - 116, PAGE_SIZE - margin * 2, { size: 16, lineHeight: 22, maxLines: 10, color: [.04, .1, .2] }),
    drawStrokeRect(margin, 150, PAGE_SIZE - margin * 2, 178, [.78, .84, .87], 1),
    drawText("ILLUSTRATION DIRECTION", margin + 14, 306, { size: 8, color: [0, .42, .48] }),
    drawWrappedText(artDirection || "No illustration direction yet.", margin + 14, 282, PAGE_SIZE - margin * 2 - 28, { size: 10, lineHeight: 14, maxLines: 8, color: [.28, .34, .42] }),
    drawText(`Artwork: ${artStatus}`, margin + 14, 166, { size: 8, color: artStatus === "approved" || artStatus === "final" ? [0, .42, .3] : [.66, .28, .08] }),
    drawText(`Monster zone: x ${placement.x}% · baseline ${placement.y}% · scale ${placement.scale}% · faces ${placement.facing} · ${placement.layer}`, margin + 120, 166, { size: 7, color: [.34, .4, .48] }),
    drawText("REVIEW ONLY - NOT A LULU PRINT FILE", margin, 62, { size: 9, color: [.72, .24, .08] }),
    drawText(`Sample personalization: ${childName} + ${monsterName}`, margin, 42, { size: 8, color: [.42, .46, .52] }),
  ];
  return { width: PAGE_SIZE, height: PAGE_SIZE, content: content.join("\n") };
}

function personalize(value, childName, monsterName) {
  return String(value || "").replaceAll("{child_name}", childName).replaceAll("{monster_name}", monsterName);
}

function clean(value, max) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function proofError(message) { const error = new Error(message); error.status = 400; return error; }

module.exports = { createAdminStoryProof };
