const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PNG } = require("pngjs");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "output/wheelchair-reference-compositor");

test("reference compositor separates four alpha poses and renders crop-safe 2550px pages", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/build-wheelchair-reference-compositor.js")], { cwd: root });
  const report = JSON.parse(fs.readFileSync(path.join(outputDir, "render-report.json"), "utf8"));
  assert.equal(report.status, "reference_only");
  assert.equal(report.productionSelectionEnabled, false);
  assert.equal(report.approval.artApproved, false);
  assert.equal(report.approval.requiredNow, true);
  assert.deepEqual(report.outputIntent, {
    width: 2550,
    height: 2550,
    nominalDpi: 300,
    trimInches: "8.5 × 8.5",
    safeMarginPixels: 150,
  });
  assert.equal(report.pages.length, 4);
  for (const page of report.pages) {
    assert.equal(page.cropSafe, true);
    assert.equal(page.movementNeutral, true);
    assert.deepEqual(page.dimensions, { width: 2550, height: 2550 });
    assert.doesNotMatch(page.text, /\b(?:walk|walked|walking|stand|stood|standing|run|ran|running|climb|climbed|climbing)\b/i);
    const rendered = PNG.sync.read(fs.readFileSync(path.join(root, page.renderedPath)));
    assert.deepEqual([rendered.width, rendered.height], [2550, 2550]);
    const pose = PNG.sync.read(fs.readFileSync(path.join(root, page.pose.path)));
    assert.ok(pose.data.some((value, index) => index % 4 === 3 && value === 0), `${page.id} retains transparency`);
    assert.ok(page.pose.alphaBounds.left >= 20 && page.pose.alphaBounds.top >= 0);
    assert.ok(page.pose.alphaBounds.right <= pose.width - 20 && page.pose.alphaBounds.bottom <= pose.height - 1);
  }
  const contact = PNG.sync.read(fs.readFileSync(path.join(root, report.contactSheet.path)));
  assert.deepEqual([contact.width, contact.height], [2048, 2220]);
});
