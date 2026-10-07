const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  HALLOWEEN_CHILD_POSES,
  HALLOWEEN_CHILD_POSE_PAGES,
  HALLOWEEN_MONSTER_POSES,
  HALLOWEEN_MONSTER_POSE_PAGES,
  HALLOWEEN_SPREADS,
  halloweenPoseForPage,
} = require("../lib/halloween-pose-blueprint");

const root = path.resolve(__dirname, "..");

test("Halloween production uses every established child pose and every existing art spread", () => {
  assert.equal(HALLOWEEN_CHILD_POSES.length, 12);
  assert.equal(HALLOWEEN_SPREADS.length, 14);
  for (const pose of HALLOWEEN_CHILD_POSES) {
    assert.ok(HALLOWEEN_CHILD_POSE_PAGES[pose.id]?.length, `${pose.id} must map to at least one page`);
    const filename = `${pose.id.replaceAll("_", "-")}.png`;
    assert.equal(fs.existsSync(path.join(root, "assets/storybook/halloween-monster-night/reference/wheelchair-profile-deep-braids-black-v1", filename)), true, `${pose.id} deep-braids art must exist`);
  }
  for (const spread of HALLOWEEN_SPREADS) {
    assert.equal(fs.existsSync(path.join(root, spread.masterPath)), true, `${spread.masterPath} must exist`);
    assert.equal(fs.existsSync(path.join(root, spread.environmentPath)), true, `${spread.environmentPath} must exist`);
  }
});

test("Halloween maps every personalized story page to one child scene and one monster action", () => {
  assert.equal(HALLOWEEN_MONSTER_POSES.length, 15);
  const childPages = Object.values(HALLOWEEN_CHILD_POSE_PAGES).flat().sort((a, b) => a - b);
  const monsterPages = Object.values(HALLOWEEN_MONSTER_POSE_PAGES).flat().sort((a, b) => a - b);
  const expectedPages = Array.from({ length: 28 }, (_, index) => index + 4);
  assert.deepEqual(childPages, expectedPages);
  assert.deepEqual(monsterPages, expectedPages);
  for (const pageNumber of expectedPages) {
    assert.ok(halloweenPoseForPage("child", pageNumber));
    assert.ok(halloweenPoseForPage("monster", pageNumber));
  }
});
