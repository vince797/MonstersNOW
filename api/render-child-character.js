const { buildChildCharacterRenderPrompt, childNegativePromptFor } = require("../lib/child-character-style");
const { resolveChildCharacter, childProfileKey } = require("../lib/child-characters");
const { readJsonBody } = require("../lib/http");
const { requireSubmission, downloadPrivateObject, matchesImageSignature } = require("../lib/monster-submissions");
const { supabaseRequest } = require("../lib/story-library");
const { enforceAiRateLimit, isAiLimitError, sendAiProtectionError } = require("../lib/ai-abuse-protection");
const { assertAdminRequest } = require("../lib/admin-auth");
const { moderateChildDetail, screenChildDetail } = require("../lib/child-detail-moderation");
const {
  findChildRender, isRenderId, listChildRenders, loadChildRenderDisplay, newRenderId, processRenderedImage, saveChildRender, signedMasterUrl,
} = require("../lib/child-renders");
const { getPreset, getPresetManifest, savePresetImage } = require("../lib/child-presets");
const convertMonster = require("./convert-monster");

const STYLE_REFERENCE = "assets/child-editor/feature-animation-character-reference-v1.png";
const DEFAULT_REFERENCES = {
  boy: "assets/child-editor/default-boy-feature-animation-v1.webp",
  girl: "assets/child-editor/default-girl-feature-animation-v1.webp",
};
const MOBILITY_REFERENCES = {
  wheelchair: {
    boy: "assets/child-editor/default-boy-wheelchair-feature-animation-v1.webp",
    girl: "assets/child-editor/default-girl-wheelchair-feature-animation-v1.webp",
  },
  "forearm-crutches": {
    boy: "assets/child-editor/default-boy-forearm-crutches-feature-animation-v1.webp",
    girl: "assets/child-editor/default-girl-forearm-crutches-feature-animation-v1.webp",
  },
};
const LONG_HAIR_STYLES = new Set(["wavy", "straight", "braids", "locs", "ponytail", "puffs"]);

// Timing budget. vercel.json gives this function maxDuration 150 s; the image
// request gets what is left after a 20 s reserve for decoding, the WebP copy,
// and two storage uploads. The browser aborts at 165 s (scripts/child-studio.js), so a
// server answer always arrives before the client gives up.
const FUNCTION_MAX_DURATION_MS = 150 * 1000;
const POST_PROCESS_RESERVE_MS = 20 * 1000;
const MAX_IMAGE_TIMEOUT_MS = FUNCTION_MAX_DURATION_MS - POST_PROCESS_RESERVE_MS;
const MAX_PREVIOUS_CHILD_BYTES = 2 * 1024 * 1024;
const CHILD_IMAGE_QUALITY = () => process.env.CHILD_CHARACTER_IMAGE_QUALITY || "high";

function referenceFor(profile) {
  const presentation = profile.presentation === "neutral"
    ? (LONG_HAIR_STYLES.has(profile.hairStyle) ? "girl" : "boy")
    : profile.presentation;
  return MOBILITY_REFERENCES[profile.mobilityAid]?.[presentation]
    || DEFAULT_REFERENCES[presentation]
    || DEFAULT_REFERENCES.girl;
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value || "";
}

// Vercel's Node runtime puts the query string on request.query and may leave it
// off request.url, so read request.query first and fall back to the URL.
function queryParam(request, name) {
  const fromQuery = firstQueryValue(request.query?.[name]);
  if (fromQuery) return String(fromQuery);
  try { return new URL(request.url || "/", "http://localhost").searchParams.get(name) || ""; } catch { return ""; }
}

function resourceOf(request) {
  return queryParam(request, "resource") || "render";
}

function header(request, name) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || "");
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "private, no-store");
  const resource = resourceOf(request);
  if (resource === "session" && request.method === "GET") return handleSession(request, response);
  if (resource === "image" && request.method === "GET") return handleImage(request, response);
  if (resource === "presets" && request.method === "GET") return handlePresetManifest(request, response);
  if (resource === "presets" && request.method === "POST") return handlePresetGeneration(request, response);
  if (resource === "render" && request.method === "POST") return handleRender(request, response);
  response.setHeader("Allow", resource === "presets" ? "GET, POST" : resource === "render" ? "POST" : "GET");
  return response.status(405).json({ error: "Method not allowed" });
};

