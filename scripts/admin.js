const login = document.querySelector("#admin-login");
const loginForm = document.querySelector("#admin-login-form");
const passwordInput = document.querySelector("#admin-password");
const loginStatus = document.querySelector("#admin-login-status");
const adminApp = document.querySelector("#admin-app");
const dashboard = document.querySelector("#admin-dashboard");
const admin = document.querySelector("#story-admin");
const ordersAdmin = document.querySelector("#orders-admin");
const newStoryButton = document.querySelector("#new-story");
const storyList = document.querySelector("#story-list");
const storyCount = document.querySelector("#story-count");
const editor = document.querySelector("#story-editor");
const empty = document.querySelector("#story-empty");
const editorStatus = document.querySelector("#story-editor-status");
const pagesContainer = document.querySelector("#story-pages");
let stories = [];
let orders = [];
let manuscriptFile = null;
let storyDirty = false;
let loadingStory = false;
let storyRevision = 0;
let savingStory = false;
let selectedOrder = null;
const orderStatuses = ["checkout_started", "paid", "proofing", "approved", "printing", "shipped", "completed", "cancelled"];
const orderDialog = document.querySelector("#order-detail");
editor.addEventListener("submit", (event) => event.preventDefault());
editor.addEventListener("input", (event) => { if (!event.target.id.startsWith("sample-")) markStoryDirty(); refreshPageTools(); });
window.addEventListener("beforeunload", (event) => { if (storyDirty) { event.preventDefault(); event.returnValue = ""; } });
["story-search", "story-filter"].forEach((id) => document.getElementById(id).addEventListener("input", renderStoryList));
document.querySelector("#order-search").addEventListener("input", renderOrders);
document.querySelector("#close-order-detail").addEventListener("click", closeOrderDetail);
orderDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeOrderDetail(); });
document.querySelector("#order-detail-form").addEventListener("submit", saveOrderDetail);
let adminPassword = sessionStorage.getItem("monstersnow_admin_password") || "";

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminPassword = passwordInput.value;
  await openLibrary();
});
newStoryButton.addEventListener("click", () => editStory());
document.querySelector("#dashboard-new-story").addEventListener("click", () => { showView("stories"); editStory(); });
document.querySelector("#halloween-story").addEventListener("click", () => { showView("stories"); editStory({ title_template: "{child_name} and {monster_name}'s Halloween Adventure", slug: "halloween-adventure", description: "A playful Halloween quest filled with costumes, pumpkins, and friendly surprises.", is_seasonal: true, available_from: "2026-09-15", available_until: "2026-10-31", pages: [] }); });
document.querySelector("#toggle-admin-password").addEventListener("click", togglePassword);
document.querySelector("#admin-sign-out").addEventListener("click", signOut);
document.querySelector("#order-filter").addEventListener("change", renderOrders);
document.querySelectorAll("[data-admin-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.adminView)));
document.querySelectorAll("[data-open-stories]").forEach((button) => button.addEventListener("click", () => showView("stories")));
document.querySelector("#add-page").addEventListener("click", () => addPage());
document.querySelector("#save-draft").addEventListener("click", () => saveStory("draft"));
document.querySelector("#publish-story").addEventListener("click", () => saveStory("published"));
document.querySelector("#show-manuscript-import").addEventListener("click", () => setManuscriptImportOpen(true));
document.querySelector("#cancel-manuscript-import").addEventListener("click", () => setManuscriptImportOpen(false));
document.querySelector("#manuscript-file").addEventListener("change", updateManuscriptFile);
document.querySelector("#import-manuscript").addEventListener("click", importManuscript);
const manuscriptDrop = document.querySelector(".manuscript-drop");
manuscriptDrop.addEventListener("dragover", (event) => { event.preventDefault(); manuscriptDrop.classList.add("is-dragging"); });
manuscriptDrop.addEventListener("dragleave", () => manuscriptDrop.classList.remove("is-dragging"));
manuscriptDrop.addEventListener("drop", handleManuscriptDrop);

if (adminPassword) openLibrary();

async function openLibrary() {
  loginStatus.textContent = "Opening story library...";
  try {
    const [storyResult, orderResult] = await Promise.all([apiRequest(), apiRequest("?resource=orders")]);
    stories = storyResult.stories || [];
    orders = orderResult.orders || [];
    sessionStorage.setItem("monstersnow_admin_password", adminPassword);
    login.hidden = true;
    adminApp.hidden = false;
    renderStoryList();
    renderDashboard();
    renderOrders();
    showView("dashboard");
  } catch (error) {
    sessionStorage.removeItem("monstersnow_admin_password");
    loginStatus.textContent = error.message;
  }
}

function showView(view) {
  dashboard.hidden = view !== "dashboard";
  admin.hidden = view !== "stories";
  ordersAdmin.hidden = view !== "orders";
  document.querySelector("#admin-view-title").textContent = view === "stories" ? "Stories" : view === "orders" ? "Orders" : "Dashboard";
  document.querySelectorAll("[data-admin-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.adminView === view));
  if (view === "stories" && editor.hidden && stories[0]) editStory(stories[0]);
}

function renderDashboard() {
  const productionStatuses = new Set(["proofing", "approved", "printing"]);
  document.querySelector("#metric-orders").textContent = orders.length;
  document.querySelector("#metric-production").textContent = orders.filter((order) => productionStatuses.has(order.status)).length;
  document.querySelector("#metric-published").textContent = stories.filter((story) => story.status === "published").length;
  document.querySelector("#metric-drafts").textContent = stories.filter((story) => story.status === "draft").length;
  document.querySelector("#nav-story-count").textContent = stories.length;
  document.querySelector("#nav-order-count").textContent = orders.length;
  const recent = document.querySelector("#recent-stories");
  if (!stories.length) {
    recent.innerHTML = '<div class="admin-inline-empty"><strong>No stories yet</strong><span>Create the Halloween story to get started.</span></div>';
    return;
  }
  recent.replaceChildren(...stories.slice(0, 4).map((story) => {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = '<span><strong></strong><small></small></span><em></em>';
    button.querySelector("strong").textContent = story.title_template;
    button.querySelector("small").textContent = `${(story.pages || []).length}/32 pages · Version ${story.version}`;
    button.querySelector("em").textContent = story.status;
    button.addEventListener("click", () => { showView("stories"); editStory(story); });
    return button;
  }));
}

function renderStoryList() {
  storyCount.textContent = String(stories.length);
  const query = document.querySelector("#story-search").value.trim().toLowerCase();
  const filter = document.querySelector("#story-filter").value;
  const visible = stories.filter((story) => (filter === "all" || story.status === filter) && `${story.title_template} ${story.slug} ${story.description}`.toLowerCase().includes(query));
  storyList.replaceChildren(...visible.map((story) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "story-list-item";
    button.classList.toggle("is-active", story.id === document.querySelector("#story-id").value);
    button.innerHTML = `<strong></strong><span></span>`;
    button.querySelector("strong").textContent = story.title_template;
    button.querySelector("span").textContent = `${story.status} · ${(story.pages || []).filter((page) => page.text?.trim() && page.illustrationPrompt?.trim()).length}/32 ready · v${story.version}`;
    button.addEventListener("click", () => editStory(story));
    return button;
  }));
  if (!visible.length) storyList.textContent = "No matching stories.";
  empty.hidden = stories.length > 0;
  renderDashboard();
}

function renderOrders() {
  const filter = document.querySelector("#order-filter").value;
  const query = document.querySelector("#order-search").value.trim().toLowerCase();
  const visible = orders.filter((order) => (filter === "all" || order.status === filter) && [order.customer_email, order.child_name, order.monster_name, order.story_label, order.id].join(" ").toLowerCase().includes(query));
  const body = document.querySelector("#orders-list");
  document.querySelector("#orders-empty").hidden = visible.length > 0;
  body.replaceChildren(...visible.map((order) => {
    const row = document.createElement("tr");
    row.innerHTML = '<td><strong></strong><small></small></td><td><strong></strong><small></small></td><td></td><td></td><td></td><td><button class="button secondary" type="button"></button></td>';
    const cells = row.children;
    cells[0].querySelector("strong").textContent = order.customer_email;
    cells[0].querySelector("small").textContent = `For ${order.child_name}`;
    cells[1].querySelector("strong").textContent = order.monster_name;
    cells[1].querySelector("small").textContent = order.story_label;
    cells[2].textContent = order.format_id === "hardcover" ? "Hardcover" : "Softcover";
    cells[3].textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency }).format(order.amount_cents / 100);
    cells[4].textContent = new Date(order.created_at).toLocaleDateString();
    const button = cells[5].querySelector("button");
    button.textContent = `${order.status.replaceAll("_", " ")} →`;
    button.setAttribute("aria-label", `Open order for ${order.child_name}`);
    button.addEventListener("click", () => openOrderDetail(order));
    return row;
  }));
}

