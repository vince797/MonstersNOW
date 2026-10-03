const ORDER_TOKEN_KEY = "monstersnow_order_access";
const query = new URLSearchParams(window.location.search);
const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const incomingToken = fragment.get("token") || query.get("token") || "";
if (incomingToken) {
  try { sessionStorage.setItem(ORDER_TOKEN_KEY, incomingToken); } catch {}
  history.replaceState({}, "", window.location.pathname);
}
let orderToken = incomingToken;
try { orderToken ||= sessionStorage.getItem(ORDER_TOKEN_KEY) || ""; } catch {}

const title = document.querySelector("#customer-order-title");
const message = document.querySelector("#customer-order-message");
const details = document.querySelector("#customer-order-details");
const proofForm = document.querySelector("#customer-proof-form");
const proofStatus = document.querySelector("#customer-proof-status");
let currentOrder;
let displayedProofIdentity = null;
let isSubmittingProof = false;

document.querySelector("#customer-proof-approve").addEventListener("click", () => submitProofResponse("approve"));
document.querySelector("#customer-proof-request").addEventListener("click", () => {
  document.querySelector("#customer-proof-notes-wrap").hidden = false;
  document.querySelector("#customer-proof-send-change").hidden = false;
  document.querySelector("#customer-proof-notes").focus();
});
document.querySelector("#customer-proof-send-change").addEventListener("click", () => submitProofResponse("request_changes"));
document.querySelector("#customer-proof-refresh").addEventListener("click", loadOrder);

if (!orderToken) {
  showError("This private order link is incomplete. Open the latest link from MonstersNOW or contact us for help.");
} else {
  loadOrder();
}

async function loadOrder() {
  try {
    const response = await fetch("/api/customer-order", { headers: { Authorization: `Bearer ${orderToken}` }, cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.order) throw new Error(result.error || "This order could not be opened.");
    renderOrder(result.order);
  } catch (error) { showError(error.message); }
}

function renderOrder(order) {
  currentOrder = order;
  title.textContent = `${order.childName}'s storybook order`;
  message.textContent = order.paymentIssue ? "Production is paused while we resolve a payment issue. No print order will be sent." : statusMessage(order);
  details.hidden = false;
  document.querySelector("#customer-order-reference").textContent = order.reference;
  document.querySelector("#customer-order-story").textContent = order.storyLabel;
  document.querySelector("#customer-order-format").textContent = order.format === "hardcover" ? "Hardcover keepsake" : "Softcover storybook";
  document.querySelector("#customer-order-total").textContent = money(order.amountCents, order.currency);
  renderProgress(order.status);
  renderProof(order.proof, order.paymentIssue);
}

function renderProgress(status) {
  const steps = [
    ["paid", "Payment"],
    ["proofing", "Proof"],
    ["approved", "Approved"],
    ["printing", "Printing"],
    ["shipped", "Shipped"],
    ["completed", "Delivered"],
  ];
  const states = ["checkout_started", ...steps.map(([value]) => value)];
  const current = states.indexOf(status);
  document.querySelector("#customer-order-progress").replaceChildren(...steps.map(([value, label], index) => {
    const item = document.createElement("li");
    const stateIndex = states.indexOf(value);
    item.className = status === "cancelled" ? "is-cancelled" : stateIndex < current ? "is-complete" : stateIndex === current ? "is-current" : "";
    const marker = document.createElement("span"); marker.textContent = stateIndex < current ? "✓" : String(index + 1);
    const copy = document.createElement("strong"); copy.textContent = label;
    item.append(marker, copy);
    return item;
  }));
}

function secureProofUrl(value) {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : ""; } catch { return ""; }
}
function renderProof(proof = {}, paymentIssue) {
  const proofTitle = document.querySelector("#customer-proof-title");
  const proofMessage = document.querySelector("#customer-proof-message");
  const open = document.querySelector("#customer-proof-open");
  const pkg = proof.package;
  const identity = pkg?.packageHash || proof.fingerprint || null;
  if (identity !== displayedProofIdentity) {
    document.querySelector("#customer-proof-approved").checked = false;
    document.querySelector("#customer-proof-notes").value = "";
    document.querySelector("#customer-proof-notes-wrap").hidden = true;
    document.querySelector("#customer-proof-send-change").hidden = true;
    proofStatus.textContent = "";
    displayedProofIdentity = identity;
  }
  proofForm.hidden = true;
  document.querySelector("#customer-proof-approve").hidden = false;
  document.querySelector("#customer-proof-approved").closest("label").hidden = false;
  open.hidden = true; open.removeAttribute("href");
  document.querySelector("#customer-proof-package-links").hidden = !pkg;
  document.querySelector("#customer-package-state").hidden = !pkg;
  if (pkg) {
    const stale = ["superseded", "stale", "invalidated"].includes(pkg.status);
    let filesAvailable = true;
    for (const kind of ["interior", "cover"]) {
      const link = document.querySelector(`#customer-package-${kind}`), url = secureProofUrl(pkg[kind]?.url);
      link.hidden = !url || stale;
      if (url && !stale) link.href = url; else link.removeAttribute("href");
      filesAvailable &&= Boolean(url);
      link.title = pkg[kind]?.sha256 ? `SHA-256: ${pkg[kind].sha256}` : "";
    }
    document.querySelector("#customer-package-state").textContent = `Review candidate · ${pkg.format === "hardcover" ? "hardcover" : "softcover"} · version ${pkg.packageHash.slice(0, 16)}… Your response applies to this exact pair of files. Printing remains disabled while production checks are unfinished.`;
    const status = pkg.customerApproval?.status || proof.status;
    if (stale) {
      proofTitle.textContent = "This proof has changed.";
      proofMessage.textContent = "A newer version needs review. Refresh to open its current cover and interior; earlier approval does not carry over.";
    } else if (!filesAvailable) {
      proofTitle.textContent = "The proof files are temporarily unavailable.";
      proofMessage.textContent = "Refresh the private links before reviewing or approving. No print order can be sent.";
    } else if ([pkg.customerApproval?.status, pkg.adminApproval?.status].includes("changes_requested")) {
      proofTitle.textContent = "A revised file package is needed.";
      proofMessage.textContent = "Changes were requested in this version. You can still view these files, but approval is paused until a revised package is published.";
    } else if (status === "approved") {
      proofTitle.textContent = "You reviewed this exact candidate.";
      proofMessage.textContent = "Your response is saved. The book still needs final artwork and production approval before printing.";
      proofForm.hidden = Boolean(paymentIssue);
      document.querySelector("#customer-proof-approve").hidden = true;
      document.querySelector("#customer-proof-approved").closest("label").hidden = true;
    } else if (status === "changes_requested") {
      proofTitle.textContent = "Your change request was received.";
      proofMessage.textContent = "We will prepare a revised file package. It will need a new review.";
    } else {
      proofTitle.textContent = "Your exact cover and interior are ready to review.";
      proofMessage.textContent = "Open both PDFs and review the names, selected characters, cover, and all 32 interior pages. These are watermarked review candidates.";
      proofForm.hidden = Boolean(paymentIssue) || proof.canApprove === false;
      if (proof.canApprove === false) { proofTitle.textContent = "This package is not open for approval."; proofMessage.textContent = "Refresh for the current review status or wait for a revised package from MonstersNOW."; }
    }
    return;
  }
  const url = secureProofUrl(proof.url);
  open.hidden = !url;
  if (url) open.href = url;
  if (proof.status === "ready") {
    proofTitle.textContent = "A manual PDF is available for review.";
    proofMessage.textContent = "You can open this PDF and request changes. MonstersNOW must publish the exact cover-and-interior package before approval can be recorded.";
    proofForm.hidden = Boolean(paymentIssue) || !url;
    document.querySelector("#customer-proof-approve").hidden = true;
    document.querySelector("#customer-proof-approved").closest("label").hidden = true;
  } else if (proof.status === "approved") {
    proofTitle.textContent = "You reviewed this proof.";
    proofMessage.textContent = "Your response is saved. Final production checks and exact-file approval remain required before printing.";
  } else if (proof.status === "changes_requested") {
    proofTitle.textContent = "Your change request was received.";
    proofMessage.textContent = "We will prepare a revised PDF. The previous proof cannot move to print.";
  } else {
    proofTitle.textContent = "Your proof is being prepared.";
    proofMessage.textContent = "We will let you know when the cover and all 32 interior pages are ready.";
  }
}

