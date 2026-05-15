const convert = require("heic-convert");
const { readJsonBody, rejectUnsupportedMethod, sendJson } = require("../lib/http");

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return rejectUnsupportedMethod(request, response, ["POST"]);
  }

  let payload;

  try {
    payload = await readJsonBody(request);
  } catch {
    return sendJson(response, 400, { error: "Invalid JSON body" });
  }

  const image = payload?.image;

  if (!isSafeHeicDataUrl(image)) {
    return sendJson(response, 400, {
      error: "Upload a HEIC or HEIF image under 8 MB.",
    });
  }

  try {
    const inputBuffer = dataUrlToBuffer(image);
    const jpegBuffer = await convert({
      buffer: inputBuffer,
      format: "JPEG",
      quality: 0.9,
    });

    return sendJson(response, 200, {
      image: `data:image/jpeg;base64,${Buffer.from(jpegBuffer).toString("base64")}`,
    });
  } catch (error) {
    console.error("HEIC conversion failed", {
      name: error?.name,
      message: error?.message,
    });

    return sendJson(response, 422, {
      code: "heic_conversion_failed",
      error: "HEIC photo could not be converted. Please save it as JPG or PNG and upload again.",
    });
  }
};

function isSafeHeicDataUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  const match = value.match(/^data:image\/(heic|heif|heic-sequence|heif-sequence);base64,([A-Za-z0-9+/=]+)$/i);

  if (!match) {
    return false;
  }

  const base64Length = match[2].length;
  const estimatedBytes = Math.floor((base64Length * 3) / 4);

  return estimatedBytes <= MAX_IMAGE_BYTES;
}

function dataUrlToBuffer(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";

  return Buffer.from(base64, "base64");
}
