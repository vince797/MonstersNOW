const test=require('node:test');
const assert=require('node:assert/strict');
const {buildHalloweenProof}=require('../lib/halloween-proof');
const {layoutForPage,placementsForPage}=require('../lib/halloween-review-layouts');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
function book(){return buildHalloweenProof({personalization:{childName:'Sample',monsterName:'Fizz',childCharacter:'warm-curly-dark'},monsterImage:image,selectedPreviewId:'sample'});}
test('crowded scenes separate copy from the whole preserved illustration',()=>{
 for(const n of [6,7,8,9,14,17,18,21,24,26,27,28,29,30,31]){
  const r=layoutForPage(n);
  assert.equal(r.artBox.widthPt,r.artBox.heightPt);
  assert.ok(r.copyTopPt+14<=r.artBox.yPt);
 }
 for(const n of [12,16,22,23])assert.ok(layoutForPage(n).bodySize<=14);
});
test('garden heroes keep the star clear and stand on the lower path',()=>{
 for(const n of [23,25]){
  const {child,monster}=placementsForPage(n);
  assert.ok(child.x+child.scale/2<=70);
  assert.ok(monster.x+monster.scale/2<70);
  assert.ok(child.y>=90&&monster.y>=90);
 }
});
test('parade stays walking and home uses explicit sofa-seat contact',()=>{
 const pages=book().pages;
 assert.equal(pages[29].layers.find(l=>l.type==='child').pose,'garden');
 const child=pages[30].layers.find(l=>l.type==='child');
 assert.equal(child.pose,'seated-home');assert.equal(child.anchor.y,0.7);
 assert.equal(child.x,21);assert.equal(child.y,63);
 const monster=pages[30].layers.find(l=>l.type==='monster');
 assert.equal(monster.x,80);assert.equal(monster.y,95);
});

test('two-treat prop is pinned to the home tabletop and appears on no other page',()=>{
 const pages=book().pages, props=pages.flatMap(p=>p.layers.filter(l=>l.type==='prop').map(l=>({page:p.number,...l})));
 assert.equal(props.length,1);
 assert.equal(props[0].page,31);
 assert.equal(props[0].assetId,'home-two-treats-prop-candidate-v1');
 assert.equal(props[0].x,57);assert.equal(props[0].y,73);assert.equal(props[0].scale,15);
 assert.equal(props[0].anchor.y,0.91015625);assert.equal(props[0].mirror,false);
});
test('standing-only choices use real standing art, report missing poses, and stay on the home rug',()=>{
 const {CHILD_CHARACTERS}=require('../lib/child-characters');
 for(const preset of Object.values(CHILD_CHARACTERS).filter(p=>p.availablePoses.length===1)){
  const proof=buildHalloweenProof({personalization:{childName:'Sample',monsterName:'Fizz',childCharacter:preset.id},monsterImage:image,selectedPreviewId:'sample'});
  const home=proof.pages[30],child=home.layers.find(l=>l.type==='child');
  assert.equal(child.pose,'standing');assert.equal(child.requestedPose,'seated-home');
  assert.equal(child.y,95);assert.ok(child.anchor.y>0.9);
  assert.ok(home.reviewNotes.some(n=>n.includes('Scene pose pending')));
  assert.equal(proof.productionReady,false);
 }
});

test('page24 heroes remain below supporting faces with separate framed copy',()=>{
 const p=book().pages[23];
 assert.ok(p.renderLayout.artBox);
 const monster=p.layers.find(l=>l.type==='monster'),child=p.layers.find(l=>l.type==='child');
 assert.equal(monster.x,26);assert.equal(monster.y,96);assert.equal(monster.scale,36);
 assert.equal(child.x,73);assert.equal(child.y,95);assert.equal(child.scale,32);
 assert.ok(monster.y-monster.scale*1.15>54);
});

test('all story scenes explicitly specify larger heroes and keep full-page baselines in trim safety',()=>{
 for(let n=4;n<=31;n++){
  const p=placementsForPage(n);assert.ok(p,`page ${n}`);
  assert.ok(p.child.scale>=31);assert.ok(p.monster.scale>=34);
  if(!layoutForPage(n)?.artBox){assert.ok(630*(1-p.child.y/100)>=45);assert.ok(630*(1-p.monster.y/100)>=45);}
 }
});

test('the red-cushion star has a complete centered source window on page7',()=>{
 const p=book().pages[6];assert.equal(p.layers.find(l=>l.type==='background').crop,'center');
 const {buildHalloweenMasterPages}=require('../lib/halloween-master-pages');
 assert.equal(buildHalloweenMasterPages()[6].backgroundCrop,'center');
 const {normalizePages}=require('../lib/story-library');
 assert.equal(normalizePages([{text:'Sample',backgroundCrop:'center'}])[0].backgroundCrop,'center');
});
