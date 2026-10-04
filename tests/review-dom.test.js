// DOM runtime coverage is separate from browser visual/layout verification.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { buildHalloweenProof } = require('../lib/halloween-proof');
const { image, selection, master, order } = require('./review-server');
const root = path.resolve(__dirname, '..');
const catalogSlugs = ['big-adventure','bedtime-monster','abc-monster-book','counting-with-my-monster','the-monster-who-lost-their-glow','birthday-monster-adventure'];
function runtime(file, prepare = () => {}) {
 const errors = [];
 const console = new VirtualConsole();
 console.on('jsdomError', e => { if (!/navigation|window.print/.test(e.message)) errors.push(e.message); });
 const dom = new JSDOM(fs.readFileSync(path.join(root,file),'utf8'), { url:`https://review.invalid/${file}`, runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:console });
 const { window } = dom;
 window.HTMLElement.prototype.scrollIntoView = function() {};
 window.matchMedia = () => ({ matches:false, addEventListener() {}, removeEventListener() {} });
 window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
 window.HTMLDialogElement.prototype.close = function() { this.open = false; };
 window.fetch = async () => { throw new Error('Network disabled in DOM tests'); };
 prepare(window);
 // Ordinary application tests use the non-preview status contract. Synthetic
 // preview isolation has its own suite and must not hijack these fixtures.
 const fixtureFetch = window.fetch;
 window.Response = global.Response; window.Request = global.Request;
 window.fetch = (url, options) => new URL(url, 'https://review.invalid').pathname === '/api/review-preview-status'
   ? Promise.resolve({ok:false,status:404,json:async()=>({error:'Not found'})}) : fixtureFetch(url, options);
 for (const script of window.document.querySelectorAll('script[src]')) {
  const src = script.getAttribute('src').split('?')[0];
  if (/^https?:/.test(src)) throw new Error('External script forbidden in local test');
  window.eval(fs.readFileSync(path.join(root,src),'utf8'));
 }
 return { dom, window, errors };
}

test('create HTML scripts initialize all nine choices and forward the canonical selected candidate', () => {
 const { dom, window, errors } = runtime('create.html');
 try {
  const input = window.document.querySelector('#child-character-warm-curly-dark');
  assert.equal(window.document.querySelectorAll('input[name="child-character"]').length,9);
  input.checked = true;
  input.dispatchEvent(new window.Event('change', { bubbles:true }));
  assert.equal(window.getSelectedChildCharacter().id,'warm-curly-dark');
  assert.equal(window.getSelectedChildCharacter().asset.status,'candidate');
  assert.equal(window.document.querySelectorAll('.child-character-option.is-selected').length,1);
  assert.equal(window.document.querySelector('#child-character-selection').textContent,'Curly dark');
  assert.equal(window.sessionStorage.getItem('monstersnow.child-character.v1'),'warm-curly-dark');
  assert.deepEqual(errors,[]);
 } finally { dom.window.close(); }
});

test('actual proof HTML renders all 32 composed pages and never exposes paid checkout', () => {
 const proof = buildHalloweenProof({ ...selection, personalization:{ ...selection.personalization, childCharacter:{id:'warm-curly-dark'} } });
 const { dom, window, errors } = runtime('halloween-proof.html', w => w.sessionStorage.setItem('monstersnow_halloween_test_proof',JSON.stringify({proof,submission:selection})));
 try {
  const doc = window.document;
  assert.equal(doc.querySelectorAll('.composed-proof-page').length,32);
  assert.equal(doc.querySelectorAll('.composition-child').length,28);
  assert.equal(doc.querySelectorAll('.composition-background').length,28);
  assert.equal(doc.querySelectorAll('.composition-prop').length,1);
  const prop = doc.querySelector('[data-page-number="31"] .composition-prop');
  assert.equal(prop.style.top,'73%');
  assert.match(prop.querySelector('img').src,/two-wrapped-treats.png$/);
  assert.match(doc.querySelector('[data-page-number="23"] .composition-child img').src,/garden-quiet.png$/);
  assert.equal(doc.querySelector('#proof-checkout').hidden,true);
  assert.match(doc.querySelector('[data-page-number="31"] .composition-child img').src,/seated-home\.png$/);
  assert.match(doc.querySelector('#proof-composition-notice').textContent,/awaiting approval/);
  assert.ok(doc.querySelector('[data-page-number="7"] .composition-background.crop-center'));
  assert.deepEqual(errors,[]);
 } finally { dom.window.close(); }
});

