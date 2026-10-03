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

document.querySelector("#customer-proof-approve").addEventListener("click", () => submitProofResponse("approve"));
document.querySelector("#customer-proof-request").addEventListener("click", () => {
  document.querySelector("#customer-proof-notes-wrap").hidden = false;
  document.querySelector("#customer-proof-send-change").hidden = false;
  document.querySelector("#customer-proof-notes").focus();
});
document.querySelector("#customer-proof-send-change").addEventListener("click", () => submitProofResponse("request_changes"));

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

function renderProof(proof, paymentIssue) {
  const proofTitle = document.querySelector("#customer-proof-title");
  const proofMessage = document.querySelector("#customer-proof-message");
  const open = document.querySelector("#customer-proof-open");
  proofForm.hidden = true;
  open.hidden = !proof.url;
  if (proof.url) open.href = proof.url;
  if (proof.status === "ready") {
    proofTitle.textContent = "Your 32-page proof is ready.";
    proofMessage.textContent = `Open the PDF and review every page. Your approval applies only to fingerprint ${proof.fingerprint.slice(0, 12)}…`;
    proofForm.hidden = paymentIssue;
  } else if (proof.status === "approved") {
    proofTitle.textContent = "You approved this proof.";
    proofMessage.textContent = "Production can now perform its final preflight before sending the book to print.";
  } else if (proof.status === "changes_requested") {
    proofTitle.textContent = "Your change request was received.";
    proofMessage.textContent = "We will prepare a revised PDF. The previous proof cannot move to print.";
  } else {
    proofTitle.textContent = "Your proof is being prepared.";
    proofMessage.textContent = "We will let you know when the cover and all 32 interior pages are ready.";
  }
}

async function submitProofResponse(action) {
  if (!currentOrder?.proof?.fingerprint) return;
  if (action === "approve" && !document.querySelector("#customer-proof-approved").checked) {
    proofStatus.textContent = "Check the review confirmation before approving.";
    return;
  }
  const button = action === "approve" ? document.querySelector("#customer-proof-approve") : document.querySelector("#customer-proof-send-change");
  button.disabled = true;
  proofStatus.textContent = action === "approve" ? "Recording your approval…" : "Sending your change request…";
  try {
    const response = await fetch("/api/customer-order", {
      method: "POST",
      headers: { Authorization: `Bearer ${orderToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, fingerprint: currentOrder.proof.fingerprint, notes: document.querySelector("#customer-proof-notes").value }),
    });
    const result = await response.json();
    if (!response.ok || !result.order) throw new Error(result.error || "Your response could not be saved.");
    renderOrder(result.order);
    proofStatus.textContent = action === "approve" ? "Proof approved. Thank you." : "Change request received.";
  } catch (error) { proofStatus.textContent = error.message; }
  finally { button.disabled = false; }
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
