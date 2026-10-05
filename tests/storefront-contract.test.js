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

test("the create flow displays and forwards the allowlisted story", () => {
  const create = read("create.html");
  const script = read("scripts/main.js");

  assert.match(create, /id="selected-story" data-story-id="halloween-monster-night" role="group"/);
  assert.match(script, /const publicStoryCatalog = \{/);
  assert.match(script, /storyId: selectedStory\.id/);
  assert.match(script, /storyLabel: selectedStory\.label/);
  assert.match(script, /storyId: storyId \|\| selectedStory\.id/);
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
