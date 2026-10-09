(() => {
  const storageKey = "monstersnow_child_character_profile_v3";
  const DETAIL_MAX = 80;
  const optionLabels = {
    presentation: { boy: "Boy", girl: "Girl", neutral: "Kid" },
    skinTone: { porcelain: "Porcelain", light: "Light", peach: "Peach", golden: "Golden", olive: "Olive", medium: "Medium", tan: "Tan", warm: "Warm brown", deep: "Deep", rich: "Rich deep" },
    hairStyle: { short: "Short", curly: "Curls", coils: "Coils", wavy: "Waves", straight: "Straight", braids: "Braids", locs: "Locs", ponytail: "Ponytail", puffs: "Puffs", buzz: "Buzz cut" },
    hairColor: { black: "Black", "dark-brown": "Dark brown", brown: "Brown", auburn: "Auburn", red: "Red / ginger", blonde: "Blonde", platinum: "Platinum" },
    eyeColor: { brown: "Brown", hazel: "Hazel", green: "Green", blue: "Blue", gray: "Gray" },
    outfitStyle: { overalls: "Overalls", hoodie: "Hoodie", tee: "T-shirt", dress: "Dress", sweater: "Sweater & jeans", jacket: "Rain jacket", shorts: "Shorts & tee", costume: "Halloween costume" },
    outfitColor: { teal: "Teal", orange: "Orange", purple: "Purple", blue: "Blue", rose: "Rose", green: "Green" },
    costume: { pumpkin: "Pumpkin", witch: "Witch or wizard", superhero: "Superhero", dinosaur: "Dinosaur", astronaut: "Astronaut", cat: "Black cat" },
    glasses: { none: "No glasses", round: "Round glasses", square: "Square glasses" },
    hearingAid: { none: "None", "hearing-aids": "Hearing aids", cochlear: "Cochlear implant" },
    headwear: { none: "None", hijab: "Hijab", patka: "Patka / turban", headwrap: "Head wrap", kippah: "Kippah", beanie: "Beanie", cap: "Baseball cap" },
    faceDetail: { none: "None", freckles: "Freckles", birthmark: "Birthmark", "freckles-birthmark": "Freckles + birthmark" },
    ageBand: { "2-4": "Ages 2–4", "5-6": "Ages 5–6", "7-8": "Ages 7–8", "9-10": "Ages 9–10" },
    relativeHeight: { shorter: "Shorter", average: "About average", taller: "Taller" },
    mobilityAid: { none: "Standing", wheelchair: "Wheelchair", "forearm-crutches": "Forearm crutches", walker: "Walker", "prosthetic-leg": "Prosthetic leg", "leg-braces": "Leg braces" },
  };
  // Radio group name for each profile field.
  const fieldInputs = {
    presentation: "child-presentation", skinTone: "child-skin-tone", hairStyle: "child-hair-style", hairColor: "child-hair-color",
    eyeColor: "child-eye-color", outfitStyle: "child-outfit-style", outfitColor: "child-outfit-color", costume: "child-costume",
    glasses: "child-glasses", hearingAid: "child-hearing-aid", headwear: "child-headwear", faceDetail: "child-face-detail",
    ageBand: "child-age-band", relativeHeight: "child-relative-height", mobilityAid: "child-mobility-aid",
  };
  const ageBands = Object.keys(optionLabels.ageBand);
  const heights = Object.keys(optionLabels.relativeHeight);
  const wheelchairSupport = { appearanceIds: ["custom"], ageBands, relativeHeights: heights };
  const forearmCrutchSupport = { appearanceIds: ["custom"], ageBands, relativeHeights: heights };
  const defaultProfile = {
    id: "custom", ageBand: "5-6", relativeHeight: "average", mobilityAid: "none", presentation: "girl",
    skinTone: "medium", hairStyle: "curly", hairColor: "dark-brown", eyeColor: "brown", outfitStyle: "overalls", outfitColor: "teal",
    costume: "", glasses: "none", hearingAid: "none", headwear: "none", faceDetail: "none", detail: "",
  };
  const legacyProfiles = {
    "warm-curly-dark": ["warm", "curly", "dark-brown"], "deep-coils-black": ["deep", "coils", "black"],
    "medium-wavy-brown": ["medium", "wavy", "brown"], "golden-straight-black": ["golden", "straight", "black"],
    "light-short-brown": ["light", "short", "brown"], "light-wavy-blonde": ["light", "wavy", "blonde"],
    "medium-curly-auburn": ["medium", "curly", "auburn"], "deep-braids-black": ["deep", "braids", "black"],
  };
  const root = document.querySelector("[data-child-selector]");
  const history = [];
  let lastProfile = null;
  let presetManifest = { presets: [] };
  let presetsRequested = false;

  /** Same rules as the server's sanitizeChildDetail, so saved keys match. */
  function sanitizeDetail(value) {
    if (typeof value !== "string") return "";
    const detail = value
      .normalize("NFKC")
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .replace(/https?:\/\/\S+|www\.\S+/gi, " ")
      .replace(/[^\p{L}\p{N} ,.'!?&()-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, DETAIL_MAX)
      .replace(/\p{Cs}/gu, "")
      .trim();
    // Same 150-byte UTF-8 cap as the server (only affects long non-Latin text).
    const encoder = new TextEncoder();
    let capped = detail;
    while (encoder.encode(capped).length > 150) capped = Array.from(capped).slice(0, -1).join("");
    return capped.trim();
  }

  function selected(name, fallback = "") { return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback; }
  function valid(field, value, fallback) { return Object.hasOwn(optionLabels[field], value) ? value : fallback; }

  function getProfile() {
    const id = selected("child-character", "custom");
    if (id === "none") {
      const empty = { id: "none", label: "Monster only", included: false, detail: "" };
      for (const field of Object.keys(fieldInputs)) empty[field] = "";
      return empty;
    }
    const profile = { id: "custom", label: "Custom illustrated child", included: true };
    for (const [field, name] of Object.entries(fieldInputs)) {
      if (field === "costume") continue;
      profile[field] = valid(field, selected(name, defaultProfile[field]), defaultProfile[field]);
    }
    profile.costume = profile.outfitStyle === "costume" ? valid("costume", selected("child-costume", "pumpkin"), "pumpkin") : "";
    profile.detail = sanitizeDetail(document.querySelector("#child-special-detail")?.value || "");
    for (const field of Object.keys(fieldInputs)) {
      if (profile[field]) profile[`${field}Label`] = optionLabels[field][profile[field]];
    }
    return profile;
  }

  function supportsWheelchair(profile) { return Boolean(profile?.included && profile.id === "custom"); }
  function supportsForearmCrutches(profile) { return Boolean(profile?.included && profile.id === "custom"); }

  function compactProfile(profile) {
    if (!profile || profile.included === false || profile.id === "none") return { id: "none" };
    const value = { id: "custom" };
    for (const field of Object.keys(fieldInputs)) {
      if (field === "costume") continue;
      value[field] = valid(field, profile[field], defaultProfile[field]);
    }
    value.costume = value.outfitStyle === "costume" ? valid("costume", profile.costume, "pumpkin") : "";
    value.detail = sanitizeDetail(profile.detail || "");
    return value;
  }
  function profileKey(profile) { return JSON.stringify(compactProfile(profile)); }

  function migrateProfile(profile) {
    if (!profile || typeof profile !== "object") return defaultProfile;
    if (profile.id === "none") return { id: "none" };
    if (profile.id === "custom") return compactProfile({ ...defaultProfile, ...profile, id: "custom" });
    const legacy = legacyProfiles[profile.id];
    if (!legacy) return defaultProfile;
    return compactProfile({ ...defaultProfile, ...profile, id: "custom", skinTone: legacy[0], hairStyle: legacy[1], hairColor: legacy[2], eyeColor: "brown", outfitStyle: "overalls", outfitColor: "teal" });
  }

  function applyProfile(profile) {
    const value = migrateProfile(profile);
    const check = (name, wanted) => {
      const input = [...document.querySelectorAll(`input[name="${name}"]`)].find((option) => option.value === wanted && !option.disabled);
      if (input) input.checked = true;
    };
    check("child-character", value.id);
    if (value.id === "custom") {
      for (const [field, name] of Object.entries(fieldInputs)) {
        const wanted = field === "costume" ? (value.costume || "pumpkin") : value[field];
        if (wanted) check(name, wanted);
      }
      const detail = document.querySelector("#child-special-detail");
      if (detail) detail.value = value.detail || "";
    }
  }

  function persist(profile) {
    try { localStorage.setItem(storageKey, JSON.stringify(compactProfile(profile))); } catch (error) { console.warn("Child character choices could not be saved locally.", error); }
  }
  function restore() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem("monstersnow_child_character_profile_v2") || localStorage.getItem("monstersnow_child_character_profile_v1") || "null"); } catch { return; }
    if (saved) applyProfile(saved);
  }
  function updateHistoryControls(message = "") {
    const undoButton = document.querySelector("#child-editor-undo");
    const status = document.querySelector("#child-editor-action-status");
    if (undoButton) undoButton.disabled = history.length === 0;
    if (status) status.textContent = message;
  }

  // ---------- Painted avatar preview, thumbnails, and quick-start looks ----------
  // Closest matching painted art from assets/child-editor (same images as the live editor).
  const HAIR_COLOR_HEX = Object.freeze({
    black: "#18151a", "dark-brown": "#38231d", brown: "#6b4028", auburn: "#963f28",
    red: "#c4521f", blonde: "#d8a83f", platinum: "#d9c897",
  });
  const HAIR_ASSET = Object.freeze({
    short: "short", curly: "curls", coils: "coils", wavy: "waves", straight: "straight", braids: "braids",
    locs: "braids", ponytail: "waves", puffs: "coils", buzz: "short",
  });

  function presentationKey(profile) {
    return profile?.presentation === "boy" ? "boy" : "girl";
  }

  function premiumReferenceFor(profile) {
    const who = presentationKey(profile);
    if (profile?.mobilityAid === "forearm-crutches") return `assets/child-editor/default-${who}-forearm-crutches-feature-animation-v1.webp`;
    if (profile?.mobilityAid === "wheelchair") return `assets/child-editor/default-${who}-wheelchair-feature-animation-v1.webp`;
    return `assets/child-editor/default-${who}-feature-animation-v1.webp`;
  }

  function hairThumbnailSrc(profile, style) {
    const who = presentationKey(profile);
    const asset = HAIR_ASSET[style] || "curls";
    const prefix = who === "boy" ? "hair-style-boy" : "hair-style";
    return `assets/child-editor/${prefix}-${asset}-v1.webp`;
  }

  function forgetPresetArt(imageUrl) {
    for (const preset of presetManifest.presets) if (preset.imageUrl === imageUrl) preset.imageUrl = null;
  }

  function presetMatch(profile) {
    if (!profile?.included) return null;
    const key = profileKey(profile);
    return presetManifest.presets.find((preset) => preset.imageUrl && profileKey(preset.profile) === key) || null;
  }

  // Swap painted art without a blank frame: decode the next image first, then
  // swap and play a short fade/settle. Rapid taps only apply the latest choice.
  const decoded = new Map();
  function decodeArt(src) {
    if (!decoded.has(src)) {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      decoded.set(src, (img.decode ? img.decode() : Promise.resolve()).catch(() => {}));
    }
    return decoded.get(src);
  }
  function preloadStockAvatars() {
    for (const who of ["girl", "boy"]) {
      for (const aid of ["", "-wheelchair", "-forearm-crutches"]) decodeArt(`assets/child-editor/default-${who}${aid}-feature-animation-v1.webp`);
    }
  }

  function setPaintedSrc(image, src, alt) {
    if (!image) return;
    if (alt != null) image.alt = alt;
    if (image.dataset.wantSrc === src || (!image.dataset.wantSrc && image.getAttribute("src") === src)) return;
    image.dataset.wantSrc = src;
    const swap = () => {
      if (image.dataset.wantSrc !== src || image.getAttribute("src") === src) return;
      image.classList.remove("is-refreshing");
      image.src = src;
      if (!image.hidden) requestAnimationFrame(() => image.classList.add("is-refreshing"));
    };
    if (!image.getAttribute("src") || image.hidden) { swap(); return; }
    decodeArt(src).then(swap);
  }

  function renderProfile(stage, _avatar, profile) {
    if (!stage) return;
    const figure = stage.querySelector(".child-preview-figure");
    const premium = stage.querySelector(".child-premium-default");
    const presetImage = stage.querySelector(".child-preset-preview");
    for (const className of [...stage.classList]) {
      if (["is-empty", "has-character-art", "has-premium-art", "has-preset-art"].includes(className) || /^(age|height|mobility)-/.test(className)) stage.classList.remove(className);
    }
    stage.classList.add("child-preview-stage");
    if (!profile?.included) {
      stage.classList.add("is-empty");
      if (premium) premium.hidden = true;
      if (presetImage) presetImage.hidden = true;
      if (figure) figure.hidden = false;
      return;
    }
    const compact = compactProfile(profile);
    if (figure) figure.hidden = true;
    stage.classList.add(`age-${compact.ageBand}`, `height-${compact.relativeHeight}`, `mobility-${compact.mobilityAid}`, "has-character-art", "has-premium-art");

    const match = presetMatch(profile);
    if (presetImage && !presetImage.dataset.errorBound) {
      presetImage.dataset.errorBound = "true";
      presetImage.addEventListener("error", () => {
        const src = presetImage.getAttribute("src");
        if (!src) return;
        forgetPresetArt(src);
        presetImage.hidden = true;
        presetImage.removeAttribute("src");
        stage.classList.remove("has-preset-art");
        // Fall back to the closest stock painted avatar for the CURRENT choices.
        if (premium) {
          premium.hidden = stage.classList.contains("has-book-render");
          setPaintedSrc(premium, premiumReferenceFor(getProfile()), "Closest painted preview of the storybook character");
        }
        window.MonstersNowChildStudio?.sync?.();
      });
    }

    if (match && presetImage) {
      setPaintedSrc(presetImage, match.imageUrl, `Painted example of the ${match.label} look.`);
      presetImage.hidden = false;
      stage.classList.add("has-preset-art");
      if (premium) premium.hidden = true;
    } else {
      if (presetImage) presetImage.hidden = true;
      if (premium) {
        premium.hidden = stage.classList.contains("has-book-render");
        setPaintedSrc(premium, premiumReferenceFor(compact), "Closest painted preview of the storybook character");
      }
    }
  }

  function renderMiniPreview(profile) {
    const mini = document.querySelector("#child-mini-art");
    if (!mini) return;
    if (!profile?.included) {
      mini.removeAttribute("src");
      return;
    }
    const match = presetMatch(profile);
    setPaintedSrc(mini, match?.imageUrl || premiumReferenceFor(compactProfile(profile)), "");
  }

  function renderHairThumbnails(profile) {
    if (!root || !profile?.included) return;
    root.style.setProperty("--selected-hair-color", HAIR_COLOR_HEX[profile.hairColor] || HAIR_COLOR_HEX["dark-brown"]);
    for (const thumb of root.querySelectorAll("[data-hair-thumbnail]")) {
      const style = thumb.dataset.hairThumbnail;
      const src = hairThumbnailSrc(profile, style);
      if (thumb.getAttribute("src") !== src) thumb.src = src;
    }
  }

  function renderPresetOptions() {
    const list = document.querySelector("#child-preset-options");
    if (!list || !presetManifest.presets.length) return;
    const current = lastProfile ? profileKey(lastProfile) : "";
    if (list.childElementCount !== presetManifest.presets.length) {
      list.replaceChildren(...presetManifest.presets.map((preset) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "child-preset-option";
        button.dataset.presetId = preset.id;
        const art = document.createElement("span");
        art.className = "child-preset-art";
        art.setAttribute("aria-hidden", "true");
        const image = document.createElement("img");
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        const fallback = premiumReferenceFor(preset.profile);
        image.src = preset.imageUrl || fallback;
        image.addEventListener("error", () => {
          if (preset.imageUrl) forgetPresetArt(preset.imageUrl);
          if (image.getAttribute("src") !== fallback) image.src = fallback;
        }, { once: true });
        art.append(image);
        const label = document.createElement("b");
        label.textContent = preset.label;
        button.append(art, label);
        button.addEventListener("click", () => applyPreset(preset.id));
        return button;
      }));
      list.closest("[data-child-presets]")?.removeAttribute("hidden");
      refreshScrollHints();
    }
    for (const button of list.querySelectorAll("[data-preset-id]")) {
      const preset = presetManifest.presets.find((item) => item.id === button.dataset.presetId);
      button.setAttribute("aria-pressed", preset && profileKey(preset.profile) === current ? "true" : "false");
    }
  }

  function applyPreset(id) {
    const preset = presetManifest.presets.find((item) => item.id === id);
    if (!preset) return;
    const current = getProfile();
    history.push(compactProfile(current));
    if (history.length > 30) history.shift();
    applyProfile({ ...defaultProfile, ...preset.profile, id: "custom", detail: "" });
    sync({ message: `${preset.label} look applied. Every choice is still editable.` });
  }

  async function loadPresets() {
    if (presetsRequested || !root) return;
    presetsRequested = true;
    try {
      const response = await fetch("/api/render-child-character?resource=presets", { headers: { Accept: "application/json" } });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.presets)) return;
      presetManifest = { presets: result.presets.filter((preset) => preset?.id && preset.profile).map((preset) => ({ ...preset, profile: compactProfile({ ...defaultProfile, ...preset.profile, id: "custom" }) })) };
      renderPresetOptions();
      sync({ save: false, silent: true });
    } catch {
      // Quick-start looks are optional; the painted avatar still covers every choice.
    }
  }

  // ---------- Phone-friendly swipe rows ----------
  const scrollRowSelector = ".child-color-options, .child-style-options, .child-segmented-options, .child-preset-options, .child-presentation-options";
  function updateRowHint(row) {
    const overflow = row.scrollWidth - row.clientWidth > 4;
    row.classList.toggle("is-scrollable", overflow);
    row.classList.toggle("at-start", row.scrollLeft <= 4);
    row.classList.toggle("at-end", row.scrollLeft + row.clientWidth >= row.scrollWidth - 4);
    const hint = row.parentElement?.querySelector(":scope > .child-swipe-hint");
    if (hint) hint.hidden = !overflow || row.dataset.swiped === "true";
  }
  // Rows can change size without a sync (e.g. the editor step being revealed,
  // fonts or art loading), so re-check each row whenever its box changes.
  const rowObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => { for (const entry of entries) updateRowHint(entry.target); })
    : null;
  function refreshScrollHints() {
    if (!root) return;
    for (const row of root.querySelectorAll(scrollRowSelector)) {
      if (!row.dataset.scrollHint) {
        row.dataset.scrollHint = "true";
        const hint = document.createElement("span");
        hint.className = "child-swipe-hint";
        hint.setAttribute("aria-hidden", "true");
        hint.textContent = window.matchMedia("(pointer: coarse)").matches ? "Swipe for more →" : "Scroll for more →";
        hint.hidden = true;
        row.insertAdjacentElement("beforebegin", hint);
        row.addEventListener("scroll", () => {
          if (row.scrollLeft > 8) row.dataset.swiped = "true";
          updateRowHint(row);
        }, { passive: true });
        rowObserver?.observe(row);
      }
      updateRowHint(row);
    }
  }

  function syncConditionalFields(profile) {
    const costumeField = document.querySelector("#child-costume-field");
    const outfitColorField = document.querySelector("#child-outfit-color-field");
    const isCostume = profile.included && profile.outfitStyle === "costume";
    if (costumeField) costumeField.hidden = !isCostume;
    if (outfitColorField) outfitColorField.hidden = isCostume;
    const counter = document.querySelector("#child-special-detail-count");
    const input = document.querySelector("#child-special-detail");
    if (counter && input) counter.textContent = `${input.value.length}/${DETAIL_MAX}`;
  }

  function describe(profile) {
    const parts = [
      optionLabels.presentation[profile.presentation],
      `${optionLabels.skinTone[profile.skinTone]} skin`,
      profile.headwear === "hijab" || profile.headwear === "patka" || profile.headwear === "headwrap"
        ? optionLabels.headwear[profile.headwear]
        : `${optionLabels.hairColor[profile.hairColor]} ${optionLabels.hairStyle[profile.hairStyle].toLowerCase()}`,
      `${optionLabels.eyeColor[profile.eyeColor]} eyes`,
      profile.outfitStyle === "costume" ? `${optionLabels.costume[profile.costume]} costume` : `${optionLabels.outfitColor[profile.outfitColor]} ${optionLabels.outfitStyle[profile.outfitStyle].toLowerCase()}`,
    ];
    const extras = [
      profile.glasses !== "none" && optionLabels.glasses[profile.glasses],
      profile.hearingAid !== "none" && optionLabels.hearingAid[profile.hearingAid],
      !["none", "hijab", "patka", "headwrap"].includes(profile.headwear) && optionLabels.headwear[profile.headwear],
      profile.faceDetail !== "none" && optionLabels.faceDetail[profile.faceDetail],
      optionLabels.ageBand[profile.ageBand],
      optionLabels.relativeHeight[profile.relativeHeight],
      profile.mobilityAid !== "none" && optionLabels.mobilityAid[profile.mobilityAid],
    ].filter(Boolean);
    return `${parts.join(" · ")}. ${extras.join(" · ")}.${profile.detail ? ` “${profile.detail}”` : ""}`;
  }

  function sync({ save = true, recordHistory = false, message = "", silent = false } = {}) {
    if (!root) return getProfile();
    const profile = getProfile();
    root.dataset.presentation = profile.presentation || "girl";
    if (recordHistory && lastProfile && profileKey(lastProfile) !== profileKey(profile)) { history.push(compactProfile(lastProfile)); if (history.length > 30) history.shift(); }
    const details = document.querySelector("#child-character-details");
    const selection = document.querySelector("#child-character-selection");
    const title = document.querySelector("#child-preview-title");
    const copy = document.querySelector("#child-preview-details");
    for (const input of root.querySelectorAll('input[type="radio"]')) input.closest("label")?.classList.toggle("is-selected", input.checked);
    if (details) details.hidden = !profile.included;
    if (selection) selection.textContent = profile.included ? "Live preview" : "Monster-only story";
    if (title) title.textContent = profile.included ? "Their storybook character is taking shape." : "Their monster takes center stage.";
    if (copy) copy.textContent = profile.included ? describe(profile) : "Your selected monster is shown here and will star in the story.";
    syncConditionalFields(profile);
    renderProfile(document.querySelector("#child-preview-stage"), null, profile);
    renderMiniPreview(profile);
    renderHairThumbnails(profile);
    if (save) persist(profile);
    lastProfile = compactProfile(profile);
    renderPresetOptions();
    updateHistoryControls(message);
    root.dispatchEvent(new CustomEvent("childprofilechange", { detail: profile }));
    if (!silent) window.requestAnimationFrame(refreshScrollHints);
    return profile;
  }

  function undo() { const previous = history.pop(); if (!previous) return getProfile(); applyProfile(previous); return sync({ message: "Last character change undone." }); }
  function reset() {
    const current = getProfile();
    if (profileKey(current) === profileKey(defaultProfile)) return current;
    history.push(compactProfile(current)); applyProfile(defaultProfile); return sync({ message: "Character reset to the starting design." });
  }
  /** Applies a saved profile (e.g. from an earlier painted version) as an undoable change. */
  function useProfile(profile, message = "") {
    const current = getProfile();
    if (profileKey(current) !== profileKey(profile)) { history.push(compactProfile(current)); if (history.length > 30) history.shift(); }
    applyProfile(profile);
    return sync({ message });
  }

  function selectEditorTab(tabId) {
    for (const button of document.querySelectorAll("[data-editor-tab]")) {
      const active = button.dataset.editorTab === tabId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    }
    for (const panel of document.querySelectorAll("[data-editor-panel]")) {
      const active = panel.dataset.editorPanel === tabId;
      panel.classList.toggle("is-active", active);
      if (active) panel.open = true;
    }
    window.requestAnimationFrame(refreshScrollHints);
  }

  window.MonstersNowChildSelector = {
    getProfile, renderProfile, restore, sync, undo, reset, useProfile, compactProfile, profileKey, sanitizeDetail, presetMatch, premiumReferenceFor,
    supportsWheelchair, supportsForearmCrutches, storageKey, wheelchairSupport, forearmCrutchSupport, optionLabels, defaultProfile, selectEditorTab,
  };
  if (!root) return;
  restore();
  let detailTimer;
  root.addEventListener("change", (event) => {
    if (event.target?.id === "child-special-detail") {
      window.clearTimeout(detailTimer);
      const input = event.target;
      const clean = sanitizeDetail(input.value);
      if (input.value !== clean) input.value = clean;
    }
    sync({ recordHistory: true });
  });
  document.querySelector("#child-special-detail")?.addEventListener("input", () => {
    syncConditionalFields(getProfile());
    window.clearTimeout(detailTimer);
    detailTimer = window.setTimeout(() => {
      if (!lastProfile || profileKey(getProfile()) !== profileKey(lastProfile)) sync({ recordHistory: true });
    }, 450);
  });
  for (const button of document.querySelectorAll("[data-editor-tab]")) {
    button.addEventListener("click", () => selectEditorTab(button.dataset.editorTab));
  }
  document.querySelector("#child-editor-undo")?.addEventListener("click", undo);
  document.querySelector("#child-editor-reset")?.addEventListener("click", reset);
  window.addEventListener("pageshow", () => { restore(); history.length = 0; lastProfile = null; sync({ save: false }); });
  window.addEventListener("resize", () => window.requestAnimationFrame(refreshScrollHints), { passive: true });
  sync({ save: false });
  loadPresets();
  if (root) (window.requestIdleCallback || ((fn) => setTimeout(fn, 400)))(preloadStockAvatars);
})();
