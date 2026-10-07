const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const publicPages = [
  "index.html",
  "books.html",
  "create.html",
  "monsters.html",
  "about.html",
  "contact.html",
  "policies.html",
  "privacy.html",
  "terms.html",
];

test("the public catalog only routes the ready story into personalization", () => {
  const books = read("books.html");
  const readyLinks = [...books.matchAll(/href="create\.html\?story=([a-z0-9-]+)"/g)].map((match) => match[1]);

  assert.deepEqual([...new Set(readyLinks)], ["halloween-monster-night"]);
  assert.match(books, /Ready to personalize/);
  assert.equal((books.match(/<span class="story-status soon">In development<\/span>/g) || []).length, 6);
});

test("the homepage and catalog use the approved v4/v5 cover collection", () => {
  const home = read("index.html");
  const books = read("books.html");

  for (const cover of [
    "halloween-monster-night-v5",
    "big-adventure-v4",
    "bedtime-monster-v5",
    "abc-monster-book-v4",
  ]) {
    assert.match(home, new RegExp(`${cover}-web\\.jpg`));
    assert.match(home, new RegExp(`${cover}-640\\.webp`));
    assert.match(books, new RegExp(`${cover}-web\\.jpg`));
  }

  for (const cover of [
    "counting-with-my-monster-v4",
    "the-monster-who-lost-their-glow-v5",
    "birthday-monster-adventure-v4",
  ]) {
    assert.match(books, new RegExp(`${cover}-web\\.jpg`));
  }

  assert.doesNotMatch(`${home}\n${books}`, /(?:halloween-monster-night|big-adventure|bedtime-monster|abc-monster-book)-v2-/);
  assert.match(books, /styles\.css\?v=20261007-books-hero-v2/);
  assert.match(books, /class="book-hero-steps"/);
});

test("the create flow displays and forwards the allowlisted story", () => {
  const create = read("create.html");
  const script = read("scripts/main.js");

  assert.match(create, /id="selected-story" data-story-id="halloween-monster-night" role="group"/);
  assert.match(script, /const publicStoryCatalog = \{/);
  assert.match(script, /storyId: selectedStory\.id/);
  assert.match(script, /storyLabel: selectedStory\.label/);
  assert.match(script, /storyId: storyId \|\| selectedStory\.id/);
});

test("the create flow gives HEIC conversion and character generation prominent progress feedback", () => {
  const create = read("create.html");
  const script = read("scripts/main.js");
  const styles = read("monster-uploader.css");

  assert.match(create, /id="monster-progress" aria-live="polite" hidden/);
  assert.match(create, /data-progress-step="1"/);
  assert.match(create, /data-progress-step="3"/);
  assert.match(script, /primeHeicConverterOnIntent\(\)/);
  assert.match(script, /showMonsterProgress\(shouldConvertHeic \? "converting" : "preparing"\)/);
  assert.match(script, /Promise\.any\(\[browserAttempt, delayedServerAttempt\]\)/);
  assert.match(script, /HEIC conversion is taking longer than expected/);
  assert.match(styles, /\.monster-progress-track i/);
  assert.match(styles, /\.result-panel\.is-working \.monster-preview > img/);
});

test("the empty monster preview uses the branded studio state instead of stock character art", () => {
  const create = read("create.html");
  const script = read("scripts/main.js");
  const styles = read("monster-uploader.css");

  assert.match(create, /id="monster-preview-placeholder"/);
  assert.match(create, /Their monster appears here/);
  assert.match(create, /id="monster-preview"[\s\S]*?hidden/);
  assert.doesNotMatch(create, /step-2-character\.jpg/);
  assert.doesNotMatch(script, /demoMonsterImage/);
  assert.match(script, /monsterPreviewPlaceholder\.hidden = hasPreview/);
  assert.match(script, /monsterPreview\.removeAttribute\("src"\)/);
  assert.match(styles, /\.monster-preview-placeholder/);
  assert.match(styles, /\.monster-preview-mark/);
});

test("public storefront remains isolated from admin and Etsy", () => {
  const publicFiles = [...publicPages, "storefront.css"];
  const combined = publicFiles.map(read).join("\n");

  assert.doesNotMatch(combined, /etsy/i);
  assert.doesNotMatch(read("admin.html"), /storefront\.css/);
});

test("public page links and image sources resolve locally", () => {
  for (const page of publicPages) {
    const markup = read(page);
    for (const [, href] of markup.matchAll(/href="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|tel:)/.test(href)) continue;
      const [pathAndQuery, fragment] = href.split("#");
      const target = pathAndQuery.split("?")[0] || page;
      const targetPath = path.join(root, target);
      assert.ok(fs.existsSync(targetPath), `${page} links to missing ${target}`);
      if (fragment && target.endsWith(".html")) {
        const targetMarkup = read(target);
        assert.match(targetMarkup, new RegExp(`id=["']${fragment}["']`), `${page} links to missing #${fragment} in ${target}`);
      }
    }

    for (const [, src] of markup.matchAll(/(?:src|srcset)="([^" ]+)/g)) {
      if (/^(?:https?:|data:)/.test(src)) continue;
      const target = src.split("?")[0];
      assert.ok(fs.existsSync(path.join(root, target)), `${page} references missing ${target}`);
    }
  }
});
