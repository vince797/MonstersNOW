'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { service, fingerprint, objectPath, storage, prepareOrderInputs } = require('../lib/order-artifacts');
const { canonicalJson } = require('../lib/composed-book-pdf');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function fixture(format = 'softcover') {
  let order = { id: '00000000-0000-4000-8000-000000000001', status: 'proofing', artifact_revision: 0, format_id: format, active_artifact_package_id: null, child_name: 'Sample Alex', monster_name: 'Moxie' };
  let revision = 1, renders = 0, mode = null, jobs = [], packages = [], requests = [], serial = 0;
  const objects = new Map();
  const storage = {
    read: async (bucket, path) => { if (!objects.has(path)) throw Error('missing'); return Buffer.from(objects.get(path)); },
    put: async (path, bytes) => {
      if (mode === 'upload-fail' && path.includes('cover-')) throw Object.assign(Error('failed'), { code: 'artifact_storage_write_failed' });
      if (objects.has(path)) assert.equal(sha(objects.get(path)), sha(bytes), 'Existing bytes are immutable');
      objects.set(path, Buffer.from(bytes));
    },
    sign: async path => `https://storage.invalid/signed/${path}?ttl=300`,
  };
  const prepare = async input => {
    if (input.status !== 'proofing' || input.payment_issue) throw Object.assign(Error('locked'), { code: 'artifact_order_locked' });
    const snapshot = { orderId: input.id, revision: input.artifact_revision, storyVersion: revision, format: input.format_id, name: input.child_name };
    return { order: input, sourceSnapshot: snapshot, inputFingerprint: fingerprint(snapshot), personalizationFingerprint: fingerprint({ name: input.child_name }) };
  };
  const render = async prepared => {
    renders++;
    if (mode === 'render-fail') throw Object.assign(Error('timeout'), { code: 'artifact_render_timeout' });
    const hash = prepared.inputFingerprint;
    const interior = Buffer.from(`%PDF-1.7\nREVIEW CANDIDATE ${hash}`), softcover = Buffer.from(`%PDF-1.7\nREVIEW CANDIDATE SOFT ${hash}`), hardcover = Buffer.from(`%PDF-1.7\nREVIEW CANDIDATE HARD ${hash}`);
    const record = b => ({ sha256: sha(b), byteLength: b.length, pageCount: b === interior ? 32 : 1 });
    if (mode === 'source-race') revision++;
    return { interior, covers: { softcover, hardcover }, manifest: { reviewOnly: true, productionReady: mode === 'fake-ready', rendererVersion: 'test-review', renderFingerprint: hash, compositionSha256: hash, artifacts: { interior: record(interior), softcover: record(softcover), hardcover: record(hardcover) }, templates: { softcover: { format: 'softcover' }, hardcover: { format: 'hardcover' } }, blockers: [{ code: 'review_only' }] } };
  };
  const db = async (url, opts = {}) => {
    requests.push({ url, ...opts });
    const b = opts.body;
    if (url.startsWith('/storybook_orders')) return [{ ...order }];
    if (url.startsWith('/order_render_jobs?')) return jobs.length ? [{ ...jobs.at(-1) }] : [];
    if (url.startsWith('/order_artifact_packages?')) return packages.filter(p => url.includes(p.id)).map(p => ({ ...p }));
    if (url === '/rpc/claim_order_render_job') {
      assert.equal(b.p_revision, order.artifact_revision);
      let job = jobs.find(j => j.input_fingerprint === b.p_input_fingerprint);
      if (!job) { job = { id: `job-${++serial}`, order_id: order.id, input_fingerprint: b.p_input_fingerprint, status: 'queued', attempts: 0 }; jobs.push(job); }
      if (job.status === 'completed' && packages.some(p => p.job_id === job.id && p.status === 'ready' && order.active_artifact_package_id === p.id) || job.status === 'running' && Date.parse(job.lease_until) > Date.now()) return { claimed: false, job: { ...job } };
      Object.assign(job, { status: 'running', attempts: job.attempts + 1, lease_token: b.p_lease_token, lease_until: new Date(Date.now() + 600000).toISOString() }); return { claimed: true, job: { ...job } };
    }
    if (url === '/rpc/finish_order_render_job') {
      const job = jobs.find(j => j.id === b.p_job_id); assert.equal(job.lease_token, b.p_lease_token);
      if (mode === 'commit-race') { order.artifact_revision++; throw Object.assign(Error('stale'), { code: 'artifact_source_changed' }); }
      assert.equal(job.status, 'running');
      const pkg = { id: `package-${serial}`, job_id: job.id, order_id: order.id, order_revision: order.artifact_revision, input_fingerprint: job.input_fingerprint, package_hash: b.p_package_hash, manifest_path: b.p_manifest_path, manifest: b.p_manifest, format_id: order.format_id, status: 'ready', customer_review: null, admin_review: null };
      const existing = packages.find(p => p.job_id === job.id);
      if (existing) { assert.equal(existing.package_hash, pkg.package_hash); Object.assign(existing, { status: 'ready', customer_review: null, admin_review: null }); order.active_artifact_package_id = existing.id; }
      else { packages.push(pkg); order.active_artifact_package_id = pkg.id; }
      job.status = 'completed';
      if (mode === 'commit-response-lost') throw Error('network lost');
      return { packageId: pkg.id };
    }
    if (url === '/rpc/fail_order_render_job') {
      const job = jobs.find(j => j.id === b.p_job_id);
      if (job.status === 'running' && job.lease_token === b.p_lease_token) Object.assign(job, { status: b.p_error_code === 'artifact_source_changed' ? 'stale' : 'failed', error_code: b.p_error_code });
      return null;
    }
    if (url === '/rpc/invalidate_order_artifact_package') { const pkg = packages.find(p => p.id === b.p_package_id); if (pkg) { pkg.status = 'stale'; pkg.customer_review = pkg.admin_review = null; } order.active_artifact_package_id = null; return null; }
    if (url === '/rpc/review_order_artifact_package') {
      const pkg = packages.find(p => p.id === b.p_package_id); assert.equal(order.active_artifact_package_id, pkg.id); assert.equal(pkg.package_hash, b.p_package_hash); assert.equal(b.p_revision, order.artifact_revision);
      pkg[b.p_role === 'customer' ? 'customer_review' : 'admin_review'] = { status: b.p_action === 'approve' ? 'approved' : 'changes_requested', packageHash: b.p_package_hash, reviewedAt: '2026-10-03', notes: b.p_notes }; return null;
    }
    throw Error(`Unexpected DB request ${url}`);
  };
  return { db, prepare, render, workflow: service({ db, storage, prepare, render }), get order() { return order; }, jobs, packages, objects, requests, get renders() { return renders; }, setMode(value) { mode = value; }, changeSource() { revision++; }, changeFormat(value) { order.format_id = value; order.artifact_revision++; order.active_artifact_package_id = null; }, storage };
}
for (const format of ['softcover', 'hardcover']) test(`${format} freezes exact interior/cover and shares one hash with both reviewers`, async () => {
  const f = fixture(format), first = await f.workflow.run(f.order.id), pkg = first.artifact_package;
  assert.equal(pkg.format, format); assert.equal(pkg.productionReady, false); assert.equal(pkg.reviewOnly, true);
  assert.equal(f.objects.size, 3); assert.equal(f.renders, 1);
  const approve = { action: 'approve', packageId: pkg.id, packageHash: pkg.packageHash };
  const customer = await f.workflow.review(f.order.id, approve, 'customer', 'authorized-order-token');
  const admin = await f.workflow.review(f.order.id, approve, 'administrator', 'authorized-admin');
  assert.equal(customer.artifact_package.customerApproval.packageHash, pkg.packageHash);
  assert.equal(admin.artifact_package.adminApproval.packageHash, pkg.packageHash);
  assert.equal(f.order.status, 'proofing');
  await f.workflow.run(f.order.id);
  assert.equal(f.renders, 1); assert.equal(f.packages.length, 1);
});

