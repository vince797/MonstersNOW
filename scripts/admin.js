const login = document.querySelector("#admin-login");
const loginForm = document.querySelector("#admin-login-form");
const passwordInput = document.querySelector("#admin-password");
const loginStatus = document.querySelector("#admin-login-status");
const adminApp = document.querySelector("#admin-app");
const dashboard = document.querySelector("#admin-dashboard");
const admin = document.querySelector("#story-admin");
const productionAdmin = document.querySelector("#production-admin");
const ordersAdmin = document.querySelector("#orders-admin");
const customersAdmin = document.querySelector("#customers-admin");
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
let storyAutosaveTimer = null;
let selectedOrder = null;
let orderView = "board";
let orderQuickFilter = "all";
let selectedPageIndex = 0;
let artworkFilter = "all";
let productionReport = null;
let productionStoryId = null;
const orderStatuses = ["checkout_started", "paid", "proofing", "approved", "printing", "shipped", "completed", "cancelled"];
const orderDialog = document.querySelector("#order-detail");
const artworkDialog = document.querySelector("#artwork-overview");
const storyReviewDialog = document.querySelector("#story-review");
let reviewSpreadIndex = 0;
const CATALOG_COVERS = {
  "halloween-monster-night": "assets/storybook/cover-series/minimal-concepts/halloween-monster-night-v1-web.jpg",
  "big-adventure": "assets/storybook/cover-series/minimal-concepts/big-adventure-v1-web.jpg",
  "bedtime-monster": "assets/storybook/cover-series/minimal-concepts/bedtime-monster-v1-web.jpg",
  "abc-monster-book": "assets/storybook/cover-series/minimal-concepts/abc-monster-book-v1-web.jpg",
  "counting-with-my-monster": "assets/storybook/cover-series/minimal-concepts/counting-with-my-monster-v1-web.jpg",
  "the-monster-who-lost-their-glow": "assets/storybook/cover-series/minimal-concepts/the-monster-who-lost-their-glow-v1-web.jpg",
  "birthday-monster-adventure": "assets/storybook/cover-series/minimal-concepts/birthday-monster-adventure-v1-web.jpg",
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
document.querySelectorAll("[data-order-view]").forEach((button) => button.addEventListener("click", () => { orderView = button.dataset.orderView; renderOrders(); }));
document.querySelectorAll("[data-order-quick-filter]").forEach((button) => button.addEventListener("click", () => { orderQuickFilter = button.dataset.orderQuickFilter; renderOrders(); }));
document.querySelector("#close-order-detail").addEventListener("click", closeOrderDetail);
orderDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeOrderDetail(); });
document.querySelector("#order-detail-form").addEventListener("submit", saveOrderDetail);
document.querySelector("#advance-order").addEventListener("click", advanceSelectedOrder);
document.querySelector("#approve-order-proof").addEventListener("click", approveSelectedOrderProof);
document.querySelector("#revoke-order-proof").addEventListener("click", revokeSelectedOrderProof);
document.querySelector("#send-order-lulu").addEventListener("click", sendSelectedOrderToLulu);
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
document.querySelector("#halloween-story").addEventListener("click", () => { showView("stories"); editStory({ title_template: "{child_name} and {monster_name}'s Halloween Adventure", slug: "halloween-adventure", description: "A playful Halloween quest filled with costumes, pumpkins, and friendly surprises.", is_seasonal: true, available_from: "2026-09-15", available_until: "2026-10-31", pages: [] }); });
document.querySelector("#production-open-book").addEventListener("click", openProductionBook);
document.querySelector("#production-open-orders").addEventListener("click", () => showView("orders"));
document.querySelector("#production-view-orders").addEventListener("click", () => showView("orders"));
document.querySelector("#download-story-proof").addEventListener("click", downloadCurrentStoryProof);
document.querySelector("#production-download-proof").addEventListener("click", downloadProductionStoryProof);
document.querySelector("#open-story-production").addEventListener("click", openCurrentStoryProduction);

async function loadProductionReadiness() {
  const overall = document.querySelector("#production-overall");
  const checks = document.querySelector("#production-checks");
  try {
    const response = await fetch("assets/storybook/halloween-monster-night/production-status.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Production status is unavailable");
    const report = await response.json();
    productionReport = report;
    overall.textContent = report.status === "ready" ? "Ready for Lulu" : "Blocked";
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
    renderProductionHub();
  } catch (error) {
    overall.textContent = "Unavailable";
    overall.className = "production-overall is-blocked";
    checks.innerHTML = `<p class="admin-inline-empty">${escapeHtml(error.message)}</p>`;
    renderProductionHub(error);
  }
}

