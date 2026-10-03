'use strict';
const { supabaseAuthHeaders } = require("./supabase-headers");
// Server-only immutable REVIEW packages. There is deliberately no print submission path.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { supabaseRequest } = require('./story-library');
const { composeReviewBook } = require('./review-composition');
const { deriveMonsterGeometry } = require('./monster-geometry');
const { canonicalJson, createLocalAssetResolver, renderComposedBookPdf } = require('./composed-book-pdf');
const { loadVerifiedReviewTemplates } = require('./lulu-cover-templates');
const ROOT = path.resolve(__dirname, '..');
const BUCKET = 'order-artifacts';
const MAX_BYTES = 20 * 1024 * 1024;
const TTL_SECONDS = 300;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fingerprint = object => sha(canonicalJson(object));
const enc = encodeURIComponent;
function error(message, code = 'artifact_workflow_error', status = 409) { return Object.assign(new Error(message), { code, status }); }
function required(condition, message, code) { if (!condition) throw error(message, code); }
function objectPath(value) {
  required(typeof value === 'string' && value.length < 800 && /^[A-Za-z0-9_./-]+$/.test(value) && !value.startsWith('/') && !value.split('/').some(p => !p || p === '.' || p === '..'), 'Invalid saved storage path.', 'artifact_storage_path_invalid');
  return value.split('/').map(enc).join('/');
}
function config() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''), key = process.env.SUPABASE_SECRET_KEY;
  required(url && key, 'Private artifact storage is not configured.', 'artifact_storage_not_configured');
  const parsed = new URL(url);
  required(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && parsed.pathname === '/', 'Private storage needs a configured HTTPS origin.', 'artifact_storage_not_configured');
  return { url, key, headers: supabaseAuthHeaders(key) };
}
function storage() {
  return {
    async read(bucket, savedPath) {
      required(['monster-submissions', 'story-artwork', BUCKET].includes(bucket), 'Invalid storage bucket.');
      const c = config(), response = await fetch(`${c.url}/storage/v1/object/authenticated/${bucket}/${objectPath(savedPath)}`, { headers: c.headers, redirect: 'error' });
      if (!response.ok) throw error('A saved private artifact could not be read.', 'artifact_storage_read_failed', 502);
      const bytes = Buffer.from(await response.arrayBuffer());
      required(bytes.length && bytes.length <= MAX_BYTES, 'Stored artifact exceeds the file limit.', 'artifact_size_limit');
      return bytes;
    },
    async put(savedPath, bytes, contentType) {
      required(bytes.length && bytes.length <= MAX_BYTES, 'Artifact exceeds the existing 20 MiB proof limit.', 'artifact_size_limit');
      const c = config(), response = await fetch(`${c.url}/storage/v1/object/${BUCKET}/${objectPath(savedPath)}`, { method: 'POST', headers: { ...c.headers, 'Content-Type': contentType, 'Cache-Control': 'private, max-age=0', 'x-upsert': 'false' }, body: bytes, redirect: 'error' });
      if (!response.ok) {
        // An interrupted upload may already have committed. Never overwrite it.
        if (![400, 409].includes(response.status)) throw error('Private artifact upload failed. Retry the same render job.', 'artifact_storage_write_failed', 502);
        const existing = await this.read(BUCKET, savedPath);
        required(sha(existing) === sha(bytes), 'An immutable object has different bytes. Rendering is paused.', 'artifact_integrity_failed');
      }
      // Verify stored bytes before a package can become reviewable.
      const stored = await this.read(BUCKET, savedPath);
      required(sha(stored) === sha(bytes) && stored.length === bytes.length, 'Stored artifact verification failed.', 'artifact_integrity_failed');
    },
    async sign(savedPath) {
      const c = config(), safe = objectPath(savedPath);
      const response = await fetch(`${c.url}/storage/v1/object/sign/${BUCKET}/${safe}`, { method: 'POST', headers: { ...c.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: TTL_SECONDS }), redirect: 'error' });
      if (!response.ok) throw error('The private review file could not be opened.', 'artifact_sign_failed', 502);
      const body = await response.json(), signed = body.signedURL || body.signedUrl;
      required(typeof signed === 'string' && signed.split('?')[0] === `/object/sign/${BUCKET}/${safe}` && !signed.includes('\\'), 'Invalid private storage response.', 'artifact_sign_failed');
      return `${c.url}/storage/v1${signed}`;
    },
  };
}

