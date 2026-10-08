/*
 * Raster helpers for the print compositor (Skia via @napi-rs/canvas).
 *
 * Every illustrated layer (background plate, child, monster, frames, panels)
 * is flattened into one opaque 300 PPI JPEG per page/cover, so the PDF holds
 * no transparency. Text stays vector on top with embedded fonts.
 */
const path = require("node:path");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const { PRINT_DPI } = require("./lulu-print-specs");

const { repoRoot } = require("./repo-root");

const ROOT = repoRoot();
const LABEL_FONT_FAMILY = "MonstersNOW Print Label";
let labelFontRegistered = false;

function ensureLabelFont() {
  if (labelFontRegistered) return;
  GlobalFonts.registerFromPath(path.join(ROOT, "assets/fonts/fredoka/print/FredokaPrint-SemiBold.ttf"), LABEL_FONT_FAMILY);
  labelFontRegistered = true;
}

async function decodeImage(buffer, label = "image") {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) throw rasterError(`${label} is empty or unreadable.`);
  try {
    return await loadImage(buffer);
  } catch (error) {
    throw rasterError(`${label} could not be decoded (PNG, JPEG, or WebP required): ${error.message}`);
  }
}

function newCanvas(width, height) {
  const canvas = createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

/**
 * Turn a character image into a cut-out with a real alpha channel.
 *
 * - Images that already carry transparency (e.g. the child renderer's
 *   `background: "transparent"` WebP/PNG) are used as-is.
 * - Opaque images on a flat studio background (the monster converter asks
 *   for a white background) are keyed: the background colour is estimated
 *   from the border, flood-filled from the edges only (so white eyes/teeth
 *   inside the character survive), then given a 1-band soft edge with colour
 *   decontamination to avoid white halos on dark scenes.
 * - Busy/non-uniform backgrounds are left opaque and reported, because
 *   guessing would cut into the character.
 */
function prepareCutout(image, { tolerance = 34, label = "character" } = {}) {
  const width = image.width;
  const height = image.height;
  const { canvas, ctx } = newCanvas(width, height);
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const border = borderIndexes(width, height);

  const transparentBorder = border.filter((index) => data[index * 4 + 3] < 128).length;
  if (transparentBorder / border.length >= 0.25) {
    return finishCutout(canvas, ctx, { method: "existing-alpha", label });
  }

  const background = medianColor(data, border);
  const tol2 = tolerance * tolerance;
  const nearBackground = (index) => colorDistance2(data, index, background) <= tol2;
  const uniform = border.filter(nearBackground).length / border.length;
  if (uniform < 0.6) {
    return finishCutout(canvas, ctx, {
      method: "opaque",
      label,
      warning: `${label} has no transparency and its background is not a flat colour; supply a transparent PNG/WebP.`,
    });
  }

  const pixelCount = width * height;
  const isBackground = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  for (const index of border) {
    if (!isBackground[index] && nearBackground(index)) {
      isBackground[index] = 1;
      queue[tail++] = index;
    }
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const neighbours = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width];
    for (const next of neighbours) {
      if (next < 0 || next >= pixelCount || isBackground[next]) continue;
      if (nearBackground(next)) {
        isBackground[next] = 1;
        queue[tail++] = next;
      }
    }
  }
  const removed = tail / pixelCount;
  if (removed < 0.02 || removed > 0.97) {
    return finishCutout(canvas, ctx, {
      method: "opaque",
      label,
      warning: `${label} background keying removed ${(removed * 100).toFixed(1)}% of pixels; supply a transparent PNG/WebP.`,
    });
  }

  // Ground shadows: soft, near-neutral pixels connected to the background in
  // the lower part of the image become a translucent dark shadow instead of
  // an opaque cream puddle. Limited to the bottom band so light-coloured
  // characters are not thinned.
  const shadowAlpha = new Float32Array(pixelCount);
  const backgroundLum = luminance(background, 0);
  const shadowTop = Math.floor(height * 0.72);
  const isShadowCandidate = (index) => {
    if (Math.floor(index / width) < shadowTop) return false;
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const lum = luminance(data, offset);
    // Cast shadows on a white/cream sweep stay warm-neutral (r >= g >= b);
    // coloured fur (green, teal, purple) fails this and is never thinned.
    const warmNeutral = r >= g - 4 && g >= b - 4;
    return warmNeutral && chroma <= 60 && lum >= backgroundLum * 0.55 && lum < backgroundLum;
  };
  let shadowHead = 0;
  let shadowTail = 0;
  const shadowQueue = new Int32Array(pixelCount);
  for (let index = shadowTop * width; index < pixelCount; index += 1) {
    if (!isBackground[index]) continue;
    const x = index % width;
    for (const next of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width]) {
      if (next >= 0 && next < pixelCount && !isBackground[next] && !shadowAlpha[next] && isShadowCandidate(next)) {
        shadowAlpha[next] = 1;
        shadowQueue[shadowTail++] = next;
      }
    }
  }
  while (shadowHead < shadowTail) {
    const index = shadowQueue[shadowHead++];
    const x = index % width;
    for (const next of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width]) {
      if (next >= 0 && next < pixelCount && !isBackground[next] && !shadowAlpha[next] && isShadowCandidate(next)) {
        shadowAlpha[next] = 1;
        shadowQueue[shadowTail++] = next;
      }
    }
  }
  for (let i = 0; i < shadowTail; i += 1) {
    const index = shadowQueue[i];
    const offset = index * 4;
    const darkness = (backgroundLum - luminance(data, offset)) / backgroundLum;
    data[offset] = 24;
    data[offset + 1] = 20;
    data[offset + 2] = 40;
    data[offset + 3] = Math.round(Math.min(0.55, darkness * 1.8) * 255);
    isBackground[index] = 2;
  }

  for (let index = 0; index < pixelCount; index += 1) {
    if (isBackground[index] === 2) continue;
    if (isBackground[index]) {
      data[index * 4 + 3] = 0;
      continue;
    }
    const x = index % width;
    const touchesBackground = (x > 0 && isBackground[index - 1]) || (x < width - 1 && isBackground[index + 1])
      || (index >= width && isBackground[index - width]) || (index + width < pixelCount && isBackground[index + width]);
    if (!touchesBackground) continue;
    const distance = Math.sqrt(colorDistance2(data, index, background));
    const alpha = Math.max(0.15, Math.min(1, (distance - tolerance) / tolerance));
    const offset = index * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      const value = (data[offset + channel] - (1 - alpha) * background[channel]) / alpha;
      data[offset + channel] = Math.max(0, Math.min(255, Math.round(value)));
    }
    data[offset + 3] = Math.round(alpha * data[offset + 3]);
  }
  ctx.putImageData(imageData, 0, 0);
  return finishCutout(canvas, ctx, {
    method: "keyed-flat-background",
    label,
    keyColor: background,
    removedFraction: Number(removed.toFixed(4)),
    shadowFraction: Number((shadowTail / pixelCount).toFixed(4)),
  });
}