test('upload failure retries the same job without overwriting files or duplicating packages', async () => {
  const f = fixture(); f.setMode('upload-fail'); const failed = await f.workflow.run(f.order.id);
  assert.equal(failed.artifact_job.status, 'failed'); assert.equal(failed.artifact_job.retryable, true); assert.equal(f.packages.length, 0);
  assert.equal(f.objects.size, 1); f.setMode(null);
  const ready = await f.workflow.run(f.order.id); assert.equal(ready.artifact_job.attempts, 2); assert.equal(f.jobs.length, 1); assert.equal(f.packages.length, 1); assert.equal(f.objects.size, 3);
});
test('source version and format changes invalidate old approvals and create a new version', async () => {
  const f = fixture(), first = (await f.workflow.run(f.order.id)).artifact_package;
  await f.workflow.review(f.order.id, { action: 'approve', packageId: first.id, packageHash: first.packageHash }, 'customer', 'owner');
  f.changeSource(); const stale = await f.workflow.state(f.order.id); assert.equal(stale.artifact_package, null); assert.equal(f.packages[0].customer_review, null);
  const second = (await f.workflow.run(f.order.id)).artifact_package; assert.notEqual(second.packageHash, first.packageHash);
  await assert.rejects(f.workflow.review(f.order.id, { action: 'approve', packageId: first.id, packageHash: first.packageHash }, 'customer', 'owner'), /changed/);
  f.changeFormat('hardcover'); const third = (await f.workflow.run(f.order.id)).artifact_package; assert.equal(third.format, 'hardcover'); assert.notEqual(third.packageHash, second.packageHash);
});
test('render/source/commit races and forged readiness cannot publish a reviewable set', async () => {
  for (const mode of ['render-fail', 'source-race', 'commit-race', 'fake-ready']) {
    const f = fixture(); f.setMode(mode); const result = await f.workflow.run(f.order.id);
    assert.equal(result.artifact_package, null, mode); assert.equal(f.packages.length, 0, mode); assert.ok(['failed', 'stale'].includes(result.artifact_job.status));
  }
});
test('a lost commit response does not demote completed jobs or create duplicate sets on retry', async () => {
  const f = fixture(); f.setMode('commit-response-lost'); const uncertain = await f.workflow.run(f.order.id);
  assert.equal(uncertain.artifact_job.status, 'completed'); f.setMode(null);
  const next = await f.workflow.run(f.order.id); assert.ok(next.artifact_package); assert.equal(f.packages.length, 1); assert.equal(f.renders, 1);
});
test('tampered persisted PDFs, manifests and cross-order packages cannot be viewed or approved', async () => {
  for (const type of ['pdf', 'manifest', 'owner']) {
    const f = fixture(); const pkg = (await f.workflow.run(f.order.id)).artifact_package;
    if (type === 'pdf') f.objects.set(f.packages[0].manifest.artifacts.cover.path, Buffer.from('%PDF-tampered'));
    if (type === 'manifest') f.packages[0].manifest.artifacts.cover.sha256 = '0'.repeat(64);
    if (type === 'owner') f.packages[0].order_id = 'different-order';
    if (type === 'owner') assert.equal((await f.workflow.state(f.order.id)).artifact_package, null);
    else await assert.rejects(f.workflow.state(f.order.id), /match|changed/);
    await assert.rejects(f.workflow.review(f.order.id, { action: 'approve', packageId: pkg.id, packageHash: pkg.packageHash }, 'customer', 'owner'));
  }
});
test('storage rejects traversal and overwrites; verifies bytes after immutable upload', async () => {
  for (const p of ['../secret', 'a//b', '/absolute', 'https://x.test/a', 'a/%2e%2e/b']) assert.throws(() => objectPath(p), /storage path/);
  const oldFetch = global.fetch, oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'synthetic-test-secret';
  const bytes = Buffer.from('%PDF-test'), calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return options.method === 'POST' ? { ok: true } : { ok: true, arrayBuffer: async () => bytes }; };
  try { await storage().put('order/hash/file.pdf', bytes, 'application/pdf'); assert.equal(calls[0].options.headers['x-upsert'], 'false'); assert.ok(calls[1].url.includes('/object/authenticated/order-artifacts/')); assert.equal(calls[0].options.redirect, 'error'); }
  finally { global.fetch = oldFetch; if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl; if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = oldKey; }
});
test('the active lease prevents duplicate concurrent render work and recovers after expiration', async () => {
  const f = fixture(); f.setMode('render-fail'); await f.workflow.run(f.order.id);
  Object.assign(f.jobs[0], { status: 'running', lease_until: new Date(Date.now()+10000).toISOString() });
  const busy = await f.workflow.run(f.order.id); assert.equal(busy.artifact_job.status, 'running'); assert.equal(f.renders, 1);
  f.jobs[0].lease_until = new Date(Date.now()-1).toISOString(); f.setMode(null);
  assert.ok((await f.workflow.run(f.order.id)).artifact_package); assert.equal(f.renders, 2); assert.equal(f.jobs.length, 1);
});
test('only a complete preview belonging to the saved order may be resolved', async () => {
  let reads = 0;
  const order = { id: 'order', artifact_revision: 0, status: 'proofing', format_id: 'softcover', story_id: 'halloween', selected_preview_id: 'preview', monster_submission_id: 'submission' };
  await assert.rejects(prepareOrderInputs(order, { db: async url => url.startsWith('/master_stories') ? [{ id: 'story', status: 'draft', pages: Array(32).fill({ text: 'story' }) }] : [{ id: 'preview', submission_id: 'other-person', status: 'complete', preview_path: 'other-person/image.png' }], storage: { read: async () => { reads++; } } }), /exact saved selected monster/);
  assert.equal(reads, 0);
});