async function updateOrderStatus(order, status) {
  const output = document.querySelector("#orders-status");
  output.textContent = "Updating order...";
  try {
    const result = await apiRequest(`?resource=orders&id=${encodeURIComponent(order.id)}`, { method: "PATCH", body: { status } });
    Object.assign(order, result.order);
    output.textContent = `Order moved to ${status.replaceAll("_", " ")}.`;
    renderOrders();
  } catch (error) { output.textContent = error.message; }
}

function editStory(story = null) {
  if (savingStory) { editorStatus.textContent = "Wait for this story to finish saving before switching."; return; }
  if (storyDirty && !window.confirm("Discard unsaved story changes?")) return;
  loadingStory = true;
  empty.hidden = true;
  editor.hidden = false;
  document.querySelector("#story-id").value = story?.id || "";
  document.querySelector("#story-title").value = story?.title_template || "";
  document.querySelector("#story-slug").value = story?.slug || "";
  document.querySelector("#story-description").value = story?.description || "";
  document.querySelector("#story-seasonal").checked = Boolean(story?.is_seasonal);
  document.querySelector("#story-from").value = story?.available_from || "";
  document.querySelector("#story-until").value = story?.available_until || "";
  document.querySelector("#story-editor-title").textContent = story ? story.title_template : "New master story";
  pagesContainer.replaceChildren();
  (story?.pages?.length ? story.pages : [{ text: "", illustrationPrompt: "" }]).forEach(addPage);
  setManuscriptImportOpen(false);
  editorStatus.textContent = "";
  loadingStory = false;
  storyDirty = false;
  document.querySelector("#story-save-state").textContent = story?.id ? "Saved" : "New draft · not saved";
  refreshPageTools();
  renderStoryList();
}

