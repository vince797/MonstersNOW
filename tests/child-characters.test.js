const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const catalog = require("../lib/child-characters");
const picker = require("../scripts/child-character-picker");
const root = path.resolve(__dirname, "..");
const ids = ["none", "warm-curly-dark", "deep-coils-black", "medium-wavy-brown", "golden-straight-black", "light-short-brown", "light-wavy-blonde", "medium-curly-auburn", "deep-braids-black"];

test("the nine stable character choices have one browser/server catalog", () => {
  const browser = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, "lib/child-characters.js"), "utf8"), browser);
  assert.deepEqual(catalog.childCharacterIds(), ids);
  assert.deepEqual(JSON.parse(JSON.stringify(browser.MonstersNOWCharacters.CHILD_CHARACTERS)), catalog.CHILD_CHARACTERS);
  assert.ok(Object.isFrozen(catalog.CHILD_CHARACTERS));
});

test("resolver allows only canonical IDs and ignores spoofed metadata", () => {
  for (const value of [undefined, null, {}, "missing", "__proto__", "constructor", { id: { toString: () => "warm-curly-dark" } }]) {
    assert.equal(catalog.resolveChildCharacter(value).id, "none");
  }
  const canonical = catalog.resolveChildCharacter({ id: ids[1], label: "Injected", included: false, asset: { src: "https://example.invalid/photo", status: "final" } });
  assert.equal(canonical.label, "Curly dark");
  assert.equal(canonical.included, true);
  assert.equal(canonical.asset.status, "candidate");
  assert.ok(Object.isFrozen(canonical.asset));
  canonical.label = "Changed";
  assert.equal(catalog.resolveChildCharacter(ids[1]).label, "Curly dark");
});

test("all eight choices have local transparent full-body candidates and honest pose availability", () => {
  assert.equal(catalog.resolveChildCharacter("none").asset, null);
  for (const id of ids.slice(1)) {
    const preset = catalog.resolveChildCharacter(id), { asset } = preset;
    assert.equal(asset.status, "candidate");
    assert.equal(asset.version, "candidate-v1");
    assert.equal(asset.mimeType, "image/png");
    assert.equal(asset.transparent, true);
    assert.equal(asset.fullBody, true);
    assert.equal(asset.style, "soft-3d-storybook-candidate");
    assert.match(asset.label, /awaiting approval/);
    assert.equal(fs.readFileSync(path.join(root, asset.src)).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    if (id !== "warm-curly-dark") assert.deepEqual(preset.availablePoses, ["standing"]);
  }
  assert.match(catalog.resolveChildCharacter("deep-coils-black").asset.src, /standing-v2.png$/);
});

test("unknown or inherited pose keys fall back to a real canonical asset", () => {
  for (const id of ids.slice(1)) for (const pose of ["__proto__", "constructor", "toString", "invented"]) {
    assert.equal(catalog.resolveChildRenderAsset(id, pose), catalog.resolveChildCharacter(id).asset);
  }
});

test("selection remembers only canonical ID within provided tab storage", () => {
  const data = new Map();
  const writes = [];
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => { writes.push([key, value]); data.set(key, value); } };
  const store = picker.createSelectionStore(storage);
  assert.equal(store.get().id, "none");
  store.set({ id: "deep-braids-black", childName: "Do not store", photo: "Do not store" });
  assert.deepEqual(writes, [[picker.STORAGE_KEY, "deep-braids-black"]]);
  assert.equal(picker.createSelectionStore(storage).get().id, "deep-braids-black");
  assert.equal(picker.createSelectionStore().get().id, "none");
  store.set("none");
  assert.equal(picker.createSelectionStore(storage).get().id, "none");
});

test("invalid stored IDs and unavailable storage safely degrade", () => {
  for (const invalid of ["constructor", "__proto__", '{"id":"deep-braids-black"}', "", "<script>"]) {
    assert.equal(picker.createSelectionStore({ getItem: () => invalid }).get().id, "none");
  }
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } };
  const store = picker.createSelectionStore(blocked);
  assert.equal(store.set("light-wavy-blonde").id, "light-wavy-blonde");
  assert.equal(store.get().id, "light-wavy-blonde");
  assert.equal(store.set("invented").id, "none");
});

test("create flow exposes chooser before upload and loads canonical scripts first", () => {
  const html = fs.readFileSync(path.join(root, "create.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "scripts/main.js"), "utf8");
  assert.ok(html.indexOf('id="child-character-picker"') < html.indexOf('id="monster-upload"'));
  assert.ok(html.indexOf('src="lib/child-characters.js') < html.indexOf('src="scripts/child-character-picker.js'));
  assert.ok(html.indexOf('src="scripts/child-character-picker.js') < html.indexOf('src="scripts/main.js'));
  assert.match(html, /role="radiogroup" aria-labelledby="child-character-title"/);
  assert.match(html, /None is approved or print-ready artwork/);
  assert.doesNotMatch(html, /class="child-avatar/);
  assert.match(html, /name="storybook-format" value="softcover"/);
  assert.match(html, /name="storybook-format" value="hardcover"/);
  assert.match(main, /window\.MonstersNOWCharacters\?\.resolveChildCharacter/);
});

test("picker renders catalog assets once and keeps selection summaries in sync", () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.listeners = {}; this.attributes = {}; this.classes = new Set(); this.classList = { add: (name) => this.classes.add(name), toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name) }; }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    closest(tag) { return this.tag === tag ? this : this.parent?.closest(tag); }
  }
  const options = new Element("div");
  const summaries = [new Element("span"), new Element("strong")];
  const document = { querySelector: () => options, querySelectorAll: () => summaries, createElement: (tag) => new Element(tag) };
  const writes = [];
  const instance = picker.init(document, { getItem: () => "medium-curly-auburn", setItem: (...args) => writes.push(args) });
  assert.equal(options.children.length, 9);
  assert.equal(instance.inputs.filter((input) => input.checked).length, 1);
  assert.equal(instance.getSelected().id, "medium-curly-auburn");
  assert.ok(summaries.every((summary) => summary.textContent === "Curly auburn"));
  const artwork = options.children.slice(1).map((label) => label.children[1].children[0]);
  assert.ok(artwork.every((image) => image.tag === "img" && image.src.startsWith("/assets/characters/") && image.alt === ""));
  const choice = instance.inputs[2];
  choice.checked = true;
  choice.listeners.change();
  assert.equal(instance.getSelected().id, "deep-coils-black");
  assert.equal(instance.inputs.filter((input) => input.checked).length, 1);
  assert.ok(summaries.every((summary) => summary.textContent === "Coils"));
  assert.deepEqual(writes, [[picker.STORAGE_KEY, "deep-coils-black"]]);
  assert.equal(picker.init(document), null);
  assert.equal(options.children.length, 9);
});


test("the first soft-3D candidate has four pinned poses and remains unapproved", () => {
  const preset = catalog.resolveChildCharacter("warm-curly-dark");
  assert.equal(preset.asset.status, "candidate");
  for (const pose of ["porch", "garden", "garden-quiet", "seated-home"]) {
    const asset = catalog.resolveChildRenderAsset(preset, pose);
    assert.equal(asset.status, "candidate");
    assert.ok(asset.anchor.y > 0.9 && asset.anchor.y <= 1);
    assert.ok(fs.existsSync(path.join(root, asset.src)));
    assert.equal(fs.readFileSync(path.join(root, asset.src)).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  }
});
