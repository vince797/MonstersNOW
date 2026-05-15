const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_MODEL = "gpt-image-1.5";

const referenceImages = [
  "assets/master-references/character-purple-storybook-style.jpg",
  "assets/master-references/coloring-page-line-art.jpg",
];

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

  if (!isSafeDataUrl(drawing)) {
    return response.status(400).json({
      error: "Upload a PNG, JPG, WebP, or GIF image under 8 MB.",
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return response.status(200).json({
      mode: "demo",
      monsterImage: "/assets/step-2-character.jpg",
      coloringPage: null,
      message: "OPENAI_API_KEY is not configured yet. Returning demo artwork.",
    });
  }

  try {
    const references = await loadReferenceImages();
    const monsterImage = await createMonsterImage(drawing, references);
    const coloringPage = await createColoringPage(monsterImage, references);

    return response.status(200).json({
      mode: "ai",
      monsterImage,
      coloringPage,
      message: "Monster preview and coloring page created.",
    });
  } catch (error) {
    console.error(error);

    return response.status(502).json({
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

async function loadReferenceImages() {
  return Promise.all(
    referenceImages.map(async (assetPath) => {
      const absolutePath = path.join(process.cwd(), assetPath);
      const file = await fs.readFile(absolutePath);
      return `data:image/jpeg;base64,${file.toString("base64")}`;
    }),
  );
}

async function createMonsterImage(drawing, references) {
  return createImageEdit({
    prompt: [
      "Transform the child's monster drawing into a friendly MonstersNOW children's book character.",
      "Preserve the drawing's main body shape, number of eyes, horns, limbs, colors, expression, and personality.",
      "Use the reference monster only for brand style: rounded friendly form, bright colors, soft storybook lighting, polished 3D children's illustration.",
      "White background. No text. No logo. No scary details. Kid-friendly.",
    ].join(" "),
    images: [drawing, references[0]],
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
    images: [monsterImage, references[1]],
    size: "1024x1024",
  });
}

async function createImageEdit({ prompt, images, size }) {
  const apiResponse = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      images: images.map((imageUrl) => ({ image_url: imageUrl })),
      prompt,
      n: 1,
      size,
      quality: "medium",
      output_format: "png",
      input_fidelity: "high",
    }),
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
