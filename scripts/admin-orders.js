// Orders: list, filters, and the order detail panel.
// Loaded after admin.js and shares its globals (orders, apiRequest,
// formatMoney, relativeAge, readFileAsDataUrl, render* helpers).

const ORDER_STATUSES = ["checkout_started", "paid", "proofing", "approved", "printing", "shipped", "completed", "cancelled"];
const ORDER_FLOW = ["checkout_started", "paid", "proofing", "approved", "printing", "shipped", "completed"];
const ORDER_STATUS_LABELS = {
  checkout_started: "Unpaid",
  paid: "Paid",
  proofing: "Proofing",
  approved: "Approved",
  printing: "Printing",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};
const ORDER_TABS = [
  { id: "attention", label: "Needs action", match: (order) => Boolean(orderAction(order).urgent) },
  { id: "all", label: "All", match: () => true },
  { id: "active", label: "In production", match: (order) => ["paid", "proofing", "approved", "printing"].includes(order.status) },
  ...ORDER_STATUSES.map((status) => ({ id: status, label: ORDER_STATUS_LABELS[status], match: (order) => order.status === status })),
];
const PROOF_LABELS = { not_ready: "Not sent", ready: "Awaiting customer", changes_requested: "Changes requested", approved: "Customer approved" };

let orderTab = "all";
let selectedOrder = null;
const orderPanel = document.querySelector("#order-panel");
const orderMessage = document.querySelector("#order-panel-message");

document.querySelector("#order-search").addEventListener("input", renderOrders);
document.querySelector("#orders-refresh").addEventListener("click", refreshOrders);
document.querySelector("#order-panel-close").addEventListener("click", closeOrderDetail);
orderPanel.addEventListener("cancel", (event) => { event.preventDefault(); closeOrderDetail(); });
orderPanel.addEventListener("click", (event) => { if (event.target === orderPanel) closeOrderDetail(); });
document.querySelector("#order-copy-id").addEventListener("click", () => selectedOrder && copyOrderText(selectedOrder.id, "Order ID copied."));
document.querySelector("#order-copy-proof").addEventListener("click", copyProofLink);
document.querySelector("#order-email-proof").addEventListener("click", emailProofLink);
document.querySelector("#order-publish-proof").addEventListener("click", publishProof);
document.querySelector("#order-approve-proof").addEventListener("click", approveProof);
document.querySelector("#order-revoke-proof").addEventListener("click", revokeProof);
document.querySelector("#order-regenerate-print").addEventListener("click", regeneratePrintFiles);
document.querySelector("#order-send-lulu").addEventListener("click", sendToLulu);
document.querySelector("#order-status-form").addEventListener("submit", saveOrderStatus);

function setOrderTab(tab) {
  orderTab = ORDER_TABS.some((item) => item.id === tab) ? tab : "all";
  renderOrders();
}

/** What an operator should do next with this order. */
function orderAction(order) {
  if (order.payment_issue) return { urgent: true, title: "Resolve the payment issue", help: `Stripe reported: ${humanize(order.payment_issue)}. Fulfillment is blocked until it is resolved in Stripe.` };
  const proof = order.customer_proof_status || "not_ready";
  const age = hoursSince(order.updated_at || order.created_at);
  switch (order.status) {
    case "checkout_started":
      return age >= 24
        ? { urgent: true, title: "Checkout not completed", help: `No verified payment after ${relativeAge(order.created_at).replace(" ago", "")}. Follow up or cancel.` }
        : { title: "Waiting for payment", help: "Stripe marks the order paid automatically when payment succeeds." };
    case "paid":
      return { urgent: true, title: "Start the proof", help: "Move the order to proofing, then publish the exact proof PDF for the customer." };
    case "proofing":
      if (proof === "approved") return { urgent: true, title: "Approve the proof for print", help: "The customer approved the proof. Lock it for production." };
      if (proof === "changes_requested") return { urgent: true, title: "Customer requested changes", help: order.customer_proof_revision_notes || "Prepare and publish a revised proof." };
      if (proof === "ready") return { urgent: age >= 72, title: "Waiting for the customer", help: "Resend the proof link if the customer hasn't responded." };
      return { urgent: true, title: "Publish the customer proof", help: "Upload the exact proof PDF and send the private link." };
    case "approved":
      return { urgent: true, title: "Send to Lulu", help: "Confirm the shipping address and create the print job." };
    case "printing":
      return { urgent: age >= 168, title: "At the printer", help: order.lulu_print_job_id ? `Lulu print job ${order.lulu_print_job_id}. Mark shipped once it ships.` : "Confirm the printer accepted the order." };
    case "shipped":
      return { urgent: age >= 168, title: "In transit", help: "Mark completed once delivery is confirmed." };
    case "completed":
      return { title: "Done", help: "This order is complete." };
    case "cancelled":
      return { title: "Cancelled", help: "No further action." };
    default:
      return { title: "Review this order", help: "" };
  }
}

