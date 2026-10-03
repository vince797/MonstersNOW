const { luluSandboxRequest } = require("./lulu-sandbox");
const {
  DEFAULT_STORYBOOK_PAGE_COUNT,
  getStorybookProductVariant,
  validateStorybookPageCount,
} = require("./lulu-products");
const { buildSignedPrintFileUrl } = require("./storybook-print-urls");
const { DEMO_PURPOSE } = require("./storybook-print-files");

// The old path regenerated generic shapes after a customer approved a different
// PDF. No claimed approval, environment flag, or sandbox mode may reopen that
// path. Production requires an authenticated immutable-artifact resolver first.
async function prepareLuluSandboxStorybookOrder(payload = {}, request) {
  if (payload.submit_print_job || payload.submitPrintJob) {
    throw validationError("Lulu submission is blocked: the exact approved interior and binding-specific cover artifact handoff is not implemented. Generic demo PDFs cannot fulfill an approved order.", "approved_artifact_handoff_unavailable");
  }
  const order = normalizeDemoOrder(payload);
  const coverDimensions = await getCoverDimensions(order);
  const files = Object.fromEntries(["interior", "cover"].map((type) => [type, buildSignedPrintFileUrl({
    request,
    purpose: DEMO_PURPOSE,
    type,
    variant: order.variant,
    pageCount: order.pageCount,
    coverDimensions,
  })]));
  const validations = payload.validate_files === false || payload.validateFiles === false
    ? null
    : await createDemoFileValidations(order, files);
  return {
    mode: "sandbox",
    purpose: DEMO_PURPOSE,
    productionReady: false,
    fileHandoff: "synthetic-demo-only",
    submittedPrintJob: false,
    blockers: ["Generic shape PDFs are not personalized production artifacts.", "Binding-specific final art, trusted preflight, exact-file approvals, and immutable artifact hosting are still required."],
    order: {
      variant: order.variant.id,
      podPackageId: order.variant.podPackageId,
      pageCount: order.pageCount,
    },
    coverDimensions,
    files,
    validations,
    // A queued Lulu validation is not a passed result or permission to print.
    printJobRequest: null,
    printJob: null,
  };
}

function normalizeDemoOrder(payload) {
  if (payload.purpose !== DEMO_PURPOSE || (payload.synthetic_data !== true && payload.syntheticData !== true)) {
    throw validationError("This endpoint only prepares synthetic sandbox-demo files. Set purpose=sandbox-demo and synthetic_data=true; customer orders require the approved-artifact handoff.", "sandbox_demo_required");
  }
  const allowedFields = new Set(["purpose", "synthetic_data", "syntheticData", "cover_type", "coverType", "format", "variant", "page_count", "pageCount", "validate_files", "validateFiles", "submit_print_job", "submitPrintJob"]);
  if (Object.keys(payload).some((key) => !allowedFields.has(key))) {
    throw validationError("Sandbox demos accept only format and test options. Do not include customer, child, monster, order, proof, or shipping data.", "sandbox_demo_personal_data_rejected");
  }
  const variant = getStorybookProductVariant(payload.cover_type || payload.coverType || payload.format || payload.variant);
  const pageCount = Number(payload.page_count ?? payload.pageCount ?? DEFAULT_STORYBOOK_PAGE_COUNT);
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw validationError("page_count must be a positive integer.");
  validateStorybookPageCount(variant, pageCount);
  return { variant, pageCount };
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
  const width = Number(result.data?.width);
  const height = Number(result.data?.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0 || (result.data?.unit && result.data.unit !== "pt")) {
    throw validationError("Lulu did not return usable point-based cover dimensions.");
  }
  return { width, height, unit: "pt", purpose: "demo-canvas-only" };
}

async function createDemoFileValidations(order, files) {
  const [interior, cover] = await Promise.all([
    luluSandboxRequest("/validate-interior/", {
      method: "POST",
      body: { source_url: files.interior, pod_package_id: order.variant.podPackageId },
    }),
    luluSandboxRequest("/validate-cover/", {
      method: "POST",
      body: { source_url: files.cover, pod_package_id: order.variant.podPackageId, interior_page_count: order.pageCount },
    }),
  ]);
  return { interior: interior.data, cover: cover.data, productionApproval: false };
}

function validationError(message, code = "invalid_sandbox_demo") {
  const error = new Error(message);
  error.name = "ValidationError";
  error.code = code;
  error.status = 409;
  return error;
}

module.exports = { prepareLuluSandboxStorybookOrder };