test('HTTP admin render requests require admin authentication and customer review requires a valid order token', async () => {
  const handler = require('../api/storybook-interest');
  const oldFetch = global.fetch, oldPassword = process.env.ADMIN_PASSWORD; process.env.ADMIN_PASSWORD = 'synthetic-admin-secret';
  let calls = 0; global.fetch = async () => { calls++; throw Error('must not fetch'); };
  const response = () => ({ statusCode: 0, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() {} });
  try {
    const admin = response(); await handler({ method: 'PATCH', url: '/api/storybook-interest?resource=orders&id=order', query: { resource: 'orders', id: 'order' }, headers: {}, body: { action: 'render_job' } }, admin); assert.equal(admin.statusCode, 401);
    const customer = response(); await handler({ method: 'POST', url: '/api/storybook-interest?resource=customer-order', query: { resource: 'customer-order' }, headers: { authorization: 'Bearer invalid' }, body: { action: 'approve', packageId: 'other', packageHash: 'a'.repeat(64) } }, customer); assert.equal(customer.statusCode, 403); assert.equal(calls, 0);
  } finally { global.fetch = oldFetch; if (oldPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = oldPassword; }
});

test('failed rendering of new inputs clears the old package approvals before work starts', async () => {
  const f = fixture(), pkg = (await f.workflow.run(f.order.id)).artifact_package;
  await f.workflow.review(f.order.id, { action: 'approve', packageId: pkg.id, packageHash: pkg.packageHash }, 'customer', 'owner');
  f.changeSource(); f.setMode('render-fail'); const result = await f.workflow.run(f.order.id);
  assert.equal(result.artifact_package, null); assert.equal(f.order.active_artifact_package_id, null);
  assert.equal(f.packages[0].status, 'stale'); assert.equal(f.packages[0].customer_review, null);
});


test('real renderer persists parseable 32-page interior and chosen binding cover before exact package approval', async () => {
  const fs = require('node:fs/promises'), path = require('node:path'), sharp = require('sharp');
  const { PDFDocument } = require('pdf-lib');
  const { renderComposedBookPdf } = require('../lib/composed-book-pdf');
  const { loadVerifiedReviewTemplates } = require('../lib/lulu-cover-templates');
  const root = path.resolve(__dirname, '..');
  const pixels = await sharp({ create: { width: 12, height: 12, channels: 4, background: { r: 120, g: 80, b: 160, alpha: 1 } } }).png().toBuffer();
  const fonts = { body: await fs.readFile(path.join(root, 'assets/fonts/fredoka/Fredoka-Print-Regular.ttf')), heading: await fs.readFile(path.join(root, 'assets/fonts/chewy/Chewy-Regular.ttf')) };
  const templates = await loadVerifiedReviewTemplates();
  const composition = { title: 'Synthetic review test', storyId: 'synthetic', masterVersion: 1, childName: 'Sample', monsterName: 'Test Monster', childCharacter: { id: 'none' }, selectedPreviewId: 'synthetic-preview', pages: Array.from({ length: 32 }, (_, i) => ({ number: i+1, title: `Page ${i+1}`, text: `Actual test text for page ${i+1}.`, layers: [{ type: 'background', src: '/assets/test.png', crop: 'full' }, { type: 'monster', src: '/assets/test.png', assetId: 'synthetic-preview', x: 50, y: 85, scale: 20, mirror: false }] })) };
  for (const format of ['softcover','hardcover']) {
    const f = fixture(format);
    const workflow = service({ db: f.db, storage: f.storage, render: renderComposedBookPdf, prepare: async order => ({ ...await f.prepare(order), composition, fonts, templates, assetResolver: async () => ({ bytes: pixels, provenance: { status: 'sample-fixture' } }) }) });
    const ready = await workflow.run(f.order.id); assert.ok(ready.artifact_package, JSON.stringify(ready.artifact_error));
    const stored = f.packages[0], interior = f.objects.get(stored.manifest.artifacts.interior.path), cover = f.objects.get(stored.manifest.artifacts.cover.path);
    const interiorPdf = await PDFDocument.load(interior), coverPdf = await PDFDocument.load(cover);
    assert.equal(interiorPdf.getPageCount(), 32); assert.equal(coverPdf.getPageCount(), 1);
    assert.deepEqual(interiorPdf.getPage(0).getSize(), { width: 630, height: 630 });
    assert.equal(coverPdf.getPage(0).getWidth(), format === 'softcover' ? 1251.51 : 1368);
    assert.equal(stored.manifest.artifacts.interior.sha256, sha(interior)); assert.equal(stored.manifest.artifacts.cover.sha256, sha(cover));
    assert.equal(stored.package_hash, sha(f.objects.get(stored.manifest_path)));
    const reviewed = await workflow.review(f.order.id, { action: 'approve', packageId: stored.id, packageHash: stored.package_hash }, 'customer', 'synthetic-owner');
    assert.equal(reviewed.artifact_package.customerApproval.packageHash, stored.package_hash); assert.equal(reviewed.artifact_package.productionReady, false);
  }
});

test('bulk job summaries tolerate only missing migration tables, never authentication failures', async () => {
  const { listArtifactJobSummaries } = require('../lib/order-artifacts');
  const missing = await listArtifactJobSummaries(['order'], async () => { throw Object.assign(Error('missing'), { code: 'PGRST205' }); }); assert.equal(missing.available, false);
  await assert.rejects(listArtifactJobSummaries(['order'], async () => { throw Object.assign(Error('bad credentials'), { code: 'PGRST301' }); }), /credentials/);
  const jobs = await listArtifactJobSummaries(['order'], async () => [{ id: 'new', order_id: 'order', status: 'failed', attempts: 2, error_code: 'timeout' }, { id: 'old', order_id: 'order', status: 'completed' }]);
  assert.equal(jobs.jobs.order.id, 'new'); assert.equal(jobs.jobs.order.retryable, true);
});

test('real saved-order preparation pins image bytes and page edits without fetching arbitrary URLs', async () => {
  const fs = require('node:fs/promises'), path = require('node:path');
  const image = await fs.readFile(path.join(__dirname, '../assets/characters/candidates/sample-monster-v1/purple-wave-candidate.png'));
  const order = { id: '00000000-0000-4000-8000-000000000001', artifact_revision: 0, status: 'proofing', format_id: 'hardcover', story_id: 'halloween-monster-night', selected_preview_id: '00000000-0000-4000-8000-000000000002', monster_submission_id: '00000000-0000-4000-8000-000000000003', child_name: 'Sample', monster_name: 'Moxie', child_character: { id: 'none' } };
  const story = { id: '00000000-0000-4000-8000-000000000004', slug: order.story_id, status: 'draft', version: 3, updated_at: '2026-10-03T00:00:00Z', title_template: 'A test for {child_name}', pages: Array.from({ length: 32 }, (_, i) => ({ text: '{child_name} meets {monster_name}.', artworkUrl: 'https://never-fetch.invalid/user-url', artworkPath: `saved-story/page-${i}.png`, backgroundCrop: 'full' })) };
  const reads = [], deps = { db: async url => url.startsWith('/master_stories') ? [story] : [{ id: order.selected_preview_id, submission_id: order.monster_submission_id, status: 'complete', preview_path: `${order.monster_submission_id}/selected.png`, completed_at: '2026-10-03T00:00:00Z' }], storage: { read: async (bucket, objectPath) => { reads.push({ bucket, objectPath }); return image; } } };
  const prepared = await prepareOrderInputs(order, deps);
  assert.equal(reads[0].bucket, 'monster-submissions'); assert.equal(reads[0].objectPath, `${order.monster_submission_id}/selected.png`);
  assert.ok(reads.every(r => !r.objectPath.includes('://')));
  assert.equal(prepared.sourceSnapshot.assets[0].sha256, sha(image));
  assert.equal(prepared.composition.pages[0].text, 'Sample meets Moxie.');
  const monster = prepared.composition.pages[0].layers.find(l => l.type === 'monster'); assert.equal(monster.assetId, order.selected_preview_id);
  assert.deepEqual(monster.anchor, { x: .5, y: 1288 / 1374 });
  assert.equal(monster.alphaGeometry.sourceSha256, sha(image));
  assert.equal(monster.alphaGeometry.selectedPreviewId, order.selected_preview_id);
  assert.equal(sha((await prepared.assetResolver(monster.src)).bytes), sha(image));
  story.pages[0].backgroundCrop = 'left';
  assert.notEqual((await prepareOrderInputs(order, deps)).inputFingerprint, prepared.inputFingerprint);
  story.pages[0].artworkPath = ''; await assert.rejects(prepareOrderInputs(order, deps), /trusted storage path/);
});

test('opaque Supabase keys use apikey only, with legacy JWT header compatibility', () => {
  const { supabaseAuthHeaders } = require('../lib/supabase-headers');
  assert.deepEqual(supabaseAuthHeaders('sb_secret_synthetic'), { apikey: 'sb_secret_synthetic' });
  assert.deepEqual(supabaseAuthHeaders('sb_publishable_synthetic'), { apikey: 'sb_publishable_synthetic' });
  assert.deepEqual(supabaseAuthHeaders('eyJsynthetic.eyJsynthetic.signature'), { apikey: 'eyJsynthetic.eyJsynthetic.signature', Authorization: 'Bearer eyJsynthetic.eyJsynthetic.signature' });
});

test('unapplied migration denies browser grants and explicitly rejects missing SQL identity arguments', async () => {
  const fs = require('node:fs/promises'), path = require('node:path');
  const sql = await fs.readFile(path.join(__dirname, '../supabase/migrations/20261003213513_order_artifact_review_packages.sql'), 'utf8');
  assert.match(sql, /order_render_jobs enable row level security/); assert.match(sql, /order_artifact_packages enable row level security/);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /revoke all on public\.order_render_jobs, public\.order_artifact_packages from public, anon, authenticated/);
  assert.match(sql, /p_package_hash is null/); assert.match(sql, /p_revision is null/); assert.match(sql, /p_role is null or p_action is null/);
  assert.match(sql, /s\.version is distinct from/); assert.match(sql, /v\.preview_path is distinct from/);
  assert.match(sql, /j\.lease_until is null/); assert.match(sql, /length\(coalesce\(trim\(p_notes\),''\)\)<3/);
  assert.match(sql, /artifact_workflow_started_at=coalesce/);
});


test('a completed inactive package can be safely restored without duplicate rows or old approvals', async () => {
  const f = fixture(), first = (await f.workflow.run(f.order.id)).artifact_package;
  await f.workflow.review(f.order.id, { action: 'approve', packageId: first.id, packageHash: first.packageHash }, 'customer', 'owner');
  f.order.active_artifact_package_id = null;
  const restored = await f.workflow.run(f.order.id);
  assert.equal(restored.artifact_package.id, first.id); assert.equal(restored.artifact_package.packageHash, first.packageHash);
  assert.equal(restored.artifact_package.customerApproval.status, 'ready'); assert.equal(f.packages.length, 1); assert.equal(f.jobs.length, 1);
});
