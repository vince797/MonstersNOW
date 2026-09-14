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
  drawCircle,
  drawRect,
  drawStrokeRect,
  drawText,
  drawWrappedText,
};
