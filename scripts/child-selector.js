(() => {
  const storageKey = "monstersnow_child_character_profile_v3";
  const ageLabels = { "2-4": "Ages 2–4", "5-6": "Ages 5–6", "7-8": "Ages 7–8" };
  const heightLabels = { shorter: "Shorter", average: "About average", taller: "Taller" };
  const optionLabels = {
    presentation: { boy: "Boy", girl: "Girl" },
    skinTone: { light: "Light", golden: "Golden", medium: "Medium", warm: "Warm brown", deep: "Deep" },
    hairStyle: { short: "Short", curly: "Curls", coils: "Coils", wavy: "Waves", straight: "Straight", braids: "Braids" },
    hairColor: { black: "Black", "dark-brown": "Dark brown", brown: "Brown", auburn: "Auburn", blonde: "Blonde" },
    eyeColor: { brown: "Brown", hazel: "Hazel", green: "Green", blue: "Blue", gray: "Gray" },
    outfitStyle: { overalls: "Overalls", hoodie: "Hoodie", tee: "T-shirt", dress: "Dress" },
    outfitColor: { teal: "Teal", orange: "Orange", purple: "Purple", blue: "Blue", rose: "Rose", green: "Green" },
  };
  const palettes = {
    skinTone: {
      light: ["#f3cdb5", "#dca98a", "#ed9e95"], golden: ["#dda06f", "#bd7950", "#cf746f"],
      medium: ["#b9724f", "#945137", "#b85f61"], warm: ["#8a4d35", "#683426", "#9d4f56"], deep: ["#593225", "#3d211a", "#7e3d4a"],
    },
    hairColor: {
      black: ["#18151a", "#393039"], "dark-brown": ["#38231d", "#684438"], brown: ["#6b4028", "#a06b42"],
      auburn: ["#963f28", "#d26a3e"], blonde: ["#d8a83f", "#f2cf69"],
    },
    eyeColor: { brown: "#6d3e27", hazel: "#9a7a32", green: "#43856d", blue: "#4989be", gray: "#7e8b98" },
    outfitColor: {
      teal: ["#168b91", "#49b8b3", "#0c6068"], orange: ["#e97832", "#f6a654", "#b94b1f"],
      purple: ["#7950b8", "#a77bd9", "#563185"], blue: ["#367cc2", "#67a4dd", "#23578e"],
      rose: ["#c85273", "#e7829d", "#923650"], green: ["#4b8b55", "#79b56f", "#32673b"],
    },
  };
  const wheelchairSupport = { appearanceIds: ["custom"], ageBands: ["5-6", "7-8"], relativeHeights: ["average", "taller"] };
  const defaultProfile = {
    id: "custom", ageBand: "5-6", relativeHeight: "average", mobilityAid: "none",
    presentation: "girl",
    skinTone: "medium", hairStyle: "curly", hairColor: "dark-brown", eyeColor: "brown",
    outfitStyle: "overalls", outfitColor: "teal",
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

  const customCharacterSvg = `
    <svg class="custom-child-svg" viewBox="0 0 360 560" role="img" aria-label="Editable illustrated child character">
      <defs>
        <filter id="child-soft-shadow" x="-35%" y="-35%" width="170%" height="190%"><feDropShadow dx="0" dy="12" stdDeviation="11" flood-color="#24102f" flood-opacity=".3"/></filter>
        <filter id="child-eye-glow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#2d1738" flood-opacity=".22"/></filter>
        <linearGradient id="child-skin-gradient" x1=".12" y1=".02" x2=".9" y2=".96"><stop offset="0" stop-color="var(--skin)"/><stop offset=".48" stop-color="var(--skin)"/><stop offset="1" stop-color="var(--skin-shadow)"/></linearGradient>
        <radialGradient id="child-face-light" cx="38%" cy="25%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".52" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="var(--skin-shadow)" stop-opacity=".2"/></radialGradient>
        <linearGradient id="child-hair-gradient" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" stop-color="var(--hair-light)"/><stop offset=".5" stop-color="var(--hair)"/><stop offset="1" stop-color="var(--hair)"/></linearGradient>
        <linearGradient id="child-outfit-gradient" x1=".12" y1="0" x2=".88" y2="1"><stop offset="0" stop-color="var(--outfit-light)"/><stop offset=".5" stop-color="var(--outfit)"/><stop offset="1" stop-color="var(--outfit-dark)"/></linearGradient>
        <radialGradient id="child-iris-gradient" cx="35%" cy="28%" r="72%"><stop offset="0" stop-color="#fff" stop-opacity=".65"/><stop offset=".22" stop-color="var(--eye)"/><stop offset=".82" stop-color="var(--eye)"/><stop offset="1" stop-color="#161018"/></radialGradient>
      </defs>
      <ellipse class="character-ground" cx="184" cy="526" rx="105" ry="18" fill="#392354" opacity=".12"/>
      <g class="wheelchair-art"><circle cx="235" cy="424" r="76" fill="#f7fbfb" stroke="#31546b" stroke-width="15"/><circle cx="235" cy="424" r="51" fill="none" stroke="#9db3be" stroke-width="4"/><path d="M187 330h73l-17 81h-83zM251 409l43 69" fill="none" stroke="#31546b" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><circle cx="300" cy="483" r="17" fill="#f7fbfb" stroke="#31546b" stroke-width="8"/></g>
      <g class="custom-child-figure" filter="url(#child-soft-shadow)">
        <g class="character-legs"><path d="M132 394l47 1-6 108h-43zM184 395l47-1 14 109h-43z" fill="var(--outfit-dark)"/><path d="M119 494h61v27c-18 8-43 8-65 0zM195 494h61v27c-18 8-43 8-65 0z" fill="#f4f0e9" stroke="#d7d0c9" stroke-width="4"/></g>
        <g class="character-arms"><path d="M125 291c-27 19-40 58-39 101 0 18 28 19 30 1 1-31 11-56 30-70zM232 290c29 18 45 52 49 91 2 18-25 23-30 5-5-28-16-50-38-62z" fill="url(#child-skin-gradient)"/><circle cx="99" cy="397" r="17" fill="url(#child-skin-gradient)"/><circle cx="266" cy="390" r="17" fill="url(#child-skin-gradient)"/></g>
        <path class="character-neck" d="M157 246h52v66h-52z" fill="var(--skin-shadow)"/>
        <g class="outfit outfit-tee"><path d="M126 285c17-14 42-22 58-22s42 8 58 22l-14 110h-87z" fill="url(#child-outfit-gradient)"/><path d="M127 286l-19 44 29 12 15-45zM240 286l22 40-27 15-18-44z" fill="var(--outfit-light)"/><path d="M164 271c5 12 35 12 40 0" fill="none" stroke="var(--outfit-dark)" stroke-width="7" stroke-linecap="round"/></g>
        <g class="outfit outfit-overalls"><path d="M128 285c17-14 39-21 56-21 18 0 41 7 57 21l-12 111h-89z" fill="var(--outfit-light)"/><path d="M143 301h82l8 106h-96z" fill="url(#child-outfit-gradient)"/><path d="M151 272l19 66M217 272l-18 66" fill="none" stroke="var(--outfit-dark)" stroke-width="10" stroke-linecap="round"/><path d="M164 324h41v39h-41z" fill="var(--outfit-light)" stroke="var(--outfit-dark)" stroke-width="4"/><circle cx="169" cy="335" r="5" fill="#ffd86a"/><circle cx="201" cy="335" r="5" fill="#ffd86a"/></g>
        <g class="outfit outfit-hoodie"><path d="M124 295c12-21 35-32 60-32 26 0 48 11 61 32l-12 113h-97z" fill="url(#child-outfit-gradient)"/><path d="M151 281c3 24 63 24 66 0M181 303v56" fill="none" stroke="var(--outfit-dark)" stroke-width="6" stroke-linecap="round"/><path d="M153 364c19 12 45 12 64 0" fill="none" stroke="var(--outfit-light)" stroke-width="12" stroke-linecap="round"/></g>
        <g class="outfit outfit-dress"><path d="M151 272h66l10 82 40 81H103l38-81z" fill="url(#child-outfit-gradient)"/><path d="M160 274c6 14 42 14 48 0M133 399c34 13 70 13 103 0" fill="none" stroke="var(--outfit-light)" stroke-width="7" stroke-linecap="round"/><circle cx="184" cy="337" r="9" fill="var(--outfit-light)"/></g>
        <g class="character-head">
          <ellipse cx="109" cy="188" rx="23" ry="30" fill="url(#child-skin-gradient)"/><ellipse cx="257" cy="188" rx="23" ry="30" fill="url(#child-skin-gradient)"/>
          <ellipse cx="183" cy="176" rx="78" ry="91" fill="url(#child-skin-gradient)"/>
          <ellipse cx="183" cy="176" rx="76" ry="89" fill="url(#child-face-light)"/>
          <path d="M130 130c17-31 43-44 72-40" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".13"/>
          <g filter="url(#child-eye-glow)">
            <path d="M132 177c3-23 14-34 31-34 18 0 29 13 30 35-3 19-14 29-31 29-17 0-28-11-30-30z" fill="#fffdf9"/>
            <path d="M194 178c2-23 13-35 30-35 18 0 29 13 31 34-2 19-13 30-31 30-17 0-28-10-30-29z" fill="#fffdf9"/>
            <ellipse cx="164" cy="178" rx="13" ry="16" fill="url(#child-iris-gradient)"/><ellipse cx="223" cy="178" rx="13" ry="16" fill="url(#child-iris-gradient)"/>
            <ellipse cx="164" cy="180" rx="6" ry="8" fill="#17131a"/><ellipse cx="223" cy="180" rx="6" ry="8" fill="#17131a"/>
            <circle cx="159" cy="171" r="4" fill="#fff"/><circle cx="218" cy="171" r="4" fill="#fff"/><circle cx="168" cy="184" r="2" fill="#fff" opacity=".72"/><circle cx="227" cy="184" r="2" fill="#fff" opacity=".72"/>
          </g>
          <path d="M135 158c8-10 21-15 35-11M204 147c14-4 27 1 35 11" fill="none" stroke="var(--hair)" stroke-width="7" stroke-linecap="round"/>
          <g class="presentation-detail presentation-girl" fill="none" stroke="var(--hair)" stroke-width="3" stroke-linecap="round"><path d="M135 171l-7-4M137 164l-6-7M250 171l7-4M248 164l6-7"/></g>
          <g class="presentation-detail presentation-boy" fill="var(--skin-shadow)" opacity=".48"><circle cx="143" cy="209" r="1.8"/><circle cx="150" cy="212" r="1.5"/><circle cx="225" cy="212" r="1.5"/><circle cx="232" cy="209" r="1.8"/></g>
          <path d="M183 179c-3 13-6 24 3 29 5 2 10 0 13-3" fill="none" stroke="var(--skin-shadow)" stroke-width="4" stroke-linecap="round" opacity=".72"/>
          <path d="M175 204c7 3 14 3 20 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".34"/>
          <ellipse cx="136" cy="214" rx="17" ry="8" fill="var(--blush)" opacity=".43"/><ellipse cx="232" cy="214" rx="17" ry="8" fill="var(--blush)" opacity=".43"/>
          <path d="M153 224c17 22 45 22 62 0-10 6-20 9-31 9s-21-3-31-9z" fill="#fbf7f4" stroke="#8f3d4b" stroke-width="4" stroke-linejoin="round"/>
          <path d="M162 226c15 7 30 7 44 0" fill="none" stroke="#d8848c" stroke-width="3" stroke-linecap="round" opacity=".72"/>
        </g>
        <g class="hair hair-short"><path d="M111 164c-9-58 22-98 73-98 50 0 80 38 70 94-13-26-31-39-55-49-16 26-48 39-88 53z" fill="url(#child-hair-gradient)"/><path d="M126 116c31-32 73-41 108-14" fill="none" stroke="var(--hair-light)" stroke-width="12" stroke-linecap="round" opacity=".65"/></g>
        <g class="hair hair-curly" fill="url(#child-hair-gradient)"><circle cx="121" cy="117" r="31"/><circle cx="150" cy="89" r="34"/><circle cx="188" cy="78" r="35"/><circle cx="226" cy="91" r="34"/><circle cx="251" cy="121" r="31"/><circle cx="111" cy="151" r="26"/><circle cx="258" cy="153" r="26"/><path d="M113 157c15-31 39-48 72-48s57 16 72 48c-22-7-40-22-56-42-18 25-48 39-88 42z"/></g>
        <g class="hair hair-coils" fill="url(#child-hair-gradient)"><circle cx="112" cy="116" r="25"/><circle cx="132" cy="91" r="26"/><circle cx="160" cy="76" r="27"/><circle cx="190" cy="72" r="28"/><circle cx="220" cy="80" r="27"/><circle cx="245" cy="99" r="26"/><circle cx="258" cy="128" r="25"/><circle cx="106" cy="146" r="23"/><circle cx="263" cy="155" r="23"/><circle cx="136" cy="126" r="25"/><circle cx="172" cy="111" r="26"/><circle cx="210" cy="113" r="26"/><circle cx="241" cy="134" r="24"/></g>
        <g class="hair hair-wavy"><path d="M102 175c-5-73 30-111 84-111 55 0 88 42 80 116l-22 72-15-81c-3-22-15-40-32-55-19 25-48 42-85 47l-8 89z" fill="url(#child-hair-gradient)"/><path d="M119 122c22-31 50-45 83-40 30 4 48 22 57 52" fill="none" stroke="var(--hair-light)" stroke-width="13" stroke-linecap="round" opacity=".65"/></g>
        <g class="hair hair-straight"><path d="M105 170c-4-69 25-106 80-106 55 0 84 38 80 106l-10 111-28-39 4-92c-13-9-27-22-39-39-18 24-45 39-81 45l4 88-27 37z" fill="url(#child-hair-gradient)"/><path d="M122 118c30-28 69-39 109-22" fill="none" stroke="var(--hair-light)" stroke-width="11" stroke-linecap="round" opacity=".6"/></g>
        <g class="hair hair-braids"><path d="M109 157c-6-63 25-94 77-94 51 0 82 33 75 96-19-18-37-32-61-45-16 25-48 39-91 43z" fill="url(#child-hair-gradient)"/><path d="M111 146c-10 48-8 91 7 125M258 146c10 48 8 91-7 125" fill="none" stroke="var(--hair)" stroke-width="19" stroke-linecap="round" stroke-dasharray="14 7"/><circle cx="119" cy="277" r="9" fill="var(--outfit-light)"/><circle cx="250" cy="277" r="9" fill="var(--outfit-light)"/></g>
      </g>
    </svg>`;

  function selected(name, fallback = "") { return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback; }

  function getProfile() {
    const id = selected("child-character", "custom");
    if (id === "none") return { id: "none", label: "Monster only", included: false, presentation: "", skinTone: "", hairColor: "", hairStyle: "", eyeColor: "", outfitStyle: "", outfitColor: "", ageBand: "", relativeHeight: "", mobilityAid: "" };
    return {
      id: "custom", label: "Custom illustrated child", included: true,
      presentation: selected("child-presentation", defaultProfile.presentation),
      skinTone: selected("child-skin-tone", defaultProfile.skinTone), hairStyle: selected("child-hair-style", defaultProfile.hairStyle),
      hairColor: selected("child-hair-color", defaultProfile.hairColor), eyeColor: selected("child-eye-color", defaultProfile.eyeColor),
      outfitStyle: selected("child-outfit-style", defaultProfile.outfitStyle), outfitColor: selected("child-outfit-color", defaultProfile.outfitColor),
      ageBand: selected("child-age-band", defaultProfile.ageBand), relativeHeight: selected("child-relative-height", defaultProfile.relativeHeight),
      mobilityAid: selected("child-mobility-aid", defaultProfile.mobilityAid),
    };
  }

  function supportsWheelchair(profile) { return Boolean(profile?.included && profile.id === "custom" && wheelchairSupport.ageBands.includes(profile.ageBand) && wheelchairSupport.relativeHeights.includes(profile.relativeHeight)); }

  function refreshWheelchairControls() {
    const wheelchair = document.querySelector('input[name="child-mobility-aid"][value="wheelchair"]');
    const none = document.querySelector('input[name="child-mobility-aid"][value="none"]');
    if (!wheelchair || !none) return;
    let profile = getProfile();
    if (!supportsWheelchair(profile) && wheelchair.checked) { none.checked = true; profile = getProfile(); }
    wheelchair.disabled = !supportsWheelchair(profile);
    const wheelchairSelected = wheelchair.checked;
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
    if (copy) copy.textContent = wheelchair.disabled ? "Choose ages 5–8 and average or taller." : "Available with the current age and height.";
  }

  function ensureCharacterArt(stage) {
    let container = stage?.querySelector(".child-preview-character");
    if (!container && stage) { container = document.createElement("span"); container.className = "child-preview-character"; stage.append(container); }
    if (container && !container.querySelector(".custom-child-svg")) container.innerHTML = customCharacterSvg;
    return container;
  }

  function renderProfile(stage, avatar, profile) {
    if (!stage) return;
    const figure = stage.querySelector(".child-preview-figure");
    const premiumDefault = stage.querySelector(".child-premium-default");
    const character = ensureCharacterArt(stage);
    stage.className = "child-preview-stage";
    if (!profile?.included) {
      stage.classList.add("is-empty");
      if (character) character.hidden = true;
      if (premiumDefault) premiumDefault.hidden = true;
      if (figure) figure.hidden = false;
      return;
    }
    const skin = palettes.skinTone[profile.skinTone] || palettes.skinTone.medium;
    const hair = palettes.hairColor[profile.hairColor] || palettes.hairColor["dark-brown"];
    const outfit = palettes.outfitColor[profile.outfitColor] || palettes.outfitColor.teal;
    const art = character?.querySelector(".custom-child-svg");
    if (art) {
      art.dataset.presentation = profile.presentation || defaultProfile.presentation;
      art.dataset.hairStyle = profile.hairStyle;
      art.dataset.outfitStyle = profile.outfitStyle;
      art.dataset.mobility = profile.mobilityAid || "none";
      art.style.setProperty("--skin", skin[0]); art.style.setProperty("--skin-shadow", skin[1]); art.style.setProperty("--blush", skin[2]);
      art.style.setProperty("--hair", hair[0]); art.style.setProperty("--hair-light", hair[1]);
      art.style.setProperty("--eye", palettes.eyeColor[profile.eyeColor] || palettes.eyeColor.brown);
      art.style.setProperty("--outfit", outfit[0]); art.style.setProperty("--outfit-light", outfit[1]); art.style.setProperty("--outfit-dark", outfit[2]);
    }
    stage.classList.add(`age-${profile.ageBand || "5-6"}`, `height-${profile.relativeHeight || "average"}`, `mobility-${profile.mobilityAid || "none"}`, "has-character-art", "has-premium-art");
    if (premiumDefault) {
      premiumDefault.src = profile.presentation === "boy"
        ? "assets/child-editor/default-boy-feature-animation-v1.webp"
        : "assets/child-editor/default-girl-feature-animation-v1.webp";
      premiumDefault.hidden = false;
    }
    if (character) character.hidden = true;
    if (figure) figure.hidden = true;
  }

  function compactProfile(profile) {
    if (!profile?.included) return { id: "none" };
    return {
      id: "custom", presentation: profile.presentation || defaultProfile.presentation, skinTone: profile.skinTone || defaultProfile.skinTone, hairStyle: profile.hairStyle || defaultProfile.hairStyle,
      hairColor: profile.hairColor || defaultProfile.hairColor, eyeColor: profile.eyeColor || defaultProfile.eyeColor,
      outfitStyle: profile.outfitStyle || defaultProfile.outfitStyle, outfitColor: profile.outfitColor || defaultProfile.outfitColor,
      ageBand: profile.ageBand || defaultProfile.ageBand, relativeHeight: profile.relativeHeight || defaultProfile.relativeHeight,
      mobilityAid: profile.mobilityAid || defaultProfile.mobilityAid,
    };
  }
  function profileKey(profile) { return JSON.stringify(compactProfile(profile)); }
  function migrateProfile(profile) {
    if (!profile || typeof profile !== "object") return defaultProfile;
    if (profile.id === "none") return { id: "none" };
    if (profile.id === "custom") return { ...defaultProfile, ...profile, id: "custom" };
    const legacy = legacyProfiles[profile.id];
    if (!legacy) return defaultProfile;
    return { ...defaultProfile, ...profile, id: "custom", presentation: profile.presentation || defaultProfile.presentation, skinTone: legacy[0], hairStyle: legacy[1], hairColor: legacy[2], eyeColor: "brown", outfitStyle: "overalls", outfitColor: "teal" };
  }

  function applyProfile(profile) {
    const value = migrateProfile(profile);
    const fields = {
      "child-character": value.id, "child-presentation": value.presentation, "child-skin-tone": value.skinTone, "child-hair-style": value.hairStyle,
      "child-hair-color": value.hairColor, "child-eye-color": value.eyeColor, "child-outfit-style": value.outfitStyle,
      "child-outfit-color": value.outfitColor, "child-age-band": value.ageBand,
      "child-relative-height": value.relativeHeight, "child-mobility-aid": value.mobilityAid,
    };
    for (const [name, selectedValue] of Object.entries(fields)) {
      if (!selectedValue) continue;
      const input = [...document.querySelectorAll(`input[name="${name}"]`)].find((option) => option.value === selectedValue && !option.disabled);
      if (input) input.checked = true;
    }
    refreshWheelchairControls();
  }

  function persist(profile) { try { localStorage.setItem(storageKey, JSON.stringify(compactProfile(profile))); } catch (error) { console.warn("Child character choices could not be saved locally.", error); } }
  function restore() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem("monstersnow_child_character_profile_v2") || localStorage.getItem("monstersnow_child_character_profile_v1") || "null"); } catch { return; }
    if (saved) applyProfile(saved);
  }
  function updateHistoryControls(message = "") {
    const undo = document.querySelector("#child-editor-undo");
    const status = document.querySelector("#child-editor-action-status");
    if (undo) undo.disabled = history.length === 0;
    if (status) status.textContent = message;
  }

  function sync({ save = true, recordHistory = false, message = "" } = {}) {
    if (!root) return getProfile();
    refreshWheelchairControls();
    const profile = getProfile();
    if (recordHistory && lastProfile && profileKey(lastProfile) !== profileKey(profile)) { history.push(compactProfile(lastProfile)); if (history.length > 30) history.shift(); }
    const details = document.querySelector("#child-character-details");
    const selection = document.querySelector("#child-character-selection");
    const title = document.querySelector("#child-preview-title");
    const copy = document.querySelector("#child-preview-details");
    for (const input of root.querySelectorAll('input[type="radio"]')) input.closest("label")?.classList.toggle("is-selected", input.checked);
    if (details) details.hidden = !profile.included;
    if (selection) selection.textContent = profile.included ? "Character in progress" : "Monster-only story";
    if (title) title.textContent = profile.included ? "Their storybook character is taking shape." : "Their monster takes center stage.";
    if (copy) copy.textContent = profile.included
      ? `${optionLabels.presentation[profile.presentation]} · ${optionLabels.skinTone[profile.skinTone]} skin · ${optionLabels.hairColor[profile.hairColor]} ${optionLabels.hairStyle[profile.hairStyle].toLowerCase()} · ${optionLabels.eyeColor[profile.eyeColor]} eyes · ${optionLabels.outfitColor[profile.outfitColor]} ${optionLabels.outfitStyle[profile.outfitStyle].toLowerCase()}. ${ageLabels[profile.ageBand]} · ${heightLabels[profile.relativeHeight]}.`
      : "The child character is turned off. Their monster remains on the drawing board.";
    renderProfile(document.querySelector("#child-preview-stage"), document.querySelector("#child-preview-avatar"), profile);
    if (save) persist(profile);
    lastProfile = compactProfile(profile);
    updateHistoryControls(message);
    root.dispatchEvent(new CustomEvent("childprofilechange", { detail: profile }));
    return profile;
  }

  function undo() { const previous = history.pop(); if (!previous) return getProfile(); applyProfile(previous); return sync({ message: "Last character change undone." }); }
  function reset() {
    const current = getProfile();
    if (profileKey(current) === profileKey(defaultProfile)) return current;
    history.push(compactProfile(current)); applyProfile(defaultProfile); return sync({ message: "Character reset to the starting design." });
  }

  function selectEditorTab(tabId) {
    for (const button of document.querySelectorAll("[data-editor-tab]")) {
      const active = button.dataset.editorTab === tabId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    }
    for (const panel of document.querySelectorAll("[data-editor-panel]")) {
      const active = panel.dataset.editorPanel === tabId;
      panel.classList.toggle("is-active", active);
      if (active) panel.open = true;
    }
  }

  window.MonstersNowChildSelector = { getProfile, renderProfile, restore, sync, undo, reset, supportsWheelchair, storageKey, wheelchairSupport };
  if (!root) return;
  restore();
  root.addEventListener("change", () => sync({ recordHistory: true }));
  for (const button of document.querySelectorAll("[data-editor-tab]")) {
    button.addEventListener("click", () => selectEditorTab(button.dataset.editorTab));
  }
  document.querySelector("#child-editor-undo")?.addEventListener("click", undo);
  document.querySelector("#child-editor-reset")?.addEventListener("click", reset);
  window.addEventListener("pageshow", () => { restore(); history.length = 0; lastProfile = null; sync({ save: false }); });
  sync({ save: false });
})();
