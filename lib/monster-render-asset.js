const crypto = require('node:crypto');
const sharp = require('sharp');

// Validate the proposed character BEFORE it becomes the selected/approved image.
// Never remove a background, redraw features, or replace an approved asset here.
async function validateMonsterRenderAsset(dataUrl) {
  const match = typeof dataUrl === 'string' && /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw assetError('The monster preview must be a transparent PNG.');
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw assetError('The monster preview is too large to review safely.');
  let image, metadata;
  try {
    image = sharp(bytes, { limitInputPixels: 16 * 1024 * 1024 });
    metadata = await image.metadata();
  } catch { throw assetError('The monster generator returned an unreadable PNG.'); }
  if (metadata.format !== 'png' || !metadata.hasAlpha || metadata.pages > 1) throw assetError('The generated preview has no usable transparent background. Create another version before selecting it.');
  if (metadata.width < 512 || metadata.height < 512) throw assetError('The generated character is too small. Create another version.');
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  let clear = 0, visible = 0;
  for (let i = info.channels - 1; i < data.length; i += info.channels) {
    if (data[i] <= 8) clear += 1;
    if (data[i] >= 128) visible += 1;
  }
  const pixels = info.width * info.height;
  if (clear / pixels < 0.01 || visible / pixels < 0.01) throw assetError('The generated preview needs a visible monster and a real transparent background. Create another version before selecting it.');
  return Object.freeze({
    sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    width: info.width, height: info.height, mimeType:'image/png', transparent:true,
    transparentFraction:Number((clear / pixels).toFixed(5)), status:'candidate',
    identityReviewRequired:true, productionReady:false,
  });
}
function setImageOutputFields(formData, background = 'opaque') {
  if (!['transparent','opaque'].includes(background)) throw new Error('Choose an explicit image background.');
  formData.append('output_format','png');
  formData.append('background',background);
}
function assetError(message) {
  return Object.assign(new Error(message), { status:422, code:'monster_render_asset_invalid' });
}
module.exports = { validateMonsterRenderAsset, setImageOutputFields };
