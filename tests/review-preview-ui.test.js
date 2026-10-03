const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const script = fs.readFileSync(path.join(__dirname,'../scripts/review-preview.js'),'utf8');
const wait = () => new Promise(resolve => setTimeout(resolve,25));
function setup(mode) {
 const dom = new JSDOM('<main><input type="file" id="monster-upload"><input type="text" id="child-name"><input type="text" id="monster-name"><input type="email" id="interest-email"><input type="password" id="admin-password"><form id="storybook-interest-form"><button>Submit</button></form><div data-child-character-options><input type="radio" name="child" value="deep-braids-black" checked></div></main>', {url:'https://review.test/create.html',runScripts:'outside-only'});
 const calls=[]; dom.window.Response=Response;
 dom.window.fetch=async (input,init={}) => { calls.push({input:String(input),init}); if(String(input)==='/api/review-preview-status') return new Response(mode==='preview' ? JSON.stringify({synthetic:true,isolated:true}) : '{}',{status:mode==='preview'?200:mode==='production'?404:503,headers:{'Content-Type':'application/json'}}); return new Response('{}',{headers:{'Content-Type':'application/json'}}); };
 dom.window.eval(script); return {dom,calls};
}
test('confirmed preview disables private inputs and only sends canonical selection/format', async () => {
 const {dom,calls}=setup('preview'); try {
  await wait(); const {document}=dom.window;
  assert.match(document.querySelector('#review-preview-notice').textContent,/Synthetic review preview/);
  for(const id of ['monster-upload','child-name','monster-name','interest-email','admin-password']) assert.equal(document.getElementById(id).disabled,true,id);
  assert.equal(document.querySelector('#child-name').value,'Sample');
  assert.equal(document.querySelector('#open-sample-book').disabled,false);
  assert.equal(document.querySelector('input[type="radio"]').disabled,false);
  await dom.window.fetch('/api/halloween-proof',{method:'POST',headers:{Authorization:'SECRET'},body:JSON.stringify({monsterImage:'REAL_DRAWING',email:'REAL_EMAIL',format:'hardcover',personalization:{childName:'REAL_NAME',childCharacter:{id:'deep-braids-black'}}})});
  const last=calls.at(-1); assert.deepEqual(JSON.parse(last.init.body),{format:'hardcover',personalization:{childCharacter:{id:'deep-braids-black'}}}); assert.ok(!JSON.stringify(last).includes('REAL_')); assert.ok(!JSON.stringify(last).includes('SECRET'));
  const count=calls.length; const result=await dom.window.fetch('/api/convert-monster',{method:'POST',body:'REAL_DRAWING'}); assert.equal(result.status,403); assert.equal(calls.length,count);
  await dom.window.fetch('/api/storybook-interest?resource=orders',{headers:{'x-admin-password':'REAL_PASSWORD'}}); assert.ok(!JSON.stringify(calls.at(-1)).includes('REAL_PASSWORD'));
 } finally {dom.window.close();}
});
test('production 404 restores fields and original fetch behavior', async () => {
 const {dom,calls}=setup('production');try { await wait(); assert.equal(dom.window.document.querySelector('#child-name').disabled,false); assert.equal(dom.window.document.querySelector('#review-preview-notice'),null); await dom.window.fetch('/api/customer-order',{headers:{Authorization:'production-placeholder'}}); assert.equal(calls.at(-1).init.headers.Authorization,'production-placeholder'); }finally{dom.window.close();}
});
test('unknown mode fails closed and explains the temporary block', async () => {
 const {dom,calls}=setup('error');try {await wait(); assert.equal(dom.window.document.querySelector('#child-name').disabled,true);assert.match(dom.window.document.querySelector('#review-preview-notice').textContent,/could not be verified/);const count=calls.length;assert.equal((await dom.window.fetch('/api/storybook-checkout',{method:'POST'})).status,403);assert.equal(calls.length,count);}finally{dom.window.close();}
});
