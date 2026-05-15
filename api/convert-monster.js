const fs = require("node:fs/promises");
const path = require("node:path");
const { Blob } = require("node:buffer");
const {
  MONSTERSNOW_COLORING_PAGE_NEGATIVE_PROMPT,
  MONSTERSNOW_IMAGE_NEGATIVE_PROMPT,
  buildMonsterCharacterPrompt,
  getMonsterStyleLabel,
  normalizeMonsterStyleId,
} = require("../lib/monster-style");

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";
const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || "low";
const FUNCTION_TIME_BUDGET_MS = 60 * 1000;
const FUNCTION_TIMEOUT_BUFFER_MS = 6 * 1000;
const COLORING_PAGE_MIN_BUDGET_MS = 18 * 1000;
const FALLBACK_IMAGE_MODELS = ["gpt-image-1"];

const characterReferenceImages = [
  "assets/master-references/soft-3d-storybook-monster-01.png",
  "assets/master-references/soft-3d-storybook-monster-02.png",
  "assets/master-references/soft-3d-storybook-monster-03.png",
  "assets/master-references/soft-3d-storybook-monster-04.png",
  "assets/master-references/soft-3d-storybook-monster-05.png",
];
const coloringPageReferenceImage = "assets/master-references/coloring-page-line-art.jpg";

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  let payload;

  try {
    payload = await readJsonBody(request);
  } catch {
    return response.status(400).json({ error: "Invalid JSON body" });
  }

  const drawing = payload?.drawing;
  const style = normalizePreviewStyle(payload?.style);
  const variationNumber = normalizeVariationNumber(payload?.variationNumber);

  if (!isSafeDataUrl(drawing)) {
    return response.status(400).json({
      error: "Upload a PNG, JPG, WebP, or GIF image under 8 MB.",
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return response.status(503).json({
      code: "missing_openai_api_key",
      error: "The monster generator is not configured yet.",
      style,
      variationNumber,
    });
  }

  try {
    const startedAt = Date.now();
    const references = await loadReferenceImages();
    const monsterImage = await createMonsterImage(
      drawing,
      references,
      style,
      variationNumber,
      getRemainingRequestBudget(startedAt),
    );
    const { coloringPage, warnings } = await createOptionalColoringPage(
      monsterImage,
      references,
      getRemainingRequestBudget(startedAt),
    );

    return response.status(200).json({
      mode: "ai",
      monsterImage,
      coloringPage,
      warnings,
      style,
      styleLabel: getMonsterStyleLabel(style),
      variationNumber,
      message: coloringPage
        ? "Monster preview and coloring page created."
        : "Monster preview created. Coloring page will be prepared in the browser.",
    });
  } catch (error) {
    console.error("Monster preview generation failed", formatErrorForLog(error));

    return response.status(502).json({
      code: "monster_generator_unavailable",
      error: "The monster generator is temporarily unavailable.",
    });
  }
};

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isSafeDataUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  const match = value.match(/^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/i);

  if (!match) {
    return false;
  }

  const base64Length = match[2].length;
  const estimatedBytes = Math.floor((base64Length * 3) / 4);

  return estimatedBytes <= MAX_IMAGE_BYTES;
}

function normalizePreviewStyle(style) {
  return normalizeMonsterStyleId(style);
}

function normalizeVariationNumber(value) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return 1;
  }

  return Math.min(3, Math.max(1, parsed));
}

async function loadReferenceImages() {
  const [characterStyle, coloringPage] = await Promise.all([
    Promise.all(characterReferenceImages.map(loadReferenceImage)),
    loadReferenceImage(coloringPageReferenceImage),
  ]);

  return {
    characterStyle,
    coloringPage,
  };
}

async function loadReferenceImage(assetPath) {
  const absolutePath = path.join(process.cwd(), assetPath);
  const file = await fs.readFile(absolutePath);

  return {
    buffer: file,
    filename: path.basename(assetPath),
    mimeType: getReferenceMimeType(assetPath),
  };
}

function getReferenceMimeType(assetPath) {
  return path.extname(assetPath).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
}

function getRemainingRequestBudget(startedAt) {
  return Math.max(1, FUNCTION_TIME_BUDGET_MS - FUNCTION_TIMEOUT_BUFFER_MS - (Date.now() - startedAt));
}

async function createMonsterImage(drawing, references, style, variationNumber, timeoutMs) {
  return createImageEdit({
    prompt: buildMonsterCharacterPrompt({ style, variationNumber }),
    negativePrompt: MONSTERSNOW_IMAGE_NEGATIVE_PROMPT,
    images: [dataUrlToImagePart(drawing, "drawing.jpg"), ...references.characterStyle],
    size: "1024x1024",
    timeoutMs,
  });
}