loadProductionReadiness();
document.querySelector("#toggle-admin-password").addEventListener("click", togglePassword);
document.querySelector("#admin-sign-out").addEventListener("click", signOut);
document.querySelector("#order-filter").addEventListener("change", renderOrders);
document.querySelectorAll("[data-admin-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.adminView)));
document.querySelectorAll("[data-open-stories]").forEach((button) => button.addEventListener("click", () => showView("stories")));
document.querySelectorAll("[data-open-orders]").forEach((button) => button.addEventListener("click", () => showView("orders")));
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

async function openLibrary() {
  loginStatus.textContent = "Opening story library...";
  try {
    const [storyResult, orderResult] = await Promise.all([apiRequest(), apiRequest("?resource=orders")]);
    stories = storyResult.stories || [];
    orders = orderResult.orders || [];
    if (Object.keys(CATALOG_COVERS).some((slug) => !stories.some((story) => story.slug === slug))) {
      const catalogResult = await setupCatalog();
      stories = catalogResult?.stories || stories;
    }
    sessionStorage.setItem("monstersnow_admin_password", adminPassword);
    login.hidden = true;
    adminApp.hidden = false;
    renderStoryList();
    renderDashboard();
    renderOrders();
    renderCustomers();
    renderProductionHub();
    showView("dashboard");
  } catch (error) {
    sessionStorage.removeItem("monstersnow_admin_password");
    loginStatus.textContent = error.message;
  }
}

function showView(view) {
  dashboard.hidden = view !== "dashboard";
  admin.hidden = view !== "stories";
  productionAdmin.hidden = view !== "production";
  ordersAdmin.hidden = view !== "orders";
  customersAdmin.hidden = view !== "customers";
  document.querySelector("#admin-view-title").textContent = view === "stories" ? "Stories" : view === "production" ? "Production" : view === "orders" ? "Orders" : view === "customers" ? "Customers" : "Dashboard";
  document.querySelectorAll("[data-admin-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.adminView === view));
  if (view === "stories" && editor.hidden && stories[0]) editStory(stories[0]);
  if (view === "production") renderProductionHub();
}

function renderDashboard() {
  const productionStatuses = new Set(["proofing", "approved", "printing"]);
  document.querySelector("#metric-orders").textContent = orders.length;
  document.querySelector("#metric-production").textContent = orders.filter((order) => productionStatuses.has(order.status)).length;
  document.querySelector("#metric-published").textContent = stories.filter((story) => story.status === "published").length;
  document.querySelector("#metric-drafts").textContent = stories.filter((story) => story.status === "draft").length;
  document.querySelector("#nav-story-count").textContent = stories.length;
  document.querySelector("#nav-order-count").textContent = orders.length;
  document.querySelector("#nav-customer-count").textContent = new Set(orders.map((order) => order.customer_email?.toLowerCase()).filter(Boolean)).size;
  document.querySelector("#nav-production-count").textContent = productionReport?.checks?.filter((check) => check.status !== "pass").length || 0;
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

function openProductionBook() {
  const story = stories.find((item) => item.id === productionStoryId) || stories.find((item) => item.is_seasonal) || stories[0];
  if (story) editStory(story);
  else editStory({ title_template: "{child_name} and {monster_name}'s Halloween Monster Night", slug: "halloween-monster-night", description: "A friendly Halloween adventure.", is_seasonal: true, available_from: "2026-09-15", available_until: "2026-10-31", pages: [] });
  showView("stories");
}

function openCurrentStoryProduction() {
  const story = currentStory();
  if (!story) {
    editorStatus.textContent = "Save this master book before opening Production.";
    return;
  }
  if (storyDirty) {
    editorStatus.textContent = "Save your changes before opening Production so the proof matches the editor.";
    return;
  }
  productionStoryId = story.id;
  showView("production");
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

async function downloadProductionStoryProof() {
  const story = stories.find((item) => item.id === productionStoryId) || stories.find((item) => item.is_seasonal) || stories[0];
  if (story) await downloadStoryProof(story, document.querySelector("#production-hub-next"));
}

async function downloadStoryProof(story, status) {
  const childName = document.querySelector("#sample-child")?.value || "Alex";
  const monsterName = document.querySelector("#sample-monster")?.value || "Milo";
  const button = document.querySelector("#story-id").value === story.id ? document.querySelector("#download-story-proof") : document.querySelector("#production-download-proof");
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

function renderProductionHub(error = null) {
  const story = stories.find((item) => item.id === productionStoryId) || stories.find((item) => item.is_seasonal) || stories[0];
  if (story && !productionStoryId) productionStoryId = story.id;
  const report = story?.slug === "halloween-monster-night" ? productionReport : null;
  const status = document.querySelector("#production-hub-status");
  const checksContainer = document.querySelector("#production-hub-checks");
  const pages = story?.pages || [];
  const contentReady = pages.filter((page) => page.text?.trim() && page.illustrationPrompt?.trim()).length;
  const artworkReady = pages.filter((page) => page.artworkUrl && ["approved", "final"].includes(page.artworkStatus)).length;
  const reportChecks = report?.checks || [];
  const check = (label) => reportChecks.find((item) => item.label === label);
  const passed = (label) => check(label)?.status === "pass";
  const coverReady = passed("Softcover package cover") && passed("Hardcover package cover");
  const packageReady = contentReady === 32 && artworkReady === 32 && coverReady && passed("Lulu file validation");
  const pipeline = [
    { title: "Master copy", detail: `${contentReady}/32 pages complete`, ready: contentReady === 32, action: "Edit book", run: openProductionBook },
    { title: "Artwork", detail: `${artworkReady}/32 page illustrations approved`, ready: artworkReady === 32 && passed("Illustration dimensions") && passed("Print-art quality review"), action: "Review artwork", run: openProductionBook },
    { title: "Print files", detail: coverReady ? "Interior and both covers ready" : "Interior prepared · covers pending", ready: passed("Interior pagination") && passed("Interior size and bleed") && coverReady },
    { title: "Lulu validation", detail: passed("Lulu file validation") ? "Files accepted" : "Waiting on final files", ready: passed("Lulu file validation") },
    { title: "Fulfillment", detail: `${orders.filter((order) => !["completed", "cancelled"].includes(order.status)).length} active orders`, ready: true, action: "View orders", run: () => showView("orders") },
  ];

  document.querySelector("#production-book-title").textContent = story?.title_template || "Select a master book";
  document.querySelector("#production-book-summary").textContent = story?.description || "Complete the master story before preparing print files.";
  document.querySelector("#editorial-proof-state").textContent = story?.id ? "Ready to generate from the latest saved story text." : "Save the master book to generate a review PDF.";
  document.querySelector("#print-package-state").textContent = packageReady ? "Interior and cover package ready." : `${contentReady}/32 pages complete · ${artworkReady}/32 illustrations approved.`;
  document.querySelector("#lulu-gate-state").textContent = packageReady ? "Ready for final sandbox validation and proof ordering." : "Locked until real interior and cover files pass preflight.";
  document.querySelector("#production-gate").classList.toggle("is-ready", packageReady);

  status.textContent = error ? "Unavailable" : report?.status === "ready" ? "Ready for Lulu" : "Action needed";
  status.className = `production-overall ${report?.status === "ready" ? "is-ready" : "is-blocked"}`;
  document.querySelector("#production-hub-updated").textContent = report?.updated ? `Preflight updated ${report.updated}` : "Waiting for preflight data";
  document.querySelector("#production-hub-next").textContent = report?.next_action || error?.message || "Complete the master book and run preflight.";
  document.querySelector("#production-hub-progress").textContent = `${reportChecks.filter((item) => item.status === "pass").length}/${reportChecks.length} complete`;
  document.querySelector("#nav-production-count").textContent = reportChecks.filter((item) => item.status !== "pass").length;
  document.querySelector("#softcover-status").textContent = passed("Softcover package cover") ? "Cover ready" : "Cover pending";
  document.querySelector("#hardcover-status").textContent = passed("Hardcover package cover") ? "Cover ready" : "Cover pending";

  document.querySelector("#release-pipeline").replaceChildren(...pipeline.map((stage, index) => {
    const article = document.createElement("article");
    article.className = stage.ready ? "is-ready" : "needs-work";
    article.innerHTML = `<span>${stage.ready ? "✓" : index + 1}</span><div><strong></strong><small></small></div>`;
    article.querySelector("strong").textContent = stage.title;
    article.querySelector("small").textContent = stage.detail;
    if (stage.action) {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = `${stage.action} →`; button.addEventListener("click", stage.run); article.append(button);
    }
    return article;
  }));
  checksContainer.replaceChildren(...reportChecks.map((item) => {
    const article = document.createElement("article");
    article.className = `production-check is-${item.status}`;
    article.innerHTML = `<span aria-hidden="true">${item.status === "pass" ? "✓" : "!"}</span><div><strong></strong><small></small></div>`;
    article.querySelector("strong").textContent = item.label;
    article.querySelector("small").textContent = item.detail;
    return article;
  }));
  if (!reportChecks.length) checksContainer.innerHTML = '<div class="admin-inline-empty"><strong>Preflight data unavailable</strong><span>Run the production preflight to refresh this section.</span></div>';
  ["paid", "proofing", "printing", "shipped"].forEach((orderStatus) => {
    document.querySelector(`#workload-${orderStatus}`).textContent = orders.filter((order) => order.status === orderStatus).length;
  });
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
  const matchesQuickFilter = (order) => orderQuickFilter === "all" || (orderQuickFilter === "attention" ? orderNeedsAttention(order) : order.status === orderQuickFilter);
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
    cells[3].textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency }).format(order.amount_cents / 100);
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
      card.querySelector("em").textContent = `${orderNeedsAttention(order) ? "Needs follow-up · " : ""}${relativeAge(order.updated_at || order.created_at)} · Review →`;
      card.addEventListener("click", () => openOrderDetail(order));
      return card;
    }));
    return section;
  }));
}

