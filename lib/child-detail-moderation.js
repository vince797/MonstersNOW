const { sanitizeChildDetail } = require("./child-characters");

// The optional "special detail" is a short visual note from a parent
// ("gap-toothed grin", "star hair clip"). It is sanitized to plain text
// (child-characters.sanitizeChildDetail), screened here, and then quoted in
// the prompt as data that can only describe an appearance detail.

const BLOCKED_PATTERNS = [
  // Violence, weapons, gore, scary content
  /\b(gun|guns|rifle|pistol|knife|knives|sword|blood|bloody|gore|kill|killing|dead|death|corpse|weapon|bomb|shoot|stab|wound|injur\w*|scar(?:y|ed)?|zombie|skull)\b/i,
  // Sexual or body-exposure content
  /\b(sexy|sexual|nude|naked|bikini|lingerie|underwear|kiss(?:ing)?|seductive)\b/i,
  // Drugs, alcohol, smoking
  /\b(beer|wine|alcohol|drunk|cigarette|vape|smoking|drugs?|weed)\b/i,
  // Hate, insults
  /\b(hate|stupid|ugly|fat|idiot|dumb|loser)\b/i,
  // Branded, studio, or franchise characters and logos
  /\b(disney|pixar|dreamworks|marvel|dc comics|nintendo|pokemon|pok[eé]mon|mario|elsa|frozen|spider-?man|batman|superman|barbie|minecraft|fortnite|roblox|logo|brand)\b/i,
  // Attempts to re-instruct the image model
  /\b(ignore|disregard|instead|override|system|prompt|instruction|pretend|jailbreak)\b/i,
  // Real people, photos, identity documents
  /\b(photo|photograph|real person|celebrity|look(?:s)? like|selfie|passport)\b/i,
];

const MODERATION_TIMEOUT_MS = 4000;

function detailError(message, code = "child_detail_rejected") {
  return Object.assign(new Error(message), { status: 400, code });
}

/** Local screen. Returns the sanitized detail or throws a friendly 400. */
function screenChildDetail(value) {
  const detail = sanitizeChildDetail(value);
  if (!detail) return "";
  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(detail))) {
    throw detailError("Please keep the special detail to a friendly look detail, like “gap-toothed grin” or “star hair clip” (no brands, characters, or instructions).");
  }
  return detail;
}

/**
 * OpenAI moderation check for the detail text. Free to call; fails open after
 * a short timeout because the local screen and the prompt guard still apply.
 */
async function moderateChildDetail(detail, { fetchImpl = fetch } = {}) {
  if (!detail || !process.env.OPENAI_API_KEY) return { checked: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS);
  try {
    const response = await fetchImpl("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input: detail }),
      signal: controller.signal,
    });
    if (!response.ok) return { checked: false };
    const body = await response.json().catch(() => null);
    if (body?.results?.some((result) => result.flagged)) {
      throw detailError("That special detail can’t be used in a children’s book. Try a simple look detail instead.");
    }
    return { checked: true };
  } catch (error) {
    if (error.code === "child_detail_rejected") throw error;
    console.warn("Child detail moderation unavailable; using the local screen only.", { message: error?.name === "AbortError" ? "timeout" : error?.message });
    return { checked: false };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { BLOCKED_PATTERNS, moderateChildDetail, screenChildDetail };
