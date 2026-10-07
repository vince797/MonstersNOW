const login = document.querySelector("#admin-login");
const loginForm = document.querySelector("#admin-login-form");
const passwordInput = document.querySelector("#admin-password");
const paymentNotice = document.querySelector(".order-payment-notice");
if (paymentNotice) paymentNotice.textContent = "Payment status is controlled by verified Stripe events. Unpaid orders cannot advance to production.";
const loginStatus = document.querySelector("#admin-login-status");
const adminApp = document.querySelector("#admin-app");
const dashboard = document.querySelector("#admin-dashboard");
const admin = document.querySelector("#story-admin");
const ordersAdmin = document.querySelector("#orders-admin");
const customersAdmin = document.querySelector("#customers-admin");
const monstersAdmin = document.querySelector("#monsters-admin");
const masterMonstersAdmin = document.querySelector("#master-monsters-admin");
const newStoryButton = document.querySelector("#new-story");
const storyList = document.querySelector("#story-list");
const storyCount = document.querySelector("#story-count");
const editor = document.querySelector("#story-editor");
const empty = document.querySelector("#story-empty");
const editorStatus = document.querySelector("#story-editor-status");
const pagesContainer = document.querySelector("#story-pages");
let stories = [];
let orders = [];
let monsters = [];
let masterMonsterManifest = null;
let masterMonsterManifestError = "";
let posePipelineAvailable = false;
let bookReviewFiles = [];
let bookReviewFilesError = "";
let manuscriptFile = null;
let storyDirty = false;
let loadingStory = false;
let storyRevision = 0;
let savingStory = false;
let storyAutosaveTimer = null;
let selectedOrder = null;
let orderView = "board";
let orderQuickFilter = "all";
let selectedPageIndex = 0;
let artworkFilter = "all";
let productionReport = null;
const orderStatuses = ["checkout_started", "paid", "proofing", "approved", "printing", "shipped", "completed", "cancelled"];
const orderDialog = document.querySelector("#order-detail");
const artworkDialog = document.querySelector("#artwork-overview");
const storyReviewDialog = document.querySelector("#story-review");
const commandDialog = document.querySelector("#admin-command");
const commandInput = document.querySelector("#admin-command-input");
const commandResults = document.querySelector("#admin-command-results");
let reviewSpreadIndex = 0;
let commandSelection = 0;
const CATALOG_COVERS = {
  "halloween-monster-night": "assets/storybook/cover-series/minimal-concepts/halloween-monster-night-v5-web.jpg",
  "big-adventure": "assets/storybook/cover-series/minimal-concepts/big-adventure-v4-web.jpg",
  "bedtime-monster": "assets/storybook/cover-series/minimal-concepts/bedtime-monster-v5-web.jpg",
  "abc-monster-book": "assets/storybook/cover-series/minimal-concepts/abc-monster-book-v4-web.jpg",
  "counting-with-my-monster": "assets/storybook/cover-series/minimal-concepts/counting-with-my-monster-v4-web.jpg",
  "the-monster-who-lost-their-glow": "assets/storybook/cover-series/minimal-concepts/the-monster-who-lost-their-glow-v5-web.jpg",
  "birthday-monster-adventure": "assets/storybook/cover-series/minimal-concepts/birthday-monster-adventure-v4-web.jpg",
};
editor.addEventListener("submit", (event) => event.preventDefault());
editor.addEventListener("input", (event) => {
  if (!event.target.id.startsWith("sample-") && !event.target.matches("[data-artwork-file]")) markStoryDirty();
  if (event.target.id === "story-slug" || event.target.id === "story-title") {
    document.querySelector("#story-editor-title").textContent = document.querySelector("#story-title").value || "New master story";
    updateCoverPreview(document.querySelector("#story-slug").value);
  }
  refreshPageTools();
});
window.addEventListener("beforeunload", (event) => { if (storyDirty) { event.preventDefault(); event.returnValue = ""; } });
["story-search", "story-filter"].forEach((id) => document.getElementById(id).addEventListener("input", renderStoryList));
document.querySelector("#order-search").addEventListener("input", renderOrders);
document.querySelector("#customer-search").addEventListener("input", renderCustomers);
document.querySelector("#monster-search").addEventListener("input", renderMonsters);
document.querySelector("#monster-filter").addEventListener("change", renderMonsters);
document.querySelector("#monster-sort").addEventListener("change", renderMonsters);
document.querySelectorAll("[data-order-view]").forEach((button) => button.addEventListener("click", () => { orderView = button.dataset.orderView; renderOrders(); }));
document.querySelectorAll("[data-order-quick-filter]").forEach((button) => button.addEventListener("click", () => { orderQuickFilter = button.dataset.orderQuickFilter; renderOrders(); }));
document.querySelector("#close-order-detail").addEventListener("click", closeOrderDetail);
orderDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeOrderDetail(); });
document.querySelector("#order-detail-form").addEventListener("submit", saveOrderDetail);
document.querySelector("#advance-order").addEventListener("click", advanceSelectedOrder);
document.querySelector("#approve-order-proof").addEventListener("click", approveSelectedOrderProof);
document.querySelector("#revoke-order-proof").addEventListener("click", revokeSelectedOrderProof);
document.querySelector("#send-order-lulu").addEventListener("click", sendSelectedOrderToLulu);
document.querySelector("#publish-customer-proof").addEventListener("click", publishSelectedCustomerProof);
document.querySelector("#copy-customer-proof-link").addEventListener("click", copySelectedCustomerProofLink);
document.querySelector("#open-customer-proof-link").addEventListener("click", openSelectedCustomerProofLink);
document.querySelector("#open-production-interior").addEventListener("click", () => openSelectedProductionFile("interior"));
document.querySelector("#open-production-cover").addEventListener("click", () => openSelectedProductionFile("cover"));
document.querySelector("#proof-review-confirm").addEventListener("change", () => {
  if (selectedOrder) renderProofApproval(selectedOrder);
});
document.querySelector("#open-artwork-overview").addEventListener("click", openArtworkOverview);
document.querySelector("#open-story-review").addEventListener("click", openStoryReview);
document.querySelector("#close-artwork-overview").addEventListener("click", () => artworkDialog.close());
document.querySelector("#close-story-review").addEventListener("click", () => storyReviewDialog.close());
artworkDialog.addEventListener("cancel", (event) => { event.preventDefault(); artworkDialog.close(); });
storyReviewDialog.addEventListener("cancel", (event) => { event.preventDefault(); storyReviewDialog.close(); });
document.querySelector("#review-previous").addEventListener("click", () => { reviewSpreadIndex -= 1; renderStoryReview(); });
document.querySelector("#review-next").addEventListener("click", () => { reviewSpreadIndex += 1; renderStoryReview(); });
["review-child", "review-monster"].forEach((id) => document.querySelector(`#${id}`).addEventListener("input", renderStoryReview));
document.querySelector("#approve-master-story").addEventListener("click", approveMasterStory);
document.querySelectorAll("[data-artwork-filter]").forEach((button) => button.addEventListener("click", () => {
  artworkFilter = button.dataset.artworkFilter;
  renderArtworkOverview();
}));
let adminPassword = sessionStorage.getItem("monstersnow_admin_password") || "";

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminPassword = passwordInput.value;
  await openLibrary();
});
newStoryButton.addEventListener("click", () => editStory());
document.querySelector("#setup-catalog").addEventListener("click", () => setupCatalog({ announce: true }));
document.querySelector("#dashboard-new-story").addEventListener("click", () => { showView("stories"); editStory(); });
document.querySelector("#rail-new-story").addEventListener("click", () => { showView("stories"); editStory(); });
document.querySelector("#halloween-story").addEventListener("click", () => { showView("stories"); editStory({ title_template: "{child_name} and {monster_name}'s Halloween Adventure", slug: "halloween-adventure", description: "A playful Halloween quest filled with costumes, pumpkins, and friendly surprises.", is_seasonal: true, available_from: "2026-09-15", available_until: "2026-10-31", pages: [] }); });
document.querySelector("#download-story-proof").addEventListener("click", downloadCurrentStoryProof);

async function loadProductionReadiness() {
  const overall = document.querySelector("#production-overall");
  const checks = document.querySelector("#production-checks");
  try {
    const response = await fetch("assets/storybook/halloween-monster-night/production-status.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Production status is unavailable");
    const report = await response.json();
    productionReport = report;
    overall.textContent = report.status === "ready" ? "Preflight passed" : "Blocked";
    overall.className = `production-overall is-${report.status}`;
    document.querySelector("#production-format").textContent = report.format;
    document.querySelector("#production-updated").textContent = `Preflight updated ${report.updated}`;
    document.querySelector("#production-next-action").textContent = report.next_action;
    checks.replaceChildren(...report.checks.map((check) => {
      const item = document.createElement("article");
      item.className = `production-check is-${check.status}`;
      item.innerHTML = `<span aria-hidden="true">${check.status === "pass" ? "✓" : "!"}</span><div><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail)}</small></div>`;
      return item;
    }));
  } catch (error) {
    overall.textContent = "Unavailable";
    overall.className = "production-overall is-blocked";
    checks.innerHTML = `<p class="admin-inline-empty">${escapeHtml(error.message)}</p>`;
  }
}

loadProductionReadiness();
document.querySelector("#toggle-admin-password").addEventListener("click", togglePassword);
document.querySelector("#admin-sign-out").addEventListener("click", signOut);
document.querySelector("#order-filter").addEventListener("change", renderOrders);
document.querySelectorAll("[data-admin-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.adminView)));
document.querySelectorAll("[data-open-stories]").forEach((button) => button.addEventListener("click", () => showView("stories")));
document.querySelectorAll("[data-open-orders]").forEach((button) => button.addEventListener("click", () => showView("orders")));
document.querySelectorAll("[data-admin-view-jump]").forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.adminStoryFilter) {
    document.querySelector("#story-filter").value = button.dataset.adminStoryFilter;
    renderStoryList();
  }
  if (button.dataset.adminOrderFilter === "active") orderQuickFilter = "active";
  showView(button.dataset.adminViewJump);
  if (button.dataset.adminViewJump === "orders") renderOrders();
}));
document.querySelector("#open-admin-command").addEventListener("click", openAdminCommand);
document.querySelector("#close-admin-command").addEventListener("click", closeAdminCommand);
commandDialog.addEventListener("click", (event) => { if (event.target === commandDialog) closeAdminCommand(); });
commandInput.addEventListener("input", () => { commandSelection = 0; renderAdminCommand(); });
commandInput.addEventListener("keydown", handleCommandKeys);
document.querySelector("#add-page").addEventListener("click", () => addPage());
document.querySelector("#previous-page").addEventListener("click", () => selectPage(selectedPageIndex - 1, true));
document.querySelector("#next-page").addEventListener("click", () => selectPage(selectedPageIndex + 1, true));
document.querySelector("#sample-child").addEventListener("input", () => renderSelectedSpread());
document.querySelector("#sample-monster").addEventListener("input", () => renderSelectedSpread());
document.querySelector("#save-draft").addEventListener("click", () => saveStory("draft"));
document.querySelector("#publish-story").addEventListener("click", () => saveStory("published"));
document.querySelector("#show-manuscript-import").addEventListener("click", () => setManuscriptImportOpen(true));
document.querySelector("#cancel-manuscript-import").addEventListener("click", () => setManuscriptImportOpen(false));
document.querySelector("#manuscript-file").addEventListener("change", updateManuscriptFile);
document.querySelector("#import-manuscript").addEventListener("click", importManuscript);
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    commandDialog.open ? closeAdminCommand() : openAdminCommand();
    return;
  }
  if (editor.hidden) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveStory("draft");
  }
  if (event.altKey && event.key === "ArrowLeft") selectPage(selectedPageIndex - 1, true);
  if (event.altKey && event.key === "ArrowRight") selectPage(selectedPageIndex + 1, true);
});
const manuscriptDrop = document.querySelector(".manuscript-drop");
manuscriptDrop.addEventListener("dragover", (event) => { event.preventDefault(); manuscriptDrop.classList.add("is-dragging"); });
manuscriptDrop.addEventListener("dragleave", () => manuscriptDrop.classList.remove("is-dragging"));
manuscriptDrop.addEventListener("drop", handleManuscriptDrop);

if (adminPassword) openLibrary();

document.querySelector("#dashboard-date").textContent = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date());

async function openLibrary() {
  const submitButton = loginForm.querySelector('button[type="submit"]');
  loginStatus.className = "is-pending";
  loginStatus.textContent = "Opening story library...";
  submitButton.disabled = true;
  try {
    const reviewFilesPromise = apiRequest("?resource=book-review-files")
      .catch((error) => ({ files: [], error: error.message || "Review files are unavailable." }));
    const masterMonsterPromise = loadMasterMonsterManifest();
    const [storyResult, orderResult, monsterResult, reviewFilesResult, masterMonsterResult] = await Promise.all([
      apiRequest(),
      apiRequest("?resource=orders"),
      apiRequest("?resource=monsters"),
      reviewFilesPromise,
      masterMonsterPromise,
    ]);
    stories = storyResult.stories || [];
    orders = orderResult.orders || [];
    monsters = monsterResult.monsters || [];
    posePipelineAvailable = monsterResult.posePipelineAvailable === true;
    bookReviewFiles = reviewFilesResult.files || [];
    bookReviewFilesError = reviewFilesResult.error || "";
    masterMonsterManifest = masterMonsterResult.manifest;
    masterMonsterManifestError = masterMonsterResult.error || "";
    if (Object.keys(CATALOG_COVERS).some((slug) => !stories.some((story) => story.slug === slug))) {
      const catalogResult = await setupCatalog();
      stories = catalogResult?.stories || stories;
    }
    sessionStorage.setItem("monstersnow_admin_password", adminPassword);
    loginStatus.className = "";
    login.hidden = true;
    adminApp.hidden = false;
    renderStoryList();
    renderDashboard();
    renderOrders();
    renderCustomers();
    renderMonsters();
    renderMasterMonsters();
    showView("dashboard");
  } catch (error) {
    sessionStorage.removeItem("monstersnow_admin_password");
    console.error("Admin sign-in failed", error);
    loginStatus.className = "is-error";
    loginStatus.textContent = formatAdminLoginError(error);
    passwordInput.focus();
    passwordInput.select();
  } finally {
    submitButton.disabled = false;
  }
}

function formatAdminLoginError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  if (message.includes("issued at future") || message.includes("not yet valid") || message.includes("clock")) {
    return "The MonstersNOW database service had a temporary timestamp problem. Your device clock is not the cause. Please try again; if it continues, contact support with the time it happened.";
  }
  if (code === "invalid_admin_password" || message.includes("password")) {
    return "That password wasn’t accepted. Check it and try again.";
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "We couldn’t reach the admin service. Check your connection and try again.";
  }
  return "We couldn’t open the dashboard. Please try again.";
}

