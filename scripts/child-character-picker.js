/* The only persisted value is a catalog ID; no name, photo, or other child data. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../lib/child-characters"));
  else {
    root.MonstersNOWChildPicker = factory(root.MonstersNOWCharacters);
    let storage;
    try { storage = root.sessionStorage; } catch (_) { /* Private mode may block storage. */ }
    root.MonstersNOWChildPicker.init(root.document, storage);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (characters) {
  "use strict";
  const STORAGE_KEY = "monstersnow.child-character.v1";

  function createSelectionStore(storage) {
    let storedId;
    try { storedId = storage?.getItem(STORAGE_KEY); } catch (_) { /* Continue in memory. */ }
    let selection = characters.resolveChildCharacter(storedId);
    return {
      get: () => characters.resolveChildCharacter(selection.id),
      set(value) {
        selection = characters.resolveChildCharacter(value);
        try { storage?.setItem(STORAGE_KEY, selection.id); } catch (_) { /* Selection still works. */ }
        return characters.resolveChildCharacter(selection.id);
      },
    };
  }

  function init(document, storage) {
    const options = document?.querySelector("[data-child-character-options]");
    if (!options || !characters || options.dataset.initialized) return null;
    options.dataset.initialized = "true";
    const store = createSelectionStore(storage);
    const inputs = [];
    const summaries = [...document.querySelectorAll("[data-child-character-selection]")];

    function sync() {
      const selected = store.get();
      for (const input of inputs) {
        input.checked = input.value === selected.id;
        input.closest("label").classList.toggle("is-selected", input.checked);
      }
      for (const summary of summaries) summary.textContent = selected.label;
    }

    for (const id of characters.childCharacterIds()) {
      const character = characters.resolveChildCharacter(id);
      const label = document.createElement("label");
      label.className = "child-character-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "child-character";
      input.value = character.id;
      input.id = `child-character-${character.id}`;
      // Keep native radio keyboard behavior and make the whole card clickable.
      input.addEventListener("change", () => {
        if (input.checked) { store.set(input.value); sync(); }
      });
      label.append(input);
      const preview = document.createElement("span");
      preview.className = "child-character-art";
      preview.setAttribute("aria-hidden", "true");
      if (character.asset) {
        const image = document.createElement("img");
        image.src = character.asset.src;
        image.alt = "";
        image.width = 180;
        image.height = 240;
        image.decoding = "async";
        preview.append(image);
      } else {
        preview.classList.add("child-character-art-none");
        const symbol = document.createElement("span");
        symbol.textContent = "✦";
        preview.append(symbol);
      }
      const name = document.createElement("b");
      name.textContent = character.label;
      const detail = document.createElement("small");
      detail.textContent = character.included ? (character.asset.status === "candidate" ? (character.availablePoses.length === 1 ? "Standing candidate" : "4-pose candidate") : "Sample illustration") : "No child character";
      label.append(preview, name, detail);
      options.append(label);
      inputs.push(input);
    }
    sync();
    return { getSelected: store.get, inputs };
  }

  return Object.freeze({ STORAGE_KEY, createSelectionStore, init });
});
