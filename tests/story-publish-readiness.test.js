const test = require("node:test");
const assert = require("node:assert/strict");
const { validateStoryPublishReadiness } = require("../lib/story-library");

function readyPages() {
  return Array.from({ length: 32 }, (_, index) => ({
    page: index + 1,
    text: `Page ${index + 1}`,
    artworkUrl: `https://assets.example/page-${index + 1}.jpg`,
    artworkStatus: "final",
    backgroundPlateConfirmed: true,
    backgroundPlateVersion: 2,
  }));
}

test("server publish gate accepts only a complete 32-page production master", () => {
  assert.doesNotThrow(() => validateStoryPublishReadiness(readyPages()));
  assert.throws(() => validateStoryPublishReadiness(readyPages().slice(0, 31)), /exactly 32 pages/i);
  for (const change of [
    { text: "" },
    { artworkUrl: "" },
    { artworkStatus: "draft" },
    { backgroundPlateConfirmed: false },
    { backgroundPlateVersion: 1 },
  ]) {
    const pages = readyPages();
    Object.assign(pages[7], change);
    assert.throws(() => validateStoryPublishReadiness(pages), /Page 8/i);
  }
});
