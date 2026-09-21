const { randomUUID } = require("node:crypto");
const {
  getSandboxConfig,
  luluSandboxRequest,
} = require("./lulu-sandbox");
const {
  DEFAULT_STORYBOOK_PAGE_COUNT,
  getStorybookProductVariant,
  validateStorybookPageCount,
} = require("./lulu-products");
const { buildPrintJobPayload } = require("./lulu-payloads");
const { buildSignedPrintFileUrl } = require("./storybook-print-urls");

async function prepareLuluSandboxStorybookOrder(payload, request) {
  const order = normalizeStorybookOrder(payload);
  const shouldSubmitPrintJob = Boolean(payload.submit_print_job || payload.submitPrintJob);
  if (shouldSubmitPrintJob) validateApprovedProductionIdentity(order);
  const coverDimensions = await getCoverDimensions(order);
  const files = {
    interior: buildSignedPrintFileUrl({
      request,
      type: "interior",
      submission: order,
      variant: order.variant,
      pageCount: order.pageCount,
      coverDimensions,
    }),
    cover: buildSignedPrintFileUrl({
      request,
      type: "cover",
      submission: order,
      variant: order.variant,
      pageCount: order.pageCount,
      coverDimensions,
    }),
  };
  const validations = payload.validate_files === false || payload.validateFiles === false
    ? null
    : await createFileValidations(order, files);
  const printJobRequest = buildStorybookPrintJobPayload(order, files, payload);
  const printJob = shouldSubmitPrintJob
    ? await luluSandboxRequest("/print-jobs/", {
        method: "POST",
        body: printJobRequest,
      })
    : null;

  return {
    mode: "sandbox",
    fileHandoff: "lulu-pulls-signed-https-urls",
    submittedPrintJob: shouldSubmitPrintJob,
    order: {
      submissionId: order.submissionId,
      storyLabel: order.storyLabel,
      styleLabel: order.styleLabel,
      childName: order.childName,
      monsterName: order.monsterName,
      storyId: order.storyId,
      masterVersion: order.masterVersion,
      monsterSubmissionId: order.monsterSubmissionId,
      selectedPreviewId: order.selectedPreviewId,
      proofFingerprint: order.proofFingerprint,
      proofApprovedAt: order.proofApprovedAt,
      variant: order.variant.id,
      podPackageId: order.variant.podPackageId,
      pageCount: order.pageCount,
    },
    coverDimensions,
    files,
    validations,
    printJobRequest,
    printJob: printJob?.data || null,
  };
}

function validateApprovedProductionIdentity(order) {
  if (!order.storyId) throw validationError("story_id is required before submitting a print job.");
  if (!order.monsterSubmissionId) throw validationError("monster_submission_id is required before submitting a print job.");
  if (!order.selectedPreviewId) throw validationError("selected_preview_id is required before submitting a print job.");
  if (!order.proofFingerprint || !order.proofApprovedAt) throw validationError("Administrator proof approval is required before submitting a print job.");
}

function normalizeStorybookOrder(payload = {}) {
  const variant = getStorybookProductVariant(
    firstPresent(payload.cover_type, payload.coverType, payload.format, payload.variant),
  );
  const pageCount = toPositiveInteger(
    firstPresent(payload.page_count, payload.pageCount, variant.defaultPageCount, DEFAULT_STORYBOOK_PAGE_COUNT),
    "page_count",
  );

  validateStorybookPageCount(variant, pageCount);

  return {
    submissionId: normalizeText(firstPresent(payload.submission_id, payload.submissionId), 120) || randomUUID(),
    externalId: normalizeText(firstPresent(payload.external_id, payload.externalId), 120),
    title: normalizeText(payload.title, 120) || "My Monster Storybook",
    storyLabel:
      normalizeText(firstPresent(payload.story_label, payload.storyLabel, payload.title), 140) ||
      "My Monster Storybook",
    styleLabel:
      normalizeText(firstPresent(payload.style_label, payload.styleLabel), 120) ||
      "Soft 3D Storybook Monster",
    childName: normalizeText(firstPresent(payload.child_name, payload.childName), 40),
    monsterName: normalizeText(firstPresent(payload.monster_name, payload.monsterName), 40),
    storyId: normalizeText(firstPresent(payload.story_id, payload.storyId), 120),
    masterVersion: toPositiveInteger(firstPresent(payload.master_version, payload.masterVersion, 1), "master_version"),
    monsterSubmissionId: normalizeText(firstPresent(payload.monster_submission_id, payload.monsterSubmissionId), 120),
    selectedPreviewId: normalizeText(firstPresent(payload.selected_preview_id, payload.selectedPreviewId), 120),
    proofFingerprint: normalizeFingerprint(firstPresent(payload.proof_fingerprint, payload.proofFingerprint)),
    proofApprovedAt: normalizeText(firstPresent(payload.proof_approved_at, payload.proofApprovedAt), 80),
    variant,
    pageCount,
  };
}

async function getCoverDimensions(order) {
  const result = await luluSandboxRequest("/cover-dimensions/", {
    method: "POST",
    body: {
      pod_package_id: order.variant.podPackageId,
      interior_page_count: order.pageCount,
      unit: "pt",
    },
  });
  const width = Number.parseFloat(result.data?.width);
  const height = Number.parseFloat(result.data?.height);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw validationError("Lulu did not return usable cover dimensions.");
  }

  return {
    width,
    height,
    unit: result.data?.unit || "pt",
  };
}

async function createFileValidations(order, files) {
  const [interior, cover] = await Promise.all([
    luluSandboxRequest("/validate-interior/", {
      method: "POST",
      body: {
        source_url: files.interior,
        pod_package_id: order.variant.podPackageId,
      },
    }),
    luluSandboxRequest("/validate-cover/", {
      method: "POST",
      body: {
        source_url: files.cover,
        pod_package_id: order.variant.podPackageId,
        interior_page_count: order.pageCount,
      },
    }),
  ]);

  return {
    interior: interior.data,
    cover: cover.data,
  };
}

function buildStorybookPrintJobPayload(order, files, payload) {
  const externalId = order.externalId || `monstersnow-${order.submissionId}`;
  const printJobPayload = {
    contact_email: firstPresent(payload.contact_email, payload.contactEmail, getSandboxConfig().contactEmail),
    external_id: externalId,
    shipping_level: firstPresent(payload.shipping_level, payload.shippingLevel),
    shipping_address: firstPresent(payload.shipping_address, payload.shippingAddress),
    line_items: [
      {
        external_id: `${externalId}-storybook`,
        title: order.title,
        quantity: firstPresent(payload.quantity, 1),
        cover_type: order.variant.id,
        cover_url: files.cover,
        interior_url: files.interior,
      },
    ],
  };

  return buildPrintJobPayload(printJobPayload, getSandboxConfig());
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeFingerprint(value) {
  const fingerprint = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-f0-9]{64}$/.test(fingerprint) ? fingerprint : "";
}

function toPositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw validationError(`${fieldName} must be a positive integer.`);
  }

  return parsed;
}

function validationError(message) {
  const error = new Error(message);
  error.name = "ValidationError";
  error.status = 400;
  return error;
}

module.exports = {
  prepareLuluSandboxStorybookOrder,
};