async function handleRender(request, response) {
  const startedAt = Date.now();
  let payload;
  try {
    payload = await readJsonBody(request, { maxBytes: 3 * 1024 * 1024 });
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
    const detail = screenChildDetail(payload.profile?.detail);
    await enforceAiRateLimit(request, { scope: "child", sessionId: payload.submissionId });
    const profile = resolveChildCharacter({ ...(payload.profile || {}), detail });
    const prompt = buildChildCharacterRenderPrompt(profile);
    await moderateChildDetail(profile.detail);
    const previousReference = parsePreviousReference(payload.previousChildImage);
    const [identityReference, styleReference] = await Promise.all([
      previousReference || convertMonster.loadReferenceImage(referenceFor(profile)),
      convertMonster.loadReferenceImage(STYLE_REFERENCE),
    ]);
    const timeoutMs = Math.max(10 * 1000, MAX_IMAGE_TIMEOUT_MS - (Date.now() - startedAt));
    const rendered = await convertMonster.createImageEdit({
      prompt,
      negativePrompt: childNegativePromptFor(profile),
      images: [identityReference, styleReference],
      size: "1024x1536",
      quality: CHILD_IMAGE_QUALITY(),
      outputFormat: "png",
      background: "transparent",
      timeoutMs,
    });
    const processed = await processRenderedImage(rendered);
    const renderId = newRenderId();
    const profileKey = childProfileKey(profile);
    const version = Math.max(1, Math.min(9, Number.parseInt(payload.version, 10) || 1));
    let saved = true;
    try {
      await saveChildRender({ submissionId: payload.submissionId, renderId, master: processed.master, display: processed.display, profile, profileKey, version });
    } catch (error) {
      // The customer still gets their character; it just won't survive a refresh.
      saved = false;
      console.error("Child character render could not be saved", { code: error.code, message: error.message });
    }
    return response.status(200).json({
      childImage: `data:image/webp;base64,${processed.display.toString("base64")}`,
      render: {
        id: renderId,
        version,
        profileKey,
        createdAt: new Date().toISOString(),
        saved,
        width: processed.width,
        height: processed.height,
        transparentBackground: processed.transparentBackground,
      },
      profile,
      styleLabel: "Animated storybook character",
    });
  } catch (error) {
    return sendRenderError(response, error);
  }
}

function parsePreviousReference(value) {
  if (!value) return null;
  let reference;
  try {
    reference = convertMonster.dataUrlToImagePart(value, "previous-child.webp");
  } catch {
    throw Object.assign(new Error("The previous character image is invalid."), { status: 400, code: "invalid_previous_child_image" });
  }
  if (reference.buffer.length > MAX_PREVIOUS_CHILD_BYTES) {
    throw Object.assign(new Error("The previous character image is too large."), { status: 413, code: "previous_child_image_too_large" });
  }
  return reference;
}

/** Maps failures to a specific code and a message a parent can act on. */
function sendRenderError(response, error) {
  if (isAiLimitError(error)) return sendAiProtectionError(response, error);
  const providerMessage = `${error?.code || ""} ${error?.type || ""} ${error?.message || ""}`.toLowerCase();
  let status;
  let code;
  let message;
  const fromProvider = Object.prototype.hasOwnProperty.call(error || {}, "requestId");
  if (error.status >= 400 && error.status < 500 && !fromProvider && error.code !== "openai_image_timeout") {
    status = error.status;
    code = error.code || "invalid_child_request";
    message = error.message;
  } else if (error.code === "openai_image_timeout" || error.status === 504) {
    status = 504; code = "child_render_timeout"; message = "Painting this character took longer than usual. Please try again; it often finishes faster on the next try.";
  } else if (/moderation|safety|content_policy|policy/.test(providerMessage)) {
    status = 422; code = "child_render_blocked"; message = "The image service declined these choices. Try removing the special detail or changing the costume, then create again.";
  } else if (error.status === 429 || /rate limit|quota|capacity|overloaded/.test(providerMessage)) {
    status = 503; code = "child_renderer_busy"; message = "The character painter is busy right now. Please try again in a minute.";
  } else if (error.code === "child_render_unreadable") {
    status = 502; code = error.code; message = "The painted character came back damaged. Please try again.";
  } else {
    status = 502; code = "child_character_renderer_unavailable"; message = "The book character renderer is temporarily unavailable. Please try again.";
  }
  if (status >= 500) {
    console.error("Child character render failed", convertMonster.formatErrorForLog(error));
    response.setHeader("Retry-After", status === 503 ? "60" : "5");
  }
  return response.status(status).json({ code, error: message, retryable: status >= 500 });
}

async function requireSessionHeaders(request) {
  const submissionId = header(request, "x-submission-id");
  const token = header(request, "x-submission-token");
  await requireSubmission(submissionId, token);
  return submissionId;
}

/** Everything needed to restore the create flow after a refresh. */
async function handleSession(request, response) {
  try {
    const submissionId = await requireSessionHeaders(request);
    const [submissionRows, previews, renders] = await Promise.all([
      supabaseRequest(`/monster_submissions?id=eq.${encodeURIComponent(submissionId)}&select=id,status,selected_preview_id`),
      supabaseRequest(`/monster_previews?submission_id=eq.${encodeURIComponent(submissionId)}&select=id,variation_number,style_id,status,preview_path,coloring_page_path&order=variation_number.asc`),
      listChildRenders(submissionId).catch((error) => {
        console.warn("Child renders could not be listed", { code: error.code, message: error.message });
        return [];
      }),
    ]);
    return response.status(200).json({
      submission: { id: submissionId, status: submissionRows[0]?.status || "draft", selectedPreviewId: submissionRows[0]?.selected_preview_id || null },
      previews: previews.filter((preview) => preview.status === "complete" && preview.preview_path).map((preview) => ({
        id: preview.id,
        variationNumber: preview.variation_number,
        style: preview.style_id,
        hasColoringPage: Boolean(preview.coloring_page_path),
      })),
      renders: renders.map(({ id, createdAt, version, profileKey, profile }) => ({ id, createdAt, version, profileKey, profile })),
    });
  } catch (error) {
    return sendReadError(response, error, "Your saved session could not be restored.");
  }
}

