const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const originalEnv = process.env.VERCEL_ENV;
const middleware = import('../middleware.ts').then(m => m.default);
function req(route, method = 'GET', body) { return new Request(`https://review.test${route}`, { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type':'application/json' } } : {}) }); }
test.after(() => { if (originalEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = originalEnv; });
test('production and development behavior is unchanged', async () => {
 const route = await middleware;
 for (const mode of ['production', 'development']) { process.env.VERCEL_ENV = mode; assert.equal(await route(req('/api/convert-monster', 'POST', {})), undefined); }
});
test('unknown deployment environment also fails closed', async () => {
 delete process.env.VERCEL_ENV; const route = await middleware;
 assert.equal((await route(req('/api/convert-monster','POST'))).status,404);
});
test('all actual API files and aliases fail closed in preview without outbound calls', async () => {
 process.env.VERCEL_ENV = 'preview'; const route = await middleware;
 const originalFetch = global.fetch; global.fetch = () => { throw new Error('OUTBOUND CALL FORBIDDEN'); };
 try {
  for (const file of fs.readdirSync(path.join(__dirname, '../api')).filter(file => file !== 'review-preview-status.js')) {
   for (const suffix of ['', '.js']) {
    const name = file.replace(/\.js$/, '');
    const response = await route(req(`/api/${name}${suffix}?resource=customer-order`));
    assert.equal(response.status, 403, `${name}${suffix}`);
    assert.equal((await response.json()).code, 'review_preview_isolated');
   }
  }
  for (const target of ['/api/stripe-webhook','/api/stripe-test-webhook','/api/halloween-test-checkout','/api/halloween-checkout-status','/api/customer-order','/api/new-unknown-endpoint','/API/convert-monster','/%61pi/convert-monster','//api//convert-monster','/api/storybook-interest?resource=manuscript','/api/storybook-interest?resource=catalog-setup','/api/storybook-interest?resource=artwork','/api/storybook-interest?resource=story-proof']) {
   for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) assert.equal((await route(req(target, method))).status, 403, `${method} ${target}`);
  }
 } finally { global.fetch = originalFetch; }
});
test('synthetic routes never save or echo personal or uploaded data; no network service is called', async () => {
 process.env.VERCEL_ENV = 'preview'; const route = await middleware;
 const originalFetch = global.fetch; global.fetch = () => { throw new Error('OUTBOUND CALL FORBIDDEN'); };
 try {
  assert.equal(await route(req('/create.html')), undefined);
  const status = await (await route(req('/api/review-preview-status'))).json();
  assert.equal(status.isolated, true); assert.equal(status.rendererRuntimeVerified, false);
  const upload = await (await route(req('/api/monster-submissions','POST',{ drawing:'NEVER_SAVE_ME',childName:'NEVER_ECHO_ME' }))).json();
  assert.equal(upload.submission.id, '11111111-1111-4111-8111-111111111111');
  const gen = await route(req('/api/convert-monster','POST',{ drawing:'NEVER_SAVE_ME' }));
  assert.equal(gen.status, 200); const generated = await gen.json(); assert.equal(generated.synthetic,true); assert.match(generated.monsterImage,/^data:image\/png;base64,/);
  const approvedStyleFixture = fs.readFileSync(path.join(__dirname, '../assets/characters/candidates/sample-monster-v2/purple-wave-soft-plush-review.png'));
  assert.deepEqual(Buffer.from(generated.monsterImage.split(',')[1], 'base64'), approvedStyleFixture);
  const result = await route(req('/api/halloween-proof','POST',{ personalization:{ childName:'NEVER_ECHO_ME',monsterName:'NEVER_ECHO_ME',childCharacter:{id:'deep-braids-black'} },format:'softcover',monsterImage:'NEVER_SAVE_ME' }));
  assert.equal(result.status, 200); const json = await result.json();
  assert.equal(json.proof.childName,'Sample'); assert.equal(json.proof.monsterName,'Fizz'); assert.equal(json.proof.format,'softcover'); assert.equal(json.proof.pages.length,32); assert.equal(json.proof.reviewOnly,true); assert.equal(json.proof.productionReady,false);
  assert.match(json.proof.monsterImage, /sample-monster-v2\/purple-wave-soft-plush-review\.png$/);
  const monsterLayer = json.proof.pages[3].layers.find(layer => layer.type === 'monster');
  assert.equal(monsterLayer.scale, 46); assert.equal(monsterLayer.anchor.y, 1296 / 1376);
  assert.ok(!JSON.stringify(json).includes('NEVER_'));
  assert.ok(Buffer.byteLength(JSON.stringify(json)) < 512 * 1024);
  const orders = await (await route(req('/api/storybook-interest?resource=orders'))).json(); assert.equal(orders.orders[0].customer_email, 'sample@example.test');
  assert.equal(orders.orders[0].monster_assets.monsterGeometry.anchor.y, 1296 / 1376);
  assert.equal(orders.orders[0].monster_assets.selectedPreviewSha256, monsterLayer.alphaGeometry.sourceSha256);
  const books = await (await route(req('/api/storybook-interest'))).json();
  assert.equal(books.stories[0].pages[6].backgroundCrop, 'center', 'Admin fixture retains the complete star crop');
  assert.equal((await route(req('/api/storybook-interest?resource=orders','PATCH',{id:'sample-order'}))).status,403);
 } finally { global.fetch = originalFetch; }
});


test('each real API handler independently prevents production execution without middleware', async () => {
 process.env.VERCEL_ENV = 'preview';
 const originalFetch = global.fetch; let outbound = 0; global.fetch = () => { outbound++; throw new Error('OUTBOUND CALL FORBIDDEN'); };
 try {
  for (const file of fs.readdirSync(path.join(__dirname, '../api')).filter(file => file !== 'review-preview-status.js')) {
   const handler = require(path.join(__dirname, '../api', file));
   let status, data; const response = { setHeader(){}, status(value){ status=value; return this; }, json(value){ data=value; return this; } };
   await handler({ method:'GET', url:`/api/${file}?resource=customer-order`, query:{resource:'customer-order'}, headers:{} }, response);
   assert.equal(status,403,file); assert.equal(data.code,'review_preview_isolated',file);
  }
  assert.equal(outbound,0);
 } finally { global.fetch = originalFetch; }
});

test('direct handler invocation fails closed even if all deployment metadata is missing', async () => {
 const savedVercel=process.env.VERCEL,savedEnv=process.env.VERCEL_ENV;
 const savedFetch=global.fetch;delete process.env.VERCEL;delete process.env.VERCEL_ENV;
 global.fetch=()=>{throw new Error('OUTBOUND CALL FORBIDDEN');};
 try {
  const {guardReviewPreview}=require('../lib/review-preview-api-guard');
  let code,body;const response={setHeader(){},status(value){code=value;return this;},json(value){body=value;}};
  assert.equal(await guardReviewPreview({url:'/api/convert-monster',method:'POST'},response),true);
  assert.equal(code,404);assert.equal(body.synthetic,true);
 } finally {global.fetch=savedFetch;if(savedVercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=savedVercel;if(savedEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=savedEnv;}
});
