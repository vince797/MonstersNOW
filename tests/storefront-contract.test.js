const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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

test("the create flow displays and forwards the allowlisted story", () => {
  const create = read("create.html");
  const script = read("scripts/main.js");

  assert.match(create, /id="selected-story" data-story-id="halloween-monster-night" role="group"/);
  assert.match(script, /const publicStoryCatalog = \{/);
  assert.match(script, /storyId: selectedStory\.id/);
  assert.match(script, /storyLabel: selectedStory\.label/);
  assert.match(script, /storyId: storyId \|\| selectedStory\.id/);
});

test("the approved seven-cover collection is used without changing story availability", () => {
  const covers = {
    "halloween-monster-night-v5": "6d7581e4e07a37885e1e7eb88b3caedd414ba92e3093acacb7578292a8cc6ac3",
    "big-adventure-v4": "ddd0fd08a6288b2bd2314a09ed1ecb5c722200afd4bd9e14be4a2a50a6ca1fc2",
    "bedtime-monster-v5": "ed2961b0cba290ffdea224f15999b982e5c7792d05dd659bb3ccfc8a85e63bc6",
    "abc-monster-book-v4": "abfed526985d0039612af5b7542198414bec3b83b162e00e2fd526328f6b6a4c",
    "counting-with-my-monster-v4": "61f2e02502febbe4b5133a8e029a39410de62d12bd447c262cccd136eb947a03",
    "the-monster-who-lost-their-glow-v5": "ff81d2a637716f91b6c9c40e17c2d286b6f967a5b6abd6c638e0cfd4f87598b0",
    "birthday-monster-adventure-v4": "22348f32575d5b9c5e5b9e16cb8a7aa7a335c5e796a6753700fb909d17c77508",
  };
  const books = read("books.html");
  const admin = read("scripts/admin.js");
  Object.entries(covers).forEach(([name, expectedHash]) => {
    assert.match(books, new RegExp(`${name}-web\\.jpg`));
    assert.match(admin, new RegExp(`${name}-web\\.jpg`));
    for (const suffix of [".png", "-web.jpg", "-640.webp"]) {
      assert.ok(fs.existsSync(path.join(root, `assets/storybook/cover-series/minimal-concepts/${name}${suffix}`)));
    }
    assert.equal(
      crypto.createHash("sha256").update(fs.readFileSync(path.join(root, `assets/storybook/cover-series/minimal-concepts/${name}.png`))).digest("hex"),
      expectedHash,
    );
  });
  const publicCoverMarkup = [read("index.html"), books, read("create.html")].join("\n");
  assert.doesNotMatch(publicCoverMarkup, /(?:big-adventure|bedtime-monster|abc-monster-book|counting-with-my-monster|birthday-monster-adventure)-v2-(?:web|640)/);
  assert.doesNotMatch(publicCoverMarkup, /bedtime-monster-v3-(?:web|640)/);
  assert.doesNotMatch(publicCoverMarkup, /the-monster-who-lost-their-glow-v3-web/);
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

test("storybook step pairs a child with their monster across the spread", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const image = path.join(root, "assets", "step-3-storybook-v2.jpg");
  assert.match(html, /assets\/step-3-storybook-v2\.jpg/);
  assert.match(html, /child and a green monster waving to each other/);
  assert.equal(fs.existsSync(image), true);
  assert.ok(fs.statSync(image).size < 200_000);
});