function showView(view) {
  dashboard.hidden = view !== "dashboard";
  admin.hidden = view !== "stories";
  ordersAdmin.hidden = view !== "orders";
  customersAdmin.hidden = view !== "customers";
  monstersAdmin.hidden = view !== "monsters";
  masterMonstersAdmin.hidden = view !== "masters";
  const viewCopy = {
    dashboard: ["Overview", "A clear view of the work that needs you."],
    orders: ["Orders", "Move every book from payment to delivery."],
    stories: ["Master Books", "Review character-free backgrounds and editable story text by revision."],
    monsters: ["Gallery Collection", "Review each uploaded drawing beside its storybook transformation and gallery permission."],
    masters: ["Master Monsters", "See the exact still references that define the active generation look."],
    customers: ["Customers", "See families, books, and order history together."],
  };
  const [title, context] = viewCopy[view] || viewCopy.dashboard;
  document.querySelector("#admin-view-title").textContent = title;
  document.querySelector("#admin-view-context").textContent = context;
  document.title = `${title} | MonstersNOW Admin`;
  document.querySelectorAll("[data-admin-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.adminView === view));
  if (view === "stories" && editor.hidden && stories[0]) editStory(stories[0]);
  if (view === "masters") renderMasterMonsters();
}

async function loadMasterMonsterManifest() {
  try {
    const response = await fetch("assets/master-references/master-monsters.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Master reference request failed: ${response.status}`);
    return { manifest: await response.json(), error: "" };
  } catch (error) {
    console.error("Master monster references could not be loaded", error);
    return { manifest: null, error: "The master reference set could not be loaded." };
  }
}

function renderMasterMonsters() {
  const grid = document.querySelector("#master-monsters-grid");
  const supportGrid = document.querySelector("#master-support-grid");
  const status = document.querySelector("#master-monsters-status");
  if (!grid || !supportGrid || !status) return;

  grid.replaceChildren();
  supportGrid.replaceChildren();

  if (!masterMonsterManifest) {
    status.textContent = masterMonsterManifestError || "The master reference set is unavailable.";
    grid.innerHTML = '<div class="admin-inline-empty"><strong>Master references unavailable</strong><span>Refresh Admin to try loading the active set again.</span></div>';
    return;
  }

  const references = Array.isArray(masterMonsterManifest.characterReferences)
    ? masterMonsterManifest.characterReferences
    : [];
  document.querySelector("#nav-master-count").textContent = String(references.length);
  document.querySelector("#master-monster-count").textContent = `${references.length} character master${references.length === 1 ? "" : "s"}`;
  document.querySelector("#master-monster-version").textContent = masterMonsterManifest.version || "Unversioned set";
  document.querySelector("#master-character-summary").textContent = `All ${references.length} are sent with every monster preview.`;

  references.forEach((reference, index) => {
    grid.append(createMasterMonsterCard(reference, index));
  });

  if (masterMonsterManifest.coloringPageReference) {
    supportGrid.append(createMasterMonsterCard(masterMonsterManifest.coloringPageReference, 0, { supporting: true }));
  }

  status.textContent = `${masterMonsterManifest.title || "Master monster set"} is active. The Admin library and preview generator share this manifest.`;
}

function createMasterMonsterCard(reference, index, { supporting = false } = {}) {
  const article = document.createElement("article");
  article.className = supporting ? "master-monster-card is-supporting" : "master-monster-card";

  const imageLink = document.createElement("a");
  imageLink.className = "master-monster-image";
  imageLink.href = reference.src;
  imageLink.target = "_blank";
  imageLink.rel = "noopener";
  imageLink.setAttribute("aria-label", `Open ${reference.label || `master reference ${index + 1}`} full size`);

  const image = document.createElement("img");
  image.src = reference.src;
  image.alt = reference.alt || "";
  image.loading = "lazy";
  image.addEventListener("load", () => {
    const dimensions = article.querySelector("[data-dimensions]");
    if (dimensions) dimensions.textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
  });
  imageLink.append(image);

  const body = document.createElement("div");
  body.className = "master-monster-card-body";
  const heading = document.createElement("header");
  const titleWrap = document.createElement("div");
  const sequence = document.createElement("span");
  sequence.textContent = supporting ? "Supporting reference" : `Reference ${String(index + 1).padStart(2, "0")}`;
  const title = document.createElement("h4");
  title.textContent = reference.label || `Master Monster ${index + 1}`;
  titleWrap.append(sequence, title);
  const active = document.createElement("em");
  active.textContent = "Active";
  heading.append(titleWrap, active);

  const role = document.createElement("p");
  role.textContent = reference.role || "Generation style reference";
  const meta = document.createElement("footer");
  const filename = document.createElement("code");
  filename.textContent = String(reference.src || "").split("/").pop() || "Reference file";
  const dimensions = document.createElement("small");
  dimensions.dataset.dimensions = "";
  dimensions.textContent = "Loading size…";
  meta.append(filename, dimensions);

  body.append(heading, role, meta);
  article.append(imageLink, body);
  return article;
}

function openAdminCommand() {
  if (adminApp.hidden) return;
  commandSelection = 0;
  commandInput.value = "";
  renderAdminCommand();
  commandDialog.showModal();
  requestAnimationFrame(() => commandInput.focus());
}

function closeAdminCommand() {
  if (commandDialog.open) commandDialog.close();
}

function renderAdminCommand() {
  const query = commandInput.value.trim().toLowerCase();
  const customers = [...orders.reduce((map, order) => {
    const email = order.customer_email?.trim().toLowerCase();
    if (!email) return map;
    const customer = map.get(email) || { email: order.customer_email, children: new Set(), monsters: new Set(), count: 0 };
    if (order.child_name) customer.children.add(order.child_name);
    if (order.monster_name) customer.monsters.add(order.monster_name);
    customer.count += 1;
    map.set(email, customer);
    return map;
  }, new Map()).values()];
  const items = [
    { type: "Go to", title: "Overview", detail: "Workspace summary", keywords: "dashboard home", run: () => showView("dashboard") },
    { type: "Go to", title: "Orders", detail: "Fulfillment queue", keywords: "orders fulfillment", run: () => showView("orders") },
    { type: "Go to", title: "Master Books", detail: "Backgrounds and editable story text", keywords: "stories books", run: () => showView("stories") },
    { type: "Go to", title: "Master Monsters", detail: "Active generation references", keywords: "master monsters animation style references", run: () => showView("masters") },
    { type: "Go to", title: "Gallery Collection", detail: "Uploaded drawing and monster pairs", keywords: "gallery monsters before after drawing artwork character", run: () => showView("monsters") },
    ...stories.map((story) => ({
      type: "Book",
      title: story.title_template,
      detail: `${story.status || "draft"} · version ${story.version || 1}`,
      keywords: `${story.slug} ${story.description || ""}`,
      run: () => { showView("stories"); editStory(story); },
    })),
    ...orders.map((order) => ({
      type: "Order",
      title: `${order.child_name || "Child"} + ${order.monster_name || "Monster"}`,
      detail: `${order.customer_email || "No email"} · ${(order.status || "new").replaceAll("_", " ")}`,
      keywords: `${order.id} ${order.story_label || ""}`,
      run: () => { showView("orders"); openOrderDetail(order); },
    })),
    ...monsters.map((monster) => ({
      type: "Monster",
      title: monster.monsterName || "Unnamed monster",
      detail: `${monster.childName || "No child"} · ${monsterStatusLabel(monster.status)}`,
      keywords: `${monster.customerEmail || ""} ${storyLabel(monster.storyId)}`,
      run: () => {
        document.querySelector("#monster-search").value = monster.monsterName || monster.childName || "";
        showView("monsters");
        renderMonsters();
      },
    })),
    ...customers.map((customer) => ({
      type: "Customer",
      title: customer.email,
      detail: `${customer.count} order${customer.count === 1 ? "" : "s"} · ${[...customer.children].join(", ") || "No child name"}`,
      keywords: `${[...customer.children].join(" ")} ${[...customer.monsters].join(" ")}`,
      run: () => {
        document.querySelector("#customer-search").value = customer.email;
        showView("customers");
        renderCustomers();
      },
    })),
  ].filter((item) => !query || `${item.type} ${item.title} ${item.detail} ${item.keywords}`.toLowerCase().includes(query)).slice(0, 12);

  commandResults.replaceChildren(...items.map((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = index === commandSelection ? "is-selected" : "";
    button.innerHTML = "<span></span><div><strong></strong><small></small></div><em>↵</em>";
    button.querySelector("span").textContent = item.type;
    button.querySelector("strong").textContent = item.title;
    button.querySelector("small").textContent = item.detail;
    button.addEventListener("mouseenter", () => {
      commandSelection = index;
      [...commandResults.querySelectorAll("button")].forEach((result, resultIndex) => result.classList.toggle("is-selected", resultIndex === index));
    });
    button.addEventListener("click", () => { closeAdminCommand(); item.run(); });
    button._commandRun = item.run;
    return button;
  }));
  if (!items.length) commandResults.innerHTML = '<div class="admin-command-empty"><strong>No matches</strong><span>Try a title, name, email, or order ID.</span></div>';
}

function handleCommandKeys(event) {
  const buttons = [...commandResults.querySelectorAll("button")];
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    commandSelection = Math.max(0, Math.min(buttons.length - 1, commandSelection + (event.key === "ArrowDown" ? 1 : -1)));
    buttons.forEach((button, index) => button.classList.toggle("is-selected", index === commandSelection));
    buttons[commandSelection]?.scrollIntoView({ block: "nearest" });
  }
  if (event.key === "Enter" && buttons[commandSelection]) {
    event.preventDefault();
    const button = buttons[commandSelection];
    closeAdminCommand();
    button._commandRun();
  }
}

function renderDashboard() {
  const productionStatuses = new Set(["proofing", "approved", "printing"]);
  document.querySelector("#metric-orders").textContent = orders.length;
  document.querySelector("#metric-production").textContent = orders.filter((order) => productionStatuses.has(order.status)).length;
  document.querySelector("#metric-published").textContent = stories.filter((story) => story.status === "published").length;
  document.querySelector("#metric-drafts").textContent = stories.filter((story) => story.status === "draft").length;
  document.querySelector("#nav-story-count").textContent = stories.length;
  document.querySelector("#nav-order-count").textContent = orders.length;
  document.querySelector("#nav-monster-count").textContent = monsters.length;
  document.querySelector("#nav-customer-count").textContent = new Set(orders.map((order) => order.customer_email?.toLowerCase()).filter(Boolean)).size;
  const recent = document.querySelector("#recent-stories");
  if (!stories.length) {
    recent.innerHTML = '<div class="admin-inline-empty"><strong>No stories yet</strong><span>Create the Halloween story to get started.</span></div>';
    renderAttentionList();
    return;
  }
  recent.replaceChildren(...stories.slice(0, 4).map((story) => {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = '<span><strong></strong><small></small></span><em></em>';
    const ready = (story.pages || []).filter((page) => page.text?.trim() && page.illustrationPrompt?.trim()).length;
    button.querySelector("strong").textContent = story.title_template;
    button.querySelector("small").textContent = `${ready}/32 pages ready · Version ${story.version}`;
    button.querySelector("em").textContent = storyStage(story, ready);
    button.addEventListener("click", () => { showView("stories"); editStory(story); });
    return button;
  }));
  renderAttentionList();
}

function currentStory() {
  const id = document.querySelector("#story-id").value;
  return stories.find((story) => story.id === id) || null;
}

async function downloadCurrentStoryProof() {
  const story = currentStory();
  if (!story) { editorStatus.textContent = "Save this master book before generating a proof."; return; }
  if (storyDirty) { editorStatus.textContent = "Save your latest changes before generating the review PDF."; return; }
  await downloadStoryProof(story, editorStatus);
}

async function downloadStoryProof(story, status) {
  const childName = document.querySelector("#sample-child")?.value || "Alex";
  const monsterName = document.querySelector("#sample-monster")?.value || "Milo";
  const button = document.querySelector("#download-story-proof");
  button.disabled = true;
  status.textContent = "Building the 32-page editorial proof…";
  try {
    const query = new URLSearchParams({ resource: "story-proof", id: story.id, child_name: childName, monster_name: monsterName });
    const response = await fetch(`/api/storybook-interest?${query}`, { headers: { "x-admin-password": adminPassword } });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "The editorial proof could not be generated.");
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url; link.download = `${story.slug}-editorial-proof.pdf`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = "Editorial proof downloaded. It is for review only—not a Lulu print file.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function renderAttentionList() {
  const attention = [];
  orders.filter((order) => order.status === "paid").forEach((order) => attention.push({ type: "order", title: `${order.child_name}'s book is paid`, detail: "Ready to begin proofing", order }));
  orders.filter((order) => order.status === "checkout_started" && Date.now() - new Date(order.created_at).getTime() > 24 * 60 * 60 * 1000).forEach((order) => attention.push({ type: "order", title: `Checkout not completed`, detail: `${order.customer_email} · ${relativeAge(order.created_at)}`, order }));
  stories.filter((story) => story.status === "draft").forEach((story) => {
    const ready = (story.pages || []).filter((page) => page.text?.trim() && page.illustrationPrompt?.trim()).length;
    const artworkReady = (story.pages || []).filter((page) => page.artworkUrl && ["approved", "final"].includes(page.artworkStatus)).length;
    if (ready < 32 || artworkReady < 32) attention.push({ type: "story", title: story.title_template, detail: `${ready}/32 copy · ${artworkReady}/32 artwork`, story });
  });
  const list = document.querySelector("#attention-list");
  if (!attention.length) { list.innerHTML = '<div class="admin-inline-empty"><strong>Nothing urgent</strong><span>Orders and story checks will appear here.</span></div>'; return; }
  list.replaceChildren(...attention.slice(0, 8).map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = "<span><strong></strong><small></small></span><em>Review →</em>";
    button.querySelector("strong").textContent = item.title;
    button.querySelector("small").textContent = item.detail;
    button.addEventListener("click", () => item.type === "order" ? (showView("orders"), openOrderDetail(item.order)) : (showView("stories"), editStory(item.story)));
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
    const ready = (story.pages || []).filter((page) => page.text?.trim() && page.illustrationPrompt?.trim()).length;
    const artworkReady = (story.pages || []).filter((page) => page.artworkUrl && ["approved", "final"].includes(page.artworkStatus)).length;
    button.innerHTML = `<span class="story-book-cover"><img alt="" /></span><span class="story-book-meta"><strong></strong><small></small><em></em></span>`;
    const cover = button.querySelector(".story-book-cover img");
    cover.src = catalogCover(story.slug);
    cover.hidden = !CATALOG_COVERS[story.slug];
    button.querySelector("strong").textContent = story.title_template;
    button.querySelector("small").textContent = `${ready}/32 copy · ${artworkReady}/32 art · v${story.version}`;
    button.querySelector("em").textContent = storyStage(story, ready);
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
  const matchesQuickFilter = (order) => orderQuickFilter === "all"
    || (orderQuickFilter === "active" ? ["proofing", "approved", "printing"].includes(order.status) : false)
    || (orderQuickFilter === "attention" ? orderNeedsAttention(order) : order.status === orderQuickFilter);
  const visible = orders.filter((order) => matchesQuickFilter(order) && (filter === "all" || order.status === filter) && [order.customer_email, order.child_name, order.monster_name, order.story_label, order.id].join(" ").toLowerCase().includes(query));
  document.querySelector("#queue-all").textContent = orders.length;
  document.querySelector("#queue-attention").textContent = orders.filter(orderNeedsAttention).length;
  document.querySelector("#queue-paid").textContent = orders.filter((order) => order.status === "paid").length;
  document.querySelector("#queue-printing").textContent = orders.filter((order) => order.status === "printing").length;
  document.querySelectorAll("[data-order-quick-filter]").forEach((button) => button.classList.toggle("is-active", button.dataset.orderQuickFilter === orderQuickFilter));
  const body = document.querySelector("#orders-list");
  const board = document.querySelector("#orders-board");
  const table = document.querySelector(".orders-table-wrap");
  board.hidden = orderView !== "board";
  table.hidden = orderView !== "table";
  document.querySelectorAll("[data-order-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.orderView === orderView));
  document.querySelector("#orders-empty").hidden = visible.length > 0;
  body.replaceChildren(...visible.map((order) => {
    const row = document.createElement("tr");
    row.innerHTML = '<td><strong></strong><small></small></td><td><strong></strong><small></small></td><td></td><td></td><td></td><td><button class="button secondary" type="button"></button></td>';
    row.classList.toggle("needs-attention", orderNeedsAttention(order));
    const cells = row.children;
    cells[0].querySelector("strong").textContent = order.customer_email;
    cells[0].querySelector("small").textContent = `For ${order.child_name}`;
    cells[1].querySelector("strong").textContent = order.monster_name;
    cells[1].querySelector("small").textContent = order.story_label;
    cells[2].textContent = order.format_id === "hardcover" ? "Hardcover" : "Softcover";
    cells[3].textContent = formatMoney(order.stripe_total_cents ?? order.amount_cents, order.currency || "USD");
    cells[4].textContent = new Date(order.created_at).toLocaleDateString();
    const button = cells[5].querySelector("button");
    button.textContent = `${order.status.replaceAll("_", " ")} →`;
    button.setAttribute("aria-label", `Open order for ${order.child_name}`);
    button.addEventListener("click", () => openOrderDetail(order));
    return row;
  }));
  renderOrderBoard(visible);
}

function renderOrderBoard(visible) {
  const columns = [
    { key: "intake", title: "Intake", statuses: ["checkout_started"] },
    { key: "proof", title: "Proof", statuses: ["paid", "proofing"] },
    { key: "production", title: "Production", statuses: ["approved", "printing"] },
    { key: "delivery", title: "Delivery", statuses: ["shipped", "completed"] },
    { key: "exceptions", title: "Exceptions", statuses: ["cancelled"] },
  ];
  const board = document.querySelector("#orders-board");
  board.replaceChildren(...columns.map((column) => {
    const section = document.createElement("section");
    const matching = visible.filter((order) => column.statuses.includes(order.status));
    section.className = "order-board-column";
    section.innerHTML = '<header><strong></strong><span></span></header><div></div>';
    section.querySelector("strong").textContent = column.title;
    section.querySelector("span").textContent = matching.length;
    const list = section.querySelector("div");
    if (!matching.length) list.innerHTML = '<p class="board-empty">No orders</p>';
    else list.replaceChildren(...matching.map((order) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "order-board-card";
      card.classList.toggle("needs-attention", orderNeedsAttention(order));
      card.innerHTML = '<span></span><strong></strong><small></small><em></em>';
      card.querySelector("span").textContent = order.status.replaceAll("_", " ");
      card.querySelector("strong").textContent = `${order.child_name} + ${order.monster_name}`;
      card.querySelector("small").textContent = `${order.story_label} · ${order.format_id === "hardcover" ? "Hardcover" : "Softcover"}`;
      card.querySelector("em").textContent = `${order.payment_issue ? `${order.payment_issue.replaceAll("_", " ")} · ` : orderNeedsAttention(order) ? "Needs follow-up · " : ""}${relativeAge(order.updated_at || order.created_at)} · Review →`;
      card.addEventListener("click", () => openOrderDetail(order));
      return card;
    }));
    return section;
  }));
}

function orderNeedsAttention(order) {
  if (order.payment_issue) return true;
  const ageHours = Math.max(0, (Date.now() - new Date(order.updated_at || order.created_at).getTime()) / 3600000);
  const limits = { checkout_started: 24, paid: 24, proofing: 48, approved: 24, printing: 168, shipped: 168 };
  return Number.isFinite(ageHours) && limits[order.status] !== undefined && ageHours >= limits[order.status];
}

function renderCustomers() {
  const query = document.querySelector("#customer-search").value.trim().toLowerCase();
  const groups = new Map();
  orders.forEach((order) => {
    const key = (order.customer_email || "Unknown customer").toLowerCase();
    if (!groups.has(key)) groups.set(key, { email: order.customer_email || "Unknown customer", orders: [] });
    groups.get(key).orders.push(order);
  });
  const visible = [...groups.values()].filter((customer) => [customer.email, ...customer.orders.flatMap((order) => [order.child_name, order.monster_name])].join(" ").toLowerCase().includes(query));
  document.querySelector("#customers-empty").hidden = visible.length > 0;
  document.querySelector("#customer-list").replaceChildren(...visible.map((customer) => {
    const article = document.createElement("article");
    const monsters = [...new Set(customer.orders.map((order) => order.monster_name).filter(Boolean))];
    const children = [...new Set(customer.orders.map((order) => order.child_name).filter(Boolean))];
    const spent = customer.orders.reduce((sum, order) => sum + (Number(order.stripe_total_cents ?? order.amount_cents) || 0), 0);
    article.className = "customer-card";
    article.innerHTML = '<header><div><strong></strong><small></small></div><span></span></header><div class="customer-monsters"></div><footer><span></span><button class="button secondary" type="button">View latest order</button></footer>';
    article.querySelector("strong").textContent = customer.email;
    article.querySelector("small").textContent = `${children.join(", ") || "No child name"} · ${customer.orders.length} order${customer.orders.length === 1 ? "" : "s"}`;
    article.querySelector("header > span").textContent = formatMoney(spent, customer.orders[0]?.currency || "USD");
    article.querySelector(".customer-monsters").replaceChildren(...monsters.map((monster) => { const span = document.createElement("span"); span.textContent = monster; return span; }));
    article.querySelector("footer span").textContent = `Last activity ${relativeAge(customer.orders[0]?.updated_at || customer.orders[0]?.created_at)}`;
    article.querySelector("button").addEventListener("click", () => { showView("orders"); openOrderDetail(customer.orders[0]); });
    return article;
  }));
}

function renderMonsters() {
  const query = document.querySelector("#monster-search").value.trim().toLowerCase();
  const filter = document.querySelector("#monster-filter").value;
  const sort = document.querySelector("#monster-sort").value;
  const visible = monsters.filter((monster) => {
    const hasPair = Boolean(monster.originalUrl && monster.selectedPreviewUrl);
    const galleryApproved = Boolean(monster.featurePermission?.canFeatureMonster);
    const matchesStatus = filter === "all"
      || (filter === "complete" && hasPair)
      || (filter === "approved" && hasPair && galleryApproved)
      || (filter === "incomplete" && !hasPair);
    const searchable = [monster.monsterName, monster.childName, monster.customerEmail, monster.storyId, monster.sourceFilename]
      .filter(Boolean).join(" ").toLowerCase();
    return matchesStatus && searchable.includes(query);
  }).sort((left, right) => monsterSort(left, right, sort));
  const library = document.querySelector("#monster-library");
  const emptyState = document.querySelector("#monsters-empty");
  emptyState.hidden = visible.length > 0;
  emptyState.querySelector("strong").textContent = monsters.length ? "No transformations match these filters" : "No transformations yet";
  emptyState.querySelector("p").textContent = monsters.length ? "Try another search term or show all transformations." : "An uploaded drawing appears here beside its generated monster after the upload is saved.";
  document.querySelector("#monsters-status").textContent = visible.length
    ? `Showing ${visible.length} of ${monsters.length} saved transformation${monsters.length === 1 ? "" : "s"}.`
    : "";
  document.querySelector("#monster-metric-total").textContent = monsters.length;
  document.querySelector("#monster-metric-ready").textContent = monsters.filter((monster) => monster.originalUrl && monster.selectedPreviewUrl).length;
  document.querySelector("#monster-metric-books").textContent = monsters.filter((monster) => !monster.originalUrl || !monster.selectedPreviewUrl).length;
  document.querySelector("#monster-metric-gallery").textContent = monsters.filter((monster) => monster.originalUrl && monster.selectedPreviewUrl && monster.featurePermission?.canFeatureMonster).length;
  library.replaceChildren(...visible.map(buildMonsterCard));
}

function monsterSort(left, right, sort) {
  if (sort === "oldest") return new Date(left.createdAt) - new Date(right.createdAt);
  if (sort === "name") return (left.monsterName || "Unnamed monster").localeCompare(right.monsterName || "Unnamed monster");
  return new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt);
}

function buildMonsterCard(monster) {
  const article = document.createElement("article");
  const canFeature = Boolean(monster.featurePermission?.canFeatureMonster);
  const canFeatureDrawing = Boolean(monster.featurePermission?.canFeatureDrawing);
  const hasOriginal = Boolean(monster.originalUrl);
  const hasPreview = Boolean(monster.selectedPreviewUrl);
  const hasPair = hasOriginal && hasPreview;
  const latestOrder = monster.orders?.[0];
  article.className = "monster-library-card";
  article.innerHTML = '<div class="monster-library-images"><figure data-original><div class="monster-image-empty">Original drawing unavailable</div><figcaption>Before · Uploaded drawing</figcaption></figure><span class="monster-transform-arrow" aria-hidden="true">→<small>becomes</small></span><figure data-preview><div class="monster-image-empty">Generated monster unavailable</div><figcaption>After · Storybook monster</figcaption></figure></div><div class="monster-library-info"><header><div><p class="eyebrow">Gallery transformation</p><h3></h3></div><span data-status></span></header><dl><div><dt>Uploaded file</dt><dd data-source></dd></div><div><dt>Child</dt><dd data-child></dd></div><div><dt>Customer</dt><dd data-customer></dd></div><div><dt>Story</dt><dd data-story></dd></div></dl><div class="monster-permission"></div><details class="monster-production-details"><summary><span>Book production assets</span><small>Poses and page coverage</small></summary><div class="monster-pose-production"></div></details><div class="monster-library-actions"></div><small data-updated></small></div>';
  article.querySelector("h3").textContent = monster.monsterName || "Unnamed monster";
  article.querySelector("[data-status]").textContent = hasPair ? "Complete pair" : hasOriginal ? "Preview missing" : hasPreview ? "Drawing missing" : "Artwork missing";
  article.querySelector("[data-status]").className = `monster-library-status is-${hasPair ? "ready" : "draft"}`;
  article.querySelector("[data-source]").textContent = monster.sourceFilename || "Not recorded";
  article.querySelector("[data-child]").textContent = monster.childName || "Not provided";
  article.querySelector("[data-customer]").textContent = monster.customerEmail || "Not provided";
  article.querySelector("[data-story]").textContent = storyLabel(monster.storyId);
  article.querySelector("[data-updated]").textContent = `Saved ${relativeAge(monster.updatedAt || monster.createdAt)} · ${monster.previewCount || 0} generated version${monster.previewCount === 1 ? "" : "s"} · ${monster.orders?.length || 0} connected book${monster.orders?.length === 1 ? "" : "s"}`;
  setMonsterImage(article.querySelector("[data-original]"), monster.originalUrl, `${monster.monsterName || "Monster"} original drawing`);
  setMonsterImage(article.querySelector("[data-preview]"), monster.selectedPreviewUrl, `${monster.monsterName || "Monster"} approved storybook character`);
  const permission = article.querySelector(".monster-permission");
  permission.innerHTML = `<strong>${canFeature ? "Gallery permission granted" : "Private — no gallery permission"}</strong><span>${canFeature ? (canFeatureDrawing ? "Monster and original drawing may be featured." : "Finished monster only; original remains private.") : "Nothing from this submission should appear publicly."}</span>`;
  permission.classList.toggle("can-feature", canFeature);
  renderMonsterPoseProduction(article.querySelector(".monster-pose-production"), monster);
  const actions = article.querySelector(".monster-library-actions");
  if (monster.selectedPreviewUrl) actions.append(downloadButton(monster.selectedPreviewUrl, "Download monster"));
  if (monster.originalUrl) actions.append(downloadButton(monster.originalUrl, "Open drawing"));
  if (latestOrder) {
    const orderButton = document.createElement("button");
    orderButton.type = "button";
    orderButton.className = "button secondary";
    orderButton.textContent = monster.orders.length > 1 ? `View ${monster.orders.length} books` : "View connected book";
    orderButton.addEventListener("click", () => {
      showView("orders");
      openOrderDetail(orders.find((order) => order.id === latestOrder.id) || latestOrder);
    });
    actions.append(orderButton);
  }
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "button monster-delete-button";
  deleteButton.textContent = "Delete monster";
  deleteButton.addEventListener("click", () => deleteMonster(monster, deleteButton));
  actions.append(deleteButton);
  return article;
}

function renderMonsterPoseProduction(container, monster) {
  if (!posePipelineAvailable) {
    container.innerHTML = '<div><strong>Book pose production</strong><span>Setup pending. Apply the reviewed pose-pipeline database migration before creating production plans.</span></div>';
    return;
  }
  const confirmedOrder = monster.orders?.[0];
  const confirmedChild = confirmedOrder?.childCharacter;
  const confirmedStory = stories.find((story) => story.id === confirmedOrder?.storyId || story.slug === confirmedOrder?.storyId || story.id === monster.storyId || story.slug === monster.storyId);
  const usesHalloweenArt = ["halloween-monster-night", "halloween-adventure"].includes(confirmedStory?.slug);
  const job = monster.poseJobs?.[0];
  if (job?.blueprintOutdated) {
    container.innerHTML = '<div class="monster-pose-empty"><span class="monster-pose-kicker">Halloween art upgrade ready</span><strong>Replace the compact pose plan</strong><span>The earlier 3-child and 4-monster plan does not use the artwork already created for this book. Upgrade it to 12 child scenes, 15 monster actions, and all 14 environment spreads. Existing files remain preserved for audit.</span></div><button class="button secondary" type="button">Connect existing Halloween art</button>';
    const button = container.querySelector("button");
    button.disabled = !monster.hasSelectedPreview || !confirmedOrder;
    button.addEventListener("click", () => createMonsterPosePlan(monster, button));
    return;
  }
  if (!job) {
    container.innerHTML = '<div class="monster-pose-empty"><span class="monster-pose-kicker">Confirmed-book workflow</span><strong>Build the exact pose set this story needs</strong><span data-pose-intro></span><div class="monster-pose-empty-summary"><span data-pose-child></span><span data-pose-story></span><span data-pose-scope></span></div></div><button class="button secondary" type="button">Build book pose set</button>';
    container.querySelector("[data-pose-intro]").textContent = confirmedOrder
      ? "The selected child will be locked automatically as the identity anchor. Planning is free and does not call the image provider."
      : "Connect a confirmed book before creating poses, so experimentation remains free.";
    container.querySelector("[data-pose-child]").textContent = confirmedChild?.included
      ? `Child: ${confirmedChild.label} · ${confirmedChild.ageBandLabel || confirmedChild.ageBand}${confirmedChild.mobilityAid === "wheelchair" ? " · Wheelchair" : ""}`
      : "Child: Monster-only story";
    container.querySelector("[data-pose-story]").textContent = `Story: ${confirmedOrder?.storyLabel || storyLabel(monster.storyId)}`;
    container.querySelector("[data-pose-scope]").textContent = usesHalloweenArt
      ? "Existing Halloween art · 14 environment spreads · 12 child scenes · 15 monster actions"
      : "Reusable story poses · 32 mapped pages · human approval required";
    const button = container.querySelector("button");
    button.disabled = !monster.hasSelectedPreview || !confirmedOrder;
    button.addEventListener("click", () => createMonsterPosePlan(monster, button));
    return;
  }
  const progress = job.progress || {};
  const readiness = job.readiness || { blockers: [] };
  container.innerHTML = '<details open><summary><span><strong></strong><small></small></span><em></em></summary><div class="monster-pose-body"><div class="monster-pose-stages" aria-label="Pose production stages"><span data-pose-stage="identity"><i>1</i>Identity</span><span data-pose-stage="poses"><i>2</i>Poses</span><span data-pose-stage="pages"><i>3</i>Pages</span><span data-pose-stage="approval"><i>4</i>Approved</span></div><div class="monster-pose-blueprint" hidden><div><span class="monster-pose-kicker">Existing artwork connected</span><strong></strong><small></small></div><a class="button secondary" target="_blank" rel="noopener">View art guide</a></div><div class="monster-pose-identity" hidden><figure><span>Child</span></figure><div><span class="monster-pose-kicker">Locked child identity</span><strong data-child-identity></strong><small data-child-profile></small><em>Automatically attached from the confirmed selection</em></div></div><p data-source></p><div class="monster-pose-meter"><span></span></div><div class="monster-pose-assets"></div><div class="monster-pose-review-actions"></div><p class="monster-pose-generation-note" hidden></p><ul class="monster-pose-blockers"></ul></div></details>';
  container.querySelector("summary strong").textContent = `Pose production · ${String(job.status || "planned").replaceAll("_", " ")}`;
  container.querySelector("summary small").textContent = `${progress.approvedAssets || 0}/${progress.totalAssets || 0} assets · ${progress.approvedScenes || 0}/${progress.totalScenes || 32} pages`;
  container.querySelector("summary em").textContent = `${formatMoney(job.estimatedCostCents || 0)} est. / ${formatMoney(job.costCapCents || 0)} cap`;
  const artBlueprint = job.plan?.artBlueprint;
  if (artBlueprint?.status === "existing_art_connected") {
    const blueprint = container.querySelector(".monster-pose-blueprint");
    blueprint.hidden = false;
    blueprint.querySelector("strong").textContent = artBlueprint.label || "Existing Halloween production art";
    blueprint.querySelector("small").textContent = `${artBlueprint.environmentPlateCount || 0} environment spreads · ${artBlueprint.childPoseCount || 0} child scenes · ${artBlueprint.monsterPoseCount || 0} monster actions. Only missing personalized character layers will be generated.`;
    const guide = blueprint.querySelector("a");
    guide.href = `/${String(artBlueprint.referenceStartPath || "").replace(/^\//, "")}`;
  }
  const childIdentity = job.plan?.identityContract?.child;
  if (childIdentity?.included) {
    const identity = container.querySelector(".monster-pose-identity");
    identity.hidden = false;
    if (job.childAnchorUrl) {
      const image = document.createElement("img"); image.src = job.childAnchorUrl; image.alt = `${childIdentity.anchorArtwork?.label || "Selected child"} identity anchor`;
      identity.querySelector("figure").replaceChildren(image);
    }
    identity.querySelector("[data-child-identity]").textContent = childIdentity.anchorArtwork?.label || childIdentity.appearanceId;
    identity.querySelector("[data-child-profile]").textContent = `${childIdentity.ageBandLabel || childIdentity.ageBand}${childIdentity.mobilityAid === "wheelchair" ? " · Wheelchair preserved in every pose" : " · Standard mobility artwork"}`;
  }
  const approvedAssets = Number(progress.approvedAssets || 0);
  const totalAssets = Number(progress.totalAssets || 0);
  const approvedScenes = Number(progress.approvedScenes || 0);
  const totalScenes = Number(progress.totalScenes || 32);
  setPoseStage(container, "identity", !childIdentity?.included || job.childAnchorAttached, true);
  setPoseStage(container, "poses", totalAssets > 0 && approvedAssets === totalAssets, approvedAssets > 0 || job.status === "generating" || job.status === "review");
  setPoseStage(container, "pages", totalScenes > 0 && approvedScenes === totalScenes, totalAssets > 0 && approvedAssets === totalAssets && approvedScenes < totalScenes);
  setPoseStage(container, "approval", job.status === "approved", readiness.ready);
  container.querySelector("[data-source]").textContent = `Pinned monster ${shortId(job.sourcePreviewId)} · ${childIdentity?.included ? `child ${childIdentity.profileKey}` : "monster-only"} · story v${job.storyVersion}. Each pose is reused only on its mapped pages.`;
  const percent = progress.totalAssets ? Math.round(((progress.approvedAssets || 0) / progress.totalAssets) * 100) : 0;
  container.querySelector(".monster-pose-meter span").style.width = `${percent}%`;
  const assetList = container.querySelector(".monster-pose-assets");
  assetList.replaceChildren(...["child", "monster"].map((subjectType) => buildPoseAssetGroup(monster, job, subjectType)).filter(Boolean));
  const reviewActions = container.querySelector(".monster-pose-review-actions");
  if (job.plan?.identityContract?.child?.included && !job.childAnchorAttached) {
    const upload = document.createElement("label"); upload.className = "button secondary"; upload.textContent = "Attach replacement child anchor";
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/png,image/jpeg,image/webp"; input.hidden = true;
    input.addEventListener("change", async () => { const file = input.files?.[0]; if (!file) return; await updateMonsterPoseJob(monster, job, { action: "record_child_anchor", image: await fileToDataUrl(file) }); });
    upload.append(input); reviewActions.append(upload);
  }
  const nextAsset = job.assets.find((asset) => asset.status === "queued" && asset.attempts < asset.maxAttempts);
  if (job.generationEnabled && nextAsset) {
    reviewActions.append(poseActionButton(`Generate next ${nextAsset.subjectType} pose`, async () => {
      if (!window.confirm("Generate exactly one queued pose now? The job reserves up to $0.03 for this provider edit and will not batch additional images.")) return;
      await updateMonsterPoseJob(monster, job, { action: "generate_next", spendApproved: true });
    }));
  } else if (nextAsset && !job.generationEnabled) {
    const note = container.querySelector(".monster-pose-generation-note");
    note.hidden = false;
    note.textContent = "Pose plan ready. Automated generation is safely locked until the production image provider and spending switch are enabled.";
  }
  if (job.plan?.scaleContract?.calibrationStatus !== "approved") reviewActions.append(poseActionButton("Approve physical scale", () => approvePoseScale(monster, job)));
  const nextScene = job.scenes?.find((scene) => scene.status === "review");
  if (nextScene) reviewActions.append(poseActionButton(`Review page ${nextScene.pageNumber}`, () => approvePoseScene(monster, job, nextScene)));
  if (readiness.ready && job.status !== "approved") reviewActions.append(poseActionButton("Approve pose set", () => approveMonsterPoseJob(monster, job), "primary"));
  const blockers = container.querySelector(".monster-pose-blockers");
  blockers.replaceChildren(...(readiness.blockers || []).map((message) => { const item = document.createElement("li"); item.textContent = message; return item; }));
}

function setPoseStage(container, name, complete, active) {
  const stage = container.querySelector(`[data-pose-stage="${name}"]`);
  stage?.classList.toggle("is-complete", Boolean(complete));
  stage?.classList.toggle("is-active", !complete && Boolean(active));
}

function buildPoseAssetGroup(monster, job, subjectType) {
  const assets = job.assets.filter((asset) => asset.subjectType === subjectType);
  if (!assets.length) return null;
  const section = document.createElement("details");
  section.className = `monster-pose-group is-${subjectType}`;
  section.open = subjectType === "child";
  const heading = document.createElement("summary");
  const approved = assets.filter((asset) => asset.status === "approved").length;
  heading.innerHTML = `<div><span>${subjectType === "child" ? "Story co-star" : "Customer monster"}</span><strong>${subjectType === "child" ? "Child pose set" : "Monster pose set"}</strong></div><em>${approved}/${assets.length} approved</em>`;
  const list = document.createElement("div");
  list.replaceChildren(...assets.map((asset) => buildPoseAssetRow(monster, job, asset)));
  section.append(heading, list);
  return section;
}

function buildPoseAssetRow(monster, job, asset) {
  const row = document.createElement("article");
  row.className = `monster-pose-asset is-${asset.status}`;
  row.innerHTML = '<div class="monster-pose-thumb"><span></span></div><div><strong></strong><small></small></div><div class="monster-pose-asset-actions"></div>';
  if (asset.url) {
    const image = document.createElement("img"); image.src = asset.url; image.alt = "";
    row.querySelector(".monster-pose-thumb").replaceChildren(image);
  } else row.querySelector(".monster-pose-thumb span").textContent = asset.subjectType === "child" ? "Child" : "Monster";
  row.querySelector("strong").textContent = asset.label || asset.poseId.replaceAll("_", " ");
  const pages = asset.pageCount ? ` · ${asset.pageCount} mapped page${asset.pageCount === 1 ? "" : "s"}` : "";
  const artGuide = asset.artReference?.status === "visual_direction_approved" ? " · existing art guide" : "";
  row.querySelector("small").textContent = `${asset.kind.replaceAll("_", " ")} · ${asset.status}${pages}${artGuide} · ${asset.attempts}/${asset.maxAttempts} attempts`;
  const actions = row.querySelector(".monster-pose-asset-actions");
  if (["queued", "failed", "blocked", "review"].includes(asset.status) && asset.attempts < asset.maxAttempts) {
    const upload = document.createElement("label");
    upload.className = "button secondary"; upload.textContent = asset.url ? "Replace PNG" : "Upload PNG";
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/png"; input.hidden = true;
    input.addEventListener("change", () => uploadPoseAsset(monster, job, asset, input)); upload.append(input); actions.append(upload);
  }
  if (asset.status === "review") actions.append(poseActionButton("Approve asset", () => approvePoseAsset(monster, job, asset)));
  return row;
}

function poseActionButton(label, run, type = "secondary") {
  const button = document.createElement("button"); button.type = "button"; button.className = `button ${type}`; button.textContent = label;
  button.addEventListener("click", async () => { button.disabled = true; try { await run(); } catch (error) { document.querySelector("#monsters-status").textContent = error.message; } finally { button.disabled = false; } });
  return button;
}

async function createMonsterPosePlan(monster, button) {
  button.disabled = true; document.querySelector("#monsters-status").textContent = "Creating a bounded internal plan…";
  try {
    const confirmedOrder = monster.orders?.[0];
    const result = await apiRequest("?resource=pose-jobs", { method: "POST", body: { submissionId: monster.id, selectedPreviewId: monster.selectedPreviewId, storyId: confirmedOrder?.storyId || monster.storyId, childCharacter: confirmedOrder?.childCharacter } });
    monster.poseJobs = [result.poseJob]; renderMonsters(); document.querySelector("#monsters-status").textContent = "Book pose set planned and the confirmed child identity was attached. No paid generation was run.";
  } catch (error) { document.querySelector("#monsters-status").textContent = error.message; button.disabled = false; }
}

async function uploadPoseAsset(monster, job, asset, input) {
  const file = input.files?.[0]; if (!file) return;
  const image = await fileToDataUrl(file);
  await updateMonsterPoseJob(monster, job, { action: "record_asset", assetKey: asset.key, image, source: "manual_upload" });
}

async function approvePoseAsset(monster, job, asset) {
  if (!window.confirm("Confirm that this transparent PNG preserves the exact approved identity/anatomy and has clean edges.")) return;
  const boundsText = window.prompt("Reviewed visual bounds as x,y,width,height percentages", "0,0,100,100");
  if (!boundsText) return;
  const [xPercent, yPercent, widthPercent, heightPercent] = boundsText.split(",").map(Number);
  const approvedBy = window.prompt("Reviewer name"); if (!approvedBy) return;
  await updateMonsterPoseJob(monster, job, { action: "approve_asset", assetKey: asset.key, approvedBy, cleanEdges: true, visualBounds: { xPercent, yPercent, widthPercent, heightPercent } });
}

async function approvePoseScale(monster, job) {
  const ratio = window.prompt("Monster height ÷ standing child height (physical story scale, not page pixels)", "0.9"); if (!ratio) return;
  const approvedBy = window.prompt("Reviewer name"); if (!approvedBy) return;
  await updateMonsterPoseJob(monster, job, { action: "approve_scale", monsterHeightToStandingChildHeight: Number(ratio), approvedBy });
}

async function approvePoseScene(monster, job, scene) {
  if (!window.confirm(`Page ${scene.pageNumber}: confirm identity, anatomy, relative scale, camera depth, measured bounds, grounding, eyelines, and interaction clearance all pass in the composed proof.`)) return;
  const approvedBy = window.prompt("Reviewer name"); if (!approvedBy) return;
  const qa = { identity: true, anatomy: true, relativeScale: true, cameraDepth: true, boundingBoxes: true, grounding: true, eyeline: true, interactionClearance: true };
  await updateMonsterPoseJob(monster, job, { action: "approve_scene", pageNumber: scene.pageNumber, approvedBy, qa });
}

async function approveMonsterPoseJob(monster, job) {
  const approvedBy = window.prompt("Final pose-set reviewer name"); if (!approvedBy) return;
  await updateMonsterPoseJob(monster, job, { action: "approve_job", approvedBy });
}

async function updateMonsterPoseJob(monster, job, body) {
  document.querySelector("#monsters-status").textContent = "Updating pose production…";
  const result = await apiRequest(`?resource=pose-jobs&id=${encodeURIComponent(job.id)}`, { method: "PATCH", body });
  monster.poseJobs = [result.poseJob, ...(monster.poseJobs || []).filter((item) => item.id !== job.id)];
  renderMonsters(); document.querySelector("#monsters-status").textContent = "Pose production updated.";
}

function fileToDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("The pose PNG could not be read.")); reader.readAsDataURL(file); }); }
function shortId(value) { const text = String(value || ""); return text ? `${text.slice(0, 8)}…` : "missing"; }

