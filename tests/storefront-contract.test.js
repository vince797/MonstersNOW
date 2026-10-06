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
    "halloween-monster-night-v3": "7c46e1c744ac3e156ce8daec97331eaa1db1dd8a0eb1052e2a54c4f9f45f3d13",
    "big-adventure-v3": "4d5a64303ddbebec72ac045b5ae0b54966fd73ceff999dcc7ae64aec534f4b27",
    "bedtime-monster-v3": "b654e6aa5d87c31a11c8449a4443f2d7d66d486354ac6227bdf03f7d2a97dbdd",
    "abc-monster-book-v3": "6dba3ddd9c51a75b589c5761507b7ec627bbf6bafd664209d1c57e2cfca8f052",
    "counting-with-my-monster-v3": "0a70ffb1877ea745113ff912a2b9ee65e8c87984f84ed2494e45a074b0ac530c",
    "the-monster-who-lost-their-glow-v4": "662ac55c635f26631661448582c21c37ae7907ba8bc2970504059b5519db61b4",
    "birthday-monster-adventure-v3": "18bd305d65b03b32d0c39d883f598fbadd601b248b0a77bcd738f045ebe7dcc1",
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