function setManuscriptImportOpen(open) {
  const panel = document.querySelector("#manuscript-import");
  panel.hidden = !open;
  document.querySelector("#show-manuscript-import").setAttribute("aria-expanded", String(open));
  if (!open) {
    manuscriptFile = null;
    document.querySelector("#manuscript-file").value = "";
    document.querySelector("#manuscript-file-name").textContent = "or drop a file here";
    document.querySelector("#import-manuscript").disabled = true;
    document.querySelector("#manuscript-import-status").textContent = "";
  }
}

function updateManuscriptFile(event) {
  const file = event.target.files?.[0];
  manuscriptFile = file || null;
  displayManuscriptFile(file);
}

function handleManuscriptDrop(event) {
  event.preventDefault();
  manuscriptDrop.classList.remove("is-dragging");
  manuscriptFile = event.dataTransfer?.files?.[0] || null;
  displayManuscriptFile(manuscriptFile);
}

function displayManuscriptFile(file) {
  document.querySelector("#manuscript-file-name").textContent = file ? `${file.name} · ${formatFileSize(file.size)}` : "or drop a file here";
  document.querySelector("#import-manuscript").disabled = !file;
  document.querySelector("#manuscript-import-status").textContent = file?.size > 3 * 1024 * 1024 ? "Choose a file smaller than 3 MB." : "";
}

