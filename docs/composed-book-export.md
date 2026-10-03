# Composed local PDF review export

This renderer produces actual illustrated PDF files from the same saved 32-page
composition used by review. It does not regenerate the monster, contact an image
API, access a remote URL, upload a file, approve art, or submit a printer job.

## Run

```sh
npm ci
npm run export:review
node scripts/render-review-pdf-previews.js
npm run test:pdf
```

The export command creates these local files in `output/pdf/composed-review/`:

- `interior-review-candidate.pdf`: 32 single pages, each 630 × 630 pt. MediaBox
  and BleedBox are 630 × 630 pt; TrimBox is 612 × 612 pt inset 9 pt.
- `paperback-cover-review-candidate.pdf`: one wrap cover, 1251.51 × 630 pt.
- `hardcover-cover-review-candidate.pdf`: one wrap cover, 1368 × 738 pt.
- `review-candidate-manifest.json`: exact source, rendition, font, template,
  renderer, composition, output-byte, and manifest SHA-256s; blocker and layout
  reports; selected identity; template geometry and provenance.

Every PDF has a visible `REVIEW CANDIDATE - NOT FOR PRINT` watermark. These are
not files approved for a customer order. The default synthetic sample names are
Sample Alex and Moxie. The warm-curly-dark four-pose child candidate is selected
by default; the synthetic monster selection ID derives from its exact source byte
hash, so selecting a different sample cannot reuse the previous identity. Its child source catalog still says `candidate`, not approved. The other
seven choices now use standing-only Soft 3D candidates. Missing walking/seated poses are labeled and remain production blockers. Page 31 uses an independent two-treat tabletop prop; background source bytes remain unchanged.

Options (values are required):

```sh
node scripts/export-review-book.js --child warm-curly-dark --child-name "Sample Alex" --monster-name "Moxie" --out output/pdf/my-local-review
node scripts/export-review-book.js --monster assets/my-local-monster.png --child none
node scripts/export-review-book.js --composition tmp/saved-local-composition.json
```

A saved composition passed through `--composition` must use local `/assets/`
image paths. For application integration with inline image sources, call the
module API and explicitly bind each source to its trusted local file. Bound
inline PNG/JPEG/WebP bytes must match the selected inline source exactly.
Nothing is fetched from a URL. There are deliberately no HTTP/API endpoints.

## Local module contract

```js
const { renderComposedBookPdf, createLocalAssetResolver } = require('../lib/composed-book-pdf');
const { loadVerifiedReviewTemplates } = require('../lib/lulu-cover-templates');
const result = await renderComposedBookPdf({
  purpose: 'review-candidate',
  composition: savedComposition,
  assetResolver: createLocalAssetResolver({
    root: absoluteRepositoryPath,
    bindings: { [savedInlineImageSource]: 'assets/local-selected-monster.png' },
    records: { /* trusted source provenance, never browser readiness claims */ },
  }),
  fonts: { body: bodyFontBytes, heading: headingFontBytes },
  templates: await loadVerifiedReviewTemplates(),
});
// result.interior and result.covers.softcover/hardcover are actual PDF Buffers.
// result.manifest.artifacts pins each exact immutable candidate byte sequence.
```

The resolver only reads regular files within its explicit realpath root. It
rejects traversal, missing files, symlinks escaping that root, and unbound
network/data URLs. SVGs must be local, self-contained, and script-free. The
renderer never delegates network requests to an image loader. Do not expose the
trusted resolver or filesystem root selection to a browser client.

The renderer checks 32 ordered pages, real copy, explicit layer crop and
placement, consistent exact monster source/ID, no mirroring, image dimensions,
font glyph support, and finite geometry. A missing declared asset fails the
whole export; it is never replaced by a generic illustration or shape. The
existing four front/closing pages have no declared background plate and retain
plain typography plus their declared image layers, with a missing-art blocker.

## Actual PDF review, rather than an HTML approximation

The browser composition is a layout review and is not pixel-identical to the
PDF. Both consume the same selected assets and text, but the PDF has fixed pages,
embedded fonts, safe copy areas, and binding-specific covers. Character scale
may be reduced deterministically to prevent art from running under the copy
panel. The manifest records that adjustment and the resolved bounds. Foot
baseline anchors and selected pose metadata are honored without mirroring.

Monster baseline geometry is derived from the exact selected PNG bytes using
`lib/monster-geometry.js`: alpha values of at least 128 define exclusive pixel
bounds, and the bottom bound divided by canvas height defines the anchor. This
measures opacity, not anatomical feet; faint shadows and unusual poses still
need visual review. Source bytes are never cropped, re-encoded, or replaced.
The decoder is bounded to 12 MiB and 16 megapixels. Opaque, unsupported, or
invalid legacy images keep the canvas baseline with an explicit review warning.

HTTP proof handlers and the local exporter use `buildHalloweenProofWithGeometry`.
Private order rendering derives geometry again from its frozen selected bytes;
admin display derives it from the owned selected storage path. A server-only
in-memory binding verifies source, preview identity, and bytes; browser-supplied,
copied, or inherited geometry cannot establish that trust. Serialized admin
metadata affects display only. Both display and PDF consume the resulting shared
layer anchor. If transparent padding forces a smaller PDF placement, the manifest
records `adjustedForTransparencyPadding` and adds a placement-review blocker.

`render-review-pdf-previews.js` first verifies the frozen files against their
SHA-256 and byte lengths, then uses Poppler to render those exact PDFs. Its
`pdf-preview-manifest.json` pins every PNG to both its source PDF SHA-256 and its
own PNG SHA-256. A future customer/admin exact-file viewer must show these
frozen PDF files or byte-derived images. Do not substitute the browser layout
when requesting approval of a print artifact fingerprint. This script does not
add such an approval workflow or host the files.

