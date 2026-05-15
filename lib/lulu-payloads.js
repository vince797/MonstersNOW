const {
  DEFAULT_STORYBOOK_PAGE_COUNT,
  getStorybookPodPackageId,
  getStorybookProductVariant,
  validateStorybookPageCount,
} = require("./lulu-products");

const DEFAULT_CURRENCY = "USD";
const DEFAULT_PRODUCTION_DELAY_MINUTES = 120;
const DEFAULT_QUANTITY = 1;
const DEFAULT_SHIPPING_LEVEL = "MAIL";

const shippingLevels = new Set([
  "MAIL",
  "PRIORITY_MAIL",
  "GROUND_HD",
  "GROUND_BUS",
  "GROUND",
  "EXPEDITED",
  "EXPRESS",
]);

function buildShippingOptionsPayload(payload) {
  const lineItems = normalizeEstimateLineItems(payload.line_items || payload.lineItems || [payload]);
  const shippingAddress = normalizeShippingOptionsAddress(
    payload.shipping_address || payload.shippingAddress || {},
  );

  requireFields(shippingAddress, ["country"], "shipping_address");

  return {
    currency: normalizeCurrency(payload.currency),
    line_items: lineItems,
    shipping_address: shippingAddress,
  };
}

function buildCostPayload(payload) {
  const shippingAddress = normalizeShippingAddress(
    payload.shipping_address || payload.shippingAddress || {},
  );
  const shippingOption = normalizeShippingLevel(firstPresent(payload.shipping_option, payload.shippingOption));

  requireFields(shippingAddress, ["street1", "city", "country_code", "postcode", "phone_number"], "shipping_address");

  return {
    line_items: normalizeEstimateLineItems(payload.line_items || payload.lineItems || [payload]),
    shipping_address: shippingAddress,
    shipping_option: shippingOption,
  };
}

function buildCoverDimensionsPayload(payload) {
  const variant = getVariantFromPayload(payload);
  const podPackageId = firstPresent(payload.pod_package_id, payload.podPackageId, variant.podPackageId);
  const interiorPageCount = toPositiveInteger(
    firstPresent(payload.interior_page_count, payload.interiorPageCount, variant.defaultPageCount),
    "interior_page_count",
  );

  validateStorybookPageCount(variant, interiorPageCount);

  return removeUndefined({
    pod_package_id: podPackageId,
    interior_page_count: interiorPageCount,
    unit: normalizeDimensionUnit(payload.unit),
  });
}

function buildFileValidationPayload(payload) {
  const type = normalizeValidationType(payload.type);
  const sourceUrl = firstPresent(payload.source_url, payload.sourceUrl);
  const variant = getVariantFromPayload(payload);

  if (!sourceUrl) {
    throw validationError("source_url is required.");
  }

  if (type === "interior") {
    return {
      endpoint: "/validate-interior/",
      body: removeUndefined({
        source_url: sourceUrl,
        pod_package_id: firstPresent(payload.pod_package_id, payload.podPackageId, variant.podPackageId),
      }),
    };
  }

  const podPackageId = firstPresent(payload.pod_package_id, payload.podPackageId, variant.podPackageId);
  const interiorPageCount = toPositiveInteger(
    firstPresent(payload.interior_page_count, payload.interiorPageCount, variant.defaultPageCount),
    "interior_page_count",
  );

  validateStorybookPageCount(variant, interiorPageCount);

  return {
    endpoint: "/validate-cover/",
    body: {
      source_url: sourceUrl,
      pod_package_id: podPackageId,
      interior_page_count: interiorPageCount,
    },
  };
}

function getFileValidationReadPath(query) {
  const type = normalizeValidationType(query.type);
  const id = toPositiveInteger(query.id, "id");

  return type === "interior" ? `/validate-interior/${id}/` : `/validate-cover/${id}/`;
}

function buildPrintJobPayload(payload, config) {
  const contactEmail = firstPresent(payload.contact_email, payload.contactEmail, config.contactEmail);
  const shippingAddress = normalizeShippingAddress(
    payload.shipping_address || payload.shippingAddress || {},
  );

  if (!contactEmail) {
    throw validationError("contact_email is required. Set LULU_SANDBOX_CONTACT_EMAIL or include contact_email.");
  }

  requireFields(
    shippingAddress,
    ["name", "street1", "city", "country_code", "postcode", "phone_number", "email"],
    "shipping_address",
  );

  return removeUndefined({
    contact_email: contactEmail,
    external_id: firstPresent(payload.external_id, payload.externalId),
    line_items: normalizePrintJobLineItems(payload.line_items || payload.lineItems),
    production_delay: normalizeProductionDelay(firstPresent(payload.production_delay, payload.productionDelay)),
    shipping_address: shippingAddress,
    shipping_level: normalizeShippingLevel(firstPresent(payload.shipping_level, payload.shippingLevel)),
  });
}

function normalizeEstimateLineItems(lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw validationError("At least one line item is required.");
  }

  return lineItems.map((item) => ({
    page_count: normalizeLineItemPageCount(item),
    pod_package_id: normalizeLineItemPodPackageId(item),
    quantity: toPositiveInteger(firstPresent(item.quantity, DEFAULT_QUANTITY), "quantity"),
  }));
}

