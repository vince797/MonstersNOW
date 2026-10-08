// Character Studio render lifecycle: painting versions, choosing one, keeping
// them across refreshes, and recovering from slow or failed paints.
(() => {
  const ENDPOINT = "/api/render-child-character";
  // The server gives the image model up to 130 s inside a 150 s function, so
  // the browser waits a little longer than the function can ever run.
  const REQUEST_TIMEOUT_MS = 165 * 1000;
  const AUTO_RETRY_DELAY_MS = 2500;
  const SLOW_NOTICE_SECONDS = 95;
  const VERSIONS_PER_PAINT = 2;
  const MAX_VERSIONS_PER_LOOK = 3;
  const MAX_SHOWN_VERSIONS = 12;
  const REF_KEY = "monstersnow_child_render_ref_v1";

  const $ = (selector) => document.querySelector(selector);
  const els = {
    editor: $("#child-editor-start"),
    stage: $("#child-preview-stage"),
    controls: $("#child-character-details"),
    rendered: $("#child-rendered-preview"),
    preset: $("#child-preset-preview"),
    monsterOnly: $("#child-monster-only-preview"),
    stale: $("#child-stale-render"),
    staleImage: $("#child-stale-render-image"),
    label: $("#child-preview-label-text"),
    mode: $("#child-preview-mode-text"),
    button: $("#render-child-character"),
    retry: $("#child-render-retry"),
    status: $("#child-render-status"),
    actions: document.querySelector(".child-render-actions"),
    progress: $("#child-render-progress"),
    progressTitle: $("#child-render-progress-title"),
    progressCopy: $("#child-render-progress-copy"),
    elapsed: $("#child-render-elapsed"),
    cancel: $("#child-render-cancel"),
    steps: [...document.querySelectorAll("[data-child-render-step]")],
    versions: $("#child-render-versions"),
    versionList: $("#child-render-version-list"),
    versionsHint: $("#child-render-versions-hint"),
    mini: $("#child-mini-preview"),
    miniRender: $("#child-mini-render"),
    miniTitle: $("#child-mini-title"),
    miniStatus: $("#child-mini-status"),
    miniJump: $("#child-mini-jump"),
    detail: $("#child-special-detail"),
  };

  const state = {
    versions: [], // newest first: { id, image, profile, key, createdAt, saved, version }
    selectedByKey: {},
    lastSelectedId: null,
    job: null,
    failure: null, // { error, count, key }
    submissionId: null,
  };
  let options = { getSubmission: () => null, getMonsterImage: () => "", isStepVisible: () => true };
  let progressTimer;
  let revealUntil = 0; // performance.now() deadline for revealChosenChip after a tap

  const selector = () => window.MonstersNowChildSelector;
  const currentProfile = () => selector()?.getProfile() || { included: false };
  const keyOf = (profile) => selector()?.profileKey(profile) || JSON.stringify(profile || {});

  function versionsFor(key) { return state.versions.filter((version) => version.key === key); }
  function selectedFor(key) {
    const matches = versionsFor(key);
    return matches.find((version) => version.id === state.selectedByKey[key]) || matches[0] || null;
  }
  /** The painted version the book will use, only if it matches the current choices. */
  function currentRender(profile = currentProfile()) {
    if (!profile?.included) return null;
    return selectedFor(keyOf(profile));
  }
  function lastSelected() { return state.versions.find((version) => version.id === state.lastSelectedId) || state.versions[0] || null; }

  // ---------- Local reference (survives refresh alongside the server copy) ----------
  function readRefs() { try { return JSON.parse(localStorage.getItem(REF_KEY) || "{}") || {}; } catch { return {}; } }
  function saveRef() {
    if (!state.submissionId) return;
    try {
      const refs = readRefs();
      refs[state.submissionId] = { selectedByKey: state.selectedByKey, lastSelectedId: state.lastSelectedId, updatedAt: Date.now() };
      const trimmed = Object.fromEntries(Object.entries(refs).sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0)).slice(0, 3));
      localStorage.setItem(REF_KEY, JSON.stringify(trimmed));
    } catch {}
  }

  function selectVersion(version, { persist = true } = {}) {
    if (!version) return;
    state.selectedByKey[version.key] = version.id;
    state.lastSelectedId = version.id;
    if (persist) saveRef();
  }

  function addVersion(version) {
    if (state.versions.some((item) => item.id === version.id)) return;
    state.versions.unshift(version);
    state.versions.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (state.versions.length > MAX_SHOWN_VERSIONS) state.versions.length = MAX_SHOWN_VERSIONS;
  }

  // ---------- Stage, versions strip, mini preview ----------
  function setStatus(message) { if (els.status) els.status.textContent = message; }

  function sync() {
    const profile = currentProfile();
    const included = Boolean(profile?.included);
    const render = currentRender(profile);
    const key = included ? keyOf(profile) : "";
    const lookVersions = included ? versionsFor(key) : [];
    const monsterImage = !included ? options.getMonsterImage() : "";
    const presetShown = Boolean(included && !render && els.preset && !els.preset.hidden);

    if (els.monsterOnly) {
      els.monsterOnly.hidden = !monsterImage;
      if (monsterImage) { els.monsterOnly.src = monsterImage; els.monsterOnly.alt = "Selected storybook monster."; } else { els.monsterOnly.removeAttribute("src"); els.monsterOnly.alt = ""; }
    }
    els.stage?.classList.toggle("has-monster-only", Boolean(monsterImage));
    els.stage?.classList.toggle("has-book-render", Boolean(render));
    if (els.rendered) {
      if (render) {
        if (els.rendered.getAttribute("src") !== render.image) els.rendered.src = render.image;
        els.rendered.alt = "Painted storybook character in the animated film style.";
        els.rendered.hidden = false;
      } else {
        els.rendered.hidden = true;
      }
    }
    const previous = included && !render ? lastSelected() : null;
    if (els.stale) {
      els.stale.hidden = !previous;
      if (previous && els.staleImage && els.staleImage.getAttribute("src") !== previous.image) els.staleImage.src = previous.image;
    }
    if (els.label) els.label.textContent = !included ? "Your monster preview" : render ? "Painted character" : presetShown ? "Painted example" : "Live sketch";
    if (els.mode) els.mode.textContent = state.job ? "Painting…" : !included ? "Monster-only story" : render ? "Used in the book" : presetShown ? "Matches a quick-start look" : "Updates as you choose";

    if (els.actions) els.actions.hidden = !included;
    els.actions?.classList.toggle("is-complete", Boolean(render));
    if (els.button) {
      const atMax = lookVersions.length >= MAX_VERSIONS_PER_LOOK;
      els.button.disabled = Boolean(state.job) || atMax;
      els.button.textContent = state.job
        ? "Painting…"
        : lookVersions.length === 0
          ? (state.versions.length ? "Paint 2 Versions of This Look" : "Paint 2 Versions")
          : atMax ? `${MAX_VERSIONS_PER_LOOK} Versions Painted` : "Paint Another Version";
      els.button.dataset.count = String(lookVersions.length === 0 ? VERSIONS_PER_PAINT : 1);
    }
    const failure = state.failure && state.failure.key === key ? state.failure : null;
    if (els.retry) {
      els.retry.hidden = !failure || !failure.error.retryable || Boolean(state.job);
      els.retry.textContent = failure && failure.partial ? "Paint the Missing Version" : "Try Again";
    }
    renderVersionList(key);
    syncMini(profile, render);
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function renderVersionList(currentKey) {
    if (!els.versions || !els.versionList) return;
    els.versions.hidden = state.versions.length === 0 || !currentKey;
    const current = currentKey ? selectedFor(currentKey) : null;
    const items = state.versions.map((version) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "child-render-version";
      button.dataset.renderId = version.id;
      button.setAttribute("role", "radio");
      const isCurrent = current?.id === version.id;
      const sameLook = version.key === currentKey;
      button.setAttribute("aria-checked", isCurrent ? "true" : "false");
      button.classList.toggle("is-current-look", sameLook);
      const image = document.createElement("img");
      image.src = version.image;
      image.alt = "";
      const label = document.createElement("span");
      const title = document.createElement("b");
      const lookIndex = versionsFor(version.key).slice().reverse().findIndex((item) => item.id === version.id) + 1;
      title.textContent = `Version ${lookIndex || version.version || 1}`;
      const note = document.createElement("small");
      note.textContent = sameLook ? (isCurrent ? "In the book" : "This look") : "Earlier look";
      label.append(title, note);
      button.append(image, label);
      button.setAttribute("aria-label", `${title.textContent}, ${note.textContent}${version.createdAt ? `, painted ${formatTime(version.createdAt)}` : ""}${version.saved === false ? ", not saved after refresh" : ""}`);
      button.addEventListener("click", () => chooseVersion(version.id));
      return button;
    });
    els.versionList.replaceChildren(...items);
    if (els.versionsHint) els.versionsHint.textContent = state.versions.some((version) => version.key !== currentKey)
      ? "Tap one to use it. Earlier looks bring back their choices."
      : "Tap one to use it in the book.";
  }

  function chooseVersion(id) {
    const version = state.versions.find((item) => item.id === id);
    if (!version) return;
    selectVersion(version);
    if (version.key !== keyOf(currentProfile())) {
      selector()?.useProfile(version.profile, "Choices switched to match this painted version.");
      setStatus("Switched to that painted version and its choices. It will be used in the book.");
    } else {
      setStatus("This version will be used in the book.");
      sync();
    }
  }

  function syncMini(profile, render) {
    if (!els.mini) return;
    const top = headerOffset();
    const show = Boolean(window.matchMedia("(max-width: 980px)").matches && profile?.included && options.isStepVisible() && miniWanted(top));
    if (show) els.mini.style.setProperty("--child-mini-top", `${top}px`);
    const appeared = show && els.mini.hidden;
    if (els.mini.hidden === show) els.mini.hidden = !show;
    // Keep focused / scrolled-to controls clear of the bar.
    const padding = show ? `${top + Math.ceil(els.mini.getBoundingClientRect().height) + 10}px` : "";
    if (document.documentElement.style.scrollPaddingTop !== padding) document.documentElement.style.scrollPaddingTop = padding;
    // The tap itself can shift the page (a row appears, scroll anchoring) so the
    // bar only shows a frame later: still keep the chip just tapped in view.
    if (appeared && performance.now() < revealUntil) revealChosenChip();
    if (els.miniRender) {
      els.miniRender.hidden = !render;
      if (render && els.miniRender.getAttribute("src") !== render.image) els.miniRender.src = render.image;
    }
    els.mini.classList.toggle("has-render", Boolean(render));
    if (els.miniTitle) els.miniTitle.textContent = state.job ? "Painting…" : render ? "Painted character" : "Live sketch";
    if (els.miniStatus) els.miniStatus.textContent = state.job ? "You can keep editing" : render ? "Used in the book" : "Updates with every choice";
  }

  // The bar shows while the controls fill the screen and the big preview is scrolled away.
  function miniWanted(top) {
    if (!els.stage || !els.controls) return false;
    const stage = els.stage.getBoundingClientRect();
    const controls = els.controls.getBoundingClientRect();
    if (!stage.height || !controls.height) return false;
    const stageGone = stage.bottom < top + stage.height * 0.35 || stage.top > window.innerHeight;
    const controlsOnScreen = controls.top < window.innerHeight * 0.6 && controls.bottom > top + 160;
    return stageGone && controlsOnScreen;
  }

  // A chip tapped while half under the phone bar slides fully into view (the
  // bar's height is already in scroll-padding-top, so "nearest" clears it).
  // Only right after a tap, and never once the user starts scrolling.
  function revealChosenChip() {
    if (!els.mini || els.mini.hidden) return;
    const label = document.activeElement?.closest?.("#child-editor-start label");
    if (!label) return;
    const chip = label.getBoundingClientRect();
    if (chip.height && chip.top < els.mini.getBoundingClientRect().bottom && chip.bottom > 0) label.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function headerOffset() {
    const header = document.querySelector(".site-header");
    if (!header || !["sticky", "fixed"].includes(getComputedStyle(header).position)) return 0;
    return Math.max(0, Math.round(header.getBoundingClientRect().bottom));
  }

  // ---------- Painting ----------
  function friendlyError(error) {
    const code = error?.code || "";
    if (code === "cancelled") return "Painting cancelled. Your choices are unchanged.";
    if (code === "network_error") return "The connection dropped while painting. Check your connection, then try again.";
    if (code === "client_timeout" || code === "child_render_timeout" || code === "gateway_timeout") return "Painting took longer than usual and was stopped. Please try again—it often finishes faster the second time.";
    if (code === "child_renderer_busy") return "The character painter is busy right now. Please try again in a minute.";
    if (code === "missing_openai_api_key") return "Character painting isn’t available right now. Please try again later.";
    if (["monster_submission_required", "monster_submission_unauthorized", "unauthorized"].includes(code) || error?.status === 401 || error?.status === 403) {
      return "Your saved monster session has expired. Go back to the monster step and create a new preview to keep painting.";
    }
    if (error?.status === 429) return error.message || "You’ve reached today’s painting limit for this monster. Your painted versions are saved.";
    return error?.message || "The character could not be painted. Please try again.";
  }

  function shouldAutoRetry(error) {
    if (error?.code === "network_error") return true;
    if (!error?.retryable) return false;
    return [500, 502].includes(error.status) && error.code !== "child_render_timeout";
  }

  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => { window.clearTimeout(timer); reject(Object.assign(new Error("Cancelled"), { code: "cancelled" })); }, { once: true });
    });
  }

  async function requestRender({ job, profile, submission, version, reference }) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, options.requestTimeoutMs || REQUEST_TIMEOUT_MS);
    const onCancel = () => controller.abort();
    job.controller.signal.addEventListener("abort", onCancel);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ submissionId: submission.id, submissionToken: submission.token, profile, previousChildImage: reference, version }),
      });
      let result = null;
      try { result = await response.json(); } catch {}
      if (!response.ok || !result?.childImage) {
        const status = response.status || 502;
        const code = result?.code || (status === 504 ? "gateway_timeout" : "child_render_unreadable");
        const retryable = code === "missing_openai_api_key" ? false : (typeof result?.retryable === "boolean" ? result.retryable : status >= 500);
        throw Object.assign(new Error(result?.error || "The character could not be painted."), { status, code, retryable });
      }
      return result;
    } catch (error) {
      if (job.cancelled) throw Object.assign(new Error("Cancelled"), { code: "cancelled" });
      if (error?.name === "AbortError") throw Object.assign(new Error("Timed out"), { code: timedOut ? "client_timeout" : "cancelled", retryable: timedOut });
      if (error instanceof TypeError) throw Object.assign(new Error("Network error"), { code: "network_error", retryable: true });
      throw error;
    } finally {
      window.clearTimeout(timer);
      job.controller.signal.removeEventListener("abort", onCancel);
    }
  }

  async function paintOne(args) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await requestRender(args);
      } catch (error) {
        if (args.job.cancelled || attempt >= 2 || !shouldAutoRetry(error)) throw error;
        args.job.retried = true;
        updateProgress();
        await delay(options.autoRetryDelayMs ?? AUTO_RETRY_DELAY_MS, args.job.controller.signal);
      }
    }
  }

  function referenceFor(profile, key) {
    // Keep the child recognizable when they change one detail: reuse the last
    // chosen painting as the identity reference if the pose family matches.
    const previous = lastSelected();
    if (!previous || previous.key === key || !previous.image) return null;
    if (previous.profile.presentation !== profile.presentation || previous.profile.mobilityAid !== profile.mobilityAid) return null;
    return previous.image.length <= 2.6 * 1024 * 1024 ? previous.image : null;
  }

  async function paint(requested) {
    if (state.job) return;
    const profile = currentProfile();
    if (!profile?.included) { setStatus("Choose “Include my child” to paint a book character."); return; }
    const submission = options.getSubmission();
    if (!submission?.id || !submission?.token) {
      setStatus("The monster must be saved before the character can be painted. Go back to the monster step and try again.");
      return;
    }
    const key = keyOf(profile);
    const existing = versionsFor(key).length;
    const count = Math.max(0, Math.min(requested || Number(els.button?.dataset.count) || VERSIONS_PER_PAINT, MAX_VERSIONS_PER_LOOK - existing));
    if (!count) { setStatus(`This look already has ${MAX_VERSIONS_PER_LOOK} painted versions. Pick your favorite below.`); return; }
    const compact = selector()?.compactProfile(profile) || profile;
    const reference = referenceFor(compact, key);
    const job = { controller: new AbortController(), cancelled: false, startedAt: Date.now(), total: count, done: 0, failed: 0, retried: false, key };
    state.job = job;
    state.failure = null;
    state.submissionId = submission.id;
    showProgress();
    setStatus(count > 1 ? `Painting ${count} versions so you can pick a favorite.` : "Painting another version.");
    sync();

    const results = await Promise.allSettled(Array.from({ length: count }, (_, index) => paintOne({ job, profile: { ...compact, detail: compact.detail || "" }, submission, version: existing + index + 1, reference })
      .then((result) => {
        if (job.cancelled) return result;
        const version = {
          id: result.render?.id || `local-${Date.now()}-${index}`,
          image: result.childImage,
          profile: compact,
          key,
          createdAt: result.render?.createdAt || new Date().toISOString(),
          saved: result.render?.saved !== false && Boolean(result.render?.id),
          version: result.render?.version || existing + index + 1,
        };
        addVersion(version);
        job.done += 1;
        const shown = selectedFor(key);
        if (!shown || !state.selectedByKey[key]) selectVersion(version);
        updateProgress();
        sync();
        return result;
      })
      .catch((error) => { job.failed += 1; updateProgress(); throw error; })));

    if (state.job !== job) return; // cancelled; the UI was already reset
    state.job = null;
    hideProgress();
    const failures = results.filter((item) => item.status === "rejected").map((item) => item.reason);
    const succeeded = results.length - failures.length;
    if (!failures.length) {
      const unsaved = state.versions.some((version) => version.key === key && version.saved === false);
      setStatus(`${succeeded > 1 ? `${succeeded} versions are ready. Tap one to choose it—` : "Ready! "}the selected version goes into the book.${unsaved ? " Note: it couldn’t be saved, so keep this tab open." : ""}`);
    } else {
      const first = failures[0];
      state.failure = { error: { ...first, retryable: first.retryable !== false && first.code !== "cancelled" }, count: failures.length, key, partial: succeeded > 0 };
      state.failure.error.retryable = Boolean(first.retryable) && first.code !== "cancelled";
      const message = friendlyError(first);
      setStatus(succeeded ? `${succeeded} of ${results.length} versions are ready. The other couldn’t be painted: ${message}` : message);
      if (["child_detail_rejected", "child_render_blocked"].includes(first.code)) els.detail?.focus({ preventScroll: true });
    }
    sync();
  }

  function cancel() {
    const job = state.job;
    if (!job) return;
    job.cancelled = true;
    job.controller.abort();
    state.job = null;
    hideProgress();
    setStatus(job.done ? `Stopped. ${job.done} finished version${job.done > 1 ? "s are" : " is"} kept below.` : "Painting cancelled. Your choices are unchanged.");
    sync();
    els.button?.focus({ preventScroll: true });
  }

  function retry() {
    const failure = state.failure;
    if (!failure || state.job) return;
    paint(failure.count);
  }

  function showProgress() {
    if (!els.progress) return;
    els.progress.hidden = false;
    els.stage?.classList.add("is-painting");
    updateProgress();
    window.clearInterval(progressTimer);
    progressTimer = window.setInterval(updateProgress, 1000);
  }
  function updateProgress() {
    const job = state.job;
    if (!job || !els.progress) return;
    const elapsed = Math.max(0, Math.floor((Date.now() - job.startedAt) / 1000));
    const activeStep = job.done > 0 || elapsed >= 45 ? 3 : 2;
    for (const item of els.steps) {
      const step = Number(item.dataset.childRenderStep);
      item.classList.toggle("is-complete", step < activeStep);
      item.classList.toggle("is-active", step === activeStep);
    }
    if (els.progressTitle) els.progressTitle.textContent = job.total > 1 ? `Painting ${job.total} versions to choose from` : "Painting another version";
    if (els.progressCopy) {
      els.progressCopy.textContent = job.done && job.total > 1
        ? `${job.done} of ${job.total} ready—tap it below while the other finishes.`
        : job.retried ? "A connection hiccup happened, so we’re trying once more automatically."
          : elapsed >= SLOW_NOTICE_SECONDS ? "Taking longer than usual. You can keep waiting or cancel and try again."
            : "Applying every choice in the animated storybook style. This usually takes 40–90 seconds.";
    }
    if (els.elapsed) els.elapsed.textContent = elapsed < 3 ? "Just started" : `${elapsed} seconds elapsed · Still working`;
  }
  function hideProgress() {
    if (els.progress) els.progress.hidden = true;
    els.stage?.classList.remove("is-painting");
    window.clearInterval(progressTimer);
    progressTimer = undefined;
  }

  // ---------- Restore after refresh ----------
  async function fetchJson(url, submission) {
    const response = await fetch(url, { headers: { Accept: "application/json", "x-submission-id": submission.id, "x-submission-token": submission.token } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error || "Could not load"), { status: response.status, code: result.code });
    return result;
  }

  /** Loads saved versions listed by the session endpoint. Fails quietly. */
  async function restoreRenders(submission, renders = []) {
    if (!submission?.id || !submission?.token || !Array.isArray(renders) || !renders.length) return 0;
    state.submissionId = submission.id;
    const ref = readRefs()[submission.id] || {};
    const list = renders.slice(0, MAX_SHOWN_VERSIONS);
    const loaded = [];
    let index = 0;
    async function worker() {
      while (index < list.length) {
        const item = list[index++];
        try {
          const result = await fetchJson(`${ENDPOINT}?resource=image&kind=render&id=${encodeURIComponent(item.id)}`, submission);
          if (!result.image) continue;
          const profile = selector()?.compactProfile({ ...(selector()?.defaultProfile || {}), ...(item.profile || result.render?.profile || {}), id: "custom", included: true }) || item.profile;
          loaded.push({ id: item.id, image: result.image, profile, key: keyOf({ ...profile, included: true }), createdAt: item.createdAt, saved: true, version: item.version || 1 });
        } catch (error) {
          console.warn("A saved character version could not be loaded.", error?.code || error?.message);
        }
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    for (const version of loaded) addVersion(version);
    for (const [key, id] of Object.entries(ref.selectedByKey || {})) {
      if (state.versions.some((version) => version.id === id && version.key === key)) state.selectedByKey[key] = id;
    }
    if (ref.lastSelectedId && state.versions.some((version) => version.id === ref.lastSelectedId)) state.lastSelectedId = ref.lastSelectedId;
    sync();
    if (loaded.length) setStatus(currentRender() ? "Welcome back—your painted character is restored." : "Welcome back—your painted versions are below. Tap one to use it.");
    return loaded.length;
  }

  function reset(message) {
    if (state.job) { state.job.cancelled = true; state.job.controller.abort(); state.job = null; hideProgress(); }
    state.versions = [];
    state.selectedByKey = {};
    state.lastSelectedId = null;
    state.failure = null;
    state.submissionId = null;
    if (els.rendered) { els.rendered.hidden = true; els.rendered.removeAttribute("src"); }
    if (message) setStatus(message);
    sync();
  }

  function onStepShown() {
    if (!state.versions.length && !state.job) setStatus("The sketch shows your choices. Paint the character to see the finished book look.");
    sync();
  }

  function explainMissing() {
    const profile = currentProfile();
    setStatus(state.versions.length
      ? "Your painted versions are safe. Paint this look (or tap an earlier version) so the book matches the editor."
      : "Finish this step by painting the character that will be used in the book.");
    els.button?.focus({ preventScroll: true });
    els.button?.scrollIntoView({ behavior: "smooth", block: "center" });
    return profile;
  }

  function init(config = {}) {
    options = { ...options, ...config };
    sync();
  }

  els.button?.addEventListener("click", () => paint());
  els.retry?.addEventListener("click", retry);
  els.cancel?.addEventListener("click", cancel);
  els.stale?.addEventListener("click", () => { const previous = lastSelected(); if (previous) chooseVersion(previous.id); });
  els.miniJump?.addEventListener("click", () => els.stage?.scrollIntoView({ behavior: "smooth", block: "center" }));
  els.editor?.addEventListener("childprofilechange", () => {
    if (state.failure && state.failure.key !== keyOf(currentProfile())) state.failure = null;
    revealUntil = performance.now() + 1000;
    sync();
    revealChosenChip();
  });
  for (const type of ["touchmove", "wheel"]) window.addEventListener(type, () => { revealUntil = 0; }, { passive: true });
  // The bar is position: fixed, so it lives directly in <body> (no transformed ancestor can trap it).
  if (els.mini && els.mini.parentElement !== document.body) document.body.append(els.mini);
  let miniFrame = 0;
  const queueMini = () => {
    if (miniFrame) return;
    miniFrame = requestAnimationFrame(() => { miniFrame = 0; syncMini(currentProfile(), currentRender(currentProfile())); });
  };
  window.addEventListener("scroll", queueMini, { passive: true });
  window.addEventListener("resize", () => sync(), { passive: true });

  window.MonstersNowChildStudio = {
    init, sync, paint, cancel, retry, reset, restoreRenders, currentRender, onStepShown, explainMissing,
    isBusy: () => Boolean(state.job),
    versions: () => state.versions.map(({ image, ...rest }) => ({ ...rest })),
    constants: { REQUEST_TIMEOUT_MS, VERSIONS_PER_PAINT, MAX_VERSIONS_PER_LOOK },
  };
})();
