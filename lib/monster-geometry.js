'use strict';
// Measures opacity only. It never edits image bytes or infers anatomical feet.
const crypto = require('node:crypto');
const sharp = require('sharp');
const VERSION = 'monster-alpha128-geometry-v1';
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 16 * 1024 * 1024;
const issued = new WeakMap();
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const own = (value, key) => value && Object.prototype.hasOwnProperty.call(value, key);

async function deriveMonsterGeometry(input, { source, selectedPreviewId } = {}) {
  const bytes = Buffer.isBuffer(input) || input instanceof Uint8Array ? Buffer.from(input) : null;
  const base = { version: VERSION, selectedPreviewId: String(selectedPreviewId || ''), sourceSha256: bytes ? sha(bytes) : null, alphaThreshold: 128 };
  const fallback = reason => Object.freeze({ ...base, available: false, reason });
  if (!bytes?.length || bytes.length > MAX_BYTES || typeof source !== 'string' || !selectedPreviewId) return fallback('unbounded_or_unbound_source');
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return fallback('legacy_non_png');
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
    const metadata = await image.metadata();
    if (metadata.format !== 'png' || metadata.pages > 1 || !metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) return fallback('unsupported_image');
    if (!metadata.hasAlpha) return fallback('opaque_image');
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.channels !== 4) return fallback('unsupported_channels');
    let left = info.width, top = info.height, right = 0, bottom = 0, visible = 0, clear = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha <= 8) clear++;
      if (alpha < 128) continue;
      visible++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
    }
    if (!visible || !clear) return fallback(visible ? 'opaque_image' : 'no_visible_core');
    const record = Object.freeze({ ...base, available: true, width: info.width, height: info.height,
      bounds: Object.freeze({ left, top, right, bottom }), // exclusive right/bottom
      anchor: Object.freeze({ x: 0.5, y: bottom / info.height }),
    });
    issued.set(record, { source, selectedPreviewId: String(selectedPreviewId) });
    return record;
  } catch { return fallback('invalid_or_oversized_image'); }
}

function trustedMonsterGeometry(record, { source, selectedPreviewId, bytes } = {}) {
  if (!record || !own(record, 'available') || record.available !== true) return null;
  const binding = issued.get(record);
  if (!binding || binding.source !== source || binding.selectedPreviewId !== String(selectedPreviewId || '')) return null;
  if (bytes && record.sourceSha256 !== sha(bytes)) return null;
  return record;
}

module.exports = { VERSION, deriveMonsterGeometry, trustedMonsterGeometry };
