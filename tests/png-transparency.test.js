const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { inspectPngTransparency } = require("../lib/png-transparency");

function chunk(type, data) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
}

function rgbaPng(alpha) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(Buffer.from([0, 20, 40, 60, alpha]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("pose PNG inspection distinguishes real transparent pixels from an opaque alpha channel", () => {
  assert.deepEqual(inspectPngTransparency(rgbaPng(120)), { validPng: true, hasAlphaChannel: true, hasTransparentPixels: true });
  assert.deepEqual(inspectPngTransparency(rgbaPng(255)), { validPng: true, hasAlphaChannel: true, hasTransparentPixels: false });
  assert.equal(inspectPngTransparency(Buffer.from("not png")).validPng, false);
});
