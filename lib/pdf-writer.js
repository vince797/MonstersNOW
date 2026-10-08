const zlib = require("node:zlib");
const crypto = require("node:crypto");
const { encodeWinAnsi, winAnsiWidths } = require("./truetype-font");

const PDF_HEADER = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";

function createPdfDocument({ pages, title = "MonstersNOW Storybook" }) {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error("At least one PDF page is required.");
  }

  const usesFont = pages.some((page) => String(page.content || "").includes("/F1 "));
  const objects = [null];
  const pageIds = [];
  const fontObjectId = usesFont ? addObject(objects, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>") : null;
  const pagesObjectId = objects.length;

  objects.push("");

  pages.forEach((page, index) => {
    const pageObjectId = objects.length;
    const contentObjectId = pageObjectId + 1;
    const width = positiveNumber(page.width, "page width");
    const height = positiveNumber(page.height, "page height");
    const content = String(page.content || "");
    const contentLength = Buffer.byteLength(content, "utf8");
    const resources = usesFont ? `/Resources << /Font << /F1 ${fontObjectId} 0 R >> >>` : "/Resources << >>";

    pageIds.push(pageObjectId);
    objects.push([
      "<<",
      "/Type /Page",
      `/Parent ${pagesObjectId} 0 R`,
      `/MediaBox [0 0 ${formatNumber(width)} ${formatNumber(height)}]`,
      resources,
      `/Contents ${contentObjectId} 0 R`,
      ">>",
    ].join(" "));
    objects.push(`<< /Length ${contentLength} >>\nstream\n${content}\nendstream`);
  });

  objects[pagesObjectId] = [
    "<<",
    "/Type /Pages",
    `/Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}]`,
    `/Count ${pages.length}`,
    ">>",
  ].join(" ");
  const catalogObjectId = addObject(objects, `<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);
  const infoObjectId = addObject(objects, [
    "<<",
    `/Title (${escapePdfString(title)})`,
    "/Creator (MonstersNOW)",
    `/CreationDate (${formatPdfDate(new Date())})`,
    ">>",
  ].join(" "));

  const chunks = [Buffer.from(PDF_HEADER, "binary")];
  const offsets = [0];

  for (let objectId = 1; objectId < objects.length; objectId += 1) {
    offsets[objectId] = Buffer.byteLength(Buffer.concat(chunks));
    chunks.push(Buffer.from(`${objectId} 0 obj\n${objects[objectId]}\nendobj\n`, "utf8"));
  }

  const xrefOffset = Buffer.byteLength(Buffer.concat(chunks));
  const xrefRows = ["xref", `0 ${objects.length}`, "0000000000 65535 f "];

  for (let objectId = 1; objectId < objects.length; objectId += 1) {
    xrefRows.push(`${String(offsets[objectId]).padStart(10, "0")} 00000 n `);
  }

  chunks.push(
    Buffer.from(
      [
        xrefRows.join("\n"),
        "\ntrailer",
        `<< /Size ${objects.length} /Root ${catalogObjectId} 0 R /Info ${infoObjectId} 0 R >>`,
        "startxref",
        String(xrefOffset),
        "%%EOF",
        "",
      ].join("\n"),
      "utf8",
    ),
  );

  return Buffer.concat(chunks);
}


/*
 * Print-grade PDF writer used by the storybook print pipeline.
 *
 * - Whole TrueType fonts are embedded (FontFile2) with WinAnsi encoding, so
 *   every glyph a page uses is in the file (Lulu: "all fonts embedded").
 * - Images are baseline JPEG XObjects (DCTDecode) that the compositor has
 *   already flattened onto an opaque page; no soft masks or blend modes are
 *   written (Lulu: "flatten transparency").
 * - Each page carries TrimBox/BleedBox so preflight tools see the trim.
 * - Output is deterministic for identical inputs and `creationDate`.
 *
 * fonts:  { [resourceName]: parsedTrueTypeFont }
 * images: { [resourceName]: { data: Buffer(jpeg), width, height, components } }
 * pages:  [{ width, height, content, trimBox?: [x0,y0,x1,y1], bleedBox?: [...] }]
 */
function createPrintPdfDocument({ pages, fonts = {}, images = {}, info = {}, creationDate = new Date(0) }) {
  if (!Array.isArray(pages) || pages.length === 0) throw new Error("At least one PDF page is required.");
  const objects = [null];
  const reserve = () => { objects.push(null); return objects.length - 1; };
  const set = (id, value) => { objects[id] = value; return id; };
  const add = (value) => set(reserve(), value);

  const fontRefs = {};
  for (const [name, font] of Object.entries(fonts)) {
    const fontFile = zlib.deflateSync(font.data, { level: 9 });
    const fileId = add(streamObject(`/Length ${fontFile.length} /Length1 ${font.data.length} /Filter /FlateDecode`, fontFile));
    const scale = 1000 / font.unitsPerEm;
    const flags = 32 | (font.fixedPitch ? 1 : 0) | (font.italicAngle ? 64 : 0);
    const descriptorId = add([
      "<< /Type /FontDescriptor",
      `/FontName /${font.postScriptName}`,
      `/Flags ${flags}`,
      `/FontBBox [${font.bbox.map((v) => Math.round(v * scale)).join(" ")}]`,
      `/ItalicAngle ${formatNumber(font.italicAngle)}`,
      `/Ascent ${Math.round(font.ascender * scale)}`,
      `/Descent ${Math.round(font.descender * scale)}`,
      `/CapHeight ${Math.round(font.capHeight * scale)}`,
      `/StemV ${Math.round(50 + (font.weightClass / 65) ** 2)}`,
      `/FontFile2 ${fileId} 0 R >>`,
    ].join(" "));
    fontRefs[name] = add([
      "<< /Type /Font /Subtype /TrueType",
      `/BaseFont /${font.postScriptName}`,
      "/FirstChar 32 /LastChar 255",
      `/Widths [${winAnsiWidths(font).join(" ")}]`,
      "/Encoding /WinAnsiEncoding",
      `/FontDescriptor ${descriptorId} 0 R >>`,
    ].join(" "));
  }

  const imageRefs = {};
  for (const [name, image] of Object.entries(images)) {
    if (!Buffer.isBuffer(image.data) || image.data[0] !== 0xff || image.data[1] !== 0xd8) {
      throw new Error(`Print image ${name} must be a JPEG buffer.`);
    }
    const colorSpace = image.components === 1 ? "/DeviceGray" : "/DeviceRGB";
    imageRefs[name] = add(streamObject(
      `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length}`,
      image.data,
    ));
  }

  const pagesId = reserve();
  const pageIds = pages.map((page) => {
    const width = positiveNumber(page.width, "page width");
    const height = positiveNumber(page.height, "page height");
    const content = String(page.content || "");
    const usedFonts = Object.keys(fontRefs).filter((name) => content.includes(`/${name} `));
    const usedImages = Object.keys(imageRefs).filter((name) => content.includes(`/${name} Do`));
    const compressed = zlib.deflateSync(Buffer.from(content, "latin1"), { level: 9 });
    const contentId = add(streamObject(`/Length ${compressed.length} /Filter /FlateDecode`, compressed));
    const resources = [
      "<<",
      usedFonts.length ? `/Font << ${usedFonts.map((name) => `/${name} ${fontRefs[name]} 0 R`).join(" ")} >>` : "",
      usedImages.length ? `/XObject << ${usedImages.map((name) => `/${name} ${imageRefs[name]} 0 R`).join(" ")} >>` : "",
      "/ProcSet [/PDF /Text /ImageC] >>",
    ].filter(Boolean).join(" ");
    const box = (value) => `[${value.map(formatNumber).join(" ")}]`;
    return add([
      "<< /Type /Page",
      `/Parent ${pagesId} 0 R`,
      `/MediaBox [0 0 ${formatNumber(width)} ${formatNumber(height)}]`,
      page.bleedBox ? `/BleedBox ${box(page.bleedBox)}` : "",
      page.trimBox ? `/TrimBox ${box(page.trimBox)}` : "",
      `/Resources ${resources}`,
      `/Contents ${contentId} 0 R >>`,
    ].filter(Boolean).join(" "));
  });
  set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const infoId = add([
    "<<",
    `/Title (${escapePdfString(info.title || "MonstersNOW Storybook")})`,
    `/Author (${escapePdfString(info.author || "MonstersNOW")})`,
    info.subject ? `/Subject (${escapePdfString(info.subject)})` : "",
    "/Creator (MonstersNOW print compositor)",
    "/Producer (MonstersNOW pdf-writer)",
    `/CreationDate (${formatPdfDate(creationDate)})`,
    `/ModDate (${formatPdfDate(creationDate)})`,
    "/Trapped /False",
    ">>",
  ].filter(Boolean).join(" "));

  const chunks = [Buffer.from(PDF_HEADER, "binary")];
  const offsets = [0];
  let length = chunks[0].length;
  const hash = crypto.createHash("sha256");
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = length;
    const value = objects[id];
    const parts = Buffer.isBuffer(value?.dictionary)
      ? [Buffer.from(`${id} 0 obj\n`), value.dictionary, value.stream, Buffer.from("\nendstream\nendobj\n")]
      : [Buffer.from(`${id} 0 obj\n${value}\nendobj\n`, "latin1")];
    parts.forEach((part) => { chunks.push(part); length += part.length; hash.update(part); });
  }
  const documentId = hash.digest("hex").slice(0, 32);
  const xref = ["xref", `0 ${objects.length}`, "0000000000 65535 f "];
  for (let id = 1; id < objects.length; id += 1) xref.push(`${String(offsets[id]).padStart(10, "0")} 00000 n `);
  chunks.push(Buffer.from([
    xref.join("\n"),
    "trailer",
    `<< /Size ${objects.length} /Root ${catalogId} 0 R /Info ${infoId} 0 R /ID [<${documentId}> <${documentId}>] >>`,
    "startxref",
    String(length),
    "%%EOF",
    "",
  ].join("\n"), "latin1"));
  return Buffer.concat(chunks);
}

function streamObject(dictionary, stream) {
  return { dictionary: Buffer.from(`<< ${dictionary} >>\nstream\n`, "latin1"), stream };
}

/** Place an image XObject so it fills the rectangle (PDF points, bottom-left origin). */
function placeImage(name, x, y, width, height) {
  return `q ${formatNumber(width)} 0 0 ${formatNumber(height)} ${formatNumber(x)} ${formatNumber(y)} cm /${name} Do Q`;
}

/** Draw one line of text with an embedded TrueType font (hex-encoded WinAnsi). */
function drawFontText(resourceName, font, text, x, y, size, color = [0, 0, 0]) {
  const hex = encodeWinAnsi(font, text).map((code) => code.toString(16).padStart(2, "0")).join("");
  return [
    "BT",
    `${formatColor(color)} rg`,
    `/${resourceName} ${formatNumber(size)} Tf`,
    `${formatNumber(x)} ${formatNumber(y)} Td`,
    `<${hex}> Tj`,
    "ET",
  ].join("\n");
}

function addObject(objects, value) {
  const objectId = objects.length;
  objects.push(value);
  return objectId;
}

function drawRect(x, y, width, height, color) {
  return [
    `${formatColor(color)} rg`,
    `${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re`,
    "f",
  ].join("\n");
}

function drawStrokeRect(x, y, width, height, color, lineWidth = 1) {
  return [
    `${formatColor(color)} RG`,
    `${formatNumber(lineWidth)} w`,
    `${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re`,
    "S",
  ].join("\n");
}

function drawCircle(cx, cy, radius, color) {
  const c = radius * 0.5522847498;

  return [
    `${formatColor(color)} rg`,
    `${formatNumber(cx)} ${formatNumber(cy + radius)} m`,
    `${formatNumber(cx + c)} ${formatNumber(cy + radius)} ${formatNumber(cx + radius)} ${formatNumber(cy + c)} ${formatNumber(cx + radius)} ${formatNumber(cy)} c`,
    `${formatNumber(cx + radius)} ${formatNumber(cy - c)} ${formatNumber(cx + c)} ${formatNumber(cy - radius)} ${formatNumber(cx)} ${formatNumber(cy - radius)} c`,
    `${formatNumber(cx - c)} ${formatNumber(cy - radius)} ${formatNumber(cx - radius)} ${formatNumber(cy - c)} ${formatNumber(cx - radius)} ${formatNumber(cy)} c`,
    `${formatNumber(cx - radius)} ${formatNumber(cy + c)} ${formatNumber(cx - c)} ${formatNumber(cy + radius)} ${formatNumber(cx)} ${formatNumber(cy + radius)} c`,
    "f",
  ].join("\n");
}

function drawText(text, x, y, options = {}) {
  const size = positiveNumber(options.size || 12, "font size");
  const color = options.color || [0, 0, 0];

  return [
    "BT",
    `${formatColor(color)} rg`,
    `/F1 ${formatNumber(size)} Tf`,
    `${formatNumber(x)} ${formatNumber(y)} Td`,
    `(${escapePdfString(text)}) Tj`,
    "ET",
  ].join("\n");
}

function drawWrappedText(text, x, y, maxWidth, options = {}) {
  const size = positiveNumber(options.size || 12, "font size");
  const lineHeight = positiveNumber(options.lineHeight || size * 1.35, "line height");
  const maxLines = options.maxLines || 100;
  const lines = wrapText(text, maxWidth, size).slice(0, maxLines);

  return lines.map((line, index) => drawText(line, x, y - index * lineHeight, options)).join("\n");
}

function wrapText(text, maxWidth, fontSize) {
  const maxChars = Math.max(8, Math.floor(maxWidth / (fontSize * 0.52)));
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;

    if (candidate.length <= maxChars) {
      line = candidate;
      return;
    }

    if (line) {
      lines.push(line);
    }

    line = word;
  });

  if (line) {
    lines.push(line);
  }

  return lines.length ? lines : [""];
}

function escapePdfString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n\t]+/g, " ");
}

function formatColor(color) {
  const values = Array.isArray(color) ? color : [0, 0, 0];
  return values.slice(0, 3).map((value) => formatNumber(Math.max(0, Math.min(1, Number(value) || 0)))).join(" ");
}

function formatNumber(value) {
  return Number(value).toFixed(3).replace(/\.?0+$/, "");
}

function positiveNumber(value, label) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }

  return parsed;
}

function formatPdfDate(date) {
  const pad = (value) => String(value).padStart(2, "0");

  return [
    "D:",
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z",
  ].join("");
}

module.exports = {
  createPdfDocument,
  createPrintPdfDocument,
  drawFontText,
  formatColor,
  formatNumber,
  placeImage,
  drawCircle,
  drawRect,
  drawStrokeRect,
  drawText,
  drawWrappedText,
};
