#!/usr/bin/env node
'use strict';
// Intentionally local-only. No uploads, API calls, approval writes, or printer jobs.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildHalloweenProofWithGeometry } = require('../lib/halloween-proof');
const { createLocalAssetResolver, renderComposedBookPdf } = require('../lib/composed-book-pdf');
const { loadVerifiedReviewTemplates } = require('../lib/lulu-cover-templates');
const ROOT = path.resolve(__dirname, '..');
async function main(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--out', '--monster', '--child', '--child-name', '--monster-name', '--composition', '--templates-dir', '--purpose'].includes(argv[i]) || !argv[i + 1]) throw new Error(`Unknown or incomplete option: ${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  const purpose = args.purpose || 'review-candidate';
  if (purpose !== 'review-candidate') throw new Error('Production export remains blocked. Only --purpose review-candidate is supported.');
  const bindings = {}, records = {};
  let composition;
  if (args.composition) composition = JSON.parse(await fs.readFile(path.resolve(ROOT, args.composition), 'utf8'));
  else {
    const monsterFile = path.resolve(ROOT, args.monster || 'assets/master-references/character-purple-storybook-style.jpg');
    const relative = path.relative(ROOT, monsterFile);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Monster image must be inside this repository.');
    const bytes = await fs.readFile(monsterFile);
    const ext = path.extname(monsterFile).toLowerCase();
    const mime = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp' }[ext];
    if (!mime) throw new Error('Use a local PNG, JPEG, or WebP monster file.');
    const monsterImage = `data:image/${mime};base64,${bytes.toString('base64')}`;
    bindings[monsterImage] = relative;
    records[monsterImage] = { status: 'unapproved-reference', usage: 'Exact selected local image; no regeneration, mirroring, or cutout substitution.' };
    composition = await buildHalloweenProofWithGeometry({
      personalization: { childName: args['child-name'] || 'Sample Alex', monsterName: args['monster-name'] || 'Moxie', childCharacter: args.child || 'warm-curly-dark' },
      selectedPreviewId: `local-review-${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 24)}`, monsterImage, format: 'softcover',
    });
  }
  const templates = await loadVerifiedReviewTemplates(args['templates-dir'] ? path.resolve(ROOT, args['templates-dir']) : undefined);
  const result = await renderComposedBookPdf({ composition, purpose, templates,
    assetResolver: createLocalAssetResolver({ root: ROOT, bindings, records }),
    fonts: { body: await fs.readFile(path.join(ROOT, 'assets/fonts/fredoka/Fredoka-Print-Regular.ttf')), heading: await fs.readFile(path.join(ROOT, 'assets/fonts/chewy/Chewy-Regular.ttf')) },
  });
  const output = path.resolve(ROOT, args.out || 'output/pdf/composed-review');
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, result.manifest.artifacts.interior.filename), result.interior);
  for (const format of ['softcover', 'hardcover']) await fs.writeFile(path.join(output, result.manifest.artifacts[format].filename), result.covers[format]);
  await fs.writeFile(path.join(output, 'review-candidate-manifest.json'), JSON.stringify(result.manifest, null, 2) + '\n');
  console.log(JSON.stringify({ output, artifactSetId: result.manifest.artifactSetId, productionReady: false, files: result.manifest.artifacts, blockers: result.manifest.blockers.map(b => b.code) }, null, 2));
  return result;
}
if (require.main === module) main().catch(error => { console.error(`Review export failed: ${error.message}`); process.exitCode = 1; });
module.exports = { main };
