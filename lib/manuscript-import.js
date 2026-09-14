const mammoth = require("mammoth");

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_PAGES = 32;

async function importManuscript(payload = {}) {
  const name = cleanText(payload.name, 180);
  const mimeType = cleanText(payload.type, 100).toLowerCase();
  const buffer = decodeFile(payload.data);

  if (!name) throw importError("Choose a manuscript file.");
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
    throw importError("Manuscripts must be smaller than 3 MB.");
  }

  const extension = name.toLowerCase().split(".").pop();
  if (extension === "json" || mimeType === "application/json") return importJson(buffer, name);

  let text = "";
  let sourcePages = [];
  if (extension === "pdf" || mimeType === "application/pdf") {
    // Load PDF tooling only for PDF imports. Its optional native canvas module
    // must never prevent story, order, or non-PDF admin requests from starting.
    const { PDFParse } = require("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      sourcePages = Array.isArray(result.pages) ? result.pages.map((page) => page.text || page.data || "") : [];
      text = result.text || "";
    } finally {
      try { await parser.destroy(); } catch {}
    }
  } else if (extension === "docx" || mimeType.includes("wordprocessingml")) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value || "";
  } else if (extension === "txt" || mimeType.startsWith("text/")) {
    text = buffer.toString("utf8");
  } else {
    throw importError("Use a PDF, Word (.docx), text, or structured JSON manuscript.");
  }

  const pageTexts = sourcePages.filter(hasUsefulText).length > 1
    ? sourcePages.filter(hasUsefulText)
    : splitManuscriptText(text);
  if (!pageTexts.length) throw importError("No readable story text was found in that file.");

  return {
    fileName: name,
    pages: pageTexts.slice(0, MAX_PAGES).map((pageText) => ({ text: normalizePageText(pageText), illustrationPrompt: "" })),
    truncated: pageTexts.length > MAX_PAGES,
  };
}

function importJson(buffer, fileName) {
  let value;
  try {
    value = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw importError("The JSON manuscript is not valid JSON.");
  }
  if (!Array.isArray(value?.pages)) throw importError("Structured JSON must contain a pages array.");
  const pages = value.pages.slice(0, MAX_PAGES).map((page) => ({
    text: cleanText(typeof page === "string" ? page : page?.text, 2000),
    illustrationPrompt: cleanText(page?.illustrationPrompt || page?.illustration_prompt, 3000),
  }));
  if (!pages.some((page) => page.text || page.illustrationPrompt)) throw importError("The JSON pages are empty.");
  return {
    fileName,
    title: cleanText(value.title || value.title_template, 160),
    description: cleanText(value.description, 1000),
    pages,
    truncated: value.pages.length > MAX_PAGES,
  };
}

function splitManuscriptText(value) {
  const text = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!text) return [];

  const explicit = text.split(/(?:^|\n)\s*(?:-{3,}|page\s+\d+(?:\s*[:.-].*)?)\s*(?:\n|$)/gi).filter(hasUsefulText);
  if (explicit.length > 1) return explicit;

  const formFeed = text.split(/\f+/).filter(hasUsefulText);
  if (formFeed.length > 1) return formFeed;

  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(hasUsefulText);
  if (blocks.length > 1) return blocks;
  return [text];
}

function normalizePageText(value) {
  return cleanText(String(value || "").replace(/\s*\n\s*/g, " "), 2000);
}

function decodeFile(value) {
  if (typeof value !== "string") throw importError("The manuscript file could not be read.");
  const base64 = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  try {
    return Buffer.from(base64, "base64");
  } catch {
    throw importError("The manuscript file could not be decoded.");
  }
}

function hasUsefulText(value) {
  return String(value || "").trim().length > 0;
}

function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function importError(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = "invalid_manuscript";
  return error;
}

module.exports = { importManuscript, splitManuscriptText };