/** One stored image as a data URL (monster preview, coloring page, or child render). */
async function handleImage(request, response) {
  try {
    const submissionId = await requireSessionHeaders(request);
    const kind = queryParam(request, "kind");
    const id = queryParam(request, "id");
    if (kind === "render") {
      if (!isRenderId(id)) throw Object.assign(new Error("Choose a saved character version."), { status: 400, code: "invalid_child_render" });
      const render = await findChildRender(submissionId, id);
      if (!render) throw Object.assign(new Error("That character version was not found."), { status: 404, code: "child_render_not_found" });
      const [image, masterUrl] = await Promise.all([loadChildRenderDisplay(render), signedMasterUrl(render)]);
      return response.status(200).json({ image, masterUrl, render: { id: render.id, createdAt: render.createdAt, version: render.version, profileKey: render.profileKey, profile: render.profile } });
    }
    if (kind === "preview" || kind === "coloring") {
      const rows = await supabaseRequest(`/monster_previews?id=eq.${encodeURIComponent(id)}&submission_id=eq.${encodeURIComponent(submissionId)}&select=preview_path,coloring_page_path`);
      const objectPath = rows[0]?.[kind === "preview" ? "preview_path" : "coloring_page_path"];
      if (!objectPath) throw Object.assign(new Error("That image was not found."), { status: 404, code: "image_not_found" });
      const { bytes, contentType } = await downloadPrivateObject(objectPath);
      const type = ["image/png", "image/jpeg", "image/webp"].includes(contentType) ? contentType : "image/png";
      if (!matchesImageSignature(bytes, type)) throw Object.assign(new Error("That image could not be opened."), { status: 502, code: "image_unreadable" });
      return response.status(200).json({ image: `data:${type};base64,${bytes.toString("base64")}` });
    }
    throw Object.assign(new Error("Choose an image to open."), { status: 400, code: "invalid_image_kind" });
  } catch (error) {
    return sendReadError(response, error, "That saved image could not be opened.");
  }
}

function sendReadError(response, error, fallback) {
  const status = error.status >= 400 && error.status < 500 ? error.status : 503;
  if (status >= 500) console.error("Child editor read failed", { code: error.code, message: error.message });
  return response.status(status).json({ code: error.code || "session_unavailable", error: status < 500 ? error.message : fallback });
}

async function handlePresetManifest(request, response) {
  try {
    response.setHeader("Cache-Control", "public, max-age=120");
    return response.status(200).json(await getPresetManifest());
  } catch (error) {
    response.setHeader("Cache-Control", "private, no-store");
    return response.status(200).json({ version: 2, presets: [], unavailable: true });
  }
}

/** Admin: paint one quick-start look (scripts/generate-child-presets.js loops over them). */
async function handlePresetGeneration(request, response) {
  try {
    assertAdminRequest(request);
  } catch (error) {
    if (error.retryAfterSeconds) response.setHeader("Retry-After", String(error.retryAfterSeconds));
    return response.status(error.status || 401).json({ code: error.code, error: error.message });
  }
  if (!process.env.OPENAI_API_KEY) {
    return response.status(503).json({ code: "missing_openai_api_key", error: "The book character renderer is not configured yet." });
  }
  const startedAt = Date.now();
  try {
    const payload = await readJsonBody(request, { maxBytes: 16 * 1024 });
    const preset = getPreset(payload?.presetId);
    if (!preset) return response.status(400).json({ code: "invalid_preset", error: "Choose a valid preset id." });
    await enforceAiRateLimit(request, { scope: "preset" });
    const profile = resolveChildCharacter(preset.profile);
    const [identityReference, styleReference] = await Promise.all([
      convertMonster.loadReferenceImage(referenceFor(profile)),
      convertMonster.loadReferenceImage(STYLE_REFERENCE),
    ]);
    const rendered = await convertMonster.createImageEdit({
      prompt: buildChildCharacterRenderPrompt(profile),
      negativePrompt: childNegativePromptFor(profile),
      images: [identityReference, styleReference],
      size: "1024x1536",
      quality: CHILD_IMAGE_QUALITY(),
      outputFormat: "png",
      background: "transparent",
      timeoutMs: Math.max(10 * 1000, MAX_IMAGE_TIMEOUT_MS - (Date.now() - startedAt)),
    });
    const processed = await processRenderedImage(rendered);
    const objectPath = await savePresetImage(preset.id, processed.display);
    return response.status(200).json({ id: preset.id, objectPath, bytes: processed.display.length, transparentBackground: processed.transparentBackground });
  } catch (error) {
    return sendRenderError(response, error);
  }
}

module.exports.referenceFor = referenceFor;
module.exports.MAX_IMAGE_TIMEOUT_MS = MAX_IMAGE_TIMEOUT_MS;
module.exports.FUNCTION_MAX_DURATION_MS = FUNCTION_MAX_DURATION_MS;