async function deleteMonster(monster, button) {
  const name = monster.monsterName || "this unnamed monster";
  const owner = monster.customerEmail ? ` for ${monster.customerEmail}` : "";
  const bookWarning = monster.orders?.length
    ? `\n\nIts ${monster.orders.length} existing connected book${monster.orders.length === 1 ? "" : "s"} will remain, but the saved artwork link will be removed.`
    : "";
  if (!window.confirm(`Permanently delete ${name}${owner}?\n\nThe original drawing, generated previews, and coloring page will be removed and cannot be recovered.${bookWarning}`)) return;
  const status = document.querySelector("#monsters-status");
  button.disabled = true;
  button.textContent = "Deleting…";
  status.className = "is-pending";
  status.textContent = `Deleting ${name}…`;
  try {
    await apiRequest(`?resource=monsters&id=${encodeURIComponent(monster.id)}`, { method: "DELETE" });
    monsters = monsters.filter((item) => item.id !== monster.id);
    orders.forEach((order) => { if (order.monster_submission_id === monster.id) order.monster_submission_id = null; });
    renderMonsters();
    renderDashboard();
    status.className = "is-success";
    status.textContent = `${name} was permanently deleted.`;
  } catch (error) {
    button.disabled = false;
    button.textContent = "Delete monster";
    status.className = "is-error";
    status.textContent = error.message;
  }
}