async function importManuscript() {
  const file = manuscriptFile;
  const status = document.querySelector("#manuscript-import-status");
  const button = document.querySelector("#import-manuscript");
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) {
    status.textContent = "Choose a file smaller than 3 MB.";
    return;
  }
  const hasCopy = [...pagesContainer.querySelectorAll("textarea")].some((area) => area.value.trim());
  if (hasCopy && !window.confirm("Replace the current page text with the imported manuscript?")) return;

  button.disabled = true;
  status.textContent = "Reading manuscript...";
  try {
    const data = await readFileAsDataUrl(file);
    const result = await apiRequest("?resource=manuscript", { method: "POST", body: { name: file.name, type: file.type, data } });
    pagesContainer.replaceChildren();
    result.pages.forEach(addPage);
    if (result.title && !document.querySelector("#story-title").value.trim()) document.querySelector("#story-title").value = result.title;
    if (result.description && !document.querySelector("#story-description").value.trim()) document.querySelector("#story-description").value = result.description;
    renumberPages();
    markStoryDirty();
    refreshPageTools();
    status.textContent = `${result.pages.length} page${result.pages.length === 1 ? "" : "s"} imported from ${result.fileName}.${result.truncated ? " Only the first 32 pages were included." : " Review every page before saving."}`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The manuscript file could not be read."));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function addPage(page = {}) {
  if (pagesContainer.children.length >= 32) return;
  const card = document.createElement("section");
  card.className = "story-page-card";
  card.innerHTML = `<div><strong>Page <span></span></strong><button type="button">Remove</button></div><label>Story text<textarea rows="3" maxlength="2000"></textarea></label><label>Illustration direction<textarea rows="3" maxlength="3000"></textarea></label>`;
  card.querySelector("span").textContent = String(pagesContainer.children.length + 1);
  const areas = card.querySelectorAll("textarea");
  areas[0].value = page.text || "";
  areas[1].value = page.illustrationPrompt || "";
  card.querySelector("button").addEventListener("click", () => { card.remove(); renumberPages(); markStoryDirty(); refreshPageTools(); });
  pagesContainer.append(card);
  if (!loadingStory) { markStoryDirty(); refreshPageTools(); }
}

function renumberPages() {
  [...pagesContainer.children].forEach((card, index) => { card.querySelector("span").textContent = String(index + 1); });
}

async function saveStory(status) {
  if (savingStory) return;
  if (!editor.reportValidity()) return;
  if (status === "published" && (pagesContainer.children.length !== 32 || [...pagesContainer.querySelectorAll("textarea")].some((area) => !area.value.trim()))) {
    editorStatus.textContent = "Complete all 32 pages with story text and illustration direction before publishing. You can save a draft at any time.";
    return;
  }
  const id = document.querySelector("#story-id").value;
  const payload = {
    title_template: document.querySelector("#story-title").value,
    slug: document.querySelector("#story-slug").value,
    description: document.querySelector("#story-description").value,
    status,
    is_seasonal: document.querySelector("#story-seasonal").checked,
    available_from: document.querySelector("#story-from").value || null,
    available_until: document.querySelector("#story-until").value || null,
    pages: [...pagesContainer.children].map((card) => {
      const areas = card.querySelectorAll("textarea");
      return { text: areas[0].value, illustrationPrompt: areas[1].value };
    }),
  };
  editorStatus.textContent = status === "published" ? "Publishing..." : "Saving draft...";
  const saveButtons = [document.querySelector("#save-draft"), document.querySelector("#publish-story")];
  saveButtons.forEach((button) => { button.disabled = true; });
  const submittedRevision = storyRevision;
  savingStory = true;
  try {
    const result = await apiRequest(id ? `?id=${encodeURIComponent(id)}` : "", { method: id ? "PATCH" : "PUT", body: payload });
    const index = stories.findIndex((story) => story.id === result.story.id);
    if (index >= 0) stories[index] = result.story; else stories.unshift(result.story);
    savingStory = false;
    if (storyRevision === submittedRevision) {
      storyDirty = false;
      editStory(result.story);
      editorStatus.textContent = status === "published" ? "Story published." : "Draft saved.";
    } else {
      document.querySelector("#story-id").value = result.story.id;
      renderStoryList();
      editorStatus.textContent = "Saved. Your newer edits still need saving.";
    }
  } catch (error) {
    editorStatus.textContent = error.message;
  } finally {
    savingStory = false;
    saveButtons.forEach((button) => { button.disabled = false; });
  }
}

function togglePassword() {
  const showing = passwordInput.type === "text";
  passwordInput.type = showing ? "password" : "text";
  document.querySelector("#toggle-admin-password").textContent = showing ? "Show" : "Hide";
  document.querySelector("#toggle-admin-password").setAttribute("aria-label", showing ? "Show password" : "Hide password");
}

function signOut() {
  if (savingStory) { editorStatus.textContent = "Wait for the story to finish saving before signing out."; return; }
  if (storyDirty && !window.confirm("Sign out and discard unsaved story changes?")) return;
  storyDirty = false;
  sessionStorage.removeItem("monstersnow_admin_password");
  adminPassword = "";
  passwordInput.value = "";
  adminApp.hidden = true;
  login.hidden = false;
  loginStatus.textContent = "Signed out.";
  passwordInput.focus();
}