function orderNeedsAttention(order) {
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
    const spent = customer.orders.reduce((sum, order) => sum + (Number(order.amount_cents) || 0), 0);
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
  return CATALOG_COVERS[slug] || "assets/monstersnow-logo.png";
}

function updateCoverPreview(slug) {
  const image = document.querySelector("#story-cover-preview");
  const cover = CATALOG_COVERS[slug];
  image.src = cover || "assets/monstersnow-logo.png";
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
  const card = document.createElement("section");
  card.className = "story-page-card";
  card.innerHTML = `<header class="page-card-header"><span><small data-page-role>Story page</small><strong>Page <span data-page-number></span></strong></span><div class="page-card-actions"><button type="button" data-page-action="up" aria-label="Move page up" title="Move page up">↑</button><button type="button" data-page-action="down" aria-label="Move page down" title="Move page down">↓</button><button type="button" data-page-action="duplicate">Duplicate</button><button type="button" data-page-action="remove">Remove</button></div></header><label class="page-copy-field"><span>Story text</span><span class="token-toolbar" aria-label="Insert personalization"><button type="button" data-insert-token="{child_name}">+ Child name</button><button type="button" data-insert-token="{monster_name}">+ Monster name</button></span><textarea rows="10" maxlength="2000" placeholder="Write the words the child will read on this page…"></textarea><small><span data-text-words>0 words</span> · <span data-text-count>0</span>/2,000 characters</small></label><label>Illustration direction<textarea rows="10" maxlength="3000" placeholder="Describe the scene, characters, action, lighting, and composition…"></textarea><small><span data-art-words>0 words</span> · <span data-art-count>0</span>/3,000 characters</small></label><section class="page-artwork-panel"><div class="page-artwork-visual"><img alt="" data-artwork-image hidden /><div data-artwork-empty><span>◇</span><strong>No artwork uploaded</strong><small>JPG, PNG, or WebP · 3 MB maximum</small></div><div class="monster-zone" data-monster-zone aria-label="Admin-only personalized monster placement"><span>MONSTER</span></div></div><div class="page-artwork-controls"><div><strong>Page artwork</strong><small data-artwork-name>Upload the background illustration without a monster.</small></div><label class="button secondary artwork-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp" data-artwork-file /> <span data-artwork-upload-label>Upload artwork</span></label><label class="artwork-status-label">Review status<select data-artwork-review><option value="missing">Missing</option><option value="draft">Draft</option><option value="approved">Approved</option><option value="final">Final</option></select></label><fieldset class="monster-placement-controls"><legend>Personalized monster zone <small>Admin preview only</small></legend><label>Horizontal <input type="range" min="5" max="95" data-placement="x" /><output data-placement-output="x"></output></label><label>Baseline <input type="range" min="10" max="95" data-placement="y" /><output data-placement-output="y"></output></label><label>Size <input type="range" min="15" max="70" data-placement="scale" /><output data-placement-output="scale"></output></label><div><label>Facing<select data-placement="facing"><option value="left">Left</option><option value="right">Right</option><option value="neutral">Neutral</option></select></label><label>Layer<select data-placement="layer"><option value="front">In front</option><option value="behind">Behind foreground</option></select></label></div><p>The guide is never included in customer previews or print files.</p></fieldset><button class="button secondary" type="button" data-remove-artwork hidden>Remove from page</button><p data-artwork-message role="status"></p></div></section>`;
  card.dataset.artworkUrl = page.artworkUrl || "";
  card.dataset.artworkPath = page.artworkPath || "";
  card.dataset.artworkName = page.artworkName || "";
  card.dataset.artworkStatus = page.artworkStatus || (page.artworkUrl ? "draft" : "missing");
  card.dataset.artworkUpdatedAt = page.artworkUpdatedAt || "";
  const placement = page.monsterPlacement || {};
  card.dataset.monsterX = String(placement.x ?? 68);
  card.dataset.monsterY = String(placement.y ?? 72);
  card.dataset.monsterScale = String(placement.scale ?? 36);
  card.dataset.monsterFacing = placement.facing || "left";
  card.dataset.monsterLayer = placement.layer || "front";
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
  card.querySelector("[data-remove-artwork]").addEventListener("click", () => removePageArtwork(card));
  card.querySelectorAll("[data-placement]").forEach((control) => control.addEventListener("input", () => updateMonsterPlacement(card, control)));
  renderArtwork(card);
  pagesContainer.append(card);
  if (!loadingStory) { selectedPageIndex = pagesContainer.children.length - 1; markStoryDirty(); refreshPageTools(); selectPage(selectedPageIndex, true); }
}