function setMonsterImage(figure, url, alt) {
  if (!url) return;
  const image = document.createElement("img");
  image.src = url;
  image.alt = alt;
  image.loading = "lazy";
  figure.querySelector(".monster-image-empty").replaceWith(image);
}

function downloadButton(url, label) {
  const link = document.createElement("a");
  link.className = "button secondary";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = label;
  return link;
}

function monsterStatusLabel(status) {
  return ({ ready: "Ready to reuse", ordered: "Used in order", draft: "Draft", expired: "Expired" })[status] || "Saved";
}

function storyLabel(storyId) {
  return stories.find((story) => story.id === storyId || story.slug === storyId)?.title_template || String(storyId || "Not selected").replaceAll("-", " ");
}

function relativeAge(value) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3600000));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatMoney(cents, currency = "USD") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100); }
  catch { return `$${(cents / 100).toFixed(2)}`; }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
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
  clearTimeout(storyAutosaveTimer);
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
  updateCoverPreview(story?.slug || "");
  selectedPageIndex = 0;
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

function renderBookWorkspace(story = currentStory(), cards = [...pagesContainer.children]) {
  const slug = document.querySelector("#story-slug").value.trim() || story?.slug || "";
  const status = story?.status || "draft";
  const version = story?.version || 1;
  const copyReady = cards.filter((card) => [...card.querySelectorAll("textarea")].every((area) => area.value.trim())).length;
  const artReady = cards.filter((card) => card.dataset.artworkUrl
    && card.dataset.backgroundPlateConfirmed === "true"
    && Number(card.dataset.backgroundPlateVersion || 0) >= 2
    && ["approved", "final"].includes(card.dataset.artworkStatus)).length;
  const files = bookReviewFiles.filter((file) => file.storySlug === slug);
  const preservedFiles = files.filter((file) => file.uploaded).length;
  const relatedOrders = orders.filter((order) => order.story_id === story?.id
    || order.story_id === slug
    || order.story_label === story?.title_template);
  const approvedProofs = relatedOrders.filter((order) => order.customer_proof_status === "approved"
    || (order.proof_fingerprint && order.proof_approved_at)).length;
  const acceptedByLulu = relatedOrders.filter((order) => order.lulu_print_job_id).length;
  const reportChecks = slug === "halloween-monster-night" ? productionReport?.checks || [] : [];
  const passedPreflight = reportChecks.filter((check) => check.status === "pass").length;
  const productionBlockers = [];
  if (cards.length !== 32 || copyReady !== 32) productionBlockers.push(`${copyReady}/32 pages have complete copy and art direction.`);
  if (artReady !== 32) productionBlockers.push(`${artReady}/32 individual page backgrounds are approved.`);
  if (files.some((file) => !file.uploaded)) productionBlockers.push(`${files.filter((file) => !file.uploaded).length} assigned review PDF${files.filter((file) => !file.uploaded).length === 1 ? " is" : "s are"} not stored.`);
  if (files.length) productionBlockers.push("Exact review-PDF approval is not recorded in the current data model.");
  productionBlockers.push("No final personalized print PDF has been created and approved.");
  let nextAction = "Complete the remaining master copy.";
  let nextHelp = "Drafts stay private until deliberately published.";
  if (copyReady === 32 && cards.length === 32 && files.some((file) => !file.uploaded)) {
    nextAction = "Preserve and inspect the review PDFs.";
    nextHelp = "These files are review candidates, not approved print masters.";
  } else if (copyReady === 32 && cards.length === 32 && artReady < 32) {
    nextAction = "Replace references with clean background plates.";
    nextHelp = preservedFiles ? "Use the preserved PDFs for continuity review; keep sample characters out of master art." : "Upload, inspect, and approve each character-free background plate.";
  } else if (copyReady === 32 && cards.length === 32 && artReady === 32) {
    nextAction = "Run the final master review.";
    nextHelp = "Publishing and print release remain separate deliberate steps.";
  }

  document.querySelector("#book-summary-status").textContent = status === "published" ? "Published" : "Draft";
  document.querySelector("#book-summary-version").textContent = `Version ${version}`;
  document.querySelector("#book-summary-copy").textContent = `${copyReady}/32`;
  document.querySelector("#book-summary-art").textContent = `${artReady}/32`;
  document.querySelector("#book-summary-next").textContent = nextAction;
  document.querySelector("#book-summary-next-help").textContent = nextHelp;
  const nextButton = document.querySelector("#book-summary-next-button");
  const reviewFilesMissing = copyReady === 32 && cards.length === 32 && files.some((file) => !file.uploaded);
  nextButton.textContent = copyReady < 32 || cards.length !== 32 ? "Open first incomplete page" : reviewFilesMissing ? "Open review files" : artReady < 32 ? "Review next background" : "Open master review";
  nextButton.onclick = () => {
    if (copyReady < 32 || cards.length !== 32) {
      const index = cards.findIndex((card) => ![...card.querySelectorAll("textarea")].every((area) => area.value.trim()));
      if (index >= 0) selectPage(index, true);
      else document.querySelector("#add-page").focus();
      return;
    }
    if (reviewFilesMissing) {
      const reviewFiles = document.querySelector(".book-review-files");
      reviewFiles.open = true;
      reviewFiles.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (artReady < 32) {
      const index = cards.findIndex((card) => !(card.dataset.artworkUrl
        && card.dataset.backgroundPlateConfirmed === "true"
        && ["approved", "final"].includes(card.dataset.artworkStatus)));
      if (index >= 0) {
        selectPage(index, true);
        cards[index].querySelector(".page-artwork-panel")?.setAttribute("open", "");
      }
      return;
    }
    openStoryReview();
  };
  document.querySelector("#gate-master-state").textContent = `${artReady}/32 backgrounds approved for master v${version}`;
  document.querySelector("#gate-proof-state").textContent = relatedOrders.length
    ? `${approvedProofs}/${relatedOrders.length} order proof${relatedOrders.length === 1 ? "" : "s"} approved`
    : "Not started · created and approved per customer order";
  document.querySelector("#gate-cover-state").textContent = CATALOG_COVERS[slug]
    ? "Catalog preview available · printer approval not recorded"
    : "No cover preview assigned";
  document.querySelector("#gate-preflight-state").textContent = reportChecks.length
    ? `${passedPreflight}/${reportChecks.length} exact-file checks passed`
    : "Not run or unavailable for this master";
  document.querySelector("#gate-lulu-state").textContent = acceptedByLulu
    ? `${acceptedByLulu}/${relatedOrders.length} order${acceptedByLulu === 1 ? "" : "s"} accepted by Lulu`
    : "No Lulu acceptance recorded";
  document.querySelector("#book-production-blockers-count").textContent = `${productionBlockers.length} open`;
  document.querySelector("#book-production-blockers-list").replaceChildren(...productionBlockers.map((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    return item;
  }));
  renderBookReviewFiles(slug);
}

function renderBookReviewFiles(storySlug) {
  const list = document.querySelector("#book-review-files-list");
  const summary = document.querySelector("#book-review-files-summary");
  const status = document.querySelector("#book-review-files-status");
  const files = bookReviewFiles.filter((file) => file.storySlug === storySlug);
  status.textContent = "";
  status.className = "book-review-files-status";
  if (bookReviewFilesError) {
    summary.textContent = "Review storage could not be checked";
    list.innerHTML = `<p class="admin-inline-empty">${escapeHtml(bookReviewFilesError)}</p>`;
    return;
  }
  if (!files.length) {
    summary.textContent = "No preserved review PDFs assigned to this book";
    list.innerHTML = '<p class="admin-inline-empty">Use “Download review PDF” to generate a fresh editorial proof from the latest saved copy.</p>';
    return;
  }

  const preserved = files.filter((file) => file.uploaded).length;
  summary.textContent = `${preserved}/${files.length} stored · review PDFs, not print approvals`;
  list.replaceChildren(...files.map((file) => {
    const article = document.createElement("article");
    article.className = `book-review-file ${file.uploaded ? "is-preserved" : "is-pending"}`;
    article.innerHTML = '<header><div><small data-category></small><strong data-label></strong></div><span data-state></span></header><p data-description></p><dl><div><dt>Length</dt><dd data-pages></dd></div><div><dt>File size</dt><dd data-size></dd></div><div><dt>PDF artwork review</dt><dd data-review-status></dd></div><div><dt>Print gate</dt><dd data-print-status></dd></div></dl><div class="book-review-file-scope"><strong>Approval scope</strong><p data-approval-scope></p></div><div class="book-review-file-next"><small>Next action</small><p data-next></p></div><div class="book-review-file-actions"></div>';
    article.querySelector("[data-category]").textContent = file.category;
    article.querySelector("[data-label]").textContent = file.label;
    article.querySelector("[data-state]").textContent = file.uploaded ? "Stored" : "Not stored";
    article.querySelector("[data-description]").textContent = file.description;
    article.querySelector("[data-pages]").textContent = `${file.pages} pages`;
    article.querySelector("[data-size]").textContent = formatFileSize(file.size);
    article.querySelector("[data-review-status]").textContent = file.reviewStatus || "Approval not recorded";
    article.querySelector("[data-print-status]").textContent = file.printStatus || "Not print ready";
    article.querySelector("[data-approval-scope]").textContent = file.approvalScope || "Review material only; no print approval is recorded.";
    article.querySelector("[data-next]").textContent = file.nextAction;
    const actions = article.querySelector(".book-review-file-actions");
    if (file.uploaded && file.downloadUrl) {
      const link = document.createElement("a");
      link.className = "button secondary";
      link.href = file.downloadUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Open PDF";
      actions.append(link);
    } else {
      const input = document.createElement("input");
      const label = document.createElement("label");
      input.type = "file";
      input.accept = "application/pdf,.pdf";
      input.hidden = true;
      label.className = "button secondary";
      label.textContent = "Choose exact PDF";
      label.append(input);
      input.addEventListener("change", () => uploadBookReviewFile(file, input));
      actions.append(label);
    }
    return article;
  }));
}

async function uploadBookReviewFile(metadata, input) {
  const file = input.files?.[0];
  const output = document.querySelector("#book-review-files-status");
  if (!file) return;
  if (file.type !== "application/pdf" || file.size > 20 * 1024 * 1024) {
    output.className = "book-review-files-status is-error";
    output.textContent = "Choose the exact PDF review file, no larger than 20 MB.";
    input.value = "";
    return;
  }
  input.disabled = true;
  output.className = "book-review-files-status is-pending";
  output.textContent = `Verifying ${file.name}…`;
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const prepared = await apiRequest("?resource=book-review-upload", {
      method: "POST",
      body: { id: metadata.id, name: file.name, type: file.type, size: file.size, sha256 },
    });
    output.textContent = `Preserving ${file.name}…`;
    const formData = new FormData();
    formData.append("cacheControl", "0");
    formData.append("", file);
    const upload = await fetch(prepared.signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: formData });
    if (!upload.ok) {
      const error = await upload.json().catch(() => ({}));
      throw new Error(error.message || error.error || "The review PDF could not be preserved.");
    }
    const confirmed = await apiRequest("?resource=book-review-confirm", { method: "POST", body: { id: metadata.id } });
    bookReviewFiles = bookReviewFiles.map((item) => item.id === metadata.id ? confirmed.file : item);
    renderBookWorkspace();
    const refreshedOutput = document.querySelector("#book-review-files-status");
    refreshedOutput.className = "book-review-files-status is-success";
    refreshedOutput.textContent = `${file.name} is preserved for private review.`;
  } catch (error) {
    output.className = "book-review-files-status is-error";
    output.textContent = error.message;
  } finally {
    input.disabled = false;
    input.value = "";
  }
}

