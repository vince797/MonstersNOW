const { getStorybookProductVariant } = require("./lulu-products");

const STRIPE_CHECKOUT_API_URL = "https://api.stripe.com/v1/checkout/sessions";
const STRIPE_API_VERSION = "2026-02-25.clover";
const DEFAULT_ALLOWED_SHIPPING_COUNTRIES = ["US"];
const CHECKOUT_SUCCESS_PATH = "/success.html";
const CHECKOUT_CANCEL_PATH = "/checkout-cancel.html";

function buildStorybookCheckoutSessionPayload(submission, request) {
  const config = getStorybookCheckoutConfig();
  const siteUrl = getCheckoutSiteUrl(request, config);
  const metadata = buildCheckoutMetadata(submission);
  const variant = getStorybookProductVariant(submission.format.id);
  const params = new URLSearchParams();

  params.set("mode", "payment");
  params.set("client_reference_id", submission.submissionId);
  params.set("customer_email", submission.email);
  params.set("success_url", `${siteUrl}${CHECKOUT_SUCCESS_PATH}?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${siteUrl}${CHECKOUT_CANCEL_PATH}`);
  params.set("phone_number_collection[enabled]", "true");
  params.set("shipping_address_collection[allowed_countries][0]", config.allowedShippingCountries[0]);

  config.allowedShippingCountries.slice(1).forEach((country, index) => {
    params.set(`shipping_address_collection[allowed_countries][${index + 1}]`, country);
  });

  config.shippingRateIds.forEach((shippingRateId, index) => {
    params.set(`shipping_options[${index}][shipping_rate]`, shippingRateId);
  });

  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", variant.currency.toLowerCase());
  params.set("line_items[0][price_data][unit_amount]", String(variant.retailPriceCents));
  params.set("line_items[0][price_data][product_data][name]", `${submission.story.label} - ${variant.label}`);
  params.set(
    "line_items[0][price_data][product_data][description]",
    "Custom MonstersNOW printed storybook. Proof preview is sent before print.",
  );

  Object.entries(metadata).forEach(([key, value]) => {
    params.set(`metadata[${key}]`, value);
    params.set(`payment_intent_data[metadata][${key}]`, value);
  });

  return {
    apiKey: config.secretKey,
    params,
  };
}

async function createStorybookCheckoutSession(submission, request) {
  const { apiKey, params } = buildStorybookCheckoutSessionPayload(submission, request);
  const apiResponse = await fetch(STRIPE_CHECKOUT_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
      "Idempotency-Key": submission.submissionId,
    },
    body: params.toString(),
  });
  const body = await apiResponse.json().catch(() => ({}));

  if (!apiResponse.ok || !body.url) {
    throw createStorybookCheckoutError(getStripeErrorMessage(body), {
      code: getStripeErrorCode(body),
      status: apiResponse.status || 502,
      service: "stripe",
    });
  }

  return {
    id: body.id || null,
    url: body.url,
  };
}

function getStorybookCheckoutConfig() {
  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  const shippingRateIds = parseList(
    process.env.STRIPE_STORYBOOK_SHIPPING_RATE_IDS || process.env.STRIPE_STORYBOOK_SHIPPING_RATE_ID,
  );
  const allowedShippingCountries =
    parseList(process.env.STORYBOOK_CHECKOUT_ALLOWED_COUNTRIES).map((country) => country.toUpperCase()) ||
    DEFAULT_ALLOWED_SHIPPING_COUNTRIES;
  const missing = [];

  if (!secretKey) {
    missing.push("STRIPE_SECRET_KEY");
  }

  if (shippingRateIds.length === 0) {
    missing.push("STRIPE_STORYBOOK_SHIPPING_RATE_IDS");
  }

  if (missing.length > 0) {
    throw createStorybookCheckoutError("Storybook checkout is not configured.", {
      code: "storybook_checkout_not_configured",
      status: 503,
      missing,
    });
  }

  return {
    secretKey,
    shippingRateIds,
    allowedShippingCountries: allowedShippingCountries.length
      ? allowedShippingCountries
      : DEFAULT_ALLOWED_SHIPPING_COUNTRIES,
    siteUrl: stripTrailingSlash(process.env.STORYBOOK_CHECKOUT_SITE_URL || process.env.SITE_URL || ""),
  };
}

function getCheckoutSiteUrl(request, config) {
  if (config.siteUrl) {
    return config.siteUrl;
  }

  const host = getHeader(request, "x-forwarded-host") || getHeader(request, "host");

  if (!host) {
    throw createStorybookCheckoutError("Storybook checkout site URL is not configured.", {
      code: "storybook_checkout_site_url_missing",
      status: 503,
      missing: ["STORYBOOK_CHECKOUT_SITE_URL"],
    });
  }

  const protocol = getHeader(request, "x-forwarded-proto") || "https";
  return `${protocol}://${host}`;
}

function buildCheckoutMetadata(submission) {
  return {
    submission_id: submission.submissionId,
    source: submission.source,
    story_id: submission.story.id,
    story_label: submission.story.label,
    child_name: submission.personalization.childName,
    monster_name: submission.personalization.monsterName,
    format_id: submission.format.id,
    style_id: submission.style,
    style_label: submission.styleLabel,
    selected_preview_id: submission.selectedPreviewId || "",
    feature_monster: submission.featurePermission.canFeatureMonster ? "yes" : "no",
    feature_drawing: submission.featurePermission.canFeatureDrawing ? "yes" : "no",
  };
}

function storybookCheckoutErrorToResponse(error) {
  if (error.name !== "StorybookCheckoutError") {
    return {
      status: 500,
      payload: {
        code: "storybook_checkout_failed",
        error: "Storybook checkout could not be started.",
      },
    };
  }

  return {
    status: error.status || 500,
    payload: {
      code: error.code || "storybook_checkout_failed",
      error: error.status === 503 ? "Storybook checkout is not configured yet." : error.message,
      missing: error.missing,
    },
  };
}

function createStorybookCheckoutError(message, details = {}) {
  const error = new Error(message);

  error.name = "StorybookCheckoutError";
  Object.assign(error, details);

  return error;
}

function getHeader(request, name) {
  if (request.headers?.get) {
    return request.headers.get(name) || "";
  }

  return request.headers?.[name.toLowerCase()] || request.headers?.[name] || "";
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function getStripeErrorMessage(body) {
  if (typeof body?.error?.message === "string") {
    return body.error.message;
  }

  if (typeof body?.message === "string") {
    return body.message;
  }

  return "Stripe checkout session could not be created.";
}

function getStripeErrorCode(body) {
  if (typeof body?.error?.code === "string") {
    return body.error.code;
  }

  if (typeof body?.error?.type === "string") {
    return body.error.type;
  }

  if (typeof body?.code === "string") {
    return body.code;
  }

  return "stripe_checkout_failed";
}

module.exports = {
  STRIPE_API_VERSION,
  buildStorybookCheckoutSessionPayload,
  createStorybookCheckoutSession,
  storybookCheckoutErrorToResponse,
};
