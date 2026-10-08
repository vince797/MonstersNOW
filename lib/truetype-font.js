/*
 * Minimal TrueType reader used to embed whole fonts in print PDFs.
 * Reads only the metrics needed for a WinAnsi-encoded simple TrueType font
 * (cmap 3/1 format 4, hmtx, head, hhea, OS/2, post, name).
 */
const WIN_ANSI_HIGH = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018,
  0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc,
  0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};
const UNICODE_TO_WIN_ANSI = new Map();
for (let code = 0x20; code <= 0xff; code += 1) {
  if (code >= 0x80 && code <= 0x9f) {
    if (WIN_ANSI_HIGH[code]) UNICODE_TO_WIN_ANSI.set(WIN_ANSI_HIGH[code], code);
  } else if (code !== 0x7f) {
    UNICODE_TO_WIN_ANSI.set(code, code);
  }
}

function winAnsiToUnicode(code) {
  if (code >= 0x80 && code <= 0x9f) return WIN_ANSI_HIGH[code] || null;
  return code;
}

function parseTrueType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) throw new Error("Invalid TrueType font.");
  const version = buffer.readUInt32BE(0);
  if (version !== 0x00010000 && version !== 0x74727565) throw new Error("Only TrueType-outline fonts can be embedded.");
  const numTables = buffer.readUInt16BE(4);
  const tables = {};
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    const tag = buffer.toString("latin1", record, record + 4);
    tables[tag] = { offset: buffer.readUInt32BE(record + 8), length: buffer.readUInt32BE(record + 12) };
  }
  for (const tag of ["head", "hhea", "hmtx", "cmap", "maxp", "glyf", "loca"]) {
    if (!tables[tag]) throw new Error(`TrueType font is missing the ${tag} table.`);
  }
  if (tables.fvar) throw new Error("Variable fonts must be instanced to a static font before PDF embedding.");

  const head = tables.head.offset;
  const unitsPerEm = buffer.readUInt16BE(head + 18);
  const bbox = [0, 2, 4, 6].map((delta) => buffer.readInt16BE(head + 36 + delta));
  const hhea = tables.hhea.offset;
  const ascender = buffer.readInt16BE(hhea + 4);
  const descender = buffer.readInt16BE(hhea + 6);
  const numberOfHMetrics = buffer.readUInt16BE(hhea + 34);
  const numGlyphs = buffer.readUInt16BE(tables.maxp.offset + 4);
  const advances = new Array(numGlyphs);
  let lastAdvance = 0;
  for (let glyph = 0; glyph < numGlyphs; glyph += 1) {
    if (glyph < numberOfHMetrics) lastAdvance = buffer.readUInt16BE(tables.hmtx.offset + glyph * 4);
    advances[glyph] = lastAdvance;
  }

  let capHeight = Math.round(ascender * 0.7);
  let weightClass = 400;
  let fsType = 0;
  if (tables["OS/2"]) {
    const os2 = tables["OS/2"].offset;
    const os2Version = buffer.readUInt16BE(os2);
    weightClass = buffer.readUInt16BE(os2 + 4);
    fsType = buffer.readUInt16BE(os2 + 8);
    if (os2Version >= 2 && tables["OS/2"].length >= 90) capHeight = buffer.readInt16BE(os2 + 88);
  }
  if ((fsType & 0x000f) === 0x0002) throw new Error("Font licence forbids embedding (restricted licence).");
  let italicAngle = 0;
  let fixedPitch = false;
  if (tables.post) {
    italicAngle = buffer.readInt32BE(tables.post.offset + 4) / 65536;
    fixedPitch = buffer.readUInt32BE(tables.post.offset + 12) !== 0;
  }

  return {
    data: buffer,
    postScriptName: readPostScriptName(buffer, tables.name) || "EmbeddedFont",
    unitsPerEm,
    bbox,
    ascender,
    descender,
    capHeight,
    weightClass,
    italicAngle,
    fixedPitch,
    advances,
    cmap: readCmap(buffer, tables.cmap.offset),
  };
}

