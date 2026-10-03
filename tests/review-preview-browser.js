// Real-browser smoke of the deployed-preview code path, not the legacy harness.
const fs=require('node:fs'); const path=require('node:path'); const http=require('node:http'); const assert=require('node:assert/strict'); const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 process.env.VERCEL_ENV='preview'; const middleware=(await import('../middleware.ts')).default;
 const requests=[],errors=[],external=[];
 const server=http.createServer(async(req,res)=>{
  try {
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   if(req.url.startsWith('/api/'))requests.push({url:req.url,method:req.method,body:body.toString('utf8')});
   const request=new Request(`http://127.0.0.1${req.url}`,{method:req.method,...(!['GET','HEAD'].includes(req.method)&&body.length?{body}: {})});
   const response=await middleware(request);
   if(response){res.statusCode=response.status;for(const [k,v]of response.headers)res.setHeader(k,v);return res.end(Buffer.from(await response.arrayBuffer()));}
   const url=new URL(req.url,'http://localhost');const file=path.resolve(root,'.'+(url.pathname==='/'?'/create.html':url.pathname));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
   const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf'};res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
  }catch(error){res.statusCode=500;res.end(error.message);}
 });
 let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>{const url=route.request().url();if(!url.startsWith(base+'/')){external.push(url);return route.abort();}return route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const [format,child]of [['softcover','deep-braids-black'],['hardcover','light-wavy-blonde']]){
   await page.goto(base+'/create.html');await page.locator('#open-sample-book').waitFor();
   assert.equal(await page.locator('#monster-upload').isDisabled(),true);assert.equal(await page.locator('#child-name').isDisabled(),true);assert.equal(await page.locator('#interest-email').isDisabled(),true);
   assert.equal(await page.locator('[data-child-character-options] input[type=radio]').count(),9);
   await page.locator(`#child-character-${child}`).check();await page.locator('#review-preview-format').selectOption(format);await page.locator('#open-sample-book').click();await page.waitForURL('**/halloween-proof.html');
   await page.locator('#review-preview-notice').waitFor();assert.equal(await page.locator('.composed-proof-page').count(),32);assert.equal(await page.locator('#proof-checkout').isVisible(),false);assert.match(await page.locator('#proof-composition-notice').innerText(),new RegExp(format==='hardcover'?'Hardcover':'Softcover'));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.setViewportSize({width:1440,height:1000});
   await page.goBack();await page.locator('#open-sample-book').waitFor();
  }
  await page.goto(base+'/admin.html');await page.locator('#review-preview-notice').waitFor();assert.equal(await page.locator('#admin-password').isDisabled(),true);await page.locator('#admin-login-form button[type=submit]').click();await page.locator('[data-admin-view=orders]').click();await page.locator('.order-board-card').click();await page.locator('#order-composition-details summary').click();assert.equal(await page.locator('#order-composition-pages .composed-proof-page').count(),32);assert.equal(await page.locator('#send-order-lulu').isDisabled(),true);
  fs.mkdirSync(path.join(root,'tmp/preview-isolation'),{recursive:true});await page.screenshot({path:path.join(root,'tmp/preview-isolation/admin.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.ok(requests.every(r=>r.url==='/api/review-preview-status'||r.url==='/api/halloween-proof'||r.url.startsWith('/api/storybook-interest?')));
  for(const r of requests.filter(r=>r.method==='POST')){const payload=JSON.parse(r.body);assert.deepEqual(Object.keys(payload).sort(),['format','personalization']);assert.deepEqual(Object.keys(payload.personalization),['childCharacter']);}
  console.log('PASS: synthetic-only preview browser: eight characters + monster-only, both formats, 32 pages, disabled personal/upload/password fields, sample admin, no external/upload/generation/checkout/print requests or browser errors.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
