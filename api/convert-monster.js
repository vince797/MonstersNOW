const fs = require("node:fs/promises");
const path = require("node:path");
const { Blob } = require("node:buffer");

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";
const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || "low";

const referenceImages = [
  "assets/master-references/character-purple-storybook-style.jpg",
  "assets/master-references/coloring-page-line-art.jpg",
];

const previewStyles = {
  storybook: "classic MonstersNOW storybook style with a warm, polished children's book character look",
  cute: "extra cute and gentle, with rounder shapes, softer features, and a sweet friendly expression",
  silly: "playful and goofy, with a bigger smile, lively pose, and funny kid-friendly personality",
  adventure: "storybook adventure style, with a brave cheerful pose and slightly more energetic character design",
};

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
    const references = await loadReferenceImages();
    const monsterImage = await createMonsterImage(drawing, references, style, variationNumber);
    const coloringPage = await createColoringPage(monsterImage, references);

    return response.status(200).json({
      mode: "ai",
      monsterImage,
      coloringPage,
      style,
      variationNumber,
      message: "Monster preview and coloring page created.",
    });
  } catch (error) {
    console.error(error);

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
  return Object.prototype.hasOwnProperty.call(previewStyles, style) ? style : "storybook";
}

function normalizeVariationNumber(value) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return 1;
  }

  return Math.min(3, Math.max(1, parsed));
}

async function loadReferenceImages() {
  return Promise.all(
    referenceImages.map(async (assetPath) => {
      const absolutePath = path.join(process.cwd(), assetPath);
      const file = await fs.readFile(absolutePath);
      return {
        buffer: file,
        filename: path.basename(assetPath),
        mimeType: "image/jpeg",
      };
    }),
  );
}

async function createMonsterImage(drawing, references, style, variationNumber) {
  return createImageEdit({
    prompt: [
      "Transform the child's monster drawing into a friendly MonstersNOW children's book character.",
      "Preserve the drawing's main body shape, number of eyes, horns, limbs, colors, expression, and personality.",
      "Use the reference monster only for brand style: rounded friendly form, bright colors, soft storybook lighting, polished 3D children's illustration.",
      `For this preview, use ${previewStyles[style]}.`,
      `Make this version distinct from prior previews while staying faithful to the drawing. Preview number ${variationNumber} of 3.`,
      "White background. No text. No logo. No scary details. Kid-friendly.",
    ].join(" "),
    images: [dataUrlToImagePart(drawing, "drawing.jpg"), references[0]],
    size: "1024x1024",
  });
}

async function createColoringPage(monsterImage, references) {
  return createImageEdit({
    prompt: [
      "Create a black-and-white printable coloring page of this monster character.",
      "Use clean bold outlines, simple interior details, open white fill areas, and no shading.",
      "Use the line-art reference only for coloring page style.",
      "White background. No text. No logo. Kid-friendly.",
    ].join(" "),
    images: [dataUrlToImagePart(monsterImage, "monster-preview.png"), references[1]],
    size: "1024x1024",
  });
}

async function createImageEdit({ prompt, images, size }) {
  const formData = new FormData();

  formData.append("model", IMAGE_MODEL);
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

  const apiResponse = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  const body = await apiResponse.json().catch(() => ({}));

  if (!apiResponse.ok) {
    throw new Error(body.error?.message || `OpenAI image request failed: ${apiResponse.status}`);
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
