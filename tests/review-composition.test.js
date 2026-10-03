const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { composeReviewBook, safeImageSource } = require('../lib/review-composition');
const { buildHalloweenProof, signProof, verifyProof } = require('../lib/halloween-proof');
const { CHILD_CHARACTERS } = require('../lib/child-characters');
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
const input = { personalization: { childName: 'Sample', monsterName: 'Fizz', childCharacter: { id: 'deep-braids-black' } }, selectedPreviewId: 'sample-preview', monsterImage: image, format: 'hardcover' };

test('public proof composes 28 existing background halves and selected child beside the exact monster', () => {
  const proof = buildHalloweenProof(input);
  assert.equal(proof.reviewOnly, true);
  assert.equal(proof.productionReady, false);
  assert.equal(proof.format, 'hardcover');
  assert.equal(proof.pages.length, 32);
  assert.equal(proof.pages.flatMap(p => p.layers).filter(l => l.type === 'background').length, 28);
  assert.equal(proof.pages.flatMap(p => p.layers).filter(l => l.type === 'child').length, 28);
  for (const page of proof.pages) for (const layer of page.layers) {
    if (layer.type === 'monster') { assert.equal(layer.src, image); assert.equal(layer.mirror, false); assert.equal(layer.assetId, 'sample-preview'); }
    else assert.ok(fs.existsSync(path.join(__dirname, '..', layer.src)));
  }
  assert.equal(proof.pages[3].layers[0].crop, 'left');
  assert.equal(proof.pages[4].layers[0].crop, 'right');
  assert.equal(proof.pages[3].layers.find(l => l.type === 'child').status, 'candidate');
});

test('every preset resolves to its own asset, while Monster only adds no child layer', () => {
  for (const preset of Object.values(CHILD_CHARACTERS)) {
    const proof = buildHalloweenProof({ ...input, personalization: { ...input.personalization, childCharacter: { id: preset.id, asset: { src: 'https://attacker.example/replace.svg', status: 'final' } } } });
    const children = proof.pages.flatMap(p => p.layers).filter(l => l.type === 'child');
    assert.equal(children.length, preset.included ? 28 : 0);
    for (const child of children) assert.equal(child.src, preset.poses?.[child.pose]?.src || preset.asset.src);
  }
  assert.throws(() => buildHalloweenProof({ ...input, personalization: { ...input.personalization, childCharacter: { id: 'unknown' } } }), /available child/);
});

test('proof token binds child selection, names, format, layout, and exact image', () => {
  process.env.STORYBOOK_PROOF_SECRET = 'local-review-test-secret';
  const token = signProof(buildHalloweenProof(input));
  const another = buildHalloweenProof({ ...input, personalization: { ...input.personalization, childCharacter: { id: 'light-wavy-blonde' } } });
  assert.throws(() => verifyProof(another, token), /changed/);
});

test('shared composition refuses a different monster and unsafe image sources', () => {
  const story = { pages: Array.from({ length: 32 }, () => ({ text: '{child_name} meets {monster_name}', monsterRequired: true })) };
  assert.throws(() => composeReviewBook(story, { selectedPreviewId: 'one' }, { selectedPreviewId: 'two', monsterImage: image }), /does not match/);
  assert.equal(safeImageSource('javascript:alert(1)'), '');
  assert.equal(safeImageSource('//attacker.example/image'), '');
  assert.equal(safeImageSource('/assets/../../secret'), '');
  assert.equal(safeImageSource('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(safeImageSource('/assets/characters/review.svg'), '/assets/characters/review.svg');
});

test('customer and admin use the same page renderer, with print control closed', () => {
  for (const file of ['halloween-proof.html', 'admin.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.match(html, /scripts\/page-compositor\.js/);
    assert.match(html, /lib\/review-composition\.js/);
  }
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'scripts/admin.js'), 'utf8'), /send.disabled = true/);
});


test("candidate child poses follow Halloween scene groups without gaining print approval", () => {
  const proof = buildHalloweenProof({ ...input, personalization: { ...input.personalization, childCharacter: { id: "warm-curly-dark" } } });
  const child = number => proof.pages[number - 1].layers.find(l => l.type === "child");
  assert.equal(child(4).pose, "porch");
  assert.equal(child(6).pose, "garden");
  assert.equal(child(22).pose, "garden-quiet");
  assert.equal(child(23).pose, "garden-quiet");
  assert.equal(child(24).pose, "garden-quiet");
  assert.equal(child(25).pose, "garden");
  assert.equal(child(30).pose, "garden");
  assert.equal(child(31).pose, "seated-home");
  assert.equal(child(4).status, "candidate");
  assert.equal(proof.productionReady, false);
});

test('saved masters retain only supported child poses and background crops', () => {
  const { normalizePages } = require('../lib/story-library');
  const pages = normalizePages([{text:'Story',childPose:'garden',backgroundCrop:'right'},{text:'Story',childPose:'untrusted',backgroundCrop:'untrusted'}]);
  assert.equal(pages[0].childPose,'garden'); assert.equal(pages[0].backgroundCrop,'right');
  assert.equal(pages[1].childPose,''); assert.equal(pages[1].backgroundCrop,'full');
});
