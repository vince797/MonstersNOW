const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
const polish = fs.readFileSync(path.join(root, "home-polish.css"), "utf8");

test("homepage pricing presents a clear free-to-print journey", () => {
  assert.match(homepage, /Create free\. Print when you’re ready\./);
  assert.match(homepage, /class="pricing-step-label"><b>1<\/b> Free preview/);
  assert.match(homepage, /class="pricing-step-label"><b>2<\/b> Optional print/);
  assert.match(homepage, /No card required/);
  assert.match(homepage, /Proof before print/);
  assert.match(homepage, /class="pricing-specs"/);
  assert.equal((homepage.match(/class="pricing-card-actions"/g) || []).length, 2);
});

test("homepage pricing cards align and stack without hover movement", () => {
  assert.match(polish, /\.pricing-grid\s*{[\s\S]*?align-items:\s*stretch/);
  assert.match(polish, /\.pricing-card:hover\s*{[\s\S]*?transform:\s*none/);
  assert.match(polish, /\.pricing-card-actions\s*{[\s\S]*?margin-top:\s*auto/);
  assert.match(polish, /@media \(max-width:\s*820px\)[\s\S]*?\.pricing-grid\s*{[\s\S]*?grid-template-columns:\s*1fr/);
});
