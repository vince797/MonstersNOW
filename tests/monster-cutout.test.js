const test = require("node:test");
const assert = require("node:assert/strict");

const { refineConnectedBackground } = require("../scripts/monster-cutout");

function fixture(width, height, color = [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) data.set(color, pixel * 4);
  return data;
}

function setPixel(data, width, x, y, color) {
  data.set(color, (y * width + x) * 4);
}

function pixel(data, width, x, y) {
  return [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
}

test("cutout removes only connected backdrop and decontaminates the pale edge", () => {
  const width = 7;
  const height = 7;
  const data = fixture(width, height);
  for (let y = 2; y <= 4; y += 1) {
    for (let x = 2; x <= 4; x += 1) setPixel(data, width, x, y, [155, 230, 155, 255]);
  }
  setPixel(data, width, 3, 3, [20, 160, 30, 255]);

  refineConnectedBackground({ data }, width, height);

  assert.equal(pixel(data, width, 0, 0)[3], 0, "connected white corner should be transparent");
  assert.ok(pixel(data, width, 2, 2)[3] < 255, "pale boundary should be feathered");
  assert.ok(pixel(data, width, 2, 2)[0] < 155, "white spill should be removed from the red channel");
  assert.deepEqual(pixel(data, width, 3, 3), [20, 160, 30, 255], "interior monster color should remain unchanged");
});

test("cutout preserves a light detail that is enclosed by foreground", () => {
  const width = 7;
  const height = 7;
  const data = fixture(width, height);
  for (let y = 1; y <= 5; y += 1) {
    for (let x = 1; x <= 5; x += 1) setPixel(data, width, x, y, [30, 150, 55, 255]);
  }
  setPixel(data, width, 3, 3, [250, 250, 245, 255]);

  refineConnectedBackground({ data }, width, height);

  assert.equal(pixel(data, width, 3, 3)[3], 255, "disconnected light detail should stay opaque");
});