function normalizePrintJobLineItems(lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw validationError("At least one line item is required.");
  }

  return lineItems.map((item, index) => {
    const printableNormalization = normalizePrintableNormalization(item);

    const title = firstPresent(item.title, `MonstersNOW Storybook ${index + 1}`);

    return removeUndefined({
      external_id: firstPresent(item.external_id, item.externalId),
      printable_normalization: printableNormalization,
      quantity: toPositiveInteger(firstPresent(item.quantity, DEFAULT_QUANTITY), "quantity"),
      title,
    });
  });
}

function buildPrintableNormalization(item) {
  const coverUrl = firstPresent(item.cover_url, item.coverUrl);
  const interiorUrl = firstPresent(item.interior_url, item.interiorUrl);
  const podPackageId = normalizeLineItemPodPackageId(item);

  if (!coverUrl || !interiorUrl) {
    throw validationError("Each print job line item needs cover_url and interior_url.");
  }

  return {
    cover: { source_url: coverUrl },
    interior: { source_url: interiorUrl },
    pod_package_id: podPackageId,
  };
}

function normalizePrintableNormalization(item) {
  const printableNormalization =
    item.printable_normalization ||
    item.printableNormalization ||
    buildPrintableNormalization(item);

  if (printableNormalization.pod_package_id) {
    return printableNormalization;
  }

  return {
    ...printableNormalization,
    pod_package_id: normalizeLineItemPodPackageId(item),
  };
}

function normalizeLineItemPageCount(item) {
  const variant = getVariantFromPayload(item);
  const pageCount = toPositiveInteger(
    firstPresent(item.page_count, item.pageCount, variant.defaultPageCount, DEFAULT_STORYBOOK_PAGE_COUNT),
    "page_count",
  );

  validateStorybookPageCount(variant, pageCount);

  return pageCount;
}

function normalizeLineItemPodPackageId(item) {
  const variant = getVariantFromPayload(item);
  return firstPresent(item.pod_package_id, item.podPackageId, getStorybookPodPackageId(variant.id));
}

function normalizeShippingOptionsAddress(address) {
  return removeUndefined({
    city: address.city,
    country: firstPresent(address.country, address.country_code, address.countryCode),
    is_business: firstPresent(address.is_business, address.isBusiness),
    is_postbox: firstPresent(address.is_postbox, address.isPostbox),
    name: address.name,
    organization: address.organization,
    phone_number: firstPresent(address.phone_number, address.phoneNumber),
    postcode: address.postcode,
    state: firstPresent(address.state, address.state_code, address.stateCode),
    street1: address.street1,
    street2: address.street2,
  });
}

function normalizeShippingAddress(address) {
  return removeUndefined({
    city: address.city,
    country_code: firstPresent(address.country_code, address.countryCode, address.country),
    email: address.email,
    is_business: firstPresent(address.is_business, address.isBusiness),
    name: address.name,
    organization: address.organization,
    phone_number: firstPresent(address.phone_number, address.phoneNumber),
    postcode: address.postcode,
    recipient_tax_id: firstPresent(address.recipient_tax_id, address.recipientTaxId),
    state_code: firstPresent(address.state_code, address.stateCode, address.state),
    street1: address.street1,
    street2: address.street2,
  });
}

function normalizeCurrency(currency) {
  return typeof currency === "string" && currency.trim() ? currency.trim().toUpperCase() : DEFAULT_CURRENCY;
}

function normalizeDimensionUnit(unit) {
  if (unit === undefined || unit === null || unit === "") {
    return undefined;
  }

  const normalized = String(unit).trim().toLowerCase();

  if (!["pt", "mm", "inch"].includes(normalized)) {
    throw validationError("unit must be pt, mm, or inch.");
  }

  return normalized;
}

function normalizeProductionDelay(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_PRODUCTION_DELAY_MINUTES;
  }

  const parsed = toPositiveInteger(value, "production_delay");
  return Math.max(60, Math.min(2880, parsed));
}

function normalizeShippingLevel(value) {
  const level = typeof value === "string" && value.trim() ? value.trim().toUpperCase() : DEFAULT_SHIPPING_LEVEL;

  if (!shippingLevels.has(level)) {
    throw validationError(`shipping_level must be one of: ${[...shippingLevels].join(", ")}.`);
  }

  return level;
}

function normalizeValidationType(value) {
  const type = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (type !== "interior" && type !== "cover") {
    throw validationError("type must be either interior or cover.");
  }

  return type;
}

function getVariantFromPayload(payload) {
  return getStorybookProductVariant(
    firstPresent(
      payload.cover_type,
      payload.coverType,
      payload.binding,
      payload.variant,
      payload.variantId,
    ),
  );
}

function toPositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw validationError(`${fieldName} must be a positive integer.`);
  }

  return parsed;
}

function requireFields(object, fields, namespace) {
  const missing = fields.filter((field) => !object[field]);

  if (missing.length > 0) {
    throw validationError(`${namespace} missing required field(s): ${missing.join(", ")}.`);
  }
}

function removeUndefined(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function validationError(message) {
  const error = new Error(message);
  error.name = "ValidationError";
  error.status = 400;
  return error;
}

function validationErrorToResponse(error) {
  return {
    status: error.status || 400,
    payload: { error: error.message },
  };
}

module.exports = {
  buildCostPayload,
  buildCoverDimensionsPayload,
  buildFileValidationPayload,
  buildPrintJobPayload,
  buildShippingOptionsPayload,
  getFileValidationReadPath,
  validationErrorToResponse,
};
