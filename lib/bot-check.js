const crypto = require("node:crypto");
const { clientAddress } = require("./ai-abuse-protection");

// Optional Cloudflare Turnstile check on the drawing upload, which every paid
// AI request depends on (both AI endpoints require a saved monster
// submission). Off unless TURNSTILE_ENABLED=true and both keys are set.
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5000;
const UPLOAD_ACTION = "monster_upload";

function botCheckSettings() {
  const enabled = /^(true|1|on)$/i.test(process.env.TURNSTILE_ENABLED || "");
  const siteKey = (process.env.TURNSTILE_SITE_KEY || "").trim();
  const secretKey = (process.env.TURNSTILE_SECRET_KEY || "").trim();
  return { enabled: Boolean(enabled && siteKey && secretKey), siteKey, secretKey };
}

/** Public, cacheable config the storefront uses to decide whether to render the widget. */
function publicBotCheckConfig() {
  const settings = botCheckSettings();
  return settings.enabled
    ? { enabled: true, provider: "turnstile", siteKey: settings.siteKey, action: UPLOAD_ACTION }
    : { enabled: false };
}

/**
 * Verifies a Turnstile token when the check is enabled. Throws a BotCheckError
 * (403) for a missing or rejected token. If Cloudflare cannot be reached, the
 * request is allowed (rate limits still apply) so an outage does not stop sales.
 */
async function verifyBotCheck(request, token, { action = UPLOAD_ACTION } = {}) {
  const settings = botCheckSettings();
  if (!settings.enabled) return { checked: false };
  if (typeof token !== "string" || !token || token.length > 2048) {
    throw botCheckError("bot_check_required", "Please complete the quick “I'm human” check, then try again.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  let result;
  try {
    const form = new URLSearchParams({ secret: settings.secretKey, response: token, idempotency_key: crypto.randomUUID() });
    const remoteIp = clientAddress(request);
    if (remoteIp && !remoteIp.includes("/") && remoteIp !== "unknown") form.set("remoteip", remoteIp);
    const response = await fetch(SITEVERIFY_URL, { method: "POST", body: form, signal: controller.signal });
    if (!response.ok) throw new Error(`siteverify returned ${response.status}`);
    result = await response.json();
  } catch (error) {
    console.warn("Turnstile verification unavailable; allowing the request.", { message: error?.name === "AbortError" ? "timeout" : error?.message });
    return { checked: false, unavailable: true };
  } finally {
    clearTimeout(timeout);
  }

  if (!result?.success || (result.action && result.action !== action)) {
    console.warn("Turnstile verification rejected", { errors: result?.["error-codes"], action: result?.action });
    throw botCheckError("bot_check_failed", "We couldn't confirm the “I'm human” check. Please try again.");
  }
  return { checked: true };
}

function botCheckError(code, message) {
  const error = new Error(message);
  error.name = "BotCheckError";
  error.status = 403;
  error.code = code;
  error.botCheck = publicBotCheckConfig();
  return error;
}

module.exports = { UPLOAD_ACTION, publicBotCheckConfig, verifyBotCheck };