async function apiRequest(query = "", options = {}) {
  const response = await fetch(`/api/storybook-interest${query}`, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The story library could not be opened.");
  return result;
}

function markStoryDirty() {
  if (loadingStory) return;
  storyDirty = true;
  storyRevision += 1;
  document.querySelector("#story-save-state").textContent = "Unsaved changes";
}

function refreshPageTools() {
  const cards = [...pagesContainer.children];
  const ready = cards.filter((card) => [...card.querySelectorAll("textarea")].every((area) => area.value.trim())).length;
  document.querySelector("#page-progress").textContent = `${ready} of 32 pages ready · ${cards.length} added`;
  document.querySelector("#add-page").disabled = cards.length >= 32;
  document.querySelector("#page-nav").replaceChildren(...cards.map((card, index) => {
    card.id = `book-page-${index + 1}`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = index + 1;
    const complete = [...card.querySelectorAll("textarea")].every((area) => area.value.trim());
    button.className = complete ? "is-ready" : "";
    button.setAttribute("aria-label", `Page ${index + 1}, ${complete ? "ready" : "incomplete"}`);
    button.addEventListener("click", () => { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.querySelector("textarea").focus({ preventScroll: true }); });
    return button;
  }));
  const child = document.querySelector("#sample-child").value || "Alex";
  const monster = document.querySelector("#sample-monster").value || "Milo";
  const preview = document.querySelector("#story-preview");
  preview.replaceChildren(...cards.map((card, index) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = `Page ${index + 1}: ${card.querySelector("textarea").value.replaceAll("{child_name}", child).replaceAll("{monster_name}", monster) || "No story text yet."}`;
    return paragraph;
  }));
}

function openOrderDetail(order) {
  selectedOrder = order;
  document.querySelector("#order-detail-id").textContent = `Order ${order.id}`;
  const fields = { Customer: order.customer_email, Child: order.child_name, Monster: order.monster_name, Story: order.story_label, Format: order.format_id, Style: order.monster_style, Created: new Date(order.created_at).toLocaleString(), "Stripe checkout": order.stripe_checkout_session_id || "Not recorded", "Preview ID": order.selected_preview_id || "Not recorded" };
  const list = document.querySelector("#order-detail-fields");
  list.replaceChildren();
  Object.entries(fields).forEach(([label, value]) => { const term = document.createElement("dt"); const detail = document.createElement("dd"); term.textContent = label; detail.textContent = value || "—"; list.append(term, detail); });
  const select = document.querySelector("#order-detail-status");
  select.replaceChildren(...orderStatuses.map((status) => new Option(status === "paid" ? "Paid (manually verified)" : status.replaceAll("_", " "), status, false, status === order.status)));
  document.querySelector("#order-detail-notes").value = order.notes || "";
  document.querySelector("#order-detail-message").textContent = "";
  orderDialog.showModal();
}

function closeOrderDetail() {
  const notes = document.querySelector("#order-detail-notes").value;
  const status = document.querySelector("#order-detail-status").value;
  if (selectedOrder && (notes !== (selectedOrder.notes || "") || status !== selectedOrder.status) && !window.confirm("Discard unsaved order changes?")) return;
  orderDialog.close();
  selectedOrder = null;
}

async function saveOrderDetail(event) {
  event.preventDefault();
  if (!selectedOrder) return;
  const order = selectedOrder;
  const button = document.querySelector("#save-order-detail");
  const message = document.querySelector("#order-detail-message");
  const status = document.querySelector("#order-detail-status").value;
  if (status === "paid" && order.status !== "paid" && !window.confirm("Have you verified this payment in Stripe? This does not charge the customer.")) return;
  button.disabled = true;
  message.textContent = "Saving order…";
  try {
    const result = await apiRequest(`?resource=orders&id=${encodeURIComponent(order.id)}`, { method: "PATCH", body: { status, notes: document.querySelector("#order-detail-notes").value } });
    if (!result.order) throw new Error("This order no longer exists. Refresh the dashboard.");
    Object.assign(order, result.order);
    renderOrders();
    renderDashboard();
    message.textContent = "Order saved.";
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
}