async function setupCatalog({ announce = false } = {}) {
  const status = document.querySelector("#catalog-setup-status");
  const button = document.querySelector("#setup-catalog");
  if (announce) status.textContent = "Checking the seven-book catalog…";
  button.disabled = true;
  try {
    const result = await apiRequest("?resource=catalog-setup", { method: "POST", body: {} });
    stories = result.stories || stories;
    if (announce) status.textContent = result.created?.length ? `${result.created.length} missing book${result.created.length === 1 ? "" : "s"} added.` : "All seven master books are already set up.";
    if (!editor.hidden) updateCoverPreview(document.querySelector("#story-slug").value);
    renderStoryList();
    return result;
  } catch (error) {
    if (announce) status.textContent = error.message;
    throw error;
  } finally {
    button.disabled = false;
  }
}

function catalogCover(slug) {
  return CATALOG_COVERS[slug] || "assets/monstersnow-logo-v2.svg";
}

function existingSpreadReference(pageNumber) {
  if (document.querySelector("#story-slug").value !== "halloween-monster-night" || pageNumber < 4 || pageNumber > 31) return "";
  const spreadStart = pageNumber % 2 === 0 ? pageNumber : pageNumber - 1;
  return `assets/storybook/halloween-monster-night/pages-${String(spreadStart).padStart(2, "0")}-${String(spreadStart + 1).padStart(2, "0")}-environment-v1.png`;
}

function existingSpreadLabel(pageNumber) {
  if (!existingSpreadReference(pageNumber)) return "";
  const spreadStart = pageNumber % 2 === 0 ? pageNumber : pageNumber - 1;
  return `Pages ${spreadStart}–${spreadStart + 1}`;
}

function updateCoverPreview(slug) {
  const image = document.querySelector("#story-cover-preview");
  const cover = CATALOG_COVERS[slug];
  image.src = cover || "assets/monstersnow-logo-v2.svg";
  image.alt = cover ? `Current cover for ${document.querySelector("#story-title").value || "this book"}` : "No catalog cover assigned yet";
  image.classList.toggle("is-placeholder", !cover);
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
  const pageNumber = pagesContainer.children.length + 1;
  const card = document.createElement("section");
  card.className = "story-page-card";
  card.innerHTML = `<header class="page-card-header"><span><small>Page content</small><strong>Words &amp; illustration</strong></span><div class="page-card-header-tools"><em data-page-completion>Checking page…</em><div class="page-card-actions"><button type="button" data-page-action="up" aria-label="Move page up" title="Move page up">↑</button><button type="button" data-page-action="down" aria-label="Move page down" title="Move page down">↓</button><button type="button" data-page-action="duplicate">Duplicate</button><button type="button" data-page-action="remove">Remove</button></div></div></header><label class="page-copy-field"><span class="page-field-heading"><b>1</b><span><strong>Story text</strong><small>The words printed in the book</small></span></span><span class="token-toolbar" role="group" aria-label="Insert personalization"><button type="button" data-insert-token="{child_name}">+ Child name</button><button type="button" data-insert-token="{monster_name}">+ Monster name</button></span><textarea rows="8" maxlength="2000" placeholder="Write the words the child will read on this page…"></textarea><small><span data-text-words>0 words</span> · <span data-text-count>0</span>/2,000 characters</small></label><label><span class="page-field-heading"><b>2</b><span><strong>Illustration direction</strong><small>Internal notes for creating or revising the scene</small></span></span><textarea rows="8" maxlength="3000" placeholder="Describe the scene, characters, action, lighting, and composition…"></textarea><small><span data-art-words>0 words</span> · <span data-art-count>0</span>/3,000 characters</small></label><section class="page-artwork-panel"><div class="page-artwork-visual is-empty"><img alt="" data-artwork-image hidden /><div data-artwork-empty><span class="artwork-empty-icon" aria-hidden="true"><i></i></span><strong>Background plate needed</strong><small>Upload the clean scene before positioning the personalized characters.</small><em>JPG, PNG, or WebP · 3 MB maximum</em></div><div class="monster-zone" data-monster-zone role="img" aria-label="Admin-only personalized monster placement"><span>MONSTER AREA</span></div><div class="child-zone" data-child-zone role="img" aria-label="Admin-only personalized child placement"><span>CHILD AREA</span></div></div><div class="page-artwork-controls"><div class="page-artwork-heading"><span class="page-step-number">3</span><span><strong>Individual page background</strong><small data-artwork-name>Upload this page's background without permanent characters.</small></span></div><label class="button secondary artwork-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp" data-artwork-file /> <span data-artwork-upload-label>Upload page background</span></label><label class="artwork-status-label"><span><strong>Background artwork review</strong><small>Applies only to this individual page, not any PDF.</small></span><select data-artwork-review><option value="missing">Background missing</option><option value="draft">Needs background review</option><option value="approved">Background approved</option><option value="final">Final background art</option></select></label><details class="monster-placement-controls"><summary>Monster placement <small>Advanced</small></summary><label>Horizontal <input type="range" min="5" max="95" data-character="monster" data-placement="x" /><output data-character-output="monster-x"></output></label><label>Baseline <input type="range" min="10" max="95" data-character="monster" data-placement="y" /><output data-character-output="monster-y"></output></label><label>Size <input type="range" min="15" max="70" data-character="monster" data-placement="scale" /><output data-character-output="monster-scale"></output></label><div><label>Facing<select data-character="monster" data-placement="facing"><option value="left">Left</option><option value="right">Right</option><option value="neutral">Neutral</option></select></label><label>Layer<select data-character="monster" data-placement="layer"><option value="front">In front</option><option value="behind">Behind foreground</option></select></label></div></details><details class="monster-placement-controls child-placement-controls"><summary>Child placement <small>Advanced</small></summary><label>Horizontal <input type="range" min="5" max="95" data-character="child" data-placement="x" /><output data-character-output="child-x"></output></label><label>Baseline <input type="range" min="10" max="95" data-character="child" data-placement="y" /><output data-character-output="child-y"></output></label><label>Size <input type="range" min="15" max="70" data-character="child" data-placement="scale" /><output data-character-output="child-scale"></output></label><div><label>Facing<select data-character="child" data-placement="facing"><option value="left">Left</option><option value="right">Right</option><option value="neutral">Neutral</option></select></label><label>Layer<select data-character="child" data-placement="layer"><option value="front">In front</option><option value="behind">Behind foreground</option></select></label></div><p>Placement guides are never printed.</p></details><button class="button secondary" type="button" data-remove-artwork hidden>Remove from page</button><p data-artwork-message role="status"></p></div></section>`;
  const artworkBody = card.querySelector(".page-artwork-panel");
  const artworkDetails = document.createElement("details");
  const artworkSummary = document.createElement("summary");
  artworkDetails.className = "page-artwork-panel";
  artworkSummary.innerHTML = '<span><b>3</b><span><strong>Page artwork &amp; placement</strong><small>Background, review status, and character positions</small></span></span><em data-artwork-summary>Background missing</em>';
  artworkBody.className = "page-artwork-body";
  artworkBody.replaceWith(artworkDetails);
  artworkDetails.append(artworkSummary, artworkBody);
  const backgroundCheck = document.createElement("label");
  backgroundCheck.className = "background-plate-check";
  backgroundCheck.innerHTML = '<input type="checkbox" data-background-confirmed /> <span><strong>This page background is character-free</strong><small>Confirms only this image: no permanent child or sample monster appears. This does not approve a PDF or unlock printing.</small></span>';
  card.querySelector(".artwork-status-label").after(backgroundCheck);
  card.dataset.artworkUrl = page.artworkUrl || "";
  card.dataset.artworkPath = page.artworkPath || "";
  card.dataset.artworkName = page.artworkName || "";
  card.dataset.artworkStatus = page.artworkStatus || (page.artworkUrl ? "draft" : "missing");
  card.dataset.artworkUpdatedAt = page.artworkUpdatedAt || "";
  card.dataset.backgroundPlateConfirmed = String(page.backgroundPlateConfirmed === true && Number(page.backgroundPlateVersion || 0) >= 2);
  card.dataset.backgroundPlateVersion = String(Number(page.backgroundPlateVersion || 0));
  card.dataset.referenceArtworkUrl = existingSpreadReference(pageNumber);
  card.dataset.referenceArtworkLabel = existingSpreadLabel(pageNumber);
  card.dataset.artworkRole = "background_plate";
  card.dataset.monsterRequired = String(page.monsterRequired ?? pageNumber !== 3);
  const halloweenChildDefault = document.querySelector("#story-slug").value === "halloween-monster-night" && pageNumber >= 4 && pageNumber <= 31;
  card.dataset.childRequired = String(page.childRequired === undefined ? halloweenChildDefault : page.childRequired === true);
  const placement = page.monsterPlacement || {};
  card.dataset.monsterX = String(placement.x ?? 68);
  card.dataset.monsterY = String(placement.y ?? 72);
  card.dataset.monsterScale = String(placement.scale ?? 36);
  card.dataset.monsterFacing = placement.facing || "left";
  card.dataset.monsterLayer = placement.layer || "front";
  const childPlacement = page.childPlacement || {};
  card.dataset.childX = String(childPlacement.x ?? 30);
  card.dataset.childY = String(childPlacement.y ?? 82);
  card.dataset.childScale = String(childPlacement.scale ?? 30);
  card.dataset.childFacing = childPlacement.facing || "right";
  card.dataset.childLayer = childPlacement.layer || "front";
  const areas = card.querySelectorAll("textarea");
  areas[0].value = page.text || "";
  areas[1].value = page.illustrationPrompt || "";
  const updateCounts = () => {
    card.querySelector("[data-text-count]").textContent = areas[0].value.length;
    card.querySelector("[data-art-count]").textContent = areas[1].value.length;
    card.querySelector("[data-text-words]").textContent = `${wordCount(areas[0].value)} words`;
    card.querySelector("[data-art-words]").textContent = `${wordCount(areas[1].value)} words`;
  };
  areas.forEach((area) => area.addEventListener("input", updateCounts));
  updateCounts();
  card.querySelectorAll("[data-insert-token]").forEach((button) => button.addEventListener("click", () => insertToken(areas[0], button.dataset.insertToken)));
  card.querySelectorAll("[data-page-action]").forEach((button) => button.addEventListener("click", () => handlePageAction(card, button.dataset.pageAction)));
  card.querySelector("[data-artwork-file]").addEventListener("change", (event) => uploadPageArtwork(card, event.target.files?.[0]));
  card.querySelector("[data-artwork-review]").addEventListener("change", (event) => {
    card.dataset.artworkStatus = event.target.value;
    markStoryDirty();
    renderArtwork(card);
    refreshPageTools();
  });
  card.querySelector("[data-background-confirmed]").addEventListener("change", (event) => {
    card.dataset.backgroundPlateConfirmed = String(event.target.checked);
    card.dataset.backgroundPlateVersion = event.target.checked ? "2" : "0";
    markStoryDirty();
    refreshPageTools();
  });
  card.querySelector("[data-remove-artwork]").addEventListener("click", () => removePageArtwork(card));
  card.querySelectorAll("[data-placement]").forEach((control) => control.addEventListener("input", () => updateCharacterPlacement(card, control)));
  renderArtwork(card);
  pagesContainer.append(card);
  if (!loadingStory) { selectedPageIndex = pagesContainer.children.length - 1; markStoryDirty(); refreshPageTools(); selectPage(selectedPageIndex, true); }
}

function renumberPages() {
  const cards = [...pagesContainer.children];
  cards.forEach((card, index) => {
    const moveUp = card.querySelector('[data-page-action="up"]');
    const moveDown = card.querySelector('[data-page-action="down"]');
    const duplicate = card.querySelector('[data-page-action="duplicate"]');
    const remove = card.querySelector('[data-page-action="remove"]');
    moveUp.hidden = index === 0;
    moveDown.hidden = index === cards.length - 1;
    duplicate.hidden = cards.length >= 32;
    remove.hidden = cards.length === 1;
  });
}

function pageRole(index, total = 32) {
  if (index === 0) return "Title page";
  if (index === 1) return "Ownership page";
  if (index === 2) return "Copyright page";
  if (index === total - 1 && total === 32) return "Meet the monster";
  return "Story page";
}

