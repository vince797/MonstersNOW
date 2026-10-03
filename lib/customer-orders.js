const crypto = require("node:crypto");
const { supabaseRequest } = require("./story-library");

const PROOF_BUCKET = "customer-proofs";
const MAX_PROOF_BYTES = 20 * 1024 * 1024;
const SIGNED_PROOF_TTL_SECONDS = 15 * 60;

function deriveOrderAccess(submission) {
  const secret = getOrderAccessSecret();
  const identity = [
    submission.submissionId,
    submission.monsterSubmissionId || "",
    submission.email,
    submission.selectedPreviewId || "",
    submission.format?.id || "",
  ].join("\n");
  const submissionDigest = hmac(secret, `order\n${identity}`).toString("hex");
  const submissionId = `order-${submissionDigest.slice(0, 48)}`;
  const tokenDigest = hmac(secret, `access\n${submissionId}`).toString("base64url");
  const token = `mn_order_${tokenDigest}`;
  return { submissionId, token, tokenHash: hashToken(token) };
}

function deriveOrderAccessToken(submissionId) {
  const normalized = cleanText(submissionId, 120);
  if (!normalized) throw customerOrderError("Order access is unavailable.", 503, "order_access_unavailable");
  return `mn_order_${hmac(getOrderAccessSecret(), `access\n${normalized}`).toString("base64url")}`;
}

async function getCustomerOrder(token) {
  const normalizedToken = normalizeToken(token);
  const rows = await supabaseRequest(
    `/storybook_orders?order_access_token_hash=eq.${encodeURIComponent(hashToken(normalizedToken))}&select=*&limit=1`,
  );
  if (!rows[0]) throw customerOrderError("This order link is invalid or no longer available.", 403, "invalid_order_access");
  return rows[0];
}

async function getCustomerOrderView(token) {
  const order = await getCustomerOrder(token);
  const proofUrl = order.customer_proof_path && ["ready", "approved", "changes_requested"].includes(order.customer_proof_status)
    ? await createSignedProofUrl(order.customer_proof_path)
    : null;
  return publicOrder(order, proofUrl);
}

async function reviewCustomerProof(token, payload = {}) {
  const order = await getCustomerOrder(token);
  if (order.payment_issue) throw customerOrderError("Proof review is paused while a payment issue is resolved.", 409, "payment_issue");
  if (order.status !== "proofing") throw customerOrderError("This proof review is locked because the order has moved to its next production stage.", 409, "proof_review_locked");
  if (!order.customer_proof_path || !order.customer_proof_fingerprint) {
    throw customerOrderError("The proof is not ready for review.", 409, "proof_not_ready");
  }
  if (payload.fingerprint !== order.customer_proof_fingerprint) {
    throw customerOrderError("This proof changed. Refresh the page before responding.", 409, "proof_changed");
  }

  const now = new Date().toISOString();
  let update;
  if (payload.action === "approve") {
    if (order.customer_proof_status !== "ready") {
      throw customerOrderError("This proof cannot be approved in its current state.", 409, "proof_not_approvable");
    }
    update = {
      customer_proof_status: "approved",
      customer_proof_reviewed_at: now,
      customer_proof_revision_notes: null,
      updated_at: now,
    };
  } else if (payload.action === "request_changes") {
    if (!['ready', 'approved'].includes(order.customer_proof_status)) {
      throw customerOrderError("This proof cannot accept a revision request in its current state.", 409, "proof_not_reviewable");
    }
    const notes = cleanText(payload.notes, 1000);
    if (notes.length < 3) throw customerOrderError("Tell us what should change in the proof.", 400, "revision_notes_required");
    update = {
      customer_proof_status: "changes_requested",
      customer_proof_reviewed_at: now,
      customer_proof_revision_notes: notes,
      customer_proof_revision_count: Number(order.customer_proof_revision_count || 0) + 1,
      updated_at: now,
    };
  } else {
    throw customerOrderError("Choose approve or request changes.", 400, "invalid_proof_action");
  }

  const rows = await supabaseRequest(
    `/storybook_orders?id=eq.${encodeURIComponent(order.id)}&customer_proof_fingerprint=eq.${encodeURIComponent(order.customer_proof_fingerprint)}`,
    { method: "PATCH", body: update, prefer: "return=representation" },
  );
  if (!rows[0]) throw customerOrderError("This proof changed. Refresh the page before responding.", 409, "proof_changed");
  return publicOrder(rows[0], await createSignedProofUrl(rows[0].customer_proof_path));
}

async function publishCustomerProof(order, payload = {}) {
  if (!order) return null;
  if (order.status !== "proofing") throw customerOrderError("Move the paid order into proofing before publishing a customer proof.", 409, "order_not_proofing");
  if (order.payment_issue) throw customerOrderError("Resolve the Stripe payment issue before publishing a proof.", 409, "payment_issue");
  const pdf = parseProofPdf(payload.proofData || payload.proof_data);
  const fingerprint = crypto.createHash("sha256").update(pdf).digest("hex");
  const path = `${order.id}/${fingerprint}.pdf`;
  await uploadProof(path, pdf);
  const now = new Date().toISOString();
  const rows = await supabaseRequest(`/storybook_orders?id=eq.${encodeURIComponent(order.id)}&status=eq.proofing`, {
    method: "PATCH",
    body: {
      order_access_token_hash: hashToken(deriveOrderAccessToken(order.submission_id)),
      customer_proof_status: "ready",
      customer_proof_path: path,
      customer_proof_fingerprint: fingerprint,
      customer_proof_master_version: Number(payload.masterStoryVersion || payload.master_story_version) || null,
      customer_proof_ready_at: now,
      customer_proof_reviewed_at: null,
      customer_proof_revision_notes: null,
      updated_at: now,
    },
    prefer: "return=representation",
  });
  if (!rows[0]) throw customerOrderError("The order changed before the proof could be published.", 409, "order_changed");
  return rows[0];
}

