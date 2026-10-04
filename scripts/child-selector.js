(() => {
  const storageKey = "monstersnow_child_character_profile_v1";
  const ageLabels = { "2-4": "Ages 2–4", "5-6": "Ages 5–6", "7-8": "Ages 7–8" };
  const heightLabels = {
    shorter: "Shorter than most children this age",
    average: "About average height",
    taller: "Taller than most children this age",
  };
  const mobilityLabels = { none: "", wheelchair: "Wheelchair shown in every scene" };
  const wheelchairSupport = {
    appearanceIds: ["warm-curly-dark", "deep-braids-black"],
    ageBands: ["5-6", "7-8"],
    relativeHeights: ["average", "taller"],
  };
  const presetVisuals = {
    "warm-curly-dark": { avatarClass: "avatar-curly", skin: "#8f5538", hair: "#24150f" },
    "deep-coils-black": { avatarClass: "avatar-coils", skin: "#5c3426", hair: "#17100e" },
    "medium-wavy-brown": { avatarClass: "avatar-wave", skin: "#bd7b54", hair: "#4a2818" },
    "golden-straight-black": { avatarClass: "avatar-straight", skin: "#d4a071", hair: "#171717" },
    "light-short-brown": { avatarClass: "avatar-short", skin: "#f0c3a0", hair: "#6a3d24" },
    "light-wavy-blonde": { avatarClass: "avatar-wave", skin: "#f5ceb0", hair: "#d9a83e" },
    "medium-curly-auburn": { avatarClass: "avatar-coils", skin: "#c88962", hair: "#8c3d25" },
    "deep-braids-black": { avatarClass: "avatar-braids", skin: "#70422f", hair: "#16110f" },
  };
  const root = document.querySelector("[data-child-selector]");
  const defaultProfile = { id: "none", ageBand: "5-6", relativeHeight: "average", mobilityAid: "none" };
  const history = [];
  let lastProfile = null;

  function selected(name, fallback = "") {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
  }

  function selectedAppearance() {
    return document.querySelector('input[name="child-character"]:checked');
  }

  function getProfile() {
    const input = selectedAppearance();
    const id = input?.value || "none";
    if (id === "none") {
      return {
        id: "none",
        label: "Monster only",
        included: false,
        skinTone: "",
        hairColor: "",
        hairStyle: "",
        ageBand: "",
        relativeHeight: "",
        mobilityAid: "",
      };
    }
    return {
      id,
      label: input.dataset.label || "Child character",
      included: true,
      skinTone: input.dataset.skinTone || "",
      hairColor: input.dataset.hairColor || "",
      hairStyle: input.dataset.hairStyle || "",
      ageBand: selected("child-age-band", "5-6"),
      relativeHeight: selected("child-relative-height", "average"),
      mobilityAid: selected("child-mobility-aid", "none"),
    };
  }

  function supportsWheelchair(profile) {
    return Boolean(profile?.included
      && wheelchairSupport.appearanceIds.includes(profile.id)
      && wheelchairSupport.ageBands.includes(profile.ageBand)
      && wheelchairSupport.relativeHeights.includes(profile.relativeHeight));
  }

  function refreshWheelchairControls() {
    const wheelchair = document.querySelector('input[name="child-mobility-aid"][value="wheelchair"]');
    const none = document.querySelector('input[name="child-mobility-aid"][value="none"]');
    if (!wheelchair || !none) return;
    let profile = getProfile();
    const supported = supportsWheelchair(profile);
    if (!supported && wheelchair.checked) {
      none.checked = true;
      profile = getProfile();
    }
    wheelchair.disabled = !supportsWheelchair(profile);
    const wheelchairSelected = wheelchair.checked;
    for (const input of document.querySelectorAll('input[name="child-character"]')) {
      input.disabled = wheelchairSelected && input.value !== "none" && !wheelchairSupport.appearanceIds.includes(input.value);
      input.closest("label")?.classList.toggle("is-unavailable", input.disabled);
    }
    for (const input of document.querySelectorAll('input[name="child-age-band"]')) {
      input.disabled = wheelchairSelected && !wheelchairSupport.ageBands.includes(input.value);
      input.closest("label")?.classList.toggle("is-unavailable", input.disabled);
    }
    for (const input of document.querySelectorAll('input[name="child-relative-height"]')) {
      input.disabled = wheelchairSelected && !wheelchairSupport.relativeHeights.includes(input.value);
      input.closest("label")?.classList.toggle("is-unavailable", input.disabled);
    }
    const label = wheelchair.closest("label");
    label?.classList.toggle("is-unavailable", wheelchair.disabled);
    label?.setAttribute("aria-disabled", wheelchair.disabled ? "true" : "false");
    const copy = document.querySelector("#child-wheelchair-option-copy");
    if (copy) copy.textContent = wheelchair.disabled
      ? "Choose Curly dark or Braids, ages 5–8, and average or taller."
      : "Preview available · print ordering pending physical proof";
  }

  function previewValues(profile) {
    const input = [...document.querySelectorAll('input[name="child-character"]')].find((option) => option.value === profile.id);
    const fallback = presetVisuals[profile.id] || {};
    return {
      avatarClass: input?.dataset.avatarClass || fallback.avatarClass || "",
      skin: input?.dataset.skin || fallback.skin || "#d4a071",
      hair: input?.dataset.hair || fallback.hair || "#24150f",
    };
  }

  function renderProfile(stage, avatar, profile) {
    if (!stage || !avatar) return;
    stage.className = "child-preview-stage";
    avatar.className = "child-avatar";
    avatar.removeAttribute("style");
    avatar.textContent = "";
    if (!profile?.included) {
      stage.classList.add("is-empty");
      avatar.classList.add("child-avatar-none");
      avatar.textContent = "◇";
      return;
    }
    const values = previewValues(profile);
    if (values.avatarClass) avatar.classList.add(values.avatarClass);
    avatar.style.setProperty("--skin", values.skin);
    avatar.style.setProperty("--hair", values.hair);
    stage.classList.add(`age-${profile.ageBand || "5-6"}`, `height-${profile.relativeHeight || "average"}`);
    stage.classList.add(`mobility-${profile.mobilityAid || "none"}`);
  }

  function persist(profile) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        id: profile.id,
        ageBand: profile.ageBand,
        relativeHeight: profile.relativeHeight,
        mobilityAid: profile.mobilityAid,
      }));
    } catch (error) {
      console.warn("Child character choices could not be saved locally.", error);
    }
  }

  function compactProfile(profile) {
    return {
      id: profile?.id || "none",
      ageBand: profile?.ageBand || "5-6",
      relativeHeight: profile?.relativeHeight || "average",
      mobilityAid: profile?.mobilityAid || "none",
    };
  }

  function profileKey(profile) {
    const value = compactProfile(profile);
    return [value.id, value.ageBand, value.relativeHeight, value.mobilityAid].join(":");
  }

  function applyProfile(profile) {
    const value = compactProfile(profile);
    const controls = {
      "child-character": value.id,
      "child-age-band": value.ageBand,
      "child-relative-height": value.relativeHeight,
    };
    for (const [name, selectedValue] of Object.entries(controls)) {
      const input = [...document.querySelectorAll(`input[name="${name}"]`)].find((option) => option.value === selectedValue && !option.disabled);
      if (input) input.checked = true;
    }
    refreshWheelchairControls();
    const mobility = [...document.querySelectorAll('input[name="child-mobility-aid"]')].find((option) => option.value === value.mobilityAid && !option.disabled);
    if (mobility) mobility.checked = true;
    refreshWheelchairControls();
  }

  function updateHistoryControls(message = "") {
    const undo = document.querySelector("#child-editor-undo");
    const status = document.querySelector("#child-editor-action-status");
    if (undo) undo.disabled = history.length === 0;
    if (status) status.textContent = message;
  }

  function restore() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { return; }
    if (!saved || typeof saved !== "object") return;
    const appearance = [...document.querySelectorAll('input[name="child-character"]')].find((input) => input.value === saved.id);
    const age = [...document.querySelectorAll('input[name="child-age-band"]')].find((input) => input.value === saved.ageBand);
    const height = [...document.querySelectorAll('input[name="child-relative-height"]')].find((input) => input.value === saved.relativeHeight);
    if (appearance) appearance.checked = true;
    if (age) age.checked = true;
    if (height) height.checked = true;
    refreshWheelchairControls();
    const mobility = [...document.querySelectorAll('input[name="child-mobility-aid"]')].find((input) => input.value === saved.mobilityAid && !input.disabled);
    if (mobility) mobility.checked = true;
    refreshWheelchairControls();
  }

  function sync({ save = true, recordHistory = false, message = "" } = {}) {
    if (!root) return getProfile();
    refreshWheelchairControls();
    const profile = getProfile();
    if (recordHistory && lastProfile && profileKey(lastProfile) !== profileKey(profile)) {
      history.push(compactProfile(lastProfile));
      if (history.length > 20) history.shift();
    }
    const details = document.querySelector("#child-character-details");
    const selection = document.querySelector("#child-character-selection");
    const title = document.querySelector("#child-preview-title");
    const copy = document.querySelector("#child-preview-details");
    const stage = document.querySelector("#child-preview-stage");
    const avatar = document.querySelector("#child-preview-avatar");
    for (const input of document.querySelectorAll('input[name="child-character"]')) {
      input.closest("label")?.classList.toggle("is-selected", input.checked);
    }
    if (details) details.hidden = !profile.included;
    if (selection) selection.textContent = profile.included ? profile.label : "Monster only";
    if (title) title.textContent = profile.included ? profile.label : "Monster-only story";
    if (copy) {
      copy.textContent = profile.included
        ? `${[ageLabels[profile.ageBand], heightLabels[profile.relativeHeight], mobilityLabels[profile.mobilityAid]].filter(Boolean).join(" · ")}. Saved with the book profile.`
        : "No child character will appear in illustrated scenes.";
    }
    renderProfile(stage, avatar, profile);
    if (save) persist(profile);
    lastProfile = compactProfile(profile);
    updateHistoryControls(message);
    root.dispatchEvent(new CustomEvent("childprofilechange", { detail: profile }));
    return profile;
  }

  function undo() {
    const previous = history.pop();
    if (!previous) return getProfile();
    applyProfile(previous);
    return sync({ message: "Last character change undone." });
  }

  function reset() {
    const current = getProfile();
    if (profileKey(current) === profileKey(defaultProfile)) return current;
    history.push(compactProfile(current));
    applyProfile(defaultProfile);
    return sync({ message: "Character reset to monster-only." });
  }

  window.MonstersNowChildSelector = { getProfile, renderProfile, restore, sync, undo, reset, supportsWheelchair, storageKey, wheelchairSupport };
  if (!root) return;
  restore();
  root.addEventListener("change", () => sync({ recordHistory: true }));
  document.querySelector("#child-editor-undo")?.addEventListener("click", undo);
  document.querySelector("#child-editor-reset")?.addEventListener("click", reset);
  window.addEventListener("pageshow", () => { restore(); history.length = 0; lastProfile = null; sync({ save: false }); });
  sync({ save: false });
})();
