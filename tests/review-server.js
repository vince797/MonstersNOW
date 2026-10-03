// Loopback-only review harness. Synthetic names/orders; every service is mocked.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { buildHalloweenProof } = require('../lib/halloween-proof');
const { buildHalloweenMasterPages } = require('../lib/halloween-master-pages');
const root = path.resolve(__dirname, '..');
const image = `data:image/jpeg;base64,${fs.readFileSync(path.join(root, 'assets/step-2-character.jpg')).toString('base64')}`;
const selection = { personalization: { childName: 'Sample', monsterName: 'Fizz', childCharacter: { id: 'deep-braids-black' } }, monsterImage: image, format: 'hardcover', selectedPreviewId: '22222222-2222-4222-8222-222222222222' };
const sampleProof = buildHalloweenProof(selection);
const master = { id: 'sample-story', slug: 'halloween-monster-night', title_template: 'Halloween Monster Night', version: 1, status: 'draft', updated_at: '2026-10-03T12:00:00Z', pages: buildHalloweenMasterPages().map((page, i) => ({ ...page, title: sampleProof.pages[i].title, artworkUrl: sampleProof.pages[i].layers.find(l => l.type === 'background')?.src || '', backgroundCrop: i % 2 ? 'left' : 'right' })) };
const order = { id: 'sample-order', story_id: master.id, story_label: master.title_template, customer_email: 'sample@example.test', child_name: 'Sample', monster_name: 'Fizz', child_character: sampleProof.childCharacter, format_id: 'hardcover', monster_style: 'storybook', amount_cents: 3999, currency: 'USD', status: 'proofing', selected_preview_id: selection.selectedPreviewId, created_at: '2026-10-03T12:00:00Z', updated_at: '2026-10-03T12:00:00Z', monster_assets: { selectedPreviewId: selection.selectedPreviewId, selectedPreviewUrl: image, originalUrl: image, previews: [] } };
function json(res, data, code = 200) { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); }
function createReviewServer() {
 return http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/review-preview-status') return json(res, {error:'Not a preview deployment.'},404);
  if (url.pathname === '/api/storybook-interest') {
    req.resume();
    if (req.method !== 'GET') return json(res, { error: 'Review harness is read only.' }, 405);
    if (url.searchParams.get('resource') === 'orders') return json(res, { orders: [order] });
    if (url.searchParams.get('resource') === 'monsters') return json(res, { monsters: [] });
    return json(res, { stories: [master, ...['big-adventure','bedtime-monster','abc-monster-book','counting-with-my-monster','the-monster-who-lost-their-glow','birthday-monster-adventure'].map(slug => ({ ...master, id: slug, slug, title_template: slug, pages: [] }))] });
  }
  if (url.pathname === '/api/monster-submissions') { req.resume(); return json(res, { submission: { id: '11111111-1111-4111-8111-111111111111', token: 'synthetic-local-token-no-production-access', selectedPreviewId: selection.selectedPreviewId, status: req.method === 'POST' ? 'draft' : 'ready' } }); }
  if (url.pathname === '/api/convert-monster') { req.resume(); return json(res, { monsterImage: image, style: 'storybook', submissionId: '11111111-1111-4111-8111-111111111111', previewId: selection.selectedPreviewId }); }
  if (url.pathname === '/api/halloween-proof') {
    let body = ''; for await (const chunk of req) body += chunk;
    try { return json(res, { proof: buildHalloweenProof(JSON.parse(body)), proofToken: 'local-review-harness-no-checkout' }); } catch (e) { return json(res, { error: e.message }, 400); }
  }
  if (url.pathname.startsWith('/api/')) { req.resume(); return json(res, { error: 'External services and checkout are disabled in this local review harness.' }, 403); }
  const file = path.resolve(root, `.${url.pathname === '/' ? '/create.html' : url.pathname}`);
  if (!file.startsWith(root + path.sep) || !/\.(html|css|js|svg|png|jpg|jpeg|webp|avif|ttf|json)$/.test(file) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
  const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.avif':'image/avif', '.ttf':'font/ttf', '.json':'application/json' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
 });
}
if (require.main === module) createReviewServer().listen(4173, '127.0.0.1', () => console.log('Local review harness: http://127.0.0.1:4173; no external service calls.'));
module.exports = { createReviewServer, image, selection, master, order };
