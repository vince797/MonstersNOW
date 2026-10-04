'use strict';
/** Synthetic-only preview handler. No database, paid APIs, uploads, mail, tokens,
 * customer data, or network fetches. The original API handlers are never imported. */
const fs = require('node:fs');
const path = require('node:path');
const { buildHalloweenProofWithGeometry } = require('./halloween-proof');
const { buildHalloweenMasterPages } = require('./halloween-master-pages');
const { childCharacterIds } = require('./child-characters');
const MONSTER_PATH = '/assets/characters/candidates/sample-monster-v2/purple-wave-soft-plush-review.png';
const PREVIEW_ID = '22222222-2222-4222-8222-222222222222';
const SUBMISSION_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'synthetic-review-only-no-customer-access';
const FIXED_TIME = '2026-10-03T12:00:00Z';
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-MonstersNOW-Review': 'synthetic-only', 'X-Robots-Tag': 'noindex, nofollow' };
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers }); }
function blockedResponse(message = 'This isolated review preview disables external services, customer data, uploads, payments, email, and printing.', status = 403) {
  return json({ code: 'review_preview_isolated', error: message, synthetic: true }, status);
}
let fixturePromise;
function sampleImage() { return `data:image/png;base64,${fs.readFileSync(path.join(__dirname, '..', MONSTER_PATH)).toString('base64')}`; }
async function fixtures() {
  if (!fixturePromise) fixturePromise = (async () => {
    const image = sampleImage();
    const selection = { personalization: { childName: 'Sample', monsterName: 'Fizz', childCharacter: { id: 'deep-braids-black' } }, monsterImage: image, selectedPreviewId: PREVIEW_ID, format: 'hardcover' };
    const proof = await buildHalloweenProofWithGeometry(selection);
    const master = { id: 'sample-story', slug: 'halloween-monster-night', title_template: 'Halloween Monster Night', version: 1, status: 'draft', updated_at: FIXED_TIME, pages: buildHalloweenMasterPages().map((page, i) => ({ ...page, title: proof.pages[i].title, artworkUrl: proof.pages[i].layers.find(l => l.type === 'background')?.src || '', backgroundCrop: page.backgroundCrop || (i % 2 ? 'left' : 'right') })) };
    const order = { id: 'sample-order', story_id: master.id, story_label: master.title_template, customer_email: 'sample@example.test', child_name: 'Sample', monster_name: 'Fizz', child_character: proof.childCharacter, format_id: 'hardcover', monster_style: 'storybook', amount_cents: 0, currency: 'USD', status: 'proofing', selected_preview_id: PREVIEW_ID, created_at: FIXED_TIME, updated_at: FIXED_TIME, monster_assets: { selectedPreviewId: PREVIEW_ID, selectedPreviewUrl: MONSTER_PATH, originalUrl: MONSTER_PATH, previews: [] } };
    const geometry = proof.pages.flatMap(page => page.layers || []).find(layer => layer.type === 'monster')?.alphaGeometry;
    if (geometry) Object.assign(order.monster_assets, { monsterGeometry: geometry, selectedPreviewSha256: geometry.sourceSha256 });
    return { image, selection, master, order };
  })();
  return fixturePromise;
}
async function boundedJson(request) {
  // Only the small proof-selector body is accepted. Uploaded images, child names,
  // email addresses and all other client fields are deliberately discarded.
  const reader = request.body?.getReader();
  if (!reader) return {};
  let bytes = 0; const chunks = [];
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 3 * 1024 * 1024) { await reader.cancel(); throw new Error('Review request is too large.'); } chunks.push(value); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}
async function handlePreviewRequest(request, normalizedPath) {
  if (process.env.VERCEL_ENV !== 'preview') return blockedResponse('Synthetic fixture routes are available only in review previews.', 404);
  const url = new URL(request.url);
  const pathname = normalizedPath || url.pathname;
  const resource = url.searchParams.get('resource');
  const method = request.method.toUpperCase();
  const route = pathname.replace(/\.js$/, '').replace(/\/$/, '');
  if (route === '/api/review-preview-status' && method === 'GET') return json({ synthetic: true, isolated: true, payments: false, printing: false, externalServices: false, realCustomerData: false, rendererRuntimeVerified: false });
  if (route === '/api/monster-submissions' || route === '/api/storybook-interest' && resource === 'monster-submissions') {
    if (!['POST', 'PATCH'].includes(method)) return blockedResponse();
    return json({ synthetic: true, submission: { id: SUBMISSION_ID, token: TOKEN, selectedPreviewId: PREVIEW_ID, status: method === 'POST' ? 'draft' : 'ready' } });
  }
  if (route === '/api/convert-monster' && method === 'POST') {
    const { image } = await fixtures();
    return json({ synthetic: true, monsterImage: image, style: 'storybook', submissionId: SUBMISSION_ID, previewId: PREVIEW_ID });
  }
  if ((route === '/api/halloween-proof' || route === '/api/storybook-interest' && resource === 'halloween-proof') && method === 'POST') {
    const payload = await boundedJson(request);
    const requestedChild = payload.personalization?.childCharacter;
    const childId = typeof requestedChild === 'string' ? requestedChild : requestedChild?.id;
    const { selection } = await fixtures();
    const proof = await buildHalloweenProofWithGeometry({ ...selection, format: payload.format === 'softcover' ? 'softcover' : 'hardcover', personalization: { ...selection.personalization, childCharacter: { id: childCharacterIds().includes(childId) ? childId : 'deep-braids-black' } } });
    // The hash is diagnostic only. It is never signed or accepted for checkout.
    proof.monsterImage = MONSTER_PATH;
    for (const page of proof.pages) for (const layer of page.layers || []) if (layer.type === 'monster') layer.src = MONSTER_PATH;
    proof.warnings = ['Synthetic review: Sample and Fizz are fixed demo identities. No customer information or uploaded drawing is retained.', ...proof.warnings];
    return json({ synthetic: true, proof, proofToken: TOKEN });
  }
  if (route === '/api/storybook-interest' && method === 'GET') {
    const { master, order } = await fixtures();
    if (resource === 'orders') return json({ synthetic: true, orders: [order] });
    if (resource === 'monsters') return json({ synthetic: true, monsters: [] });
    if (!resource || resource === 'stories') return json({ synthetic: true, stories: [master, ...['big-adventure','bedtime-monster','abc-monster-book','counting-with-my-monster','the-monster-who-lost-their-glow','birthday-monster-adventure'].map(slug => ({ ...master, id: slug, slug, title_template: slug, pages: [] }))] });
  }
  return blockedResponse();
}
module.exports = { handlePreviewRequest, blockedResponse, MONSTER_PATH };