## Geometry and downloaded template provenance

The unchanged official calculator downloads live under `assets/lulu/templates/`.
They are reference inputs only. Their guide pages are never embedded or drawn.

| File | SHA-256 |
| --- | --- |
| paperback-32-square-premium-matte-template.pdf | `80971232a952f3f9ff835629cd4ff95ec228329571b34c45d22f0ffacb301db5` |
| hardcover-32-square-premium-matte-template.pdf | `dd6befef1beb7963f740ebd581ab4dbd5eb45b51364020880d29a12d234d4a2c` |

Source: official [Lulu print calculator](https://www.lulu.com/pricing), downloaded
October 3, 2026 for 32 interior pages, 8.5-inch square, premium color, 80# coated
white, matte. Package IDs are the existing `lib/lulu-products.js` values.

All coordinates are PDF points from the lower-left origin:

- Paperback: back x9–621, spine x621–630.51, front x630.51–1242.51; trim y9–621;
  bleed 9 pt; safety inset 36 pt inside trim. Front safe x666.51–1206.51, y45–585.
- Hardcover: full wrap 1368 × 738; outer wrap 45 pt; back board x45–675,
  spine x675–693, front board x693–1323; board y45–693. Front live safe
  x738–1278, y90–648. No paperback geometry is reused for case wrap.

The reader verifies the actual one-page template MediaBox, exact template hash,
SKU, binding, page count, ordered panels, and safe areas. This checked-in
geometry applies only to these exact files. A configurable future template must
supply its own verified geometry and matching PDF bytes/provenance. Never infer
cover dimensions from generic trim or assume all jobs use these templates.

## Resolution and typography

The 14 background originals remain untouched at 1774 × 887 px. Cropping a half
for a 630 pt square page yields 887 px across 8.75 inches: **101.371 native PPI**,
far below 300. Opaque background PDF renditions are JPEG quality 95, 4:4:4, at
native pixel dimensions; source and rendition hashes are separately recorded.
Cover art preserves aspect ratio and fills the wrap, with edge cropping where
needed. No upsampling is performed or treated as new image detail.

Selected JPEG monsters are embedded from the original bytes unchanged. PNG
alpha is retained. PDF PNG image streams are recompressed losslessly with standard
PNG predictors; RGB and alpha samples are round-trip verified and their decoded
pixel hashes are recorded. This reduces the sample interior below the existing
20 MiB customer proof cap without changing that cap or resizing character art.
WebP/SVG assets are decoded to lossless PNG with the exact
source pinned. When provenance records smaller original `nativeWidth` and
`nativeHeight` than the available pixels, PPI uses those smaller values and
`upscaledSource` stays true. Enlarged pixel dimensions alone can never clear
native-resolution blockers.

Chewy and Fredoka are embedded and Unicode-mapped. The PDF body uses a static
400-weight Fredoka instance generated from the repository's existing variable
font with fontTools at wght=400 and wdth=100. `Fredoka-Print-Regular.ttf` is
redistributable under the adjacent unchanged OFL license. Its bytes are pinned
in every manifest. Unsupported glyphs and overflowing copy cause errors rather
than missing text, tofu, tiny unreadable text, or clipping.

## Approval and production boundary

`purpose: 'production'`, missing purpose, caller readiness flags, and supplied
approval-shaped data are rejected. This implementation has no production mode.
It cannot establish production prerequisites simply by relabeling a candidate.
No existing checkout, approval, Lulu submission, or immutable-storage gate was
changed by this exporter.

Remaining production work includes final child/monster masters and matching
scene poses, transparent monster cutouts, native-resolution background masters,
complete front matter/original drawing layouts, foreground occlusion masks,
final cover art, independent prepress checks, actual physical proofing, exact
customer/admin artifact approvals, and trusted immutable artifact storage.
Existing `validateApprovedPrintArtifacts` remains the separate integrity
contract; this review schema is intentionally incompatible with an approved
production manifest.

## Reproducibility and verification

- Fixed PDF dates; canonical composition, art bytes, fonts, runtime versions,
  implementation source SHA, and template geometry determine the fingerprint.
- PDFs are hashed after serialization. The manifest hash excludes only its own
  `manifestSha256` field. Changed copy/art/fonts/templates/code changes the
  fingerprint and invalidates the candidate set.
- Tests reopen actual PDFs with pdf-lib, inspect all page boxes, read all story
  text and glyph bounds using Poppler, verify embedded fonts, compare repeated
  byte hashes, exercise both cover geometries, detect bad sources and template
  mutations, check fixtures/low-native-PPI/upscaled provenance, and reject
  spoofed production exports.
- Poppler-backed checks report skipped if Poppler is absent. They are not an
  independent print certification. Visual QA uses the rendered pages as well.

## Candidate image-size control

The original generated files are unchanged. For untagged 8-bit child candidates, the PDF rendition clears RGB only where alpha is exactly zero; every visible RGB and alpha sample is retained. The selected monster follows the exact original embedding path. The small tabletop prop is explicitly downsampled to 768×512 pixels for its PDF rendition, still far above 300 PPI at the current placement. The manifest records original-byte hashes, rendition hashes, decoded-pixel verification, native PPI and encoded-rendition PPI separately. A changed rendition changes the exact frozen PDF hashes. This keeps the four-pose review package within the unchanged 20 MiB private artifact limit without treating upsampling as real detail.
