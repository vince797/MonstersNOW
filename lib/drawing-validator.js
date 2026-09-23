const DEFAULT_VALIDATION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";
const DEFAULT_TIMEOUT_MS = 12 * 1000;

async function validateMonsterDrawing(drawing, options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  const model = options.model || DEFAULT_VALIDATION_MODEL;
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Math.max(1, options.timeoutMs || DEFAULT_TIMEOUT_MS);

  if (!apiKey) {
    throw validationServiceError("The drawing checker is not configured yet.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let apiResponse;

  try {
    apiResponse = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 120,
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Decide whether this upload is suitable source artwork for a personalized children's monster book.",
                "Accept only when a hand-drawn, painted, or handmade imaginary monster/creature/character is clearly visible and is the main subject.",
                "The artwork may be photographed on paper and may contain more than one invented creature.",
                "Reject rooms, scenery, people, pets, ordinary objects, blank pages, screenshots, photos without visible artwork, and images where the drawing is too small or unclear to preserve its identity.",
                "When uncertain, reject it.",
              ].join(" "),
            },
            { type: "input_image", image_url: drawing, detail: "low" },
          ],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "monster_drawing_check",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                accepted: { type: "boolean" },
                reason: { type: "string" },
              },
              required: ["accepted", "reason"],
            },
          },
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw validationServiceError("The drawing check timed out. Please try again.", "drawing_validation_timeout", 504);
    }
    throw validationServiceError("The drawing could not be checked right now. Please try again.");
  } finally {
    clearTimeout(timeout);
  }

  const body = await apiResponse.json().catch(() => ({}));
  if (!apiResponse.ok) {
    throw validationServiceError("The drawing could not be checked right now. Please try again.", "drawing_validation_unavailable", 502, {
      providerStatus: apiResponse.status,
      providerRequestId: apiResponse.headers?.get?.("x-request-id"),
    });
  }

  let result;
  try {
    result = JSON.parse(extractOutputText(body));
  } catch {
    throw validationServiceError("The drawing could not be checked right now. Please try again.");
  }

  if (result.accepted !== true) {
    const error = new Error("We couldn't find a clear monster drawing in this photo. Try a closer, brighter picture with the artwork filling most of the frame.");
    error.status = 422;
    error.code = "monster_drawing_not_found";
    error.validationReason = String(result.reason || "No clear monster drawing was detected.").slice(0, 240);
    throw error;
  }

  return { accepted: true };
}

function extractOutputText(body) {
  if (typeof body?.output_text === "string" && body.output_text) return body.output_text;
  for (const item of body?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function validationServiceError(message, code = "drawing_validation_unavailable", status = 502, details = {}) {
  const error = new Error(message);
  Object.assign(error, { code, status, ...details });
  return error;
}

module.exports = { validateMonsterDrawing };
