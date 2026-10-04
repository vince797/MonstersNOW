const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const publicPages = ['index', 'about', 'books', 'monsters', 'create', 'contact', 'policies', 'privacy', 'terms', 'order', 'success', 'checkout-cancel'];

function contrast(a, b) {
  const luminance = hex => {
    const channels = hex.match(/[0-9a-f]{2}/gi).map(channel => {
      const value = parseInt(channel, 16) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const l = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l[0] + .05) / (l[1] + .05);
}

test('public headers and footers use selected, responsive MonstersNow.com artwork', () => {
  for (const page of publicPages) {
    const html = read(`${page}.html`);
    assert.match(html, /<body class="brand-theme">/, page);
    assert.match(html, /brand\.css\?v=20261004-selected-logo/, page);
    assert.match(html, /aria-label="MonstersNow\.com home"/, page);
    assert.match(html, /<source media="\(max-width: 520px\)" srcset="assets\/brand\/monstersnow-stacked-v1\.png" width="640" height="331"/, page);
    assert.match(html, /monstersnow-primary-v1\.png" alt="" width="960" height="228"/, page);
    assert.doesNotMatch(html, /monstersnow-logo-v2\.svg/, page);
    assert.match(html, /monstersnow-icon-32-v1\.png" type="image\/png" sizes="32x32"/, page);
    assert.match(html, /rel="apple-touch-icon" href="assets\/brand\/monstersnow-icon-180-v1\.png"/, page);
  }
});

test('brand raster dimensions and alpha match the production markup', () => {
  const manifest = JSON.parse(read('assets/brand/manifest.json'));
  for (const asset of manifest.assets) {
    const png = fs.readFileSync(path.join(root, asset.path));
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), asset.width);
    assert.equal(png.readUInt32BE(20), asset.height);
    assert.equal(png[25], 6, 'RGBA is retained for transparent marks');
    assert.ok(png.length < 200000, 'header assets remain web-sized');
  }
});

test('palette uses accessible foregrounds for buttons, links, and dark panels', () => {
  for (const [foreground, background] of [['291448', 'ff8a00'], ['291448', 'ffac47'], ['ffffff', '3b1d6d'], ['21c7c6', '3b1d6d'], ['3b1d6d', 'faf9f6'], ['ffffff', '006b70']]) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}: ${contrast(foreground, background)}`);
  }
  const css = read('brand.css');
  assert.match(css, /\.brand-theme \{[\s\S]*--brand-purple: #3b1d6d;[\s\S]*--brand-orange: #ff8a00;[\s\S]*--brand-teal: #21c7c6;/);
  assert.match(css, /\.brand-theme \.header-button::after \{ color: #291448; \}/);
  assert.doesNotMatch(css, /(?:^|\n):root\s*\{/);
});

test('private workspace receives logo-only styling without public palette inheritance', () => {
  const admin = read('admin.html');
  assert.match(admin, /<body class="admin-page">/);
  assert.doesNotMatch(admin, /brand-theme|storefront\.css/);
  assert.match(admin, /monstersnow-primary-v1\.png" alt="MonstersNow\.com"/);
  assert.match(admin, /monstersnow-stacked-v1\.png" alt="MonstersNow\.com"/);
  assert.match(admin, /id="admin-login-form"/);
});