function renderOrders() {
  const query = document.querySelector("#order-search").value.trim().toLowerCase();
  const tabs = document.querySelector("#order-tabs");
  tabs.replaceChildren(...ORDER_TABS.map((tab) => {
    const count = orders.filter(tab.match).length;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.orderTab = tab.id;
    button.className = tab.id === orderTab ? "is-active" : "";
    if (tab.id === "attention" && count) button.classList.add("has-items");
    button.setAttribute("aria-pressed", String(tab.id === orderTab));
    button.innerHTML = "<span></span><em></em>";
    button.querySelector("span").textContent = tab.label;
    button.querySelector("em").textContent = count;
    button.addEventListener("click", () => setOrderTab(tab.id));
    return button;
  }));
  const tab = ORDER_TABS.find((item) => item.id === orderTab) || ORDER_TABS[1];
  const visible = orders
    .filter(tab.match)
    .filter((order) => !query || [order.id, order.submission_id, order.customer_email, order.shipping_name, order.child_name, order.monster_name, order.story_label, order.lulu_print_job_id]
      .filter(Boolean).join(" ").toLowerCase().includes(query))
    .sort((left, right) => new Date(right.updated_at || right.created_at) - new Date(left.updated_at || left.created_at));
  const body = document.querySelector("#orders-list");
  body.replaceChildren(...visible.map(buildOrderRow));
  document.querySelector("#orders-empty").hidden = visible.length > 0;
  document.querySelector(".orders-list").hidden = visible.length === 0;
}

function buildOrderRow(order) {
  const action = orderAction(order);
  const row = document.createElement("tr");
  row.tabIndex = 0;
  row.dataset.orderId = order.id;
  row.classList.toggle("needs-action", Boolean(action.urgent));
  row.innerHTML = `
    <td class="order-cell-main"><strong></strong><small></small><span class="order-next-hint"></span></td>
    <td><span class="order-customer"></span><small></small></td>
    <td><span class="status-chip"></span></td>
    <td><span class="pay-chip"></span></td>
    <td><span class="proof-label"></span></td>
    <td class="order-cell-money"></td>
    <td class="order-cell-age"></td>`;
  const cells = row.children;
  cells[0].querySelector("strong").textContent = `${order.child_name || "Child"} + ${order.monster_name || "Monster"}`;
  cells[0].querySelector("small").textContent = `${order.story_label || "Storybook"} · ${formatLabel(order.format_id)} · #${shortId(order.id)}`;
  cells[0].querySelector(".order-next-hint").textContent = action.urgent ? action.title : "";
  cells[1].querySelector(".order-customer").textContent = order.shipping_name || order.customer_email || "—";
  cells[1].querySelector("small").textContent = order.shipping_name ? order.customer_email || "" : "";
  setStatusChip(cells[2].querySelector(".status-chip"), order.status);
  setPaymentChip(cells[3].querySelector(".pay-chip"), order);
  cells[4].querySelector(".proof-label").textContent = PROOF_LABELS[order.customer_proof_status || "not_ready"];
  cells[5].textContent = formatMoney(order.stripe_total_cents ?? order.amount_cents ?? 0, order.currency || "USD");
  cells[6].textContent = relativeAge(order.updated_at || order.created_at);
  row.addEventListener("click", () => openOrderDetail(order));
  row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openOrderDetail(order); } });
  return row;
}