async function loadOrder(id, db = supabaseRequest) {
  const rows = await db(`/storybook_orders?id=eq.${enc(id)}&select=*&limit=1`);
  required(rows[0], 'Order not found.', 'order_not_found'); return rows[0];
}
async function prepareOrderInputs(order, deps = {}) {
  const db = deps.db || supabaseRequest, objects = deps.storage || storage();
  required(order.status === 'proofing' && !order.payment_issue, 'The order must be in proofing without a payment issue.', 'artifact_order_locked');
  required(['softcover', 'hardcover'].includes(order.format_id), 'An explicit saved book format is required.', 'artifact_format_invalid');
  const storyKey = /^[a-f0-9-]{36}$/i.test(order.story_id || '') ? 'id' : 'slug';
  const stories = await db(`/master_stories?${storyKey}=eq.${enc(order.story_id)}&select=*&limit=1`);
  const story = stories[0];
  required(story && story.status !== 'archived' && story.pages?.length === 32, 'A saved non-archived 32-page story is required.', 'artifact_story_missing');
  const previews = await db(`/monster_previews?id=eq.${enc(order.selected_preview_id)}&submission_id=eq.${enc(order.monster_submission_id)}&select=*&limit=1`);
  const preview = previews[0];
  required(preview?.status === 'complete' && preview.preview_path && preview.id === order.selected_preview_id && preview.submission_id === order.monster_submission_id, 'The exact saved selected monster is unavailable.', 'artifact_monster_missing');
  required(preview.preview_path.startsWith(`${order.monster_submission_id}/`), 'Selected monster storage ownership mismatch.', 'artifact_monster_mismatch');
  const frozenAssets = new Map();
  const monsterSource = `/assets/frozen-monster/${preview.id}.png`;
  frozenAssets.set(monsterSource, { bytes: await objects.read('monster-submissions', preview.preview_path), provenance: { status: 'unapproved-selected-preview', bucket: 'monster-submissions', savedPath: preview.preview_path, previewId: preview.id } });
  const local = createLocalAssetResolver({ root: ROOT });
  const pages = [];
  for (const [index, original] of story.pages.entries()) {
    const page = { ...original };
    if (page.artworkPath) {
      const source = `/assets/frozen-background/${index + 1}.png`;
      frozenAssets.set(source, { bytes: await objects.read('story-artwork', page.artworkPath), provenance: { status: page.artworkStatus || 'unapproved', bucket: 'story-artwork', savedPath: page.artworkPath } });
      page.artworkUrl = source;
    } else if (page.artworkUrl) {
      required(/^\/assets\//.test(page.artworkUrl), 'Background artwork needs its saved trusted storage path; remote URLs are not fetched.', 'artifact_background_path_missing');
    }
    pages.push(page);
  }
  const monsterGeometry = await deriveMonsterGeometry(frozenAssets.get(monsterSource).bytes, { source: monsterSource, selectedPreviewId: preview.id });
  const composition = composeReviewBook({ ...story, pages }, { childName: order.child_name, monsterName: order.monster_name, childCharacter: order.child_character, selectedPreviewId: order.selected_preview_id, format_id: order.format_id }, { selectedPreviewId: preview.id, selectedPreviewUrl: monsterSource, monsterGeometry });
  for (const layer of composition.pages.flatMap(p => p.layers)) if (!frozenAssets.has(layer.src)) frozenAssets.set(layer.src, await local(layer.src));
  const fonts = { body: await fs.readFile(path.join(ROOT, 'assets/fonts/fredoka/Fredoka-Print-Regular.ttf')), heading: await fs.readFile(path.join(ROOT, 'assets/fonts/chewy/Chewy-Regular.ttf')) };
  const templates = await loadVerifiedReviewTemplates();
  const sourceSnapshot = {
    orderId: order.id, revision: Number(order.artifact_revision || 0), storyId: story.id, storyVersion: story.version, storyUpdatedAt: story.updated_at,
    previewId: preview.id, previewPath: preview.preview_path, previewCompletedAt: preview.completed_at || null,
    format: order.format_id, personalization: { childName: order.child_name, monsterName: order.monster_name, childCharacter: composition.childCharacter.id },
    compositionSha256: fingerprint(composition), assets: [...frozenAssets].map(([source, a]) => ({ source, sha256: sha(a.bytes), byteLength: a.bytes.length })),
    fonts: { body: sha(fonts.body), heading: sha(fonts.heading) }, templates: Object.fromEntries(Object.entries(templates).map(([key, t]) => [key, t.metadata])),
    implementationSha256: sha(Buffer.concat(await Promise.all(['composed-book-pdf.js', 'pdf-image-compression.js', 'review-composition.js', 'monster-geometry.js', 'child-characters.js', 'order-artifacts.js'].map(f => fs.readFile(path.join(__dirname, f)))))),
    runtime: { node: process.version, pdfLib: require('pdf-lib/package.json').version, sharp: require('sharp').versions },
  };
  return { order, sourceSnapshot, inputFingerprint: fingerprint(sourceSnapshot), personalizationFingerprint: fingerprint(sourceSnapshot.personalization), composition, fonts, templates, assetResolver: async source => { const asset = frozenAssets.get(source); required(asset, 'Unfrozen asset reference.', 'artifact_source_changed'); return asset; } };
}
function publicJob(job) {
  if (!job) return null;
  return { id: job.id, status: job.status, attempts: job.attempts, errorCode: job.error_code || null, retryable: ['failed', 'stale'].includes(job.status) || job.status === 'running' && Date.parse(job.lease_until) <= Date.now(), retryAfter: job.status === 'running' ? job.lease_until : null };
}
async function readPackageBytes(pkg, objects) {
  required(pkg?.manifest && fingerprint(pkg.manifest) === pkg.package_hash, 'Frozen package manifest was changed.', 'artifact_integrity_failed');
  required(pkg.manifest.schemaVersion === 'order-review-package-v1' && pkg.manifest.purpose === 'review-candidate' && pkg.manifest.productionReady === false && pkg.manifest.orderId === pkg.order_id && pkg.manifest.sourceFingerprint === pkg.input_fingerprint && pkg.manifest.format === pkg.format_id, 'Package identity or readiness mismatch.', 'artifact_integrity_failed');
  required(pkg.manifest_path === `${pkg.order_id}/${pkg.input_fingerprint}/package-${pkg.package_hash}.json`, 'Invalid package manifest path.', 'artifact_integrity_failed');
  const bytes = {};
  for (const kind of ['interior', 'cover']) {
    const a = pkg.manifest.artifacts[kind];
    required(a && a.path === `${pkg.order_id}/${pkg.input_fingerprint}/${kind}-${a.sha256}.pdf` && /^[a-f0-9]{64}$/.test(a.sha256) && a.pageCount === (kind === 'interior' ? 32 : 1), 'Invalid frozen artifact reference.', 'artifact_integrity_failed');
    bytes[kind] = await objects.read(BUCKET, a.path);
    required(sha(bytes[kind]) === a.sha256 && bytes[kind].length === a.byteLength && bytes[kind].subarray(0, 5).toString() === '%PDF-', 'Frozen PDF bytes no longer match the reviewed package.', 'artifact_integrity_failed');
  }
  const manifestBytes = await objects.read(BUCKET, pkg.manifest_path);
  required(sha(manifestBytes) === pkg.package_hash, 'Stored package manifest does not match.', 'artifact_integrity_failed');
  return bytes;
}
function reviewView(value) { return value ? { status: value.status, packageHash: value.packageHash, reviewedAt: value.reviewedAt, notes: value.notes || null } : { status: 'ready' }; }
async function publicPackage(pkg, objects) {
  await readPackageBytes(pkg, objects);
  const artifact = async kind => ({ url: await objects.sign(pkg.manifest.artifacts[kind].path), sha256: pkg.manifest.artifacts[kind].sha256, byteLength: pkg.manifest.artifacts[kind].byteLength, pageCount: pkg.manifest.artifacts[kind].pageCount });
  return { id: pkg.id, packageHash: pkg.package_hash, status: pkg.status, format: pkg.format_id, reviewOnly: true, productionReady: false, blockers: pkg.manifest.blockers, interior: await artifact('interior'), cover: await artifact('cover'), customerApproval: reviewView(pkg.customer_review), adminApproval: reviewView(pkg.admin_review), expiresIn: TTL_SECONDS };
}
function service(deps = {}) {
  const db = deps.db || supabaseRequest, objects = deps.storage || storage(), prepare = deps.prepare || (order => prepareOrderInputs(order, { db, storage: objects })), render = deps.render || renderComposedBookPdf;
  const rpc = async (name, body) => { const result = await db(`/rpc/${name}`, { method: 'POST', body }); return Array.isArray(result) ? result[0] : result; };
  const getPackage = async id => (await db(`/order_artifact_packages?id=eq.${enc(id)}&select=*&limit=1`))[0];
  const getJob = async orderId => (await db(`/order_render_jobs?order_id=eq.${enc(orderId)}&select=*&order=updated_at.desc&limit=1`))[0];
  async function state(orderId) {
    const order = await loadOrder(orderId, db), job = await getJob(orderId);
    if (!order.active_artifact_package_id) return { order, artifact_job: publicJob(job), artifact_package: null, ...(job?.status === 'completed' ? { artifact_error: { code: 'artifact_source_changed', message: 'No current package is available. Render the current sources again.' } } : {}) };
    const pkg = await getPackage(order.active_artifact_package_id);
    try {
      required(pkg && pkg.order_id === order.id && pkg.status === 'ready' && pkg.order_revision === Number(order.artifact_revision || 0), 'This package is no longer current.', 'artifact_source_changed');
      const current = await prepare(order);
      required(current.inputFingerprint === pkg.input_fingerprint, 'Source files or personalization changed. Render a new package.', 'artifact_source_changed');
      const view = await publicPackage(pkg, objects);
      return { order, artifact_job: publicJob(job), artifact_package: view };
    } catch (err) {
      if (['artifact_source_changed', 'artifact_order_locked', 'artifact_monster_missing', 'artifact_story_missing'].includes(err.code)) {
        await rpc('invalidate_order_artifact_package', { p_order_id: order.id, p_package_id: pkg?.id || order.active_artifact_package_id, p_reason: err.code });
        return { order: { ...order, active_artifact_package_id: null }, artifact_job: publicJob(job), artifact_package: null, artifact_error: { code: err.code, message: 'The saved sources changed. Render a new candidate package.' } };
      }
      throw err;
    }
  }
  async function run(orderId) {
    const order = await loadOrder(orderId, db), prepared = await prepare(order), lease = crypto.randomUUID();
    if (order.active_artifact_package_id) {
      const previous = await getPackage(order.active_artifact_package_id);
      if (!previous || previous.input_fingerprint !== prepared.inputFingerprint || previous.order_revision !== Number(order.artifact_revision || 0)) {
        await rpc('invalidate_order_artifact_package', { p_order_id: order.id, p_package_id: order.active_artifact_package_id, p_reason: 'artifact_source_changed' });
      }
    }
    const claim = await rpc('claim_order_render_job', { p_order_id: order.id, p_revision: Number(order.artifact_revision || 0), p_input_fingerprint: prepared.inputFingerprint, p_source_snapshot: prepared.sourceSnapshot, p_lease_token: lease });
    required(claim?.job, 'The render job could not be claimed.', 'artifact_job_unavailable');
    if (!claim.claimed) return state(orderId);
    try {
      const rendered = await render({ ...prepared, purpose: 'review-candidate' });
      required(rendered.manifest?.productionReady === false && rendered.manifest.reviewOnly === true, 'Only a watermarked review renderer may publish candidate packages.', 'artifact_readiness_invalid');
      const chosen = order.format_id;
      const artifactBytes = { interior: Buffer.from(rendered.interior), cover: Buffer.from(rendered.covers[chosen]) };
      const artifacts = {};
      for (const kind of ['interior', 'cover']) {
        const bytes = artifactBytes[kind], description = rendered.manifest.artifacts[kind === 'interior' ? 'interior' : chosen];
        required(bytes.length <= MAX_BYTES, 'The candidate exceeds the existing 20 MiB proof limit.', 'artifact_size_limit');
        required(sha(bytes) === description.sha256 && bytes.length === description.byteLength, 'Renderer output does not match its exact byte manifest.', 'artifact_integrity_failed');
        const savedPath = `${order.id}/${prepared.inputFingerprint}/${kind}-${description.sha256}.pdf`;
        await objects.put(savedPath, bytes, 'application/pdf');
        artifacts[kind] = { ...description, path: savedPath };
      }
      const manifest = { schemaVersion: 'order-review-package-v1', purpose: 'review-candidate', reviewOnly: true, productionReady: false, orderId: order.id, orderRevision: Number(order.artifact_revision || 0), format: chosen, sourceFingerprint: prepared.inputFingerprint, personalizationFingerprint: prepared.personalizationFingerprint, renderFingerprint: rendered.manifest.renderFingerprint, rendererVersion: rendered.manifest.rendererVersion, compositionSha256: rendered.manifest.compositionSha256, sourceSnapshot: prepared.sourceSnapshot, artifacts, template: rendered.manifest.templates[chosen], blockers: rendered.manifest.blockers };
      const packageHash = fingerprint(manifest), manifestPath = `${order.id}/${prepared.inputFingerprint}/package-${packageHash}.json`;
      await objects.put(manifestPath, Buffer.from(canonicalJson(manifest)), 'application/json');
      const freshOrder = await loadOrder(orderId, db), fresh = await prepare(freshOrder);
      required(fresh.inputFingerprint === prepared.inputFingerprint && Number(freshOrder.artifact_revision || 0) === Number(order.artifact_revision || 0), 'The sources changed while rendering. Retry for the current version.', 'artifact_source_changed');
      await rpc('finish_order_render_job', { p_job_id: claim.job.id, p_lease_token: lease, p_package_hash: packageHash, p_manifest_path: manifestPath, p_manifest: manifest });
      return state(orderId);
    } catch (err) {
      // If the commit response was lost, the RPC never demotes a completed job.
      await rpc('fail_order_render_job', { p_job_id: claim.job.id, p_lease_token: lease, p_error_code: err.code || 'artifact_render_failed' }).catch(() => {});
      const current = await loadOrder(orderId, db), currentJob = await getJob(orderId);
      if (currentJob?.status === 'completed') {
        try { return await state(orderId); } catch { /* Preserve a visible integrity/storage failure below. */ }
      }
      return { order: current, artifact_job: publicJob(currentJob), artifact_package: null, artifact_error: { code: err.code || 'artifact_render_failed', message: err.code === 'artifact_source_changed' ? 'Sources changed during rendering. Render the current version again.' : err.code === 'artifact_size_limit' ? 'A candidate PDF exceeds the 20 MiB proof limit. Review source sizes or lossless PDF optimization before retrying.' : 'Rendering did not complete. Retry this job; no new approval or printing action was taken.' } };
    }
  }
  async function review(orderId, payload, role, actor) {
    required(['customer', 'administrator'].includes(role), 'Invalid review role.');
    const current = await state(orderId), pkg = current.artifact_package;
    required(pkg && pkg.id === payload.packageId && pkg.packageHash === payload.packageHash, 'This package changed. Refresh and review both exact files.', 'artifact_package_changed');
    required(['approve', 'request_changes'].includes(payload.action), 'Choose approve or request changes.', 'artifact_review_action_invalid');
    const notes = typeof payload.notes === 'string' ? payload.notes.trim().slice(0, 1000) : '';
    if (payload.action === 'request_changes') required(notes.length >= 3, 'Describe the changes needed.', 'artifact_revision_notes_required');
    await rpc('review_order_artifact_package', { p_order_id: orderId, p_package_id: pkg.id, p_package_hash: pkg.packageHash, p_revision: Number(current.order.artifact_revision || 0), p_role: role, p_action: payload.action, p_actor: actor, p_notes: notes });
    return state(orderId);
  }
  return { run, state, review };
}
async function listArtifactJobSummaries(orderIds, db = supabaseRequest) {
  if (!orderIds.length) return { available: true, jobs: {} };
  try {
    const rows = await db(`/order_render_jobs?order_id=in.(${orderIds.map(enc).join(',')})&select=id,order_id,status,attempts,error_code,lease_until,updated_at&order=updated_at.desc`);
    const jobs = {};
    for (const row of rows) if (!jobs[row.order_id]) jobs[row.order_id] = publicJob(row);
    return { available: true, jobs };
  } catch (err) {
    if (['42P01', 'PGRST205'].includes(err.code)) return { available: false, jobs: {} };
    throw err;
  }
}
module.exports = { listArtifactJobSummaries, BUCKET, MAX_BYTES, TTL_SECONDS, fingerprint, objectPath, storage, prepareOrderInputs, readPackageBytes, service, loadOrder };