function wordCount(value = "") {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function insertToken(textarea, token) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const prefix = start > 0 && !/\s/.test(textarea.value[start - 1]) ? " " : "";
  const suffix = end < textarea.value.length && !/\s/.test(textarea.value[end]) ? " " : "";
  textarea.setRangeText(`${prefix}${token}${suffix}`, start, end, "end");
  textarea.focus();
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function handlePageAction(card, action) {
  const cards = [...pagesContainer.children];
  const index = cards.indexOf(card);
  if (action === "remove") {
    if (cards.length === 1) return;
    card.remove();
    selectedPageIndex = Math.min(index, pagesContainer.children.length - 1);
  } else if (action === "duplicate") {
    if (cards.length >= 32) return;
    const wasLoading = loadingStory;
    loadingStory = true;
    addPage(pageData(card));
    const duplicate = pagesContainer.lastElementChild;
    card.after(duplicate);
    loadingStory = wasLoading;
    selectedPageIndex = index + 1;
  } else if (action === "up" && index > 0) {
    card.parentElement.insertBefore(card, cards[index - 1]);
    selectedPageIndex = index - 1;
  } else if (action === "down" && index < cards.length - 1) {
    card.parentElement.insertBefore(cards[index + 1], card);
    selectedPageIndex = index + 1;
  } else return;
  renumberPages();
  markStoryDirty();
  refreshPageTools();
  selectPage(selectedPageIndex, true);
}

function pageData(card) {
  const areas = card.querySelectorAll("textarea");
  return {
    text: areas[0].value,
    illustrationPrompt: areas[1].value,
    artworkUrl: card.dataset.artworkUrl || "",
    artworkPath: card.dataset.artworkPath || "",
    artworkName: card.dataset.artworkName || "",
    artworkStatus: card.dataset.artworkStatus || "missing",
    artworkUpdatedAt: card.dataset.artworkUpdatedAt || null,
    artworkRole: "background_plate",
    backgroundPlateConfirmed: card.dataset.backgroundPlateConfirmed === "true",
    backgroundPlateVersion: Number(card.dataset.backgroundPlateVersion || 0),
    monsterRequired: card.dataset.monsterRequired !== "false",
    monsterPlacement: {
      x: Number(card.dataset.monsterX),
      y: Number(card.dataset.monsterY),
      scale: Number(card.dataset.monsterScale),
      facing: card.dataset.monsterFacing,
      layer: card.dataset.monsterLayer,
    },
    childRequired: card.dataset.childRequired === "true",
    childPlacement: {
      x: Number(card.dataset.childX),
      y: Number(card.dataset.childY),
      scale: Number(card.dataset.childScale),
      facing: card.dataset.childFacing,
      layer: card.dataset.childLayer,
    },
  };
}

function updateCharacterPlacement(card, control) {
  const character = control.dataset.character || "monster";
  const key = control.dataset.placement;
  const datasetKey = `${character}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  card.dataset[datasetKey] = control.value;
  renderCharacterPlacements(card);
  markStoryDirty();
  renderSelectedSpread();
}

function renderCharacterPlacements(card) {
  const hasVisual = Boolean(card.dataset.artworkUrl || card.dataset.referenceArtworkUrl);
  for (const character of ["monster", "child"]) {
    const prefix = character.charAt(0).toUpperCase() + character.slice(1);
    const values = {
      x: card.dataset[`${character}X`] || (character === "monster" ? "68" : "30"),
      y: card.dataset[`${character}Y`] || (character === "monster" ? "72" : "82"),
      scale: card.dataset[`${character}Scale`] || (character === "monster" ? "36" : "30"),
      facing: card.dataset[`${character}Facing`] || (character === "monster" ? "left" : "right"),
      layer: card.dataset[`${character}Layer`] || "front",
    };
    card.querySelectorAll(`[data-character="${character}"][data-placement]`).forEach((control) => { control.value = values[control.dataset.placement]; });
    ["x", "y", "scale"].forEach((key) => { card.querySelector(`[data-character-output="${character}-${key}"]`).textContent = `${values[key]}%`; });
    const zone = card.querySelector(`[data-${character}-zone]`);
    zone.style.left = `${values.x}%`;
    zone.style.top = `${values.y}%`;
    zone.style.width = `${values.scale}%`;
    zone.style.transform = `translate(-50%, -100%) scaleX(${values.facing === "right" ? -1 : 1})`;
    zone.dataset.layer = values.layer;
    zone.dataset.facing = values.facing;
    zone.hidden = !hasVisual || card.dataset[`${character}Required`] !== "true";
    const details = card.querySelector(`.${character}-placement-controls`);
    if (details) details.hidden = !hasVisual || card.dataset[`${character}Required`] !== "true";
  }
}

function renderArtwork(card) {
  const image = card.querySelector("[data-artwork-image]");
  const emptyState = card.querySelector("[data-artwork-empty]");
  const remove = card.querySelector("[data-remove-artwork]");
  const status = card.querySelector("[data-artwork-review]");
  const name = card.querySelector("[data-artwork-name]");
  const uploadLabel = card.querySelector("[data-artwork-upload-label]");
  const summary = card.querySelector("[data-artwork-summary]");
  const hasArtwork = Boolean(card.dataset.artworkUrl);
  const hasReference = !hasArtwork && Boolean(card.dataset.referenceArtworkUrl);
  const visibleArtworkUrl = hasArtwork ? card.dataset.artworkUrl : card.dataset.referenceArtworkUrl;
  const visual = card.querySelector(".page-artwork-visual");
  visual.classList.toggle("is-empty", !visibleArtworkUrl);
  visual.classList.toggle("has-artwork", Boolean(visibleArtworkUrl));
  if (hasReference) visual.dataset.referenceLabel = `${card.dataset.referenceArtworkLabel} · character-free environment reference`;
  else delete visual.dataset.referenceLabel;
  image.hidden = !visibleArtworkUrl;
  image.classList.toggle("is-reference", hasReference);
  image.alt = hasReference ? "Existing illustrated Halloween spread used only as a composition reference" : "Uploaded character-free background plate";
  emptyState.hidden = Boolean(visibleArtworkUrl);
  remove.hidden = !hasArtwork;
  status.disabled = !hasArtwork;
  status.value = hasArtwork ? card.dataset.artworkStatus || "draft" : "missing";
  summary.textContent = hasArtwork ? artworkStatusLabel(status.value) : hasReference ? "Reference art available" : "Background missing";
  summary.className = hasArtwork && ["approved", "final"].includes(status.value) ? "is-ready" : "";
  const backgroundConfirmed = card.querySelector("[data-background-confirmed]");
  backgroundConfirmed.checked = card.dataset.backgroundPlateConfirmed === "true";
  backgroundConfirmed.disabled = !hasArtwork;
  uploadLabel.textContent = hasArtwork ? "Replace background plate" : hasReference ? "Upload approved environment plate" : "Upload background plate";
  name.textContent = hasArtwork
    ? `${card.dataset.artworkName || "Uploaded background plate"} · ${artworkStatusLabel(status.value)} · Selected child and monster added later`
    : hasReference
      ? `${card.dataset.referenceArtworkLabel} · Character-free environment reference · Upload it to story storage before approval.`
      : "Upload the background illustration with both personalized character areas empty.";
  if (visibleArtworkUrl && image.getAttribute("src") !== visibleArtworkUrl) image.src = visibleArtworkUrl;
  for (const character of ["monster", "child"]) {
    const zone = card.querySelector(`[data-${character}-zone]`);
    zone.dataset.referenceRemoval = "false";
    zone.querySelector("span").textContent = `${character.toUpperCase()} AREA`;
  }
  renderCharacterPlacements(card);
}

function appendPreviewCharacterZones(art, card) {
  for (const character of ["monster", "child"]) {
    if (card.dataset[`${character}Required`] !== "true") continue;
    const zone = document.createElement("span");
    zone.className = `${character}-zone ${character}-zone-preview`;
    zone.dataset.referenceRemoval = "false";
    const label = document.createElement("span");
    label.textContent = `${character.toUpperCase()} AREA`;
    zone.append(label);
    zone.style.left = `${card.dataset[`${character}X`] || (character === "monster" ? 68 : 30)}%`;
    zone.style.top = `${card.dataset[`${character}Y`] || (character === "monster" ? 72 : 82)}%`;
    zone.style.width = `${card.dataset[`${character}Scale`] || (character === "monster" ? 36 : 30)}%`;
    zone.style.transform = `translate(-50%, -100%) scaleX(${card.dataset[`${character}Facing`] === "right" ? -1 : 1})`;
    zone.dataset.layer = card.dataset[`${character}Layer`] || "front";
    art.append(zone);
  }
}

async function uploadPageArtwork(card, file) {
  const input = card.querySelector("[data-artwork-file]");
  const message = card.querySelector("[data-artwork-message]");
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
    message.textContent = "Choose a JPG, PNG, or WebP image smaller than 3 MB.";
    input.value = "";
    return;
  }
  input.disabled = true;
  message.textContent = "Uploading artwork…";
  try {
    const data = await readFileAsDataUrl(file);
    const storyId = document.querySelector("#story-id").value || document.querySelector("#story-slug").value || "unsaved-story";
    const page = [...pagesContainer.children].indexOf(card) + 1;
    const result = await apiRequest("?resource=artwork", { method: "POST", body: { storyId, page, name: file.name, data } });
    card.dataset.artworkUrl = result.artwork.url;
    card.dataset.artworkPath = result.artwork.path;
    card.dataset.artworkName = result.artwork.name;
    card.dataset.artworkStatus = "draft";
    card.dataset.artworkUpdatedAt = new Date().toISOString();
    message.textContent = "Artwork uploaded. Mark it approved or final after review.";
    renderArtwork(card);
    markStoryDirty();
    refreshPageTools();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    input.disabled = false;
    input.value = "";
  }
}

function removePageArtwork(card) {
  card.dataset.artworkUrl = "";
  card.dataset.artworkPath = "";
  card.dataset.artworkName = "";
  card.dataset.artworkStatus = "missing";
  card.dataset.artworkUpdatedAt = "";
  card.querySelector("[data-artwork-message]").textContent = "Artwork removed from this page. The stored source file was preserved.";
  renderArtwork(card);
  markStoryDirty();
  refreshPageTools();
}

function artworkStatusLabel(status) {
  return ({ missing: "Background missing", draft: "Needs background review", approved: "Background approved", final: "Final background art" })[status] || "Background missing";
}

function openArtworkOverview() {
  artworkFilter = "all";
  renderArtworkOverview();
  artworkDialog.showModal();
}

function renderArtworkOverview() {
  const cards = [...pagesContainer.children];
  const counts = { missing: 0, draft: 0, approved: 0, final: 0 };
  cards.forEach((card) => { counts[card.dataset.artworkStatus || "missing"] += 1; });
  const referenceCount = new Set(cards.map((card) => card.dataset.referenceArtworkUrl).filter(Boolean)).size;
  document.querySelector("#artwork-overview-summary").textContent = `${counts.approved + counts.final}/32 approved or final · ${counts.draft} awaiting review · ${counts.missing} missing${referenceCount ? ` · ${referenceCount} existing spread references` : ""}`;
  document.querySelectorAll("[data-artwork-filter]").forEach((button) => {
    const filter = button.dataset.artworkFilter;
    button.classList.toggle("is-active", filter === artworkFilter);
    const count = filter === "all" ? cards.length : counts[filter];
    button.textContent = `${filter.charAt(0).toUpperCase() + filter.slice(1)} · ${count}`;
  });
  const visible = cards.map((card, index) => ({ card, index })).filter(({ card }) => artworkFilter === "all" || (card.dataset.artworkStatus || "missing") === artworkFilter);
  const grid = document.querySelector("#artwork-overview-grid");
  grid.replaceChildren(...visible.map(({ card, index }) => {
    const button = document.createElement("button");
    const status = card.dataset.artworkStatus || "missing";
    const copyReady = [...card.querySelectorAll("textarea")].every((area) => area.value.trim());
    button.type = "button";
    button.className = `artwork-overview-card is-${status}`;
    button.innerHTML = `<span class="artwork-overview-image"></span><span class="artwork-overview-meta"><small></small><strong></strong><em></em></span>`;
    const visual = button.querySelector(".artwork-overview-image");
    const visualUrl = card.dataset.artworkUrl || card.dataset.referenceArtworkUrl;
    if (visualUrl) {
      const image = document.createElement("img");
      image.src = visualUrl;
      image.alt = "";
      visual.append(image);
    } else visual.textContent = "◇";
    button.querySelector("small").textContent = `Page ${index + 1} · ${pageRole(index, cards.length)}`;
    button.querySelector("strong").textContent = card.dataset.artworkUrl ? artworkStatusLabel(status) : card.dataset.referenceArtworkUrl ? `${card.dataset.referenceArtworkLabel} reference` : artworkStatusLabel(status);
    button.querySelector("em").textContent = copyReady ? "Copy ready" : "Copy needs work";
    button.setAttribute("aria-label", `Edit page ${index + 1}, artwork ${artworkStatusLabel(status)}`);
    button.addEventListener("click", () => {
      artworkDialog.close();
      selectPage(index, true);
      card.querySelector(".page-artwork-panel")?.setAttribute("open", "");
    });
    return button;
  }));
  if (!visible.length) grid.innerHTML = '<div class="artwork-overview-empty"><strong>No pages in this group</strong><span>Choose another artwork status.</span></div>';
}

function openStoryReview() {
  const cards = [...pagesContainer.children];
  if (!cards.length) { editorStatus.textContent = "Add a page before opening book review."; return; }
  document.querySelector("#review-child").value = document.querySelector("#sample-child").value || "Alex";
  document.querySelector("#review-monster").value = document.querySelector("#sample-monster").value || "Milo";
  reviewSpreadIndex = Math.floor(selectedPageIndex / 2);
  renderStoryReview();
  storyReviewDialog.showModal();
}

function storyReviewState(cards = [...pagesContainer.children]) {
  const issues = [];
  if (!document.querySelector("#story-title").value.trim()) issues.push({ page: null, label: "Book title is missing" });
  if (!document.querySelector("#story-slug").value.trim()) issues.push({ page: null, label: "Book slug is missing" });
  if (cards.length !== 32) issues.push({ page: null, label: `${cards.length}/32 pages added` });
  cards.forEach((card, index) => {
    const areas = card.querySelectorAll("textarea");
    if (!areas[0].value.trim()) issues.push({ page: index, label: `Page ${index + 1}: story text is missing` });
    if (!areas[1].value.trim()) issues.push({ page: index, label: `Page ${index + 1}: illustration direction is missing` });
    if (!card.dataset.artworkUrl) issues.push({ page: index, label: `Page ${index + 1}: artwork is missing` });
    else if (card.dataset.backgroundPlateConfirmed !== "true") issues.push({ page: index, label: `Page ${index + 1}: confirm the artwork is a clean background plate` });
    else if (!["approved", "final"].includes(card.dataset.artworkStatus)) issues.push({ page: index, label: `Page ${index + 1}: artwork needs approval` });
    const unknown = `${areas[0].value} ${areas[1].value}`.match(/\{[^}]+\}/g) || [];
    [...new Set(unknown)].filter((token) => !["{child_name}", "{monster_name}"].includes(token)).forEach((token) => issues.push({ page: index, label: `Page ${index + 1}: unknown token ${token}` }));
    if (areas[0].value.length > 1200) issues.push({ page: index, label: `Page ${index + 1}: story text needs a length review` });
  });
  return { issues, ready: cards.length === 32 && issues.length === 0 };
}

function renderStoryReview() {
  const cards = [...pagesContainer.children];
  if (!cards.length) return;
  const spreadCount = Math.ceil(cards.length / 2);
  reviewSpreadIndex = Math.max(0, Math.min(reviewSpreadIndex, spreadCount - 1));
  const firstPage = reviewSpreadIndex * 2;
  const child = document.querySelector("#review-child").value.trim() || "Alex";
  const monster = document.querySelector("#review-monster").value.trim() || "Milo";
  const state = storyReviewState(cards);
  document.querySelector("#story-review-title").textContent = (document.querySelector("#story-title").value || "Untitled master book")
    .replaceAll("{child_name}", child)
    .replaceAll("{monster_name}", monster);
  document.querySelector("#story-review-summary").textContent = `Reviewing with ${child} and ${monster} · ${cards.length} pages`;
  document.querySelector("#review-spread-label").textContent = `Spread ${reviewSpreadIndex + 1} of ${spreadCount} · Pages ${firstPage + 1}${cards[firstPage + 1] ? `–${firstPage + 2}` : ""}`;
  document.querySelector("#review-previous").disabled = reviewSpreadIndex === 0;
  document.querySelector("#review-next").disabled = reviewSpreadIndex === spreadCount - 1;

  const spread = document.querySelector("#story-review-spread");
  spread.replaceChildren(...cards.slice(firstPage, firstPage + 2).map((card, offset) => buildReviewPage(card, firstPage + offset, child, monster)));
  document.querySelector("#story-review-spread-nav").replaceChildren(...Array.from({ length: spreadCount }, (_, index) => {
    const button = document.createElement("button");
    const pageIssues = state.issues.some((issue) => issue.page === index * 2 || issue.page === index * 2 + 1);
    button.type = "button";
    button.textContent = String(index + 1);
    button.className = `${index === reviewSpreadIndex ? "is-current" : ""} ${pageIssues ? "has-issue" : "is-ready"}`;
    button.setAttribute("aria-label", `Spread ${index + 1}${pageIssues ? ", needs attention" : ", ready"}`);
    button.addEventListener("click", () => { reviewSpreadIndex = index; renderStoryReview(); });
    return button;
  }));

  document.querySelector("#review-readiness-title").textContent = state.ready ? "Artwork master ready" : "Artwork review required";
  document.querySelector("#review-readiness-count").textContent = state.ready ? "All 32 pages passed" : `${state.issues.length} issue${state.issues.length === 1 ? "" : "s"}`;
  const issues = document.querySelector("#story-review-issues");
  if (!state.issues.length) issues.innerHTML = "<li class=\"is-ready\">✓ Copy, artwork, personalization, and page count passed.</li>";
  else issues.replaceChildren(...state.issues.map((issue) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = issue.label;
    if (issue.page !== null) button.addEventListener("click", () => { storyReviewDialog.close(); selectPage(issue.page, true); });
    else button.disabled = true;
    item.append(button);
    return item;
  }));
  const approve = document.querySelector("#approve-master-story");
  approve.disabled = !state.ready || savingStory;
  approve.textContent = state.ready ? "Approve artwork master" : "Resolve artwork issues";
}

function buildReviewPage(card, index, child, monster) {
  const section = document.createElement("section");
  section.className = "review-page";
  section.innerHTML = '<header><span></span><button type="button">Edit page</button></header><div class="review-page-art"></div><p></p><footer><span></span><span></span></footer>';
  section.querySelector("header span").textContent = `Page ${index + 1} · ${pageRole(index, pagesContainer.children.length)}`;
  section.querySelector("header button").addEventListener("click", () => { storyReviewDialog.close(); selectPage(index, true); });
  const art = section.querySelector(".review-page-art");
  const visualUrl = card.dataset.artworkUrl || card.dataset.referenceArtworkUrl;
  if (visualUrl) {
    const image = document.createElement("img"); image.src = visualUrl; image.alt = card.dataset.artworkUrl ? `Artwork for page ${index + 1}` : `Existing spread reference for page ${index + 1}`; art.append(image);
  } else art.innerHTML = "<span>Artwork missing</span>";
  if (visualUrl) appendPreviewCharacterZones(art, card);
  section.querySelector("p").textContent = card.querySelectorAll("textarea")[0].value.replaceAll("{child_name}", child).replaceAll("{monster_name}", monster) || "No story text yet.";
  const footer = section.querySelectorAll("footer span");
  footer[0].textContent = card.dataset.artworkUrl ? `${artworkStatusLabel(card.dataset.artworkStatus || "missing")} background plate` : card.dataset.referenceArtworkUrl ? "Environment reference · upload required" : "Background plate missing";
  footer[1].textContent = `${wordCount(card.querySelectorAll("textarea")[0].value)} words`;
  return section;
}

async function approveMasterStory() {
  const state = storyReviewState();
  if (!state.ready || !window.confirm("Approve and publish this story and its individual page backgrounds? This does not approve any PDF or release a print file.")) return;
  const status = document.querySelector("#story-review-status");
  status.textContent = "Saving and approving the artwork master…";
  const saved = await saveStory("published");
  if (saved) {
    storyReviewDialog.close();
    editorStatus.textContent = `Artwork master approved and published as version ${saved.version}. Review-PDF and print approval remain separate.`;
  } else status.textContent = editorStatus.textContent || "The master book could not be approved.";
}

function storyPayload(status) {
  return {
    title_template: document.querySelector("#story-title").value,
    slug: document.querySelector("#story-slug").value,
    description: document.querySelector("#story-description").value,
    status,
    is_seasonal: document.querySelector("#story-seasonal").checked,
    available_from: document.querySelector("#story-from").value || null,
    available_until: document.querySelector("#story-until").value || null,
    pages: [...pagesContainer.children].map(pageData),
  };
}

async function saveStory(status, { silent = false } = {}) {
  if (savingStory) return null;
  clearTimeout(storyAutosaveTimer);
  if (!silent && !editor.reportValidity()) return null;
  const artIncomplete = [...pagesContainer.children].some((card) => !card.dataset.artworkUrl || card.dataset.backgroundPlateConfirmed !== "true" || Number(card.dataset.backgroundPlateVersion || 0) < 2 || !["approved", "final"].includes(card.dataset.artworkStatus));
  if (status === "published" && (pagesContainer.children.length !== 32 || [...pagesContainer.querySelectorAll("textarea")].some((area) => !area.value.trim()) || artIncomplete)) {
    editorStatus.textContent = "Complete all 32 pages and approve a version 2 clean background plate for every page before publishing. You can save a draft at any time.";
    return null;
  }
  const id = document.querySelector("#story-id").value;
  if (silent && (!id || !document.querySelector("#story-title").value.trim() || !document.querySelector("#story-slug").value.trim())) return null;
  const payload = storyPayload(status);
  if (!silent) editorStatus.textContent = status === "published" ? "Publishing..." : "Saving draft...";
  else document.querySelector("#story-save-state").textContent = "Autosaving…";
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
      if (silent) {
        document.querySelector("#story-save-state").textContent = "Autosaved just now";
        renderStoryList();
      } else {
        editStory(result.story);
        editorStatus.textContent = status === "published" ? "Story published." : "Draft saved.";
      }
    } else {
      document.querySelector("#story-id").value = result.story.id;
      renderStoryList();
      editorStatus.textContent = "Saved. Your newer edits still need saving.";
    }
    return result.story;
  } catch (error) {
    if (silent) {
      document.querySelector("#story-save-state").textContent = "Autosave paused · save manually";
    } else editorStatus.textContent = error.message;
    return null;
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
  clearTimeout(storyAutosaveTimer);
  sessionStorage.removeItem("monstersnow_admin_password");
  adminPassword = "";
  passwordInput.value = "";
  adminApp.hidden = true;
  login.hidden = false;
  loginStatus.className = "is-success";
  loginStatus.textContent = "Signed out.";
  passwordInput.focus();
}

async function apiRequest(query = "", options = {}, retryCount = 0) {
  const method = String(options.method || "GET").toUpperCase();
  const response = await fetch(`/api/storybook-interest${query}`, {
    method,
    headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const retryableTimestampFailure = method === "GET"
      && retryCount === 0
      && response.status === 401
      && result.code === "PGRST303"
      && /jwt issued at future/i.test(String(result.error || ""));
    if (retryableTimestampFailure) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return apiRequest(query, options, retryCount + 1);
    }
    const error = new Error(result.error || "The story library could not be opened.");
    error.code = result.code || "admin_request_failed";
    error.status = response.status;
    throw error;
  }
  return result;
}

function markStoryDirty() {
  if (loadingStory) return;
  storyDirty = true;
  storyRevision += 1;
  document.querySelector("#story-save-state").textContent = "Unsaved changes";
  scheduleStoryAutosave();
}

function scheduleStoryAutosave() {
  clearTimeout(storyAutosaveTimer);
  const id = document.querySelector("#story-id").value;
  const current = stories.find((story) => story.id === id);
  if (!id || current?.status === "published") return;
  storyAutosaveTimer = setTimeout(() => saveStory("draft", { silent: true }), 2500);
}

function storyStage(story, ready = null) {
  const complete = ready ?? (story?.pages || []).filter((page) => page.text?.trim() && page.illustrationPrompt?.trim()).length;
  if (story?.status === "published") return "Published";
  if (complete === 32) return "Content ready";
  if (complete > 0) return "In progress";
  return "Draft";
}

function selectPage(index, focus = false) {
  const cards = [...pagesContainer.children];
  if (!cards.length) return;
  selectedPageIndex = Math.max(0, Math.min(index, cards.length - 1));
  cards.forEach((card, cardIndex) => {
    const active = cardIndex === selectedPageIndex;
    card.hidden = !active;
    card.classList.toggle("is-active", active);
  });
  [...document.querySelector("#page-nav").children].forEach((button, buttonIndex) => button.classList.toggle("is-selected", buttonIndex === selectedPageIndex));
  document.querySelector("#selected-page-title").textContent = `Page ${selectedPageIndex + 1} · ${pageRole(selectedPageIndex, cards.length)}`;
  document.querySelector("#previous-page").disabled = selectedPageIndex === 0;
  document.querySelector("#next-page").disabled = selectedPageIndex === cards.length - 1;
  if (focus) cards[selectedPageIndex].querySelector("textarea")?.focus();
  renderSelectedSpread(cards);
}

function renderSelectedSpread(cards = [...pagesContainer.children]) {
  const child = document.querySelector("#sample-child").value || "Alex";
  const monster = document.querySelector("#sample-monster").value || "Milo";
  const firstIndex = selectedPageIndex % 2 === 0 ? selectedPageIndex : selectedPageIndex - 1;
  const spread = cards.slice(firstIndex, firstIndex + 2);
  const preview = document.querySelector("#story-preview");
  const article = document.createElement("article");
  spread.forEach((card, offset) => {
    const section = document.createElement("section");
    section.classList.toggle("is-selected", firstIndex + offset === selectedPageIndex);
    section.innerHTML = "<small></small><div data-preview-art></div><p></p>";
    section.querySelector("small").textContent = `Page ${firstIndex + offset + 1}`;
    const art = section.querySelector("[data-preview-art]");
    const visualUrl = card.dataset.artworkUrl || card.dataset.referenceArtworkUrl;
    if (visualUrl) {
      const image = document.createElement("img");
      image.src = visualUrl;
      image.alt = card.dataset.artworkUrl ? `Artwork for page ${firstIndex + offset + 1}` : `Existing spread reference for page ${firstIndex + offset + 1}`;
      art.append(image);
    } else art.textContent = "Artwork pending";
    if (visualUrl) appendPreviewCharacterZones(art, card);
    section.querySelector("p").textContent = card.querySelector("textarea").value.replaceAll("{child_name}", child).replaceAll("{monster_name}", monster) || "No story text yet.";
    article.append(section);
  });
  preview.replaceChildren(article);
}

function refreshPageTools() {
  const cards = [...pagesContainer.children];
  const ready = cards.filter((card) => [...card.querySelectorAll("textarea")].every((area) => area.value.trim())).length;
  const artworkReady = cards.filter((card) => card.dataset.artworkUrl && card.dataset.backgroundPlateConfirmed === "true" && ["approved", "final"].includes(card.dataset.artworkStatus)).length;
  const referenceCount = new Set(cards.map((card) => card.dataset.referenceArtworkUrl).filter(Boolean)).size;
  renderBookWorkspace(currentStory(), cards);
  document.querySelector("#page-progress").textContent = `${ready}/32 copy · ${artworkReady}/32 final art${referenceCount ? ` · ${referenceCount} existing spread references` : ""}`;
  document.querySelector("#add-page").hidden = cards.length >= 32;
  document.querySelector("#page-nav").replaceChildren(...cards.map((card, index) => {
    card.id = `book-page-${index + 1}`;
    const button = document.createElement("button");
    button.type = "button";
    const complete = [...card.querySelectorAll("textarea")].every((area) => area.value.trim());
    const artStatus = card.dataset.artworkStatus || "missing";
    const pageReady = complete && card.dataset.artworkUrl && card.dataset.backgroundPlateConfirmed === "true" && ["approved", "final"].includes(artStatus);
    const completion = card.querySelector("[data-page-completion]");
    completion.textContent = pageReady ? "Page ready" : !complete ? "Copy needs work" : card.dataset.referenceArtworkUrl && !card.dataset.artworkUrl ? "Reference art available" : card.dataset.artworkUrl ? "Artwork needs review" : "Artwork needed";
    completion.className = pageReady ? "is-ready" : "needs-work";
    button.innerHTML = `<span>${index + 1}</span><small>${escapeHtml(pageRole(index, cards.length))}</small><em>${complete ? "Copy ready" : "Copy needed"} · ${escapeHtml(artworkStatusLabel(artStatus))}</em>`;
    button.className = `${complete ? "is-ready" : ""} is-art-${artStatus}`;
    button.setAttribute("aria-label", `Page ${index + 1}, ${pageRole(index, cards.length)}, ${complete ? "copy ready" : "copy incomplete"}, artwork ${artworkStatusLabel(artStatus)}`);
    button.addEventListener("click", () => selectPage(index, true));
    return button;
  }));
  renumberPages();
  const stage = storyStage({ status: stories.find((story) => story.id === document.querySelector("#story-id").value)?.status, pages: [] }, ready);
  document.querySelector("#story-stage").textContent = stage;
  document.querySelector("#story-stage").className = `is-${stage.toLowerCase().replaceAll(" ", "-")}`;
  if (artworkDialog.open) renderArtworkOverview();
  selectPage(selectedPageIndex);
}

function openOrderDetail(order) {
  selectedOrder = order;
  document.querySelector("#order-detail-title").textContent = `${order.child_name || "Customer"}'s personalized book`;
  document.querySelector("#order-detail-id").textContent = `Order ${order.id}`;
  document.querySelector("#order-detail-age").textContent = `${orderNeedsAttention(order) ? "Needs follow-up · " : "Updated "}${relativeAge(order.updated_at || order.created_at)}`;
  const childProfile = order.child_character || {};
  const legacyAge = ["2-4", "5-6", "7-8"].includes(childProfile.ageBand);
  const childProfileLabel = childProfile.included === false || childProfile.id === "none"
    ? "Monster only"
    : `${childProfile.label || "Illustrated child"} · ${childProfile.ageBand || "age not selected"}${legacyAge ? " · legacy age — reselect 3–5 or 6–8" : ""}${childProfile.mobilityAid === "wheelchair" ? " · wheelchair" : ""}`;
  const fields = { Customer: order.customer_email, Child: order.child_name, "Child character": childProfileLabel, Monster: order.monster_name, Story: order.story_label, Format: order.format_id, Style: order.monster_style, Total: formatMoney(order.stripe_total_cents ?? order.amount_cents, order.currency || "USD"), Created: new Date(order.created_at).toLocaleString(), Paid: order.stripe_paid_at ? new Date(order.stripe_paid_at).toLocaleString() : "Not verified", "Stripe checkout": order.stripe_checkout_session_id || "Not recorded", "Payment intent": order.stripe_payment_intent_id || "Not recorded", "Payment issue": order.payment_issue?.replaceAll("_", " ") || "None", "Preview ID": order.selected_preview_id || "Not recorded" };
  const list = document.querySelector("#order-detail-fields");
  list.replaceChildren();
  Object.entries(fields).forEach(([label, value]) => { const term = document.createElement("dt"); const detail = document.createElement("dd"); term.textContent = label; detail.textContent = value || "—"; list.append(term, detail); });
  renderOrderArtwork(order.monster_assets);
  const savedAddress = order.shipping_address || {};
  document.querySelector("#lulu-recipient-name").value = order.shipping_name || "";
  document.querySelector("#lulu-email").value = order.customer_email || "";
  document.querySelector("#lulu-phone").value = order.shipping_phone || "";
  document.querySelector("#lulu-street").value = savedAddress.line1 || "";
  document.querySelector("#lulu-city").value = savedAddress.city || "";
  document.querySelector("#lulu-state").value = savedAddress.state || "";
  document.querySelector("#lulu-postcode").value = savedAddress.postal_code || "";
  document.querySelector("#lulu-country").value = savedAddress.country || "US";
  document.querySelector("#lulu-shipping-level").value = "MAIL";
  document.querySelector("#proof-review-confirm").checked = false;
  renderProofApproval(order);
  syncOrderStatusOptions(order);
  document.querySelector("#order-detail-notes").value = order.notes || "";
  document.querySelector("#order-detail-message").textContent = "";
  renderOrderProgress(order);
  renderOrderNextAction(order);
  orderDialog.showModal();
}

function syncOrderStatusOptions(order) {
  const select = document.querySelector("#order-detail-status");
  const editableStatuses = new Set([order.status, "cancelled"]);
  if (!order.payment_issue) {
    if (order.status === "paid") editableStatuses.add("proofing");
    if (order.status === "printing" && order.lulu_print_job_id) editableStatuses.add("shipped");
    if (order.status === "shipped") editableStatuses.add("completed");
  }
  select.replaceChildren(...orderStatuses.filter((status) => editableStatuses.has(status)).map((status) => new Option(status.replaceAll("_", " "), status, false, status === order.status)));
}

function renderOrderNextAction(order) {
  const customerStatus = order.customer_proof_status || "not_ready";
  const proofingAction = !order.customer_proof_path
    ? ["Upload the complete personalized book", "Lock the customer proof plus the exact Lulu interior and wrap-cover PDFs."]
    : customerStatus === "changes_requested"
      ? ["Revise and republish the customer proof", order.customer_proof_revision_notes || "The customer requested changes to this version."]
      : customerStatus === "ready"
        ? ["Waiting for customer approval", "The private proof is published. Copy the link if the customer needs it again."]
        : customerStatus === "approved" && !order.proof_fingerprint
          ? ["Review and approve the complete book", "Open the full proof, review all pages, then lock this exact version for print."]
          : ["Finish the personalized proof", "Complete the next open production gate below."];
  const actions = {
    checkout_started: ["Verify payment in Stripe", "Confirm payment before beginning book production."],
    paid: ["Start the personalized book", "Move the paid order into proofing to begin production."],
    proofing: proofingAction,
    approved: ["Add shipping and send to Lulu Sandbox", "Lulu will validate the locked cover and interior before creating the test print job."],
    printing: ["Monitor the Lulu print job", order.lulu_print_job_id ? `Print job ${order.lulu_print_job_id} is in production.` : "Confirm the printer accepted the order."],
    shipped: ["Confirm delivery", "Complete the order after the book reaches the customer."],
    completed: ["Production complete", "The book was approved, submitted, and fulfilled."],
    cancelled: ["Order cancelled", "No production action is available."],
  };
  const [title, help] = order.payment_issue
    ? ["Resolve the Stripe payment issue", `Fulfillment is blocked: ${order.payment_issue.replaceAll("_", " ")}. Review the payment in Stripe.`]
    : actions[order.status] || ["Review this order", "Confirm the current fulfillment state."];
  document.querySelector(".order-next-action").classList.toggle("is-blocked", Boolean(order.payment_issue));
  document.querySelector("#order-next-action").textContent = title;
  document.querySelector("#order-next-help").textContent = help;
}

function renderProofApproval(order) {
  const approved = Boolean(order.proof_fingerprint && order.proof_approved_at);
  const submitted = Boolean(order.lulu_print_job_id);
  const customerStatus = order.customer_proof_status || "not_ready";
  const state = document.querySelector("#proof-approval-state");
  const approve = document.querySelector("#approve-order-proof");
  const revoke = document.querySelector("#revoke-order-proof");
  const send = document.querySelector("#send-order-lulu");
  const help = document.querySelector("#proof-approval-help");
  const blocked = Boolean(order.payment_issue);
  const productionReady = hasOrderProductionFiles(order);
  const reviewConfirmation = document.querySelector("#proof-review-confirm");
  const reviewConfirmationWrap = document.querySelector("#full-proof-confirmation");
  const customerStageStatus = document.querySelector("#customer-proof-stage-status");
  const studioStageStatus = document.querySelector("#studio-approval-stage-status");
  const luluStageStatus = document.querySelector("#lulu-stage-status");
  const fulfillmentStageStatus = document.querySelector("#fulfillment-stage-status");
  const job = document.querySelector("#order-lulu-job");
  if (submitted) {
    state.textContent = `Sent to Lulu · job ${order.lulu_print_job_id}`;
    help.textContent = order.lulu_submitted_at ? `Submitted ${new Date(order.lulu_submitted_at).toLocaleString()}.` : "The print job has been submitted.";
  } else if (approved) {
    state.textContent = `Approved ${new Date(order.proof_approved_at).toLocaleString()} by ${order.proof_approved_by || "MonstersNOW admin"}.`;
    help.textContent = `Master v${order.master_story_version || "?"} · fingerprint ${order.proof_fingerprint.slice(0, 12)}… Final PDFs must pass Lulu validation before sending.`;
  } else if (customerStatus === "approved") {
    state.textContent = `Customer approved PDF ${order.customer_proof_fingerprint?.slice(0, 12) || ""}…`;
    help.textContent = productionReady ? "Open the customer proof and both locked print files, then approve this exact package." : "The customer proof is approved, but the exact Lulu interior and cover files are missing.";
  } else if (customerStatus === "changes_requested") {
    state.textContent = "Customer requested proof changes.";
    help.textContent = order.customer_proof_revision_notes || "Prepare and publish a revised PDF for review.";
  } else if (customerStatus === "ready") {
    state.textContent = "Customer proof published · awaiting customer response.";
    help.textContent = `PDF fingerprint ${order.customer_proof_fingerprint?.slice(0, 12) || ""}… Copy the private link if email delivery is handled separately.`;
  } else {
    state.textContent = "No customer proof has been published.";
    help.textContent = "Upload the exact cover-and-interior PDF. Customer approval is required before final production approval.";
  }
  customerStageStatus.textContent = customerStatus === "approved" ? "Customer approved" : customerStatus === "changes_requested" ? "Changes requested" : customerStatus === "ready" ? "Awaiting customer" : "Not published";
  studioStageStatus.textContent = approved ? "Locked" : customerStatus === "approved" ? "Ready for review" : "Waiting";
  luluStageStatus.textContent = submitted ? "Accepted" : approved ? "Ready to send" : "Sandbox";
  fulfillmentStageStatus.textContent = order.status === "completed" ? "Complete" : order.status === "shipped" ? "Shipped" : order.status === "printing" ? "Printing" : "Waiting";
  reviewConfirmationWrap.hidden = approved || submitted;
  reviewConfirmation.disabled = customerStatus !== "approved" || blocked;
  if (customerStatus !== "approved" || approved || submitted) reviewConfirmation.checked = false;
  approve.hidden = approved || submitted;
  approve.disabled = blocked || customerStatus !== "approved" || !productionReady || !reviewConfirmation.checked || !["proofing", "approved"].includes(order.status);
  approve.title = customerStatus !== "approved"
    ? "The customer must approve the current proof first."
    : !productionReady
      ? "Upload the exact Lulu interior and wrap-cover PDFs first."
    : !reviewConfirmation.checked
      ? "Open and review the complete proof, then confirm the review checklist."
      : "Lock this exact customer-approved PDF for print.";
  revoke.hidden = !approved || submitted;
  document.querySelector("#customer-proof-upload").hidden = approved || submitted || order.status !== "proofing";
  document.querySelector("#publish-customer-proof").disabled = blocked || order.status !== "proofing";
  document.querySelector("#customer-proof-link-actions").hidden = !order.customer_proof_path;
  document.querySelector("#open-production-interior").hidden = !productionReady;
  document.querySelector("#open-production-cover").hidden = !productionReady;
  document.querySelector("#lulu-shipping-fields").hidden = !approved || submitted;
  send.hidden = submitted;
  send.disabled = blocked || !approved || submitted;
  send.title = blocked ? "Resolve the Stripe payment issue first." : approved ? "Validate the production PDFs and create the Lulu Sandbox print job." : "Approve the proof first.";
  job.hidden = !submitted;
  if (submitted) job.innerHTML = `<span>Lulu Sandbox print job</span><strong>${escapeHtml(order.lulu_print_job_id)}</strong><small>${order.lulu_submitted_at ? `Submitted ${escapeHtml(new Date(order.lulu_submitted_at).toLocaleString())}` : "Submission recorded"}</small>`;
  renderOrderBookChecklist(order);
  renderWorkflowStageStates(order);
}

function renderOrderBookChecklist(order) {
  const child = order.child_character || {};
  const monsterOnly = child.included === false || child.id === "none";
  const statusIndex = orderStatuses.indexOf(order.status);
  const checks = [
    { label: "Payment verified", detail: order.stripe_paid_at ? new Date(order.stripe_paid_at).toLocaleDateString() : "Waiting for verified Stripe payment", ready: Boolean(order.stripe_paid_at) || statusIndex >= orderStatuses.indexOf("paid") },
    { label: "Story and format locked", detail: order.story_label && order.format_id ? `${order.story_label} · ${order.format_id}` : "Story or print format missing", ready: Boolean(order.story_id && order.format_id) },
    { label: "Monster locked", detail: order.selected_preview_id ? "Exact selected preview saved" : "Select the customer's approved monster", ready: Boolean(order.monster_submission_id && order.selected_preview_id && order.monster_assets?.selectedPreviewUrl) },
    { label: monsterOnly ? "Monster-only story" : "Child character locked", detail: monsterOnly ? "No child character requested" : child.label || "Character selection missing", ready: monsterOnly || Boolean(child.id || child.label) },
    { label: "Complete customer proof", detail: order.customer_proof_path ? "Exact review file stored privately" : "Cover and 32-page review PDF still needed", ready: Boolean(order.customer_proof_path) },
    { label: "Exact Lulu print files", detail: hasOrderProductionFiles(order) ? "Interior and wrap cover locked privately" : "Final interior and wrap-cover PDFs still needed", ready: hasOrderProductionFiles(order) },
  ];
  const readyCount = checks.filter((check) => check.ready).length;
  document.querySelector("#order-book-stage-status").textContent = order.customer_proof_path && hasOrderProductionFiles(order) ? "Files locked" : `${readyCount}/${checks.length} ready`;
  document.querySelector("#order-book-checklist").replaceChildren(...checks.map((check) => {
    const item = document.createElement("div");
    item.className = check.ready ? "is-ready" : "is-pending";
    item.innerHTML = `<span aria-hidden="true">${check.ready ? "✓" : "•"}</span><div><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail)}</small></div>`;
    return item;
  }));
}

function renderWorkflowStageStates(order) {
  const approved = Boolean(order.proof_fingerprint && order.proof_approved_at);
  const submitted = Boolean(order.lulu_print_job_id);
  const customerApproved = order.customer_proof_status === "approved";
  const stages = [
    ["order-book-stage", Boolean(order.customer_proof_path) && hasOrderProductionFiles(order)],
    ["order-customer-proof-stage", customerApproved],
    ["order-studio-approval-stage", approved],
    ["order-lulu-stage", submitted],
    ["order-fulfillment-stage", order.status === "completed"],
  ];
  const current = stages.findIndex(([, complete]) => !complete);
  stages.forEach(([id, complete], index) => {
    const stage = document.querySelector(`#${id}`);
    stage.classList.toggle("is-complete", complete);
    stage.classList.toggle("is-current", !complete && index === current);
    stage.classList.toggle("is-blocked", Boolean(order.payment_issue));
  });
}

function hasOrderProductionFiles(order) {
  return Boolean(order?.production_interior_path && order?.production_interior_fingerprint && order?.production_cover_path && order?.production_cover_fingerprint);
}

async function publishSelectedCustomerProof() {
  if (!selectedOrder) return;
  const fileInput = document.querySelector("#customer-proof-file");
  const interiorInput = document.querySelector("#production-interior-file");
  const coverInput = document.querySelector("#production-cover-file");
  const file = fileInput.files?.[0];
  const interiorFile = interiorInput.files?.[0];
  const coverFile = coverInput.files?.[0];
  const message = document.querySelector("#order-detail-message");
  const files = [file, interiorFile, coverFile];
  if (files.some((item) => !item || item.type !== "application/pdf")) { message.textContent = "Choose the customer proof, Lulu interior, and Lulu wrap-cover PDFs."; return; }
  if (files.some((item) => item.size > 250 * 1024 * 1024)) { message.textContent = "Each PDF must be smaller than 250 MB."; return; }
  if (!window.confirm("Publish this customer proof and lock these exact Lulu print files? Publishing a revision invalidates the previous customer response.")) return;
  const button = document.querySelector("#publish-customer-proof");
  button.disabled = true;
  message.textContent = "Fingerprinting the customer proof and exact print files…";
  try {
    const roles = ["proof", "interior", "cover"];
    const metadata = await Promise.all(files.map((selectedFile, index) => pdfUploadMetadata(selectedFile, roles[index])));
    const prepared = await apiRequest(`?resource=orders&id=${encodeURIComponent(selectedOrder.id)}`, {
      method: "PATCH",
      body: { action: "prepare_customer_proof_upload", files: metadata },
    });
    message.textContent = "Uploading three private PDFs…";
    await Promise.all(prepared.order.files.map((upload) => uploadSignedPdf(upload, files[roles.indexOf(upload.role)])));
    message.textContent = "Confirming the locked production package…";
    const result = await apiRequest(`?resource=orders&id=${encodeURIComponent(selectedOrder.id)}`, {
      method: "PATCH",
      body: { action: "publish_customer_proof", files: metadata },
    });
    Object.assign(selectedOrder, result.order);
    fileInput.value = "";
    interiorInput.value = "";
    coverInput.value = "";
    renderProofApproval(selectedOrder);
    renderOrderProgress(selectedOrder);
    renderOrderNextAction(selectedOrder);
    renderOrders(); renderDashboard();
    const copied = result.order.customer_proof_link ? await copyText(result.order.customer_proof_link) : false;
    message.textContent = copied
      ? "Customer proof and exact print files locked. The private customer link was copied."
      : "Customer proof and exact print files locked. Use Copy private customer link to send it through your approved communication channel.";
  } catch (error) { message.textContent = error.message; }
  finally { renderProofApproval(selectedOrder); }
}

async function pdfUploadMetadata(file, role) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { role, name: file.name, type: file.type, size: file.size, sha256 };
}