function finishCutout(canvas, ctx, report) {
  const bounds = alphaBounds(ctx, canvas.width, canvas.height);
  if (!bounds) throw rasterError(`${report.label} is fully transparent.`);
  const { canvas: trimmed, ctx: trimmedCtx } = newCanvas(bounds.width, bounds.height);
  trimmedCtx.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  return {
    canvas: trimmed,
    width: bounds.width,
    height: bounds.height,
    report: { ...report, sourcePixels: [canvas.width, canvas.height], trimmedPixels: [bounds.width, bounds.height] },
  };
}

function alphaBounds(ctx, width, height) {
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function borderIndexes(width, height) {
  const indexes = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 400));
  for (let x = 0; x < width; x += step) indexes.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y += step) indexes.push(y * width, y * width + width - 1);
  return indexes;
}

function medianColor(data, indexes) {
  return [0, 1, 2].map((channel) => {
    const values = indexes.map((index) => data[index * 4 + channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  });
}

function luminance(data, offset) {
  return 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
}

function colorDistance2(data, index, color) {
  const offset = index * 4;
  const dr = data[offset] - color[0];
  const dg = data[offset + 1] - color[1];
  const db = data[offset + 2] - color[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * Draw `image` so it covers `dest` (pixels), optionally using only part of
 * the source (e.g. the left half of a two-page spread). Returns the
 * effective resolution of the placed pixels in PPI.
 */
function drawCover(ctx, image, dest, { sourceRect = null, dpi = PRINT_DPI } = {}) {
  const source = sourceRect || { x: 0, y: 0, width: image.width, height: image.height };
  const scale = Math.max(dest.width / source.width, dest.height / source.height);
  const cropWidth = dest.width / scale;
  const cropHeight = dest.height / scale;
  const sx = source.x + (source.width - cropWidth) / 2;
  const sy = source.y + (source.height - cropHeight) / 2;
  ctx.drawImage(image, sx, sy, cropWidth, cropHeight, dest.x, dest.y, dest.width, dest.height);
  return { effectivePpi: round1(dpi / scale), sourcePixels: [Math.round(cropWidth), Math.round(cropHeight)] };
}

/** Draw a cut-out into a box, optionally mirrored. Returns effective PPI. */
function drawCutout(ctx, cutout, box, { mirror = false, dpi = PRINT_DPI } = {}) {
  ctx.save();
  if (mirror) {
    ctx.translate(box.x + box.width, box.y);
    ctx.scale(-1, 1);
    ctx.drawImage(cutout.canvas, 0, 0, box.width, box.height);
  } else {
    ctx.drawImage(cutout.canvas, box.x, box.y, box.width, box.height);
  }
  ctx.restore();
  return round1(dpi * Math.min(cutout.width / box.width, cutout.height / box.height));
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** Clearly-labelled placeholder art: never mistakable for a finished plate. */
function drawPlaceholderBackground(ctx, dest, { title, lines = [], palette, labelY = 0.5, labelX = 0.5 }) {
  ensureLabelFont();
  const gradient = ctx.createLinearGradient(dest.x, dest.y, dest.x, dest.y + dest.height);
  gradient.addColorStop(0, palette.placeholderTop || "#24305e");
  gradient.addColorStop(1, palette.placeholderBottom || "#4b3a6e");
  ctx.fillStyle = gradient;
  ctx.fillRect(dest.x, dest.y, dest.width, dest.height);
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = Math.max(2, dest.width / 400);
  const step = Math.max(60, dest.width / 18);
  for (let offset = -dest.height; offset < dest.width; offset += step) {
    ctx.beginPath();
    ctx.moveTo(dest.x + offset, dest.y + dest.height);
    ctx.lineTo(dest.x + offset + dest.height, dest.y);
    ctx.stroke();
  }
  const size = Math.max(28, Math.min(dest.width, dest.height) / 22);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${size}px "${LABEL_FONT_FAMILY}"`;
  const cx = dest.x + dest.width * labelX;
  const cy = dest.y + dest.height * labelY;
  ctx.fillText(title, cx, cy - size * 0.9);
  ctx.font = `${size * 0.5}px "${LABEL_FONT_FAMILY}"`;
  lines.forEach((line, index) => ctx.fillText(line, cx, cy + size * 0.2 + index * size * 0.7));
  ctx.restore();
}

/** Small proof stamp drawn inside the safe area of sample output. */
function drawProofStamp(ctx, text, x, y, maxWidth) {
  ensureLabelFont();
  const size = 30;
  ctx.save();
  ctx.font = `${size}px "${LABEL_FONT_FAMILY}"`;
  const width = Math.min(maxWidth, ctx.measureText(text).width + size * 1.2);
  ctx.fillStyle = "rgba(180,30,40,0.88)";
  roundedRectPath(ctx, x, y, width, size * 1.6, size * 0.4);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + size * 0.6, y + size * 0.8, width - size * 1.2);
  ctx.restore();
}

async function encodeJpeg(canvas, quality = 92) {
  return canvas.encode("jpeg", quality);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function rasterError(message) {
  const error = new Error(message);
  error.name = "ProductionError";
  error.status = 400;
  return error;
}

module.exports = {
  decodeImage,
  drawCover,
  drawCutout,
  drawPlaceholderBackground,
  drawProofStamp,
  encodeJpeg,
  newCanvas,
  prepareCutout,
  roundedRectPath,
};