test('failed images and pre-compositor saved proofs are visible review exceptions', () => {
 const proof = buildHalloweenProof(selection);
 const first = runtime('halloween-proof.html', w => w.sessionStorage.setItem('monstersnow_halloween_test_proof',JSON.stringify({proof,submission:selection})));
 try {
  first.window.document.querySelector('.composition-monster img').dispatchEvent(new first.window.Event('error'));
  assert.match(first.window.document.querySelector('.composition-missing').textContent,/monster image unavailable/);
  assert.equal(first.window.document.querySelector('#proof-checkout').hidden,true);
 } finally { first.dom.window.close(); }
 const second = runtime('halloween-proof.html', w => w.sessionStorage.setItem('monstersnow_halloween_test_proof',JSON.stringify({proof:{pages:Array(32).fill({})},submission:selection})));
 try {
  assert.match(second.window.document.querySelector('#proof-status').textContent,/build a new proof/);
  assert.equal(second.window.document.querySelector('#proof-checkout').hidden,true);
  assert.equal(second.window.document.querySelectorAll('.composed-proof-page').length,0);
 } finally { second.dom.window.close(); }
});

test('existing admin runtime opens the synthetic order and reuses composed pages without duplicate content', async () => {
 const calls = [];
 const { dom, window, errors } = runtime('admin.html', w => {
  w.sessionStorage.setItem('monstersnow_admin_password','synthetic-local-test');
  w.fetch = async (url, options) => {
   calls.push({url,options});
   assert.equal(options.method || 'GET','GET');
   if (url.endsWith('/production-status.json')) return { ok:true, json:async () => JSON.parse(fs.readFileSync(path.join(root,url),'utf8')) };
   const resource = new URL(url,'https://review.invalid').searchParams.get('resource');
   return { ok:true, json: async () => resource === 'orders' ? {orders:[order]} : resource === 'monsters' ? {monsters:[]} : { stories:[master,...catalogSlugs.map(slug => ({...master,id:slug,slug,pages:[]}))] } };
  };
 });
 try {
  for (let n=0;n<8;n++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(window.document.querySelector('#admin-app').hidden,false);
  window.document.querySelector('[data-admin-view="orders"]').click();
  window.document.querySelector('.order-board-card').click();
  const dialog = window.document.querySelector('#order-detail');
  assert.equal(dialog.open,true);
  assert.equal(window.document.querySelectorAll('#order-composition-pages .composed-proof-page').length,32);
  assert.equal(window.document.querySelector('#send-order-lulu').disabled,true);
  assert.match(window.document.querySelector('#order-composition-notice').textContent,/current-master review/);
  window.document.querySelector('#order-composition-details').open=true;
  window.document.querySelector('#close-order-detail').click();
  assert.equal(dialog.open,false);
  window.document.querySelector('.order-board-card').click();
  assert.equal(window.document.querySelector('#order-composition-details').open,false);
  assert.equal(window.document.querySelectorAll('#order-composition-pages .composed-proof-page').length,32);
  assert.equal(calls.filter(call => call.url.startsWith('/api/')).length,3);
  assert.deepEqual(errors,[]);
 } finally { dom.window.close(); }
});

test('double submission makes one proof request, and a failed build can be retried safely', async () => {
 let releaseSave, saveCalls = 0, proofCalls = 0;
 const { dom, window } = runtime('create.html', w => {
  w.fetch = async (url, options) => {
   if (url === '/api/monster-submissions') {
    if (options.method === 'POST') return {ok:true,json:async () => ({submission:{id:'synthetic-submission',token:'synthetic-local-only'}})};
    saveCalls += 1;
    if (saveCalls === 1) await new Promise(resolve => { releaseSave = resolve; });
    return {ok:true,json:async () => ({submission:{id:'synthetic-submission'}})};
   }
   assert.equal(url,'/api/halloween-proof'); proofCalls += 1;
   if (proofCalls === 1) return {ok:false,json:async () => ({error:'Synthetic build failure; retry allowed.'})};
   const payload=JSON.parse(options.body);
   return {ok:true,json:async () => ({proof:buildHalloweenProof(payload),proofToken:'synthetic-no-checkout'})};
  };
 });
 try {
  const doc=window.document;
  doc.querySelector('#child-name').value='Sample'; doc.querySelector('#monster-name').value='Fizz';
  doc.querySelector('#interest-email').value='sample@example.test';
  await window.ensureMonsterSubmission(image);
  window.addGeneratedPreview({id:'synthetic-preview',image,style:'storybook',mode:'ai'});
  window.selectGeneratedPreview('synthetic-preview');
  doc.querySelector('#confirm-monster').click();
  const event={preventDefault(){}};
  const first=window.handleStorybookInterestSubmit(event);
  await window.handleStorybookInterestSubmit(event);
  assert.equal(saveCalls,1); assert.equal(proofCalls,0);
  assert.equal(doc.querySelector('#storybook-interest').disabled,true);
  releaseSave(); await first;
  assert.equal(proofCalls,1); assert.equal(doc.querySelector('#storybook-interest').disabled,false);
  assert.match(doc.querySelector('#interest-status').textContent,/retry allowed/);
  await window.handleStorybookInterestSubmit(event);
  assert.equal(saveCalls,2); assert.equal(proofCalls,2);
  const saved=JSON.parse(window.sessionStorage.getItem('monstersnow_halloween_test_proof'));
  assert.equal(saved.proof.pages.length,32); assert.equal(saved.proof.reviewOnly,true);
 } finally { dom.window.close(); }
});

function customerPackage(hash = 'a'.repeat(64)) {
 return {id:'package-1',packageHash:hash,status:'current',format:'hardcover',productionReady:false,
  interior:{url:'https://storage.example.test/private/interior?token=one',sha256:'b'.repeat(64)},cover:{url:'https://storage.example.test/private/cover?token=two',sha256:'c'.repeat(64)},customerApproval:{status:'pending'},adminApproval:{status:'pending'},blockers:['Art approval pending']};
}
function customerOrder(pkg) { return {reference:'sample-order',childName:'Sample',storyLabel:'Halloween Monster Night',format:'hardcover',amountCents:3999,currency:'USD',status:'proofing',paymentIssue:null,proof:{status:'ready',package:pkg}}; }

test('customer reviews exact separate files and approval cannot carry onto a new package', async () => {
 const pkg=customerPackage(), calls=[];
 const {dom,window,errors}=runtime('order.html',w => {
  w.sessionStorage.setItem('monstersnow_order_access','mn_order_synthetic');
  w.fetch=async(url,options={}) => {
   calls.push({url,options});
   if(options.method==='POST') return {ok:true,json:async()=>({order:customerOrder({...pkg,customerApproval:{status:'approved'}})})};
   return {ok:true,json:async()=>({order:customerOrder(pkg)})};
  };
 });
 try {
  for(let n=0;n<4;n++) await new Promise(resolve=>setImmediate(resolve));
  const doc=window.document;
  assert.equal(doc.querySelector('#customer-proof-open').hidden,true);
  assert.equal(doc.querySelector('#customer-proof-package-links').hidden,false);
  assert.match(doc.querySelector('#customer-package-interior').href,/private\/interior/);
  assert.match(doc.querySelector('#customer-package-cover').href,/private\/cover/);
  assert.equal(doc.querySelector('#customer-proof-form').hidden,false);
  doc.querySelector('#customer-proof-approved').checked=true;
  await window.submitProofResponse('approve');
  const sent=JSON.parse(calls.find(c=>c.options.method==='POST').options.body);
  assert.equal(sent.packageId,pkg.id);assert.equal(sent.packageHash,pkg.packageHash);assert.equal(sent.fingerprint,undefined);
  assert.match(doc.querySelector('#customer-proof-title').textContent,/exact candidate/);
  assert.equal(doc.querySelector('#customer-proof-approve').hidden,true);
  assert.equal(doc.querySelector('#customer-proof-request').hidden,false);
  window.renderOrder(customerOrder(customerPackage('d'.repeat(64))));
  assert.equal(doc.querySelector('#customer-proof-approved').checked,false);
  assert.equal(doc.querySelector('#customer-proof-approve').hidden,false);
  assert.match(doc.querySelector('#customer-package-state').textContent,/dddddddddddddddd/);
  assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});

test('stale packages and unavailable or unsafe PDF links cannot be approved', async()=>{
 const {dom,window}=runtime('order.html');
 try{
  for(const pkg of [{...customerPackage(),status:'superseded'},{...customerPackage(),interior:{url:'javascript:alert(1)'}}]){
   window.renderOrder(customerOrder(pkg));
   assert.equal(window.document.querySelector('#customer-proof-form').hidden,true);
   assert.equal(window.document.querySelector('#customer-package-interior').hasAttribute('href'),false);
  }
 }finally{dom.window.close();}
});

test('master editor exposes persistent scene-pose and background-half controls', async () => {
 const {dom,window,errors}=runtime('admin.html');
 try{
  await new Promise(resolve=>setImmediate(resolve));
  window.editStory(master);
  const card=window.document.querySelector('.story-page-card');
  const pose=card.querySelector('[data-child-pose]'),crop=card.querySelector('[data-background-crop]');
  assert.ok(pose);assert.ok(crop);
  pose.value='seated-home';pose.dispatchEvent(new window.Event('change',{bubbles:true}));
  crop.value='right';crop.dispatchEvent(new window.Event('change',{bubbles:true}));
  const data=window.pageData(card);
  assert.equal(data.childPose,'seated-home');assert.equal(data.backgroundCrop,'right');
  assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});

test('admin allows retry after an expired render lease and resets exact-package acknowledgment', async () => {
 const {dom,window}=runtime('admin.html');
 try{
  await new Promise(resolve=>setImmediate(resolve));
  const pkg=customerPackage();pkg.customerApproval={status:'approved'};
  const saved={...order,artifact_job:{id:'job',status:'running',retryable:true},artifact_package:pkg};
  window.renderArtifactPackage(saved);
  assert.equal(window.document.querySelector('#render-order-artifacts').disabled,false);
  assert.match(window.document.querySelector('#render-order-artifacts').textContent,/Retry/);
  window.document.querySelector('#artifact-reviewed').checked=true;window.renderArtifactPackage(saved);
  assert.equal(window.document.querySelector('#approve-artifact-package').disabled,false);
  window.renderArtifactPackage({...saved,artifact_package:{...pkg,packageHash:'f'.repeat(64)}});
  assert.equal(window.document.querySelector('#artifact-reviewed').checked,false);
  assert.equal(window.document.querySelector('#approve-artifact-package').disabled,true);
 }finally{dom.window.close();}
});

test('customer approval stays closed when either reviewer requested revisions or server canApprove is false', async()=>{
 const {dom,window}=runtime('order.html');
 try{
  const pkg={...customerPackage(),adminApproval:{status:'changes_requested'}};
  window.renderOrder({...customerOrder(pkg),proof:{status:'ready',canApprove:false,package:pkg}});
  assert.equal(window.document.querySelector('#customer-proof-form').hidden,true);
  assert.match(window.document.querySelector('#customer-proof-title').textContent,/revised file package/);
  window.document.querySelector('#customer-proof-approved').checked=true;
  await window.submitProofResponse('approve');
  assert.match(window.document.querySelector('#customer-proof-status').textContent,/needs revision/);
  window.renderOrder({...customerOrder(customerPackage()),proof:{status:'ready',canApprove:false,package:customerPackage()}});
  assert.equal(window.document.querySelector('#customer-proof-form').hidden,true);
 }finally{dom.window.close();}
});

const settleAdmin = async () => { for (let n = 0; n < 8; n++) await new Promise(resolve => setImmediate(resolve)); };
function adminResourceFixture(w, respond, calls) {
 w.sessionStorage.setItem('monstersnow_admin_password', 'synthetic-local-test');
 w.fetch = async (url, options = {}) => {
  if (url.endsWith('/production-status.json')) return { ok:true, json:async () => JSON.parse(fs.readFileSync(path.join(root,url),'utf8')) };
  const resource = new URL(url,'https://review.invalid').searchParams.get('resource') || 'stories';
  calls.push({resource, method: options.method || 'GET'});
  return respond(resource);
 };
}
const adminOk = payload => ({ok:true,status:200,json:async()=>payload});
const adminFailure = (code = 'PGRST301', error = 'JWT issued at future') => ({ok:false,status:401,json:async()=>({code,error})});
const savedMonsterFixtures = [1,2,3].map(n => ({id:`sample-${n}`,monsterName:`Sample monster ${n}`,status:'ready',orders:[],createdAt:'2026-10-03T00:00:00Z'}));

test('orders failure preserves the three loaded monsters and retries only failed reads without duplicate requests', async () => {
 const calls = []; let orderReady = false, releaseRetry;
 const {dom,window,errors} = runtime('admin.html', w => adminResourceFixture(w, resource => {
  if (resource === 'orders') {
   if (!orderReady) return adminFailure();
   return new Promise(resolve => { releaseRetry = () => resolve(adminOk({orders:[]})); });
  }
  return adminOk(resource === 'monsters' ? {monsters:savedMonsterFixtures} : {stories:[]});
 }, calls));
 try {
  await settleAdmin(); const doc = window.document;
  assert.equal(doc.querySelector('#admin-app').hidden,false);
  assert.equal(doc.querySelector('#admin-login').hidden,true);
  assert.equal(doc.querySelectorAll('.monster-library-card').length,3);
  assert.equal(doc.querySelector('#nav-order-count').textContent,'—');
  assert.equal(doc.querySelector('#metric-orders').textContent,'—');
  assert.match(doc.querySelector('#orders-empty').textContent,/could not be loaded/);
  assert.match(doc.querySelector('#customers-empty').textContent,/could not be loaded/);
  assert.match(doc.querySelector('#admin-data-status').textContent,/Orders and customers unavailable/);
  assert.equal(window.sessionStorage.getItem('monstersnow_admin_password'),'synthetic-local-test');
  assert.deepEqual(calls,[{resource:'stories',method:'GET'},{resource:'orders',method:'GET'},{resource:'monsters',method:'GET'}]);
  doc.querySelector('[data-admin-view="monsters"]').click();
  orderReady = true;
  doc.querySelector('#retry-admin-sections').click();
  doc.querySelector('#retry-admin-sections').click();
  await settleAdmin(); assert.equal(calls.length,4);
  releaseRetry(); await settleAdmin();
  assert.equal(doc.querySelector('#admin-data-status').hidden,true);
  assert.equal(doc.querySelector('#admin-connection-state').textContent,'Connected');
  assert.equal(doc.querySelector('#monsters-admin').hidden,false);
  assert.equal(doc.querySelectorAll('.monster-library-card').length,3);
  assert.equal(doc.querySelector('#nav-order-count').textContent,'0');
  assert.match(doc.querySelector('#orders-empty').textContent,/No orders yet/);
  assert.ok(calls.every(call => call.method === 'GET'));
  assert.deepEqual(errors,[]);
 } finally {dom.window.close();}
});

test('unavailable monsters are distinguished from an empty library and available books remain usable', async () => {
 const calls = [];
 const {dom,window,errors} = runtime('admin.html', w => adminResourceFixture(w, resource => resource === 'monsters' ? adminFailure() : adminOk(resource === 'orders' ? {orders:[]} : {stories:[master]}), calls));
 try {
  await settleAdmin(); const doc = window.document;
  assert.equal(doc.querySelector('#admin-app').hidden,false);
  assert.equal(doc.querySelector('#monster-metric-total').textContent,'—');
  assert.equal(doc.querySelector('#nav-monster-count').textContent,'—');
  assert.match(doc.querySelector('#monsters-empty').textContent,/could not be loaded/);
  assert.doesNotMatch(doc.querySelector('#monsters-empty').textContent,/No saved monsters/);
  doc.querySelector('#monster-search').value='test';
  doc.querySelector('#monster-search').dispatchEvent(new window.Event('input'));
  assert.match(doc.querySelector('#monsters-status').textContent,/unavailable, not empty/);
  assert.equal(doc.querySelectorAll('.story-list-item').length,1);
  assert.ok(calls.every(call=>call.method==='GET'));
  assert.deepEqual(errors,[]);
 } finally {dom.window.close();}
});

test('books failure does not hide a successful monster library or silently create a catalog', async () => {
 const calls = [];
 const {dom,window,errors} = runtime('admin.html', w => adminResourceFixture(w, resource => resource === 'stories' ? adminFailure() : adminOk(resource === 'orders' ? {orders:[]} : {monsters:savedMonsterFixtures}), calls));
 try {
  await settleAdmin(); const doc=window.document;
  assert.equal(doc.querySelector('#admin-app').hidden,false);
  assert.equal(doc.querySelectorAll('.monster-library-card').length,3);
  assert.match(doc.querySelector('#story-empty').textContent,/could not be loaded/);
  assert.equal(doc.querySelector('#metric-published').textContent,'—');
  assert.match(doc.querySelector('#attention-list').textContent,/Some checks unavailable/);
  assert.ok(calls.every(call=>call.method==='GET'));
  assert.deepEqual(errors,[]);
 } finally {dom.window.close();}
});

test('a shared database rejection keeps login recoverable without blaming the device or prescribing key rotation', async () => {
 const calls=[];
 const {dom,window,errors}=runtime('admin.html',w=>adminResourceFixture(w,()=>adminFailure(),calls));
 try {
  await settleAdmin();const doc=window.document;
  assert.equal(doc.querySelector('#admin-app').hidden,true);
  assert.equal(doc.querySelector('#admin-login').hidden,false);
  assert.equal(doc.querySelector('#admin-login-form button[type="submit"]').disabled,false);
  assert.equal(window.sessionStorage.getItem('monstersnow_admin_password'),'synthetic-local-test');
  assert.match(doc.querySelector('#admin-login-status').textContent,/does not use your device clock/);
  assert.doesNotMatch(doc.querySelector('#admin-login-status').textContent,/update.*key|rotate|incorrect password/i);
  assert.deepEqual(errors,[]);
 } finally {dom.window.close();}
});

test('an explicit rejected admin password blocks all partial results and removes the session', async () => {
 const calls=[];
 const {dom,window,errors}=runtime('admin.html',w=>adminResourceFixture(w,resource=>resource==='orders'?adminFailure('invalid_admin_password','Incorrect admin password.'):adminOk(resource==='stories'?{stories:[]}:{monsters:savedMonsterFixtures}),calls));
 try {
  await settleAdmin();const doc=window.document;
  assert.equal(doc.querySelector('#admin-app').hidden,true);
  assert.equal(doc.querySelector('#admin-login').hidden,false);
  assert.equal(doc.querySelectorAll('.monster-library-card').length,0);
  assert.equal(window.sessionStorage.getItem('monstersnow_admin_password'),null);
  assert.match(doc.querySelector('#admin-login-status').textContent,/password wasn’t accepted/);
  assert.deepEqual(errors,[]);
 } finally {dom.window.close();}
});

test('signing out during a section retry prevents the delayed response from reopening private data', async () => {
 const calls=[];let delayed=false,release;
 const {dom,window,errors}=runtime('admin.html',w=>adminResourceFixture(w,resource=>{
  if(resource==='orders') return delayed?new Promise(resolve=>{release=()=>resolve(adminOk({orders:[order]}));}):adminFailure();
  return adminOk(resource==='stories'?{stories:[]}:{monsters:savedMonsterFixtures});
 },calls));
 try {
  await settleAdmin();const doc=window.document;
  delayed=true;doc.querySelector('#retry-admin-sections').click();await settleAdmin();
  doc.querySelector('#admin-sign-out').click();release();await settleAdmin();
  assert.equal(doc.querySelector('#admin-app').hidden,true);
  assert.equal(doc.querySelector('#admin-login').hidden,false);
  assert.equal(window.sessionStorage.getItem('monstersnow_admin_password'),null);
  assert.equal(doc.querySelectorAll('.monster-library-card,.order-board-card').length,0);
  assert.equal(doc.querySelector('#admin-login-status').textContent,'Signed out.');
  assert.deepEqual(errors,[]);
 } finally {dom.window.close();}
});

test('monster order summaries cannot open an editable order until complete order data loads', async () => {
 const calls=[]; let orderReady=false;
 const linkedMonster={...savedMonsterFixtures[0],orders:[{id:order.id,story_label:'Sample summary',status:'proofing',created_at:order.created_at}]};
 const {dom,window,errors}=runtime('admin.html',w=>adminResourceFixture(w,resource=>{
  if(resource==='orders') return orderReady?adminOk({orders:[{...order,notes:'Preserve these production notes'}]}):adminFailure();
  return adminOk(resource==='stories'?{stories:[master]}:{monsters:[linkedMonster]});
 },calls));
 try {
  await settleAdmin();const doc=window.document;
  let button=[...doc.querySelectorAll('.monster-library-actions button')].find(b=>b.textContent==='View connected book');
  assert.equal(button.disabled,true); button.click();
  assert.equal(doc.querySelector('#order-detail').open,false);
  assert.ok(calls.every(call=>call.method==='GET'));
  orderReady=true;doc.querySelector('#retry-admin-sections').click();await settleAdmin();
  button=[...doc.querySelectorAll('.monster-library-actions button')].find(b=>b.textContent==='View connected book');
  assert.equal(button.disabled,false);button.click();
  assert.equal(doc.querySelector('#order-detail').open,true);
  assert.equal(doc.querySelector('#order-detail-notes').value,'Preserve these production notes');
  assert.deepEqual(errors,[]);
 } finally {dom.window.close();}
});