async function uploadSignedPdf(prepared, file) {
  if (!prepared?.signedUrl || !file) throw new Error("A private PDF upload could not be prepared.");
  const formData = new FormData();
  formData.append("cacheControl", "0");
  formData.append("", file);
  const response = await fetch(prepared.signedUrl, { method: "PUT", headers: { "x-upsert": "true" }, body: formData });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || `The ${prepared.role} PDF could not be stored.`);
  }
}

async function copySelectedCustomerProofLink() {
  if (!selectedOrder) return;
  const message = document.querySelector("#order-detail-message");
  message.textContent = "Creating the private customer link…";
  try {
    const result = await apiRequest(`?resource=orders&id=${encodeURIComponent(selectedOrder.id)}`, { method: "PATCH", body: { action: "get_customer_proof_link" } });
    const copied = await copyText(result.order.customer_proof_link);
    message.textContent = copied ? "Private customer proof link copied." : "Private customer proof link is ready in the copy dialog.";
  } catch (error) { message.textContent = error.message; }
}

async function openSelectedCustomerProofLink() {
  if (!selectedOrder) return;
  const message = document.querySelector("#order-detail-message");
  const proofWindow = window.open("about:blank", "_blank");
  if (proofWindow) proofWindow.opener = null;
  message.textContent = "Opening the private full-book proof…";
  try {
    const result = await apiRequest(`?resource=orders&id=${encodeURIComponent(selectedOrder.id)}`, { method: "PATCH", body: { action: "get_customer_proof_link" } });
    if (proofWindow) {
      proofWindow.location.replace(result.order.customer_proof_link);
      message.textContent = "Full-book proof opened in a new tab.";
    } else {
      const copied = await copyText(result.order.customer_proof_link);
      message.textContent = copied ? "Pop-ups were blocked, so the private proof link was copied." : "Allow pop-ups to open the proof in a new tab.";
    }
  } catch (error) {
    proofWindow?.close();
    message.textContent = error.message;
  }
}