async function createOptionalColoringPage(monsterImage, references, timeoutMs) {
  if (timeoutMs < COLORING_PAGE_MIN_BUDGET_MS) {
    return {
      coloringPage: null,
      warnings: [
        {
          code: "coloring_page_deferred",
          message: "The coloring page will be prepared in the browser from the generated preview.",
        },
      ],
    };
  }

  try {
    return {
      coloringPage: await createColoringPage(monsterImage, references, timeoutMs),
      warnings: [],
    };
  } catch (error) {
    console.warn("Coloring page generation failed after preview succeeded", formatErrorForLog(error));

    return {
      coloringPage: null,
      warnings: [
        {
          code: "coloring_page_unavailable",
          message: "The coloring page will be prepared in the browser from the generated preview.",
        },
      ],
    };
  }
}

async function createColoringPage(monsterImage, references, timeoutMs) {
  return createImageEdit({
    prompt: [
      "Create a black-and-white printable coloring page of this monster character.",
      "Preserve the monster's identity, proportions, number of eyes, horns, limbs, teeth, spots, stripes, and other defining features.",
      "Use clean bold outlines, simple interior details, open white fill areas, and no shading.",
      "Use the line-art reference only for coloring page style.",
      "White background. No text. No logo. Kid-friendly.",
    ].join(" "),
    negativePrompt: MONSTERSNOW_COLORING_PAGE_NEGATIVE_PROMPT,
    images: [dataUrlToImagePart(monsterImage, "monster-preview.png"), references.coloringPage],
    size: "1024x1024",
    timeoutMs,
  });
}

async function createImageEdit({ prompt, negativePrompt, images, size, timeoutMs }) {
  const models = getImageModels();
  let lastError;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];

    try {
      return await requestImageEdit({
        model,
        prompt: preparePromptForOpenAIImageEdit({ prompt, negativePrompt }),
        images,
        size,
        timeoutMs,
      });
    } catch (error) {
      lastError = error;

      if (!shouldRetryWithFallbackModel(error, index, models)) {
        throw error;
      }

      console.warn(
        `OpenAI image edit failed with ${model}; retrying with ${models[index + 1]}`,
        formatErrorForLog(error),
      );
    }
  }

  throw lastError;
}

function getImageModels() {
  return [...new Set([IMAGE_MODEL, ...FALLBACK_IMAGE_MODELS].filter(Boolean))];
}

function preparePromptForOpenAIImageEdit({ prompt, negativePrompt }) {
  if (!negativePrompt) {
    return prompt;
  }

  // OpenAI image edits currently do not expose a separate negative_prompt
  // field, so keep MonstersNOW's shared exclusions centralized and fold them
  // into the prompt text for this provider.
  return `${prompt} Avoid: ${negativePrompt}.`;
}

function shouldRetryWithFallbackModel(error, index, models) {
  if (index >= models.length - 1) {
    return false;
  }

  const message = `${error?.message || ""} ${error?.code || ""}`.toLowerCase();

  return (
    error?.status === 404 ||
    message.includes("model") ||
    message.includes("not have access") ||
    message.includes("unsupported")
  );
}

async function requestImageEdit({ model, prompt, images, size, timeoutMs }) {
  const formData = new FormData();
  const controller = new AbortController();
  const requestTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(1, timeoutMs)
    : FUNCTION_TIME_BUDGET_MS - FUNCTION_TIMEOUT_BUFFER_MS;
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  formData.append("model", model);
  formData.append("prompt", prompt);
  formData.append("n", "1");
  formData.append("size", size);
  formData.append("quality", IMAGE_QUALITY);
  formData.append("output_format", "png");

  images.forEach((image, index) => {
    formData.append(
      "image[]",
      new Blob([image.buffer], { type: image.mimeType }),
      image.filename || `image-${index + 1}.png`,
    );
  });

  let apiResponse;

  try {
    apiResponse = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createOpenAIError("OpenAI image request timed out.", {
        code: "openai_image_timeout",
        status: 504,
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const body = await apiResponse.json().catch(() => ({}));

  if (!apiResponse.ok) {
    throw createOpenAIError(body.error?.message || `OpenAI image request failed: ${apiResponse.status}`, {
      code: body.error?.code,
      type: body.error?.type,
      param: body.error?.param,
      status: apiResponse.status,
      requestId: apiResponse.headers.get("x-request-id"),
    });
  }

  const base64 = body.data?.[0]?.b64_json;

  if (!base64) {
    throw new Error("OpenAI did not return image data.");
  }

  return `data:image/png;base64,${base64}`;
}

function dataUrlToImagePart(dataUrl, filename) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/i);

  if (!match) {
    throw new Error("Invalid image data URL.");
  }

  const mimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const buffer = Buffer.from(match[2], "base64");

  return {
    buffer,
    filename,
    mimeType,
  };
}

function createOpenAIError(message, details = {}) {
  const error = new Error(message);

  Object.assign(error, details);

  return error;
}

function formatErrorForLog(error) {
  return {
    message: error?.message,
    code: error?.code,
    type: error?.type,
    param: error?.param,
    status: error?.status,
    requestId: error?.requestId,
  };
}