function renumberPages() {
  const cards = [...pagesContainer.children];
  cards.forEach((card, index) => {
    card.querySelector("[data-page-number]").textContent = String(index + 1);
    card.querySelector("[data-page-role]").textContent = pageRole(index, cards.length);
    card.querySelector('[data-page-action="up"]').disabled = index === 0;
    card.querySelector('[data-page-action="down"]').disabled = index === cards.length - 1;
    card.querySelector('[data-page-action="duplicate"]').disabled = cards.length >= 32;
    card.querySelector('[data-page-action="remove"]').disabled = cards.length === 1;
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
    monsterPlacement: {
      x: Number(card.dataset.monsterX),
      y: Number(card.dataset.monsterY),
      scale: Number(card.dataset.monsterScale),
      facing: card.dataset.monsterFacing,
      layer: card.dataset.monsterLayer,
    },
  };
}

function updateMonsterPlacement(card, control) {
  const key = control.dataset.placement;
  const datasetKey = `monster${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  card.dataset[datasetKey] = control.value;
  renderMonsterPlacement(card);
  markStoryDirty();
  renderSelectedSpread();
}

function renderMonsterPlacement(card) {
  const values = {
    x: card.dataset.monsterX || "68",
    y: card.dataset.monsterY || "72",
    scale: card.dataset.monsterScale || "36",
    facing: card.dataset.monsterFacing || "left",
    layer: card.dataset.monsterLayer || "front",
  };
  card.querySelectorAll("[data-placement]").forEach((control) => { control.value = values[control.dataset.placement]; });
  ["x", "y", "scale"].forEach((key) => { card.querySelector(`[data-placement-output="${key}"]`).textContent = `${values[key]}%`; });
  const zone = card.querySelector("[data-monster-zone]");
  zone.style.left = `${values.x}%`;
  zone.style.top = `${values.y}%`;
  zone.style.width = `${values.scale}%`;
  zone.style.transform = `translate(-50%, -100%) scaleX(${values.facing === "right" ? -1 : 1})`;
  zone.dataset.layer = values.layer;
  zone.dataset.facing = values.facing;
}

function renderArtwork(card) {
  const image = card.querySelector("[data-artwork-image]");
  const emptyState = card.querySelector("[data-artwork-empty]");
  const remove = card.querySelector("[data-remove-artwork]");
  const status = card.querySelector("[data-artwork-review]");
  const name = card.querySelector("[data-artwork-name]");
  const uploadLabel = card.querySelector("[data-artwork-upload-label]");
  const hasArtwork = Boolean(card.dataset.artworkUrl);
  image.hidden = !hasArtwork;
  emptyState.hidden = hasArtwork;
  remove.hidden = !hasArtwork;
  status.disabled = !hasArtwork;
  status.value = hasArtwork ? card.dataset.artworkStatus || "draft" : "missing";
  uploadLabel.textContent = hasArtwork ? "Replace artwork" : "Upload artwork";
  name.textContent = hasArtwork ? `${card.dataset.artworkName || "Uploaded artwork"} · ${artworkStatusLabel(status.value)}` : "Upload the current illustration for this page.";
  if (hasArtwork && image.src !== card.dataset.artworkUrl) image.src = card.dataset.artworkUrl;
  renderMonsterPlacement(card);
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
  return ({ missing: "Missing", draft: "Draft review", approved: "Approved", final: "Final artwork" })[status] || "Missing";
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
  document.querySelector("#artwork-overview-summary").textContent = `${counts.approved + counts.final}/32 approved or final · ${counts.draft} awaiting review · ${counts.missing} missing`;
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
    if (card.dataset.artworkUrl) {
      const image = document.createElement("img");
      image.src = card.dataset.artworkUrl;
      image.alt = "";
      visual.append(image);
    } else visual.textContent = "◇";
    button.querySelector("small").textContent = `Page ${index + 1} · ${pageRole(index, cards.length)}`;
    button.querySelector("strong").textContent = artworkStatusLabel(status);
    button.querySelector("em").textContent = copyReady ? "Copy ready" : "Copy needs work";
    button.setAttribute("aria-label", `Edit page ${index + 1}, artwork ${artworkStatusLabel(status)}`);
    button.addEventListener("click", () => { artworkDialog.close(); selectPage(index, true); });
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

  document.querySelector("#review-readiness-title").textContent = state.ready ? "Ready for approval" : "Review required";
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
  approve.textContent = state.ready ? "Approve & publish master" : "Resolve issues to approve";
}

function buildReviewPage(card, index, child, monster) {
  const section = document.createElement("section");
  section.className = "review-page";
  section.innerHTML = '<header><span></span><button type="button">Edit page</button></header><div class="review-page-art"></div><p></p><footer><span></span><span></span></footer>';
  section.querySelector("header span").textContent = `Page ${index + 1} · ${pageRole(index, pagesContainer.children.length)}`;
  section.querySelector("header button").addEventListener("click", () => { storyReviewDialog.close(); selectPage(index, true); });
  const art = section.querySelector(".review-page-art");
  if (card.dataset.artworkUrl) {
    const image = document.createElement("img"); image.src = card.dataset.artworkUrl; image.alt = `Artwork for page ${index + 1}`; art.append(image);
  } else art.innerHTML = "<span>Artwork missing</span>";
  const zone = document.createElement("i");
  zone.className = "monster-zone monster-zone-preview";
  zone.style.left = `${card.dataset.monsterX || 68}%`;
  zone.style.top = `${card.dataset.monsterY || 72}%`;
  zone.style.width = `${card.dataset.monsterScale || 36}%`;
  zone.style.transform = `translate(-50%, -100%) scaleX(${card.dataset.monsterFacing === "right" ? -1 : 1})`;
  art.append(zone);
  section.querySelector("p").textContent = card.querySelectorAll("textarea")[0].value.replaceAll("{child_name}", child).replaceAll("{monster_name}", monster) || "No story text yet.";
  const footer = section.querySelectorAll("footer span");
  footer[0].textContent = artworkStatusLabel(card.dataset.artworkStatus || "missing");
  footer[1].textContent = `${wordCount(card.querySelectorAll("textarea")[0].value)} words`;
  return section;
}

async function approveMasterStory() {
  const state = storyReviewState();
  if (!state.ready || !window.confirm("Approve and publish this master book? Future personalized orders will use this saved version.")) return;
  const status = document.querySelector("#story-review-status");
  status.textContent = "Saving and approving the master book…";
  const saved = await saveStory("published");
  if (saved) {
    storyReviewDialog.close();
    editorStatus.textContent = `Master book approved and published as version ${saved.version}.`;
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
  const artIncomplete = [...pagesContainer.children].some((card) => !card.dataset.artworkUrl || !["approved", "final"].includes(card.dataset.artworkStatus));
  if (status === "published" && (pagesContainer.children.length !== 32 || [...pagesContainer.querySelectorAll("textarea")].some((area) => !area.value.trim()) || artIncomplete)) {
    editorStatus.textContent = "Complete all 32 pages, upload artwork, and mark every illustration approved or final before publishing. You can save a draft at any time.";
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
    if (card.dataset.artworkUrl) {
      const image = document.createElement("img");
      image.src = card.dataset.artworkUrl;
      image.alt = `Artwork for page ${firstIndex + offset + 1}`;
      art.append(image);
    } else art.textContent = "Artwork pending";
    const zone = document.createElement("span");
    zone.className = "monster-zone monster-zone-preview";
    zone.textContent = "MONSTER";
    zone.style.left = `${card.dataset.monsterX || 68}%`;
    zone.style.top = `${card.dataset.monsterY || 72}%`;
    zone.style.width = `${card.dataset.monsterScale || 36}%`;
    zone.style.transform = `translate(-50%, -100%) scaleX(${card.dataset.monsterFacing === "right" ? -1 : 1})`;
    zone.dataset.layer = card.dataset.monsterLayer || "front";
    art.append(zone);
    section.querySelector("p").textContent = card.querySelector("textarea").value.replaceAll("{child_name}", child).replaceAll("{monster_name}", monster) || "No story text yet.";
    article.append(section);
  });
  preview.replaceChildren(article);
}

function refreshPageTools() {
  const cards = [...pagesContainer.children];
  const ready = cards.filter((card) => [...card.querySelectorAll("textarea")].every((area) => area.value.trim())).length;
  const artworkReady = cards.filter((card) => card.dataset.artworkUrl && ["approved", "final"].includes(card.dataset.artworkStatus)).length;
  document.querySelector("#page-progress").textContent = `${ready}/32 copy · ${artworkReady}/32 artwork approved`;
  document.querySelector("#add-page").disabled = cards.length >= 32;
  document.querySelector("#page-nav").replaceChildren(...cards.map((card, index) => {
    card.id = `book-page-${index + 1}`;
    const button = document.createElement("button");
    button.type = "button";
    const complete = [...card.querySelectorAll("textarea")].every((area) => area.value.trim());
    const artStatus = card.dataset.artworkStatus || "missing";
    button.innerHTML = `<span>${index + 1}</span><small>${escapeHtml(pageRole(index, cards.length))}</small><em>${complete ? "Copy ready" : "Copy needed"} · ${escapeHtml(artworkStatusLabel(artStatus))}</em>`;
    button.className = `${complete ? "is-ready" : ""} is-art-${artStatus}`;
    button.setAttribute("aria-label", `Page ${index + 1}, ${pageRole(index, cards.length)}, ${complete ? "copy ready" : "copy incomplete"}, artwork ${artworkStatusLabel(artStatus)}`);
    button.addEventListener("click", () => selectPage(index, true));
    return button;
  }));
  renumberPages();
  const settings = {
    title: document.querySelector("#story-title").value.trim(),
    slug: document.querySelector("#story-slug").value.trim(),
    seasonal: document.querySelector("#story-seasonal").checked,
    from: document.querySelector("#story-from").value,
    until: document.querySelector("#story-until").value,
  };
  const allText = cards.map((card) => [...card.querySelectorAll("textarea")].map((area) => area.value).join(" ")).join(" ");
  const unresolved = [...new Set(allText.match(/\{[^}]+\}/g) || [])].filter((token) => !["{child_name}", "{monster_name}"].includes(token));
  const checks = [
    { ok: Boolean(settings.title && settings.slug), label: "Title and slug are complete" },
    { ok: cards.length === 32, label: `${cards.length}/32 pages added` },
    { ok: ready === cards.length && cards.length > 0, label: "Every page has story text and art direction" },
    { ok: artworkReady === cards.length && cards.length === 32, label: `${artworkReady}/32 page illustrations approved or final` },
    { ok: !unresolved.length, label: unresolved.length ? `Unknown tokens: ${unresolved.join(", ")}` : "No unknown personalization tokens" },
    { ok: !settings.seasonal || Boolean(settings.from && settings.until), label: settings.seasonal ? "Seasonal availability dates are set" : "Evergreen availability" },
    { ok: !cards.some((card) => card.querySelector("textarea").value.length > 1200), label: "Page text is within review length" },
  ];
  document.querySelector("#story-readiness-list").replaceChildren(...checks.map((check) => {
    const item = document.createElement("li"); item.className = check.ok ? "is-ready" : "needs-work"; item.textContent = `${check.ok ? "✓" : "!"} ${check.label}`; return item;
  }));
  const stage = storyStage({ status: stories.find((story) => story.id === document.querySelector("#story-id").value)?.status, pages: [] }, ready);
  document.querySelector("#story-stage").textContent = stage;
  document.querySelector("#story-stage").className = `is-${stage.toLowerCase().replaceAll(" ", "-")}`;
  if (artworkDialog.open) renderArtworkOverview();
  selectPage(selectedPageIndex);
}

function openOrderDetail(order) {
  selectedOrder = order;
  document.querySelector("#order-detail-id").textContent = `Order ${order.id}`;
  document.querySelector("#order-detail-age").textContent = `${orderNeedsAttention(order) ? "Needs follow-up · " : "Updated "}${relativeAge(order.updated_at || order.created_at)}`;
  const fields = { Customer: order.customer_email, Child: order.child_name, Monster: order.monster_name, Story: order.story_label, Format: order.format_id, Style: order.monster_style, Created: new Date(order.created_at).toLocaleString(), "Stripe checkout": order.stripe_checkout_session_id || "Not recorded", "Preview ID": order.selected_preview_id || "Not recorded" };
  const list = document.querySelector("#order-detail-fields");
  list.replaceChildren();
  Object.entries(fields).forEach(([label, value]) => { const term = document.createElement("dt"); const detail = document.createElement("dd"); term.textContent = label; detail.textContent = value || "—"; list.append(term, detail); });
  renderOrderArtwork(order.monster_assets);
  ["lulu-recipient-name", "lulu-phone", "lulu-street", "lulu-city", "lulu-state", "lulu-postcode"].forEach((id) => { document.querySelector(`#${id}`).value = ""; });
  document.querySelector("#lulu-country").value = "US";
  document.querySelector("#lulu-shipping-level").value = "MAIL";
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
  if (order.status === "checkout_started") editableStatuses.add("paid");
  if (order.status === "paid") editableStatuses.add("proofing");
  if (order.status === "printing" && order.lulu_print_job_id) editableStatuses.add("shipped");
  if (order.status === "shipped") editableStatuses.add("completed");
  select.replaceChildren(...orderStatuses.filter((status) => editableStatuses.has(status)).map((status) => new Option(status === "paid" ? "Paid (manually verified)" : status.replaceAll("_", " "), status, false, status === order.status)));
}

function renderOrderNextAction(order) {
  const actions = {
    checkout_started: ["Verify payment in Stripe", "Confirm payment before beginning proof production."],
    paid: ["Begin personalized proof", "Advance the order to proofing when production work starts."],
    proofing: ["Review and approve the proof", "Approval fingerprints the exact master, names, and selected monster."],
    approved: ["Enter shipping and send to Lulu Sandbox", "Lulu validates both PDFs before creating the print job."],
    printing: ["Monitor the Lulu print job", order.lulu_print_job_id ? `Print job ${order.lulu_print_job_id} is in production.` : "Confirm the printer accepted the order."],
    shipped: ["Add delivery follow-up", "Confirm delivery, then complete the order."],
    completed: ["No action required", "This order is complete."],
    cancelled: ["No action required", "This order was cancelled."],
  };
  const [title, help] = actions[order.status] || ["Review this order", "Confirm the current fulfillment state."];
  document.querySelector("#order-next-action").textContent = title;
  document.querySelector("#order-next-help").textContent = help;
}

function renderProofApproval(order) {
  const approved = Boolean(order.proof_fingerprint && order.proof_approved_at);
  const submitted = Boolean(order.lulu_print_job_id);
  const state = document.querySelector("#proof-approval-state");
  const approve = document.querySelector("#approve-order-proof");
  const revoke = document.querySelector("#revoke-order-proof");
  const send = document.querySelector("#send-order-lulu");
  const help = document.querySelector("#proof-approval-help");
  if (submitted) {
    state.textContent = `Sent to Lulu · job ${order.lulu_print_job_id}`;
    help.textContent = order.lulu_submitted_at ? `Submitted ${new Date(order.lulu_submitted_at).toLocaleString()}.` : "The print job has been submitted.";
  } else if (approved) {
    state.textContent = `Approved ${new Date(order.proof_approved_at).toLocaleString()} by ${order.proof_approved_by || "MonstersNOW admin"}.`;
    help.textContent = `Master v${order.master_story_version || "?"} · fingerprint ${order.proof_fingerprint.slice(0, 12)}… Final PDFs must pass Lulu validation before sending.`;
  } else {
    state.textContent = "This order has not been approved for printing.";
    help.textContent = "Approval verifies all 32 final backgrounds, the selected monster, names, and the exact master version.";
  }
  approve.hidden = approved || submitted;
  approve.disabled = !["proofing", "approved"].includes(order.status);
  revoke.hidden = !approved || submitted;
  document.querySelector("#lulu-shipping-fields").hidden = !approved || submitted;
  send.disabled = !approved || submitted;
  send.title = approved ? "Validate the production PDFs and create the Lulu Sandbox print job." : "Approve the proof first.";
}

async function approveSelectedOrderProof() {
  if (!selectedOrder || !window.confirm("Approve this exact personalized book for printing? The saved master version, names, monster, and all 32 final illustrations will be fingerprinted.")) return;
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
    renderOrders(); renderDashboard(); renderProductionHub();
    message.textContent = "Proof approved and locked. Lulu submission remains a separate action.";
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
}

async function sendSelectedOrderToLulu() {
  if (!selectedOrder) return;
  const values = {
    name: document.querySelector("#lulu-recipient-name").value.trim(),
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
    renderOrders(); renderDashboard(); renderProductionHub();
    message.textContent = `Sent to Lulu Sandbox. Print job ${selectedOrder.lulu_print_job_id} is now tracked on this order.`;
  } catch (error) { message.textContent = error.message; }
  finally { button.textContent = "Send to Lulu Sandbox"; renderProofApproval(selectedOrder); }
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
    renderOrders(); renderDashboard(); renderProductionHub();
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
  const flow = ["checkout_started", "paid", "proofing", "approved", "printing", "shipped", "completed"];
  const current = flow.indexOf(order.status);
  document.querySelector("#order-progress").replaceChildren(...flow.map((status, index) => {
    const item = document.createElement("li");
    item.className = order.status === "cancelled" ? "is-cancelled" : index < current ? "is-complete" : index === current ? "is-current" : "";
    item.innerHTML = `<span>${index < current ? "✓" : index + 1}</span><small></small>`;
    item.querySelector("small").textContent = status === "checkout_started" ? "Checkout" : status.charAt(0).toUpperCase() + status.slice(1);
    return item;
  }));
  const advance = document.querySelector("#advance-order");
  const next = flow[current + 1];
  advance.hidden = !next || order.status === "cancelled";
  advance.textContent = next ? `Advance to ${next.replaceAll("_", " ")} →` : "Order complete";
  if (order.status === "checkout_started") {
    advance.hidden = false;
    advance.disabled = true;
    advance.textContent = "Verify Stripe payment first";
  } else if (order.status === "proofing") {
    advance.hidden = false;
    advance.disabled = true;
    advance.textContent = "Approve proof to continue";
  } else if (order.status === "approved") {
    advance.hidden = false;
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
    renderOrders(); renderDashboard(); renderProductionHub();
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
    renderProductionHub();
    renderOrderProgress(order);
    renderProofApproval(order);
    renderOrderNextAction(order);
    document.querySelector("#order-detail-age").textContent = "Updated just now";
    message.textContent = "Order saved.";
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
}