function readCmap(buffer, offset) {
  const count = buffer.readUInt16BE(offset + 2);
  let subtable = null;
  for (let index = 0; index < count; index += 1) {
    const record = offset + 4 + index * 8;
    const platform = buffer.readUInt16BE(record);
    const encoding = buffer.readUInt16BE(record + 2);
    const subOffset = offset + buffer.readUInt32BE(record + 4);
    if (buffer.readUInt16BE(subOffset) !== 4) continue;
    if ((platform === 3 && encoding === 1) || (platform === 0 && !subtable)) subtable = subOffset;
  }
  if (!subtable) throw new Error("TrueType font needs a Unicode (format 4) cmap.");
  const segCount = buffer.readUInt16BE(subtable + 6) / 2;
  const endCodes = subtable + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;
  const map = new Map();
  for (let segment = 0; segment < segCount; segment += 1) {
    const end = buffer.readUInt16BE(endCodes + segment * 2);
    const start = buffer.readUInt16BE(startCodes + segment * 2);
    const delta = buffer.readInt16BE(idDeltas + segment * 2);
    const rangeOffsetPosition = idRangeOffsets + segment * 2;
    const rangeOffset = buffer.readUInt16BE(rangeOffsetPosition);
    for (let code = start; code <= end && code !== 0xffff; code += 1) {
      let glyph;
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff;
      } else {
        const glyphPosition = rangeOffsetPosition + rangeOffset + (code - start) * 2;
        glyph = buffer.readUInt16BE(glyphPosition);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph) map.set(code, glyph);
    }
  }
  return map;
}

function readPostScriptName(buffer, table) {
  if (!table) return "";
  const base = table.offset;
  const count = buffer.readUInt16BE(base + 2);
  const strings = base + buffer.readUInt16BE(base + 4);
  for (let index = 0; index < count; index += 1) {
    const record = base + 6 + index * 12;
    const platform = buffer.readUInt16BE(record);
    const nameId = buffer.readUInt16BE(record + 6);
    if (nameId !== 6) continue;
    const length = buffer.readUInt16BE(record + 8);
    const offset = strings + buffer.readUInt16BE(record + 10);
    // Copy before swapping: subarray() shares memory with the font bytes we embed.
    const raw = Buffer.from(buffer.subarray(offset, offset + length));
    const value = platform === 3 || platform === 0 ? raw.swap16().toString("utf16le") : raw.toString("latin1");
    return value.replace(/[^A-Za-z0-9+_-]/g, "");
  }
  return "";
}

/** Encode text as WinAnsi byte codes; throws on characters the font cannot print. */
function encodeWinAnsi(font, text) {
  const codes = [];
  const missing = new Set();
  for (const char of String(text)) {
    const codePoint = char.codePointAt(0);
    const code = UNICODE_TO_WIN_ANSI.get(codePoint);
    if (code === undefined || !font.cmap.has(codePoint)) {
      missing.add(char);
      continue;
    }
    codes.push(code);
  }
  if (missing.size) {
    const error = new Error(`The print font cannot render: ${[...missing].join(" ")}`);
    error.name = "ProductionError";
    error.status = 400;
    error.code = "unsupported_print_characters";
    error.characters = [...missing];
    throw error;
  }
  return codes;
}

function unsupportedCharacters(font, text) {
  return [...new Set([...String(text).replace(/[\r\n\t]/g, "")].filter((char) => {
    const codePoint = char.codePointAt(0);
    return !UNICODE_TO_WIN_ANSI.has(codePoint) || !font.cmap.has(codePoint);
  }))];
}

function glyphAdvance(font, codePoint) {
  const glyph = font.cmap.get(codePoint) || 0;
  return font.advances[glyph] || 0;
}

/** Text width in points. */
function measureText(font, text, size) {
  let units = 0;
  for (const char of String(text)) units += glyphAdvance(font, char.codePointAt(0));
  return (units / font.unitsPerEm) * size;
}

/** PDF /Widths array (1000-unit em) for WinAnsi codes 32..255. */
function winAnsiWidths(font) {
  const widths = [];
  for (let code = 32; code <= 255; code += 1) {
    const unicode = winAnsiToUnicode(code);
    widths.push(unicode ? Math.round((glyphAdvance(font, unicode) * 1000) / font.unitsPerEm) : 0);
  }
  return widths;
}

module.exports = { encodeWinAnsi, measureText, parseTrueType, unsupportedCharacters, winAnsiWidths };