async function openSelectedProductionFile(type) {
  if (!selectedOrder || !["interior", "cover"].includes(type)) return;
  const message = document.querySelector("#order-detail-message");
  const fileWindow = window.open("about:blank", "_blank");
  if (fileWindow) fileWindow.opener = null;
  message.textContent = `Opening the locked print ${type}…`;
  try {
    const result = await apiRequest(`?resource=orders&id=${encodeURIComponent(selectedOrder.id)}`, { method: "PATCH", body: { action: "get_production_file_links" } });
    const url = type === "interior" ? result.order.production_interior_url : result.order.production_cover_url;
    if (fileWindow) {
      fileWindow.location.replace(url);
      message.textContent = `Locked print ${type} opened in a new tab.`;
    } else {
      const copied = await copyText(url);
      message.textContent = copied ? `Pop-ups were blocked, so the print ${type} link was copied.` : `Allow pop-ups to open the print ${type}.`;
    }
  } catch (error) {
    fileWindow?.close();
    message.textContent = error.message;
  }
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return true; } catch {}
  }
  window.prompt("Copy this private customer proof link:", value);
  return false;
}

async function approveSelectedOrderProof() {
  if (!selectedOrder || !window.confirm("Lock the exact customer-approved PDF for production handoff?")) return;
  const button = document.querySelector("#approve-order-proof");
  const message = document.querySelector("#order-detail-message");
  button.disabled = true;
  message.textContent = "Checking and fingerprinting the personalized proof…";
  try {
    const result = await apiRequest(`?resource=orders&id=${encodeURIComponent(selectedOrder.id)}`, { method: "PATCH", body: { action: "approve_proof", approvedBy: "MonstersNOW admin" } });
    Object.assign(selectedOrder, result.order);
    syncOrderStatusOptions(selectedOrder);
    renderProofApproval(selectedOrder);
    renderOrderProgress(selectedOrder);
    renderOrderNextAction(selectedOrder);
    renderOrders(); renderDashboard();
    message.textContent = "Proof approved and locked. Lulu submission remains a separate action.";
  } catch (error) { message.textContent = error.message; }
  finally { renderProofApproval(selectedOrder); }
}

async function sendSelectedOrderToLulu() {
  if (!selectedOrder) return;
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
  const missing = Object.entries(values).filter(([key, value]) => !value && key !== "state_code").map(([key]) => key.replaceAll("_", " "));
  const message = document.querySelector("#order-detail-message");
  if (missing.length) {
    message.textContent = `Complete the shipping fields: ${missing.join(", ")}.`;
    return;
  }
  if (!window.confirm("Validate the production PDFs and create this print job in Lulu Sandbox?")) return;
  const button = document.querySelector("#send-order-lulu");
  button.disabled = true;
  button.textContent = "Validating and sending…";
  message.textContent = "Lulu is validating the cover and interior PDFs…";
  try {
    const result = await apiRequest(`?resource=orders&id=${encodeURIComponent(selectedOrder.id)}`, {
      method: "PATCH",
      body: { action: "submit_to_lulu", shippingLevel: document.querySelector("#lulu-shipping-level").value, shippingAddress: values },
    });
    Object.assign(selectedOrder, result.order);
    syncOrderStatusOptions(selectedOrder);
    renderProofApproval(selectedOrder);
    renderOrderProgress(selectedOrder);
    renderOrderNextAction(selectedOrder);
    renderOrders(); renderDashboard();
    message.textContent = `Sent to Lulu Sandbox. Print job ${selectedOrder.lulu_print_job_id} is now tracked on this order.`;
  } catch (error) { message.textContent = error.message; }
  finally { button.textContent = "Validate and send to Lulu Sandbox"; renderProofApproval(selectedOrder); }
}

async function revokeSelectedOrderProof() {
  if (!selectedOrder || !window.confirm("Revoke this proof approval? The order will return to proofing.")) return;
  const message = document.querySelector("#order-detail-message");
  message.textContent = "Revoking approval…";
  try {
    const result = await apiRequest(`?resource=orders&id=${encodeURIComponent(selectedOrder.id)}`, { method: "PATCH", body: { action: "revoke_proof_approval" } });
    Object.assign(selectedOrder, result.order);
    syncOrderStatusOptions(selectedOrder);
    renderProofApproval(selectedOrder);
    renderOrderProgress(selectedOrder);
    renderOrderNextAction(selectedOrder);
    renderOrders(); renderDashboard();
    message.textContent = "Approval revoked. Review and approve a new proof before printing.";
  } catch (error) { message.textContent = error.message; }
}

function renderOrderArtwork(assets) {
  const panel = document.querySelector("#order-artwork-panel");
  const grid = document.querySelector("#order-artwork-grid");
  grid.replaceChildren();
  const files = [
    ["Original drawing", assets?.originalUrl],
    ["Selected monster", assets?.selectedPreviewUrl],
    ["Coloring page", assets?.coloringPageUrl],
  ].filter(([, url]) => url);
  panel.hidden = files.length === 0;
  files.forEach(([label, url]) => {
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    const caption = document.createElement("figcaption");
    image.src = url;
    image.alt = label;
    caption.textContent = label;
    figure.append(image, caption);
    grid.append(figure);
  });
}

function renderOrderProgress(order) {
  const approved = Boolean(order.proof_fingerprint && order.proof_approved_at);
  const steps = [
    { label: "Payment", complete: order.status !== "checkout_started" },
    { label: "Book files", complete: Boolean(order.customer_proof_path) && hasOrderProductionFiles(order) },
    { label: "Customer", complete: order.customer_proof_status === "approved" },
    { label: "Studio", complete: approved },
    { label: "Lulu", complete: Boolean(order.lulu_print_job_id) },
    { label: "Delivered", complete: order.status === "completed" },
  ];
  const current = steps.findIndex((step) => !step.complete);
  document.querySelector("#order-progress").replaceChildren(...steps.map((step, index) => {
    const item = document.createElement("li");
    item.className = order.status === "cancelled" ? "is-cancelled" : step.complete ? "is-complete" : index === current ? "is-current" : "";
    item.innerHTML = `<span>${step.complete ? "✓" : index + 1}</span><small></small>`;
    item.querySelector("small").textContent = step.label;
    return item;
  }));
  const flow = ["checkout_started", "paid", "proofing", "approved", "printing", "shipped", "completed"];
  const lifecycleIndex = flow.indexOf(order.status);
  const advance = document.querySelector("#advance-order");
  const next = flow[lifecycleIndex + 1];
  advance.hidden = !next || order.status === "cancelled";
  advance.textContent = next ? `Advance to ${next.replaceAll("_", " ")} →` : "Order complete";
  if (order.status === "checkout_started") {
    advance.hidden = true;
    advance.disabled = true;
    advance.textContent = "Verify Stripe payment first";
  } else if (order.status === "proofing") {
    advance.hidden = true;
    advance.disabled = true;
    advance.textContent = "Approve proof to continue";
  } else if (order.status === "approved") {
    advance.hidden = true;
    advance.disabled = true;
    advance.textContent = "Send to Lulu to continue";
  } else advance.disabled = false;
}

async function advanceSelectedOrder() {
  if (!selectedOrder) return;
  const flow = ["checkout_started", "paid", "proofing", "approved", "printing", "shipped", "completed"];
  const next = flow[flow.indexOf(selectedOrder.status) + 1];
  if (!next || selectedOrder.status === "checkout_started") return;
  const button = document.querySelector("#advance-order");
  const message = document.querySelector("#order-detail-message");
  button.disabled = true;
  message.textContent = `Moving order to ${next.replaceAll("_", " ")}…`;
  try {
    const result = await apiRequest(`?resource=orders&id=${encodeURIComponent(selectedOrder.id)}`, { method: "PATCH", body: { status: next, notes: document.querySelector("#order-detail-notes").value } });
    Object.assign(selectedOrder, result.order);
    syncOrderStatusOptions(selectedOrder);
    document.querySelector("#order-detail-status").value = selectedOrder.status;
    document.querySelector("#order-detail-age").textContent = "Updated just now";
    renderOrderProgress(selectedOrder);
    renderProofApproval(selectedOrder);
    renderOrderNextAction(selectedOrder);
    renderOrders(); renderDashboard();
    message.textContent = `Order advanced to ${next.replaceAll("_", " ")}.`;
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
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
    syncOrderStatusOptions(order);
    renderOrders();
    renderDashboard();
    renderCustomers();
    renderOrderProgress(order);
    renderProofApproval(order);
    renderOrderNextAction(order);
    document.querySelector("#order-detail-age").textContent = "Updated just now";
    message.textContent = "Order saved.";
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
}
