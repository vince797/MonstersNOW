const { buildChildCharacterRenderPrompt, CHILD_CHARACTER_NEGATIVE_PROMPT } = require("../lib/child-character-style");
const { resolveChildCharacter } = require("../lib/child-characters");
const { readJsonBody } = require("../lib/http");
const { requireSubmission } = require("../lib/monster-submissions");
const convertMonster = require("./convert-monster");

const STYLE_REFERENCE = "assets/child-editor/feature-animation-character-reference-v1.png";
const DEFAULT_REFERENCES = {
  boy: "assets/child-editor/default-boy-feature-animation-v1.webp",
  girl: "assets/child-editor/default-girl-feature-animation-v1.webp",
};
const FUNCTION_TIMEOUT_MS = 54 * 1000;

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "private, no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  let payload;
  try {
    payload = await readJsonBody(request, { maxBytes: 128 * 1024 });
  } catch (error) {
    return response.status(error.status || 400).json({ code: error.code || "invalid_json", error: "Invalid character request." });
  }

  if (!payload?.submissionId || !payload?.submissionToken) {
    return response.status(403).json({ code: "monster_submission_required", error: "Choose a saved monster before rendering the book character." });
  }
  if (!process.env.OPENAI_API_KEY) {
    return response.status(503).json({ code: "missing_openai_api_key", error: "The book character renderer is not configured yet." });
  }

  try {
    await requireSubmission(payload.submissionId, payload.submissionToken);
    const profile = resolveChildCharacter(payload.profile);
    const [identityReference, styleReference] = await Promise.all([
      convertMonster.loadReferenceImage(DEFAULT_REFERENCES[profile.presentation] || DEFAULT_REFERENCES.girl),
      convertMonster.loadReferenceImage(STYLE_REFERENCE),
    ]);
    const childImage = await convertMonster.createImageEdit({
      prompt: buildChildCharacterRenderPrompt(profile),
      negativePrompt: CHILD_CHARACTER_NEGATIVE_PROMPT,
      images: [identityReference, styleReference],
      size: "1024x1536",
      quality: process.env.CHILD_CHARACTER_IMAGE_QUALITY || "medium",
      outputFormat: "webp",
      outputCompression: 86,
      background: "transparent",
      timeoutMs: FUNCTION_TIMEOUT_MS,
    });
    return response.status(200).json({
      childImage,
      profile,
      styleLabel: "Feature-animation storybook character",
    });
  } catch (error) {
    console.error("Child character render failed", convertMonster.formatErrorForLog(error));
    const clientError = error.status >= 400 && error.status < 500;
    return response.status(clientError ? error.status : 502).json({
      code: error.code || "child_character_renderer_unavailable",
      error: clientError ? error.message : "The book character renderer is temporarily unavailable. Please try again.",
    });
  }
};
