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
  storyList.replaceChildren(...stories.map((story) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "story-list-item";
    button.innerHTML = `<strong></strong><span></span>`;
    button.querySelector("strong").textContent = story.title_template;
    button.querySelector("span").textContent = `${story.status} · v${story.version}`;
    button.addEventListener("click", () => editStory(story));
    return button;
  }));
  empty.hidden = stories.length > 0;
  renderDashboard();
}

function renderOrders() {
  const filter = document.querySelector("#order-filter").value;
  const visible = filter === "all" ? orders : orders.filter((order) => order.status === filter);
  const body = document.querySelector("#orders-list");
  document.querySelector("#orders-empty").hidden = visible.length > 0;
  body.replaceChildren(...visible.map((order) => {
    const row = document.createElement("tr");
    row.innerHTML = '<td><strong></strong><small></small></td><td><strong></strong><small></small></td><td></td><td></td><td></td><td><select></select></td>';
    const cells = row.children;
    cells[0].querySelector("strong").textContent = order.customer_email;
    cells[0].querySelector("small").textContent = `For ${order.child_name}`;
    cells[1].querySelector("strong").textContent = order.monster_name;
    cells[1].querySelector("small").textContent = order.story_label;
    cells[2].textContent = order.format_id === "hardcover" ? "Hardcover" : "Softcover";
    cells[3].textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency }).format(order.amount_cents / 100);
    cells[4].textContent = new Date(order.created_at).toLocaleDateString();
    const select = cells[5].querySelector("select");
    ["checkout_started", "paid", "proofing", "approved", "printing", "shipped", "completed", "cancelled"].forEach((status) => select.add(new Option(status.replaceAll("_", " "), status, false, status === order.status)));
    select.addEventListener("change", () => updateOrderStatus(order, select.value));
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
  card.querySelector("button").addEventListener("click", () => { card.remove(); renumberPages(); });
  pagesContainer.append(card);
}

function renumberPages() {
  [...pagesContainer.children].forEach((card, index) => { card.querySelector("span").textContent = String(index + 1); });
}

async function saveStory(status) {
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
  try {
    const result = await apiRequest(id ? `?id=${encodeURIComponent(id)}` : "", { method: id ? "PATCH" : "PUT", body: payload });
    const index = stories.findIndex((story) => story.id === result.story.id);
    if (index >= 0) stories[index] = result.story; else stories.unshift(result.story);
    renderStoryList();
    editStory(result.story);
    editorStatus.textContent = status === "published" ? "Story published." : "Draft saved.";
  } catch (error) {
    editorStatus.textContent = error.message;
  }
}

function togglePassword() {
  const showing = passwordInput.type === "text";
  passwordInput.type = showing ? "password" : "text";
  document.querySelector("#toggle-admin-password").textContent = showing ? "Show" : "Hide";
  document.querySelector("#toggle-admin-password").setAttribute("aria-label", showing ? "Show password" : "Hide password");
}

function signOut() {
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
