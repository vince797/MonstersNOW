const login = document.querySelector("#admin-login");
const loginForm = document.querySelector("#admin-login-form");
const passwordInput = document.querySelector("#admin-password");
const loginStatus = document.querySelector("#admin-login-status");
const admin = document.querySelector("#story-admin");
const newStoryButton = document.querySelector("#new-story");
const storyList = document.querySelector("#story-list");
const storyCount = document.querySelector("#story-count");
const editor = document.querySelector("#story-editor");
const empty = document.querySelector("#story-empty");
const editorStatus = document.querySelector("#story-editor-status");
const pagesContainer = document.querySelector("#story-pages");
let stories = [];
let adminPassword = sessionStorage.getItem("monstersnow_admin_password") || "";

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminPassword = passwordInput.value;
  await openLibrary();
});
newStoryButton.addEventListener("click", () => editStory());
document.querySelector("#add-page").addEventListener("click", () => addPage());
document.querySelector("#save-draft").addEventListener("click", () => saveStory("draft"));
document.querySelector("#publish-story").addEventListener("click", () => saveStory("published"));

if (adminPassword) openLibrary();

async function openLibrary() {
  loginStatus.textContent = "Opening story library...";
  try {
    const result = await apiRequest();
    stories = result.stories || [];
    sessionStorage.setItem("monstersnow_admin_password", adminPassword);
    login.hidden = true;
    admin.hidden = false;
    newStoryButton.hidden = false;
    renderStoryList();
    if (stories[0]) editStory(stories[0]);
  } catch (error) {
    sessionStorage.removeItem("monstersnow_admin_password");
    loginStatus.textContent = error.message;
  }
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
  editorStatus.textContent = "";
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
