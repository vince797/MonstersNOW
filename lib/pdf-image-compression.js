'use strict';
// Lossless PDF PNG prediction. Optimizes bytes, not pixels or source dimensions.
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { PDFName, PDFRawStream } = require('pdf-lib');
const key = name => PDFName.of(name);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
function predict(raw, width, height, colors) {
  const stride = width * colors, output = Buffer.alloc((stride + 1) * height);
  const scratch = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  for (let row = 0; row < height; row++) {
    const start = row * stride, scores = [0, 0, 0, 0];
    for (let col = 0; col < stride; col++) {
      const value = raw[start + col], a = col >= colors ? raw[start + col - colors] : 0, b = row ? raw[start + col - stride] : 0, c = row && col >= colors ? raw[start + col - stride - colors] : 0;
      const values = [value, (value - a) & 255, (value - b) & 255, (value - paeth(a, b, c)) & 255];
      for (let i = 0; i < 4; i++) { scores[i] += Math.min(values[i], 256 - values[i]); if (i) scratch[i - 1][col] = values[i]; }
    }
    const best = scores.indexOf(Math.min(...scores)), offset = row * (stride + 1);
    output[offset] = [0, 1, 2, 4][best];
    (best ? scratch[best - 1] : raw.subarray(start, start + stride)).copy(output, offset + 1);
  }
  return output;
}
function unPredict(encoded, width, height, colors) {
  const stride = width * colors, output = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row++) {
    const start = row * stride, offset = row * (stride + 1), filter = encoded[offset];
    for (let col = 0; col < stride; col++) {
      const a = col >= colors ? output[start + col - colors] : 0, b = row ? output[start + col - stride] : 0, c = row && col >= colors ? output[start + col - stride - colors] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 4 ? paeth(a, b, c) : NaN;
      if (!Number.isFinite(prediction)) throw new Error('Unsupported lossless PNG filter.');
      output[start + col] = (encoded[offset + col + 1] + prediction) & 255;
    }
  }
  return output;
}
async function optimizePdfImages(document) {
  await document.flush();
  const report = { method: 'lossless-png-predictor-15', totalSavedBytes: 0, images: [] };
  for (const [ref, stream] of document.context.enumerateIndirectObjects()) {
    if (!(stream instanceof PDFRawStream) || stream.dict.get(key('Subtype'))?.toString() !== '/Image' || stream.dict.get(key('Filter'))?.toString() !== '/FlateDecode' || stream.dict.has(key('DecodeParms'))) continue;
    const width = stream.dict.get(key('Width'))?.asNumber(), height = stream.dict.get(key('Height'))?.asNumber();
    const bits = stream.dict.get(key('BitsPerComponent'))?.asNumber(), space = stream.dict.get(key('ColorSpace'))?.toString();
    const colors = space === '/DeviceRGB' ? 3 : space === '/DeviceGray' ? 1 : 0;
    if (!colors || bits !== 8 || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) continue;
    const original = Buffer.from(stream.getContents()), raw = zlib.inflateSync(original, { maxOutputLength: width * height * colors + 1 });
    if (raw.length !== width * height * colors) throw new Error('Unexpected image sample data; refusing compression.');
    const predicted = predict(raw, width, height, colors), compressed = zlib.deflateSync(predicted, { level: 9 });
    if (compressed.length >= original.length) continue;
    if (!unPredict(zlib.inflateSync(compressed), width, height, colors).equals(raw)) throw new Error('Lossless image pixel verification failed.');
    const dict = stream.dict.clone(document.context);
    dict.set(key('DecodeParms'), document.context.obj({ Predictor: 15, Colors: colors, BitsPerComponent: 8, Columns: width }));
    document.context.assign(ref, PDFRawStream.of(dict, compressed));
    const savedBytes = original.length - compressed.length; report.totalSavedBytes += savedBytes;
    report.images.push({ objectNumber: ref.objectNumber, width, height, colors, decodedPixelSha256: sha(raw), originalCompressedBytes: original.length, compressedBytes: compressed.length, savedBytes, pixelRoundTripVerified: true });
  }
  return report;
}
module.exports = { optimizePdfImages, predict, unPredict };