async function submitProofResponse(action) {
  const pkg = currentOrder?.proof?.package;
  if (isSubmittingProof || (!pkg?.packageHash && !currentOrder?.proof?.fingerprint)) return;
  if (action === "approve" && (currentOrder.proof.canApprove === false || [pkg?.customerApproval?.status, pkg?.adminApproval?.status].includes("changes_requested"))) {
    proofStatus.textContent = "This version needs revision before it can be approved. Refresh for the latest files.";
    return;
  }
  if (action === "approve" && !document.querySelector("#customer-proof-approved").checked) {
    proofStatus.textContent = "Check the review confirmation before approving.";
    return;
  }
  isSubmittingProof = true;
  const button = action === "approve" ? document.querySelector("#customer-proof-approve") : document.querySelector("#customer-proof-send-change");
  for (const control of proofForm.querySelectorAll("button")) control.disabled = true;
  proofStatus.textContent = action === "approve" ? "Recording your approval…" : "Sending your change request…";
  try {
    const response = await fetch("/api/customer-order", {
      method: "POST",
      headers: { Authorization: `Bearer ${orderToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(pkg ? { packageId: pkg.id, packageHash: pkg.packageHash } : { fingerprint: currentOrder.proof.fingerprint }), notes: document.querySelector("#customer-proof-notes").value }),
    });
    const result = await response.json();
    if (!response.ok || !result.order) throw new Error(result.error || "Your response could not be saved.");
    renderOrder(result.order);
    proofStatus.textContent = action === "approve" ? "Proof approved. Thank you." : "Change request received.";
  } catch (error) { proofStatus.textContent = error.message; }
  finally { isSubmittingProof = false; for (const control of proofForm.querySelectorAll("button")) control.disabled = false; }
}

function statusMessage(order) {
  return ({
    checkout_started: "Payment confirmation is still processing.",
    paid: "Payment is confirmed. Your personalized proof is next.",
    proofing: "Your personalized book proof is in progress.",
    approved: "Your proof is approved and awaiting print handoff.",
    printing: "Your book is in production.",
    shipped: "Your book has shipped.",
    completed: "This order is complete.",
    cancelled: "This order was cancelled and will not be printed.",
  })[order.status] || "Your order is being reviewed.";
}

function money(cents, currency) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(Number(cents || 0) / 100); }
  catch { return `$${(Number(cents || 0) / 100).toFixed(2)}`; }
}

function showError(copy) {
  title.textContent = "We couldn’t open this order.";
  message.textContent = copy;
  details.hidden = true;
}
