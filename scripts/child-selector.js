(() => {
  const storageKey = "monstersnow_child_character_profile_v1";
  const ageLabels = { "3-5": "Ages 3–5", "6-8": "Ages 6–8" };
  const ageDescriptions = {
    "3-5": "younger-child proportions",
    "6-8": "older-child proportions",
  };
  const legacyAgeBands = new Set(["2-4", "5-6", "7-8"]);
  const mobilityLabels = { none: "", wheelchair: "Wheelchair shown in every scene" };
  const genderLabels = { boy: "Boy", girl: "Girl" };
  const wheelchairSupport = {
    appearanceIds: ["warm-curly-dark", "deep-braids-black"],
    ageBands: ["6-8"],
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
  const characterArt = {
    "warm-curly-dark": "assets/child-characters/warm-curly-dark-v1.webp",
    "deep-coils-black": "assets/child-characters/deep-coils-black-v1.webp",
    "medium-wavy-brown": "assets/child-characters/medium-wavy-brown-v1.webp",
    "golden-straight-black": "assets/child-characters/golden-straight-black-v1.webp",
    "light-short-brown": "assets/child-characters/light-short-brown-v1.webp",
    "light-wavy-blonde": "assets/child-characters/light-wavy-blonde-v1.webp",
    "medium-curly-auburn": "assets/child-characters/medium-curly-auburn-v1.webp",
    "deep-braids-black": "assets/child-characters/deep-braids-black-v1.webp",
  };
  const wheelchairCharacterArt = {
    "warm-curly-dark": "assets/child-characters/warm-curly-dark-wheelchair-v1.webp",
    "deep-braids-black": "assets/child-characters/deep-braids-black-wheelchair-v1.webp",
  };
  const root = document.querySelector("[data-child-selector]");
  const defaultProfile = { id: "none", ageBand: "6-8", relativeHeight: "standard", mobilityAid: "none" };
  const history = [];
  let lastProfile = null;
  let legacyAgeRequiresReselection = false;

  function selected(name, fallback = "") {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
  }

  function selectedAppearance() {
    return document.querySelector('input[name="child-character"]:checked');
  }

  function genderForAppearance(input) {
    return input?.dataset.gender || input?.closest("[data-gender]")?.dataset.gender || "";
  }

  function syncAppearanceBuilder(profile) {
    const lookPicker = document.querySelector("#child-look-picker");
    const monsterOnly = document.querySelector(".child-monster-only-option");
    const selectedInput = selectedAppearance();
    const gender = profile?.included ? genderForAppearance(selectedInput) : "";
    const genderInput = [...document.querySelectorAll('input[name="child-gender"]')]
      .find((input) => input.value === gender);
    for (const input of document.querySelectorAll('input[name="child-gender"]')) {
      input.checked = input === genderInput;
      input.closest("label")?.classList.toggle("is-selected", input.checked);
    }
    for (const option of document.querySelectorAll(".child-character-option[data-gender]")) {
      option.hidden = !gender || option.dataset.gender !== gender;
    }
    if (lookPicker) lookPicker.hidden = !gender;
    monsterOnly?.classList.toggle("is-selected", !profile?.included);
  }

  function chooseFirstAppearanceForGender(gender) {
    const current = selectedAppearance();
    const currentGender = genderForAppearance(current);
    if (current?.value !== "none" && currentGender === gender) return;
    const firstMatch = document.querySelector(`.child-character-option[data-gender="${gender}"] input[name="child-character"]`);
    if (firstMatch) firstMatch.checked = true;
  }

  function getProfile() {
    const input = selectedAppearance();
    const id = input?.value || "none";
    if (id === "none") {
      return {
        id: "none",
        label: "Monster only",
        included: false,
        gender: "",
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
      gender: genderForAppearance(input),
      skinTone: input.dataset.skinTone || "",
      hairColor: input.dataset.hairColor || "",
      hairStyle: input.dataset.hairStyle || "",
      ageBand: legacyAgeRequiresReselection ? "" : selected("child-age-band", "6-8"),
      relativeHeight: "standard",
      mobilityAid: selected("child-mobility-aid", "none"),
      profileVersion: "launch-v2",
      requiresAgeBandReselection: legacyAgeRequiresReselection,
    };
  }

  function supportsWheelchair(profile) {
    return Boolean(profile?.included
      && wheelchairSupport.appearanceIds.includes(profile.id)
      && wheelchairSupport.ageBands.includes(profile.ageBand));
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
    const label = wheelchair.closest("label");
    label?.classList.toggle("is-unavailable", wheelchair.disabled);
    label?.setAttribute("aria-disabled", wheelchair.disabled ? "true" : "false");
    const copy = document.querySelector("#child-wheelchair-option-copy");
    if (copy) copy.textContent = wheelchair.disabled
      ? "Choose Dark curls or Long braids and Ages 6–8."
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
    const characterImage = stage.querySelector(".child-preview-character");
    const ageProfile = stage.querySelector("#child-age-profile");
    const fallbackFigure = stage.querySelector(".child-preview-figure");
    stage.className = "child-preview-stage";
    avatar.className = "child-avatar";
    avatar.removeAttribute("style");
    avatar.textContent = "";
    if (!profile?.included) {
      stage.classList.add("is-empty");
      avatar.classList.add("child-avatar-none");
      avatar.textContent = "✦";
      if (characterImage) {
        characterImage.hidden = true;
        characterImage.removeAttribute("src");
      }
      if (ageProfile) ageProfile.hidden = true;
      if (fallbackFigure) fallbackFigure.hidden = false;
      return;
    }
    const artSource = profile.mobilityAid === "wheelchair"
      ? wheelchairCharacterArt[profile.id]
      : characterArt[profile.id];
    stage.classList.add(`age-${profile.ageBand || "6-8"}`, "height-standard");
    stage.classList.add(`mobility-${profile.mobilityAid || "none"}`);
    if (characterImage && artSource) {
      characterImage.src = artSource;
      characterImage.hidden = false;
      characterImage.classList.remove("is-arriving");
      window.requestAnimationFrame(() => characterImage.classList.add("is-arriving"));
      if (ageProfile) {
        ageProfile.hidden = false;
        const label = ageProfile.querySelector("strong");
        if (label) label.textContent = ageLabels[profile.ageBand] || ageLabels["6-8"];
      }
      if (fallbackFigure) fallbackFigure.hidden = true;
      stage.classList.add("has-character-art");
      return;
    }
    const values = previewValues(profile);
    if (values.avatarClass) avatar.classList.add(values.avatarClass);
    avatar.style.setProperty("--skin", values.skin);
    avatar.style.setProperty("--hair", values.hair);
    if (characterImage) characterImage.hidden = true;
    if (ageProfile) ageProfile.hidden = true;
    if (fallbackFigure) fallbackFigure.hidden = false;
  }

  function persist(profile) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        id: profile.id,
        ageBand: profile.ageBand,
        relativeHeight: "standard",
        profileVersion: "launch-v2",
        mobilityAid: profile.mobilityAid,
      }));
    } catch (error) {
      console.warn("Child character choices could not be saved locally.", error);
    }
  }

  function compactProfile(profile) {
    return {
      id: profile?.id || "none",
      ageBand: profile?.ageBand || "6-8",
      relativeHeight: "standard",
      mobilityAid: profile?.mobilityAid || "none",
    };
  }

  function profileKey(profile) {
    const value = compactProfile(profile);
    return [value.id, value.ageBand, value.mobilityAid].join(":");
  }

  function applyProfile(profile) {
    const value = compactProfile(profile);
    const controls = {
      "child-character": value.id,
      "child-age-band": value.ageBand,
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
    if (appearance) appearance.checked = true;
    legacyAgeRequiresReselection = legacyAgeBands.has(saved.ageBand);
    if (legacyAgeRequiresReselection) {
      for (const input of document.querySelectorAll('input[name="child-age-band"]')) input.checked = false;
    } else if (age) age.checked = true;
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
    const ageReselection = document.querySelector("#child-age-reselection");
    const stage = document.querySelector("#child-preview-stage");
    const avatar = document.querySelector("#child-preview-avatar");
    for (const input of document.querySelectorAll('input[name="child-character"]')) {
      input.closest("label")?.classList.toggle("is-selected", input.checked);
    }
    syncAppearanceBuilder(profile);
    if (details) details.hidden = !profile.included;
    if (selection) selection.textContent = profile.included ? `${genderLabels[profile.gender] || "Character"} · ${profile.label}` : "Monster-only story";
    if (title) title.textContent = profile.included ? `${genderLabels[profile.gender] || "Their character"} joins the adventure` : "Their monster takes center stage";
    if (copy) {
      copy.textContent = profile.included
        ? profile.requiresAgeBandReselection
          ? `${profile.label}. Choose a current age band to continue; the older saved range was preserved and not remapped.`
          : `${[profile.label, `${ageLabels[profile.ageBand]} with ${ageDescriptions[profile.ageBand]}`, mobilityLabels[profile.mobilityAid]].filter(Boolean).join(" · ")}. Previewed beside their chosen monster.`
        : "Choose a boy or girl to add a storybook co-star beside their monster.";
    }
    if (ageReselection) ageReselection.hidden = !profile.requiresAgeBandReselection;
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
  root.addEventListener("change", (event) => {
    if (event.target?.name === "child-gender") chooseFirstAppearanceForGender(event.target.value);
    if (event.target?.name === "child-age-band") legacyAgeRequiresReselection = false;
    sync({ recordHistory: true });
  });
  document.querySelector("#child-editor-undo")?.addEventListener("click", undo);
  document.querySelector("#child-editor-reset")?.addEventListener("click", reset);
  window.addEventListener("pageshow", () => { restore(); history.length = 0; lastProfile = null; sync({ save: false }); });
  sync({ save: false });
})();