async function refreshOrders() {
  const button = document.querySelector("#orders-refresh");
  const status = document.querySelector("#orders-status");
  button.disabled = true;
  status.textContent = "Refreshing orders…";
  try {
    const result = await apiRequest("?resource=orders");
    orders = result.orders || [];
    refreshOrderViews();
    status.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}

function refreshOrderViews() {
  renderOrders();
  if (typeof renderDashboard === "function") renderDashboard();
  if (typeof renderCustomers === "function") renderCustomers();
  if (typeof renderProductionHub === "function") renderProductionHub();
}

function openOrderDetail(order) {
  if (!order) return;
  selectedOrder = order;
  orderMessage.textContent = "";
  orderMessage.className = "order-panel-message";
  document.querySelector("#order-print-files").hidden = true;
  document.querySelector("#order-proof-file").value = "";
  renderOrderDetail();
  if (!orderPanel.open) orderPanel.showModal();
  document.querySelector("#order-panel-body").scrollTop = 0;
}

function closeOrderDetail() {
  if (!selectedOrder) { if (orderPanel.open) orderPanel.close(); return; }
  const notesChanged = document.querySelector("#order-notes").value !== (selectedOrder.notes || "");
  const statusChanged = document.querySelector("#order-status-select").value !== selectedOrder.status;
  if ((notesChanged || statusChanged) && !window.confirm("Discard unsaved changes to this order?")) return;
  orderPanel.close();
  selectedOrder = null;
}

function renderOrderDetail() {
  const order = selectedOrder;
  const action = orderAction(order);
  document.querySelector("#order-panel-ref").textContent = `Order #${shortId(order.id)} · ${new Date(order.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
  document.querySelector("#order-panel-title").textContent = `${order.child_name || "Child"} + ${order.monster_name || "Monster"}`;
  const chips = document.querySelector("#order-panel-chips");
  const status = document.createElement("span");
  const payment = document.createElement("span");
  setStatusChip(status, order.status);
  setPaymentChip(payment, order);
  chips.replaceChildren(status, payment);

  const next = document.querySelector("#order-next");
  next.classList.toggle("is-urgent", Boolean(action.urgent));
  next.classList.toggle("is-blocked", Boolean(order.payment_issue));
  document.querySelector("#order-next-title").textContent = action.title;
  document.querySelector("#order-next-help").textContent = action.help;
  renderOrderSteps(order);
  renderCharacters(order);

  const address = order.shipping_address || {};
  fillList("#order-customer", [
    ["Email", order.customer_email ? link(`mailto:${order.customer_email}`, order.customer_email) : null],
    ["Ship to", order.shipping_name],
    ["Phone", order.shipping_phone],
    ["Address", [address.line1, address.line2, [address.city, address.state, address.postal_code].filter(Boolean).join(", "), address.country].filter(Boolean).join("\n")],
  ]);
  fillList("#order-book", [
    ["Story", order.story_label],
    ["Format", formatLabel(order.format_id)],
    ["Child", order.child_name],
    ["Monster", order.monster_name],
    ["Monster style", order.monster_style],
  ]);
  const dashboard = order.stripe_payment_intent_id
    ? link(`https://dashboard.stripe.com/${isTestOrder(order) ? "test/" : ""}payments/${encodeURIComponent(order.stripe_payment_intent_id)}`, "Open in Stripe ↗", true)
    : null;
  fillList("#order-payment", [
    ["Status", paymentLabel(order)],
    ["Total", formatMoney(order.stripe_total_cents ?? order.amount_cents ?? 0, order.currency || "USD")],
    ["Breakdown", order.stripe_total_cents != null ? [
      order.stripe_subtotal_cents != null ? `Book ${formatMoney(order.stripe_subtotal_cents, order.currency)}` : "",
      order.stripe_shipping_cents != null ? `Shipping ${formatMoney(order.stripe_shipping_cents, order.currency)}` : "",
      order.stripe_tax_cents != null ? `Tax ${formatMoney(order.stripe_tax_cents, order.currency)}` : "",
    ].filter(Boolean).join(" · ") : null],
    ["Paid", order.stripe_paid_at ? new Date(order.stripe_paid_at).toLocaleString() : null],
    ["Issue", order.payment_issue ? `${humanize(order.payment_issue)}${order.payment_issue_at ? ` · ${relativeAge(order.payment_issue_at)}` : ""}` : null],
    ["Stripe", dashboard || order.stripe_checkout_session_id],
  ]);
  renderProofCard(order);
  renderPrintCard(order);
  renderStatusForm(order);
}

function renderOrderSteps(order) {
  const current = ORDER_FLOW.indexOf(order.status);
  document.querySelector("#order-steps").replaceChildren(...ORDER_FLOW.map((status, index) => {
    const item = document.createElement("li");
    item.className = order.status === "cancelled" ? "is-cancelled" : index < current ? "is-done" : index === current ? "is-current" : "";
    item.textContent = ORDER_STATUS_LABELS[status];
    if (index === current) item.setAttribute("aria-current", "step");
    return item;
  }));
}

function renderCharacters(order) {
  const assets = order.monster_assets || {};
  const character = order.child_character || {};
  const childCaption = character.included
    ? [character.label, character.ageBandLabel, character.mobilityAid && character.mobilityAid !== "none" ? character.mobilityAidLabel : ""].filter(Boolean).join(" · ")
    : "Monster only (no child character)";
  const tiles = [
    { label: "Chosen monster", caption: order.monster_name || "", url: assets.selectedPreviewUrl, empty: "Monster image unavailable" },
    { label: "Child character", caption: childCaption, url: character.included ? order.child_image_url : null, empty: character.included ? "Render not saved with this order" : "Not included" },
    { label: "Original drawing", caption: "Customer upload", url: assets.originalUrl, empty: "Drawing unavailable" },
  ];
  document.querySelector("#order-characters").replaceChildren(...tiles.map((tile) => {
    const figure = document.createElement("figure");
    figure.className = tile.url ? "" : "is-empty";
    if (tile.url) {
      const anchor = document.createElement("a");
      anchor.href = tile.url;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      const image = document.createElement("img");
      image.src = tile.url;
      image.alt = `${tile.label}: ${tile.caption}`;
      image.loading = "lazy";
      anchor.append(image);
      figure.append(anchor);
    } else {
      const empty = document.createElement("div");
      empty.className = "order-image-empty";
      empty.textContent = tile.empty;
      figure.append(empty);
    }
    const caption = document.createElement("figcaption");
    caption.innerHTML = "<strong></strong><small></small>";
    caption.querySelector("strong").textContent = tile.label;
    caption.querySelector("small").textContent = tile.caption;
    figure.append(caption);
    return figure;
  }));
}

function renderProofCard(order) {
  const proof = order.customer_proof_status || "not_ready";
  const blocked = Boolean(order.payment_issue);
  const approved = Boolean(order.proof_fingerprint && order.proof_approved_at);
  const states = {
    not_ready: "No proof has been published yet.",
    ready: `Published ${order.customer_proof_ready_at ? relativeAge(order.customer_proof_ready_at) : ""} · waiting for the customer to approve.`,
    changes_requested: `Customer requested changes${order.customer_proof_revision_notes ? `: “${order.customer_proof_revision_notes}”` : "."}`,
    approved: `Customer approved${order.customer_proof_reviewed_at ? ` ${relativeAge(order.customer_proof_reviewed_at)}` : ""}${order.customer_proof_fingerprint ? ` · PDF ${order.customer_proof_fingerprint.slice(0, 10)}…` : ""}.`,
  };
  document.querySelector("#order-proof-state").textContent = states[proof] || states.not_ready;
  const hasProof = Boolean(order.customer_proof_path);
  document.querySelector("#order-copy-proof").hidden = !hasProof;
  document.querySelector("#order-email-proof").hidden = !hasProof || !order.customer_email;
  document.querySelector("#order-email-proof").textContent = proof === "ready" ? "Resend link by email" : "Email link to customer";
  const canPublish = order.status === "proofing" && !approved && !order.lulu_print_job_id;
  document.querySelector("#order-proof-upload").hidden = !canPublish;
  document.querySelector("#order-publish-proof").disabled = blocked;
  document.querySelector("#order-publish-proof").textContent = hasProof ? "Publish revised proof" : "Publish proof";
}

function renderPrintCard(order) {
  const approved = Boolean(order.proof_fingerprint && order.proof_approved_at);
  const submitted = Boolean(order.lulu_print_job_id);
  const blocked = Boolean(order.payment_issue);
  const state = submitted
    ? "Sent to Lulu."
    : approved
      ? `Proof locked for print ${relativeAge(order.proof_approved_at)} by ${order.proof_approved_by || "MonstersNOW admin"}.`
      : "Not approved for print yet. The customer must approve the proof first.";
  document.querySelector("#order-print-state").textContent = state;
  fillList("#order-print", [
    ["Print job", order.lulu_print_job_id || "Not sent"],
    ["Submitted", order.lulu_submitted_at ? new Date(order.lulu_submitted_at).toLocaleString() : null],
    ["Lulu status", submitted ? placeholder("Live status sync is not connected yet. Check the Lulu dashboard.") : placeholder("Appears after the order is sent to Lulu.")],
    ["Tracking", order.tracking_url ? link(order.tracking_url, order.tracking_number || "Track package ↗", true) : order.tracking_number || placeholder("Added when Lulu shipping updates are connected.")],
  ]);
  const approve = document.querySelector("#order-approve-proof");
  approve.hidden = approved || submitted || order.status !== "proofing";
  approve.disabled = blocked || order.customer_proof_status !== "approved";
  approve.title = order.customer_proof_status === "approved" ? "" : "Available after the customer approves the proof.";
  document.querySelector("#order-revoke-proof").hidden = !approved || submitted;
  const regenerate = document.querySelector("#order-regenerate-print");
  regenerate.hidden = ["checkout_started", "cancelled"].includes(order.status);
  regenerate.disabled = !order.monster_submission_id;
  const shipping = document.querySelector("#order-shipping");
  shipping.hidden = !approved || submitted || order.status !== "approved";
  if (!shipping.hidden) {
    const address = order.shipping_address || {};
    setValue("#lulu-recipient-name", order.shipping_name);
    setValue("#lulu-email", order.customer_email);
    setValue("#lulu-phone", order.shipping_phone);
    setValue("#lulu-street", address.line1);
    setValue("#lulu-city", address.city);
    setValue("#lulu-state", address.state);
    setValue("#lulu-postcode", address.postal_code);
    setValue("#lulu-country", address.country || "US");
    document.querySelector("#order-send-lulu").disabled = blocked;
  }
}

function renderStatusForm(order) {
  const allowed = new Set([order.status, "cancelled"]);
  if (!order.payment_issue) {
    if (order.status === "paid") allowed.add("proofing");
    if (order.status === "printing" && order.lulu_print_job_id) allowed.add("shipped");
    if (order.status === "shipped") allowed.add("completed");
  }
  const select = document.querySelector("#order-status-select");
  select.replaceChildren(...ORDER_STATUSES.filter((status) => allowed.has(status)).map((status) => new Option(status === order.status ? `${ORDER_STATUS_LABELS[status]} (current)` : ORDER_STATUS_LABELS[status], status, false, status === order.status)));
  select.disabled = allowed.size === 1;
  document.querySelector("#order-notes").value = order.notes || "";
}

async function sendOrderUpdate(body, pending) {
  setOrderMessage(pending, "pending");
  const result = await apiRequest(`?resource=orders&id=${encodeURIComponent(selectedOrder.id)}`, { method: "PATCH", body });
  if (!result.order) throw new Error("This order no longer exists. Refresh the list.");
  return result.order;
}

function applyOrderUpdate(update) {
  const { customer_proof_link: _link, print_files: _files, ...fields } = update;
  Object.assign(selectedOrder, fields);
  renderOrderDetail();
  refreshOrderViews();
}

async function saveOrderStatus(event) {
  event.preventDefault();
  if (!selectedOrder) return;
  const status = document.querySelector("#order-status-select").value;
  const notes = document.querySelector("#order-notes").value;
  if (status === "cancelled" && selectedOrder.status !== "cancelled" && !window.confirm("Cancel this order? Refunds are handled separately in Stripe.")) return;
  const button = document.querySelector("#order-save");
  const previous = selectedOrder.status;
  button.disabled = true;
  try {
    const update = await sendOrderUpdate({ status, notes }, "Saving…");
    applyOrderUpdate(update);
    setOrderMessage(update.status !== previous ? `Saved · now ${ORDER_STATUS_LABELS[update.status]}.` : "Saved.", "success");
  } catch (error) { setOrderMessage(error.message, "error"); }
  finally { button.disabled = false; }
}

async function getProofLink() {
  const update = await sendOrderUpdate({ action: "get_customer_proof_link" }, "Creating the private proof link…");
  return update.customer_proof_link;
}

async function copyProofLink() {
  try {
    const url = await getProofLink();
    const copied = await copyOrderText(url, "Private proof link copied.");
    if (!copied) setOrderMessage("Copy the private proof link from the dialog.", "success");
  } catch (error) { setOrderMessage(error.message, "error"); }
}

/** Opens a prefilled email in the operator's mail app. Nothing is sent automatically. */
async function emailProofLink() {
  try {
    const url = await getProofLink();
    const order = selectedOrder;
    const subject = `Your MonstersNOW book proof is ready: ${order.child_name} + ${order.monster_name}`;
    const body = [
      "Hi,",
      "",
      `The proof for ${order.child_name} and ${order.monster_name}'s book is ready for you to review.`,
      "",
      "Open your private proof link to approve it or request changes:",
      url,
      "",
      "This link is private to your order, so please don't share it.",
      "",
      "Thank you,",
      "MonstersNOW",
    ].join("\n");
    window.location.href = `mailto:${encodeURIComponent(order.customer_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setOrderMessage("Opened a prefilled email in your mail app. Review it and press send there.", "success");
  } catch (error) { setOrderMessage(error.message, "error"); }
}

async function publishProof() {
  const input = document.querySelector("#order-proof-file");
  const file = input.files?.[0];
  if (!file || file.type !== "application/pdf") { setOrderMessage("Choose the exact proof PDF first.", "error"); return; }
  if (file.size > 20 * 1024 * 1024) { setOrderMessage("Choose a PDF smaller than 20 MB.", "error"); return; }
  if (!window.confirm("Publish this exact PDF for the customer? A revision replaces the previous proof and resets the customer's response.")) return;
  const button = document.querySelector("#order-publish-proof");
  button.disabled = true;
  try {
    const proofData = await readFileAsDataUrl(file);
    const update = await sendOrderUpdate({ action: "publish_customer_proof", proofData }, "Fingerprinting and publishing the proof…");
    input.value = "";
    applyOrderUpdate(update);
    const copied = update.customer_proof_link ? await copyOrderText(update.customer_proof_link, "Proof published and its private link copied.") : false;
    if (!copied) setOrderMessage("Proof published. Use “Email link to customer” to send it.", "success");
  } catch (error) { setOrderMessage(error.message, "error"); }
  finally { button.disabled = false; }
}

async function approveProof() {
  if (!window.confirm("Lock the customer-approved proof for printing?")) return;
  try {
    applyOrderUpdate(await sendOrderUpdate({ action: "approve_proof", approvedBy: "MonstersNOW admin" }, "Checking and locking the proof…"));
    setOrderMessage("Proof approved for print. Next: send it to Lulu.", "success");
  } catch (error) { setOrderMessage(error.message, "error"); }
}

async function revokeProof() {
  if (!window.confirm("Revoke the print approval? The order goes back to proofing.")) return;
  try {
    applyOrderUpdate(await sendOrderUpdate({ action: "revoke_proof_approval" }, "Revoking approval…"));
    setOrderMessage("Approval revoked.", "success");
  } catch (error) { setOrderMessage(error.message, "error"); }
}

async function regeneratePrintFiles() {
  const button = document.querySelector("#order-regenerate-print");
  button.disabled = true;
  try {
    const update = await sendOrderUpdate({ action: "regenerate_print_files" }, "Generating fresh print PDF links…");
    const files = update.print_files || {};
    const container = document.querySelector("#order-print-files");
    container.replaceChildren();
    const heading = document.createElement("p");
    heading.textContent = `Fresh signed links (valid 7 days) · ${files.format ? formatLabel(files.format) : ""} · ${files.pageCount || 32} pages`;
    container.append(heading);
    const actions = document.createElement("div");
    actions.className = "order-actions";
    actions.append(link(files.interior, "Open interior PDF ↗", true, "button secondary"));
    if (files.cover) actions.append(link(files.cover, "Open cover PDF ↗", true, "button secondary"));
    container.append(actions);
    if (files.coverError) {
      const note = document.createElement("small");
      note.textContent = `Cover link unavailable: ${files.coverError}`;
      container.append(note);
    }
    container.hidden = false;
    setOrderMessage("Print PDF links generated. Each link renders the current PDF when opened.", "success");
  } catch (error) { setOrderMessage(error.message, "error"); }
  finally { button.disabled = !selectedOrder?.monster_submission_id; }
}

async function sendToLulu() {
  const values = {
    name: document.querySelector("#lulu-recipient-name").value.trim(),
    email: document.querySelector("#lulu-email").value.trim(),
    phone_number: document.querySelector("#lulu-phone").value.trim(),
    street1: document.querySelector("#lulu-street").value.trim(),
    city: document.querySelector("#lulu-city").value.trim(),
    state_code: document.querySelector("#lulu-state").value.trim(),
    postcode: document.querySelector("#lulu-postcode").value.trim(),
    country_code: document.querySelector("#lulu-country").value.trim().toUpperCase(),
  };
  const missing = Object.entries(values).filter(([key, value]) => !value && key !== "state_code").map(([key]) => humanize(key));
  if (missing.length) { setOrderMessage(`Complete the shipping fields: ${missing.join(", ")}.`, "error"); return; }
  if (!window.confirm("Validate the print PDFs and create this print job in Lulu Sandbox?")) return;
  const button = document.querySelector("#order-send-lulu");
  button.disabled = true;
  try {
    const update = await sendOrderUpdate({ action: "submit_to_lulu", shippingLevel: document.querySelector("#lulu-shipping-level").value, shippingAddress: values }, "Lulu is validating the cover and interior PDFs…");
    applyOrderUpdate(update);
    setOrderMessage(`Sent to Lulu Sandbox · print job ${update.lulu_print_job_id}.`, "success");
  } catch (error) { setOrderMessage(error.message, "error"); }
  finally { button.disabled = false; }
}

// ---- small helpers ----

function setOrderMessage(text, kind = "") {
  orderMessage.textContent = text;
  orderMessage.className = `order-panel-message${kind ? ` is-${kind}` : ""}`;
}

async function copyOrderText(value, success) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); setOrderMessage(success, "success"); return true; } catch {}
  }
  window.prompt("Copy:", value);
  return false;
}

function fillList(selector, rows) {
  const list = document.querySelector(selector);
  list.replaceChildren();
  rows.filter(([, value]) => value !== null && value !== undefined && value !== "").forEach(([label, value]) => {
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    if (value instanceof Node) detail.append(value);
    else detail.textContent = value;
    list.append(term, detail);
  });
}

function link(href, text, external = false, className = "") {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.textContent = text;
  if (className) anchor.className = className;
  if (external) { anchor.target = "_blank"; anchor.rel = "noopener"; }
  return anchor;
}

function placeholder(text) {
  const span = document.createElement("span");
  span.className = "order-placeholder";
  span.textContent = text;
  return span;
}

function setStatusChip(element, status) {
  element.className = `status-chip is-${status}`;
  element.textContent = ORDER_STATUS_LABELS[status] || humanize(status);
}

function setPaymentChip(element, order) {
  const kind = order.payment_issue ? "issue" : order.stripe_paid_at || !["checkout_started", "cancelled"].includes(order.status) ? "paid" : "unpaid";
  element.className = `pay-chip is-${kind}`;
  element.textContent = order.payment_issue ? humanize(order.payment_issue) : kind === "paid" ? "Paid" : "Unpaid";
}

function paymentLabel(order) {
  if (order.payment_issue) return `Blocked · ${humanize(order.payment_issue)}`;
  if (order.stripe_paid_at) return "Paid (verified by Stripe)";
  if (order.status === "checkout_started") return "Not paid yet";
  return order.stripe_payment_status ? humanize(order.stripe_payment_status) : "Not recorded";
}

function setValue(selector, value) { document.querySelector(selector).value = value || ""; }
function shortId(id) { return String(id || "").slice(0, 8); }
function humanize(value) { const text = String(value || "").replaceAll("_", " "); return text.charAt(0).toUpperCase() + text.slice(1); }
function formatLabel(format) { return format === "hardcover" ? "Hardcover" : "Softcover"; }
function hoursSince(value) { const time = new Date(value).getTime(); return Number.isFinite(time) ? Math.max(0, (Date.now() - time) / 3600000) : 0; }
function isTestOrder(order) { return String(order.submission_id || "").startsWith("test-") || /"testOrder":true/.test(order.notes || ""); }
