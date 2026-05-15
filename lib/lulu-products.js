const DEFAULT_STORYBOOK_PAGE_COUNT = 32;
const DEFAULT_STORYBOOK_VARIANT = "softcover";
const STORYBOOK_CURRENCY = "USD";
const STORYBOOK_SHIPPING_POLICY = "calculated_at_checkout";

const storybookProductVariants = {
  softcover: {
    id: "softcover",
    label: "Softcover Storybook",
    podPackageId: "0850X0850.FC.PRE.PB.080CW444.MXX",
    currency: STORYBOOK_CURRENCY,
    retailPriceUsd: "39.99",
    retailPriceCents: 3999,
    priceDisplay: "$39.99 + shipping",
    shippingPolicy: STORYBOOK_SHIPPING_POLICY,
    estimatedPrintCostUsd: "8.68",
    binding: "Paperback Perfect Bound",
    coverFinish: "Matte",
    trim: "8.5 x 8.5 in",
    interiorColor: "Full Color",
    printQuality: "Premium",
    paper: "80# Coated White",
    minPageCount: 32,
    maxPageCount: 800,
    defaultPageCount: DEFAULT_STORYBOOK_PAGE_COUNT,
  },
  hardcover: {
    id: "hardcover",
    label: "Hardcover Keepsake",
    podPackageId: "0850X0850.FC.PRE.CW.080CW444.MXX",
    currency: STORYBOOK_CURRENCY,
    retailPriceUsd: "59.99",
    retailPriceCents: 5999,
    priceDisplay: "$59.99 + shipping",
    shippingPolicy: STORYBOOK_SHIPPING_POLICY,
    estimatedPrintCostUsd: "17.16",
    binding: "Hardcover Case Wrap",
    coverFinish: "Matte",
    trim: "8.5 x 8.5 in",
    interiorColor: "Full Color",
    printQuality: "Premium",
    paper: "80# Coated White",
    minPageCount: 24,
    maxPageCount: 800,
    defaultPageCount: DEFAULT_STORYBOOK_PAGE_COUNT,
  },
};

function getStorybookProductVariant(value) {
  const id = normalizeStorybookVariantId(value);
  return storybookProductVariants[id];
}

function getStorybookProductVariants() {
  return Object.values(storybookProductVariants);
}

function getDefaultStorybookProductVariant() {
  return storybookProductVariants[DEFAULT_STORYBOOK_VARIANT];
}

function getStorybookPricingSummary() {
  const defaultVariant = getDefaultStorybookProductVariant();

  return {
    currency: STORYBOOK_CURRENCY,
    startsAtPriceUsd: defaultVariant.retailPriceUsd,
    startsAtPriceCents: defaultVariant.retailPriceCents,
    startsAtDisplay: `From $${defaultVariant.retailPriceUsd}`,
    shippingPolicy: STORYBOOK_SHIPPING_POLICY,
    variants: getStorybookProductVariants(),
  };
}

function getStorybookPodPackageId(value) {
  return getStorybookProductVariant(value).podPackageId;
}

function normalizeStorybookVariantId(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (!normalized) {
    return DEFAULT_STORYBOOK_VARIANT;
  }

  if (normalized === "soft" || normalized === "paperback" || normalized === "pb") {
    return "softcover";
  }

  if (normalized === "hard" || normalized === "casewrap" || normalized === "case-wrap" || normalized === "cw") {
    return "hardcover";
  }

  if (Object.prototype.hasOwnProperty.call(storybookProductVariants, normalized)) {
    return normalized;
  }

  throw validationError(
    `cover_type must be one of: ${Object.keys(storybookProductVariants).join(", ")}.`,
  );
}

function validateStorybookPageCount(variant, pageCount) {
  if (pageCount < variant.minPageCount || pageCount > variant.maxPageCount) {
    throw validationError(
      `${variant.id} requires ${variant.minPageCount}-${variant.maxPageCount} interior pages.`,
    );
  }
}

function validationError(message) {
  const error = new Error(message);
  error.name = "ValidationError";
  error.status = 400;
  return error;
}

module.exports = {
  DEFAULT_STORYBOOK_PAGE_COUNT,
  getDefaultStorybookProductVariant,
  getStorybookPodPackageId,
  getStorybookPricingSummary,
  getStorybookProductVariant,
  getStorybookProductVariants,
  normalizeStorybookVariantId,
  validateStorybookPageCount,
};
