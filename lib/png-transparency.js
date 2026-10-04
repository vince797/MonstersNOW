const zlib = require("node:zlib");

function inspectPngTransparency(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { validPng: false, hasAlphaChannel: false, hasTransparentPixels: false };
  }
  let offset = 8;
  let header = null;
  const idat = [];
  let paletteTransparency = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (offset + 12 + length > buffer.length) break;
    if (type === "IHDR") header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
    if (type === "IDAT") idat.push(data);
    if (type === "tRNS") paletteTransparency = [...data].some((alpha) => alpha < 255);
    offset += 12 + length;
  }
  const hasAlphaChannel = Boolean(header && [4, 6].includes(header.colorType)) || paletteTransparency;
  if (!header || !hasAlphaChannel) return { validPng: Boolean(header), hasAlphaChannel, hasTransparentPixels: paletteTransparency };
  if (paletteTransparency || header.bitDepth !== 8 || header.interlace !== 0 || !idat.length) {
    return { validPng: true, hasAlphaChannel, hasTransparentPixels: paletteTransparency, inspectionLimited: true };
  }
  const channels = header.colorType === 6 ? 4 : 2;
  const stride = header.width * channels;
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch { return { validPng: true, hasAlphaChannel, hasTransparentPixels: false, inspectionLimited: true }; }
  if (raw.length < (stride + 1) * header.height) return { validPng: true, hasAlphaChannel, hasTransparentPixels: false, inspectionLimited: true };
  let prior = Buffer.alloc(stride);
  let cursor = 0;
  let transparent = false;
  let visible = false;
  for (let rowIndex = 0; rowIndex < header.height; rowIndex += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const encoded = raw.subarray(cursor, cursor + stride);
    cursor += stride;
    const row = unfilterRow(encoded, prior, channels, filter);
    for (let index = channels - 1; index < row.length; index += channels) {
      transparent ||= row[index] < 250;
      visible ||= row[index] > 5;
      if (transparent && visible) break;
    }
    prior = row;
    if (transparent && visible) break;
  }
  return { validPng: true, hasAlphaChannel, hasTransparentPixels: transparent && visible };
}

function unfilterRow(encoded, prior, bytesPerPixel, filter) {
  const row = Buffer.alloc(encoded.length);
  for (let index = 0; index < encoded.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
    const up = prior[index] || 0;
    const upperLeft = index >= bytesPerPixel ? prior[index - bytesPerPixel] || 0 : 0;
    if (filter === 0) row[index] = encoded[index];
    else if (filter === 1) row[index] = (encoded[index] + left) & 255;
    else if (filter === 2) row[index] = (encoded[index] + up) & 255;
    else if (filter === 3) row[index] = (encoded[index] + Math.floor((left + up) / 2)) & 255;
    else if (filter === 4) row[index] = (encoded[index] + paeth(left, up, upperLeft)) & 255;
    else throw new Error("Unsupported PNG filter.");
  }
  return row;
}

function paeth(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

module.exports = { inspectPngTransparency };
