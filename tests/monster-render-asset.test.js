const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { validateMonsterRenderAsset, setImageOutputFields } = require('../lib/monster-render-asset');
const { buildMonsterCharacterPrompt } = require('../lib/monster-style');
const dataUrl = bytes => `data:image/png;base64,${bytes.toString('base64')}`;
async function fixture(background, overlay = false) {
 const image = sharp({ create:{width:512,height:512,channels:4,background} });
 if (overlay) image.composite([{input:await sharp({create:{width:200,height:300,channels:4,background:'#7c4ea5'}}).png().toBuffer(),left:156,top:106}]);
 return image.png().toBuffer();
}
test('monster generation requests PNG transparency; coloring pages stay opaque', () => {
 const monster = new FormData(); setImageOutputFields(monster,'transparent');
 const coloring = new FormData(); setImageOutputFields(coloring);
 assert.equal(monster.get('background'),'transparent'); assert.equal(monster.get('output_format'),'png');
 assert.equal(coloring.get('background'),'opaque');
 assert.match(buildMonsterCharacterPrompt(), /transparent alpha background/);
 assert.doesNotMatch(buildMonsterCharacterPrompt(), /White background/);
 assert.match(buildMonsterCharacterPrompt(), /number of eyes, horns, arms, legs/);
});
test('valid transparent candidate is pinned without modifying its bytes or certifying its art', async () => {
 const bytes = await fixture({r:0,g:0,b:0,alpha:0},true);
 const before = Buffer.from(bytes);
 const result = await validateMonsterRenderAsset(dataUrl(bytes));
 assert.equal(result.transparent,true); assert.equal(result.width,512);
 assert.equal(result.status,'candidate'); assert.equal(result.productionReady,false);
 assert.equal(result.identityReviewRequired,true); assert.match(result.sourceSha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(bytes,before);
});
test('opaque rectangles, empty alpha canvases, tiny output and invalid data are refused before selection', async () => {
 for (const bytes of [await fixture('#fff'),await fixture({r:0,g:0,b:0,alpha:0}),await sharp({create:{width:20,height:20,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer(),Buffer.from('bad png')]) {
  await assert.rejects(validateMonsterRenderAsset(dataUrl(bytes)), error => error.status===422 && error.code==='monster_render_asset_invalid');
 }
 await assert.rejects(validateMonsterRenderAsset('https://untrusted.example/monster.png'));
});