function buildCustomerOrderUrl(order, request) {
  const token = deriveOrderAccessToken(order.submission_id);
  const site = customerSiteUrl(request);
  return `${site}/order.html#token=${encodeURIComponent(token)}`;
}

function parseProofPdf(value) {
  const match = typeof value === "string" && value.match(/^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw customerOrderError("Choose a PDF proof.", 400, "invalid_proof_pdf");
  const bytes = Buffer.from(match[1], "base64");
  if (!bytes.length || bytes.length > MAX_PROOF_BYTES || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw customerOrderError("Choose a valid PDF proof under 20 MB.", 400, "invalid_proof_pdf");
  }
  return bytes;
}

async function uploadProof(path, bytes) {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/${PROOF_BUCKET}/${encodeObjectPath(path)}`, {
    method: "POST",
    headers: storageHeaders(key, { "Content-Type": "application/pdf", "Cache-Control": "private, max-age=0", "x-upsert": "true" }),
    body: bytes,
  });
  if (!response.ok) throw await storageError(response, "The customer proof could not be stored.");
}

async function createSignedProofUrl(path) {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/sign/${PROOF_BUCKET}/${encodeObjectPath(path)}`, {
    method: "POST",
    headers: storageHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn: SIGNED_PROOF_TTL_SECONDS }),
  });
  if (!response.ok) throw await storageError(response, "The customer proof could not be opened.");
  const body = await response.json();
  const signedPath = body.signedURL || body.signedUrl;
  if (!signedPath) throw customerOrderError("The customer proof could not be opened.", 502, "proof_storage_error");
  return `${url}/storage/v1${signedPath.startsWith("/") ? signedPath : `/${signedPath}`}`;
}

function publicOrder(order, proofUrl) {
  return {
    id: order.id,
    reference: String(order.id || "").slice(0, 8).toUpperCase(),
    status: order.status,
    childName: order.child_name,
    monsterName: order.monster_name,
    storyLabel: order.story_label,
    format: order.format_id,
    amountCents: order.stripe_total_cents ?? order.amount_cents,
    currency: order.currency || "USD",
    paidAt: order.stripe_paid_at,
    paymentIssue: Boolean(order.payment_issue),
    proof: {
      status: order.customer_proof_status || "not_ready",
      url: proofUrl,
      fingerprint: order.customer_proof_fingerprint,
      readyAt: order.customer_proof_ready_at,
      reviewedAt: order.customer_proof_reviewed_at,
      revisionNotes: order.customer_proof_revision_notes,
      revisionCount: Number(order.customer_proof_revision_count || 0),
    },
    updatedAt: order.updated_at,
  };
}

function customerSiteUrl(request) {
  const configured = String(process.env.STORYBOOK_CUSTOMER_SITE_URL || process.env.STORYBOOK_CHECKOUT_SITE_URL || process.env.SITE_URL || "").replace(/\/+$/, "");
  if (configured) {
    let parsed;
    try { parsed = new URL(configured); } catch { throw customerOrderError("Customer order site URL is invalid.", 503, "customer_site_url_invalid"); }
    const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" || (parsed.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local && parsed.protocol === "http:"))) {
      throw customerOrderError("Customer order site URL must be a secure origin.", 503, "customer_site_url_invalid");
    }
    return parsed.origin;
  }
  const host = getHeader(request, "x-forwarded-host") || getHeader(request, "host");
  const hostname = host.toLowerCase().replace(/:\d+$/, "");
  if (!["monstersnow.com", "www.monstersnow.com"].includes(hostname) && !(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(hostname))) {
    throw customerOrderError("Customer order site URL is not configured.", 503, "customer_site_url_missing");
  }
  return `${hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https"}://${host}`;
}

function getOrderAccessSecret() {
  const secret = process.env.ORDER_ACCESS_SECRET || "";
  if (secret.length < 32) throw customerOrderError("Customer order access is not configured.", 503, "order_access_not_configured");
  return secret;
}

function normalizeToken(value) {
  const token = cleanText(value, 180);
  if (!/^mn_order_[A-Za-z0-9_-]{43}$/.test(token)) throw customerOrderError("This order link is invalid or no longer available.", 403, "invalid_order_access");
  return token;
}

function storageConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw customerOrderError("Customer proof storage is not configured.", 503, "proof_storage_not_configured");
  return { url, key };
}

function storageHeaders(key, extra = {}) { return { apikey: key, Authorization: `Bearer ${key}`, ...extra }; }
function encodeObjectPath(value) { return String(value).split("/").map(encodeURIComponent).join("/"); }
function hmac(secret, value) { return crypto.createHmac("sha256", secret).update(value).digest(); }
function hashToken(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function cleanText(value, max) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function getHeader(request, name) { return request?.headers?.get ? request.headers.get(name) || "" : request?.headers?.[name] || request?.headers?.[name.toLowerCase()] || ""; }
async function storageError(response, fallback) { const body = await response.json().catch(() => ({})); return customerOrderError(body.message || body.error || fallback, response.status < 500 ? response.status : 502, body.code || "proof_storage_error"); }
function customerOrderError(message, status = 400, code = "customer_order_error") { const error = new Error(message); error.name = "CustomerOrderError"; error.status = status; error.code = code; return error; }

module.exports = {
  buildCustomerOrderUrl,
  deriveOrderAccess,
  deriveOrderAccessToken,
  getCustomerOrder,
  getCustomerOrderView,
  hashToken,
  publishCustomerProof,
  reviewCustomerProof,
};
