# Halloween wheelchair production candidate v2

This candidate covers one synthetic profile only: `warm-curly-dark:5-6:wheelchair` (Maya). It does not approve or enable any other appearance, age, or accessibility combination.

## Interior scope

- 32 full-bleed interior pages at 2625 × 2625 px.
- 8.75 × 8.75 in PDF media box, yielding an 8.5 × 8.5 in trim with 0.125 in bleed on every edge.
- Page 1 title, page 2 provenance/original drawing, page 3 copyright, pages 4–31 story, and page 32 closing/original drawing.
- 32 character-free background candidates are rendered directly at 2625 × 2625 px. They are not enlarged from smaller bitmap backgrounds.
- The wheelchair child appears on every one of the 28 required story pages using 12 seated poses.

## Native and effective resolution

The compositor records source pixels, placed pixels, scale, and effective DPI for every child, monster, and original-drawing placement.

- No placed raster is enlarged: maximum raster scale is 1.0.
- Minimum recorded effective resolution is 300 DPI.
- Child pose sources are 483–683 px wide and are therefore kept at or below native size. The earlier review placed them at 928–980 px (roughly 152–209 effective DPI); v2 corrects that defect.
- Larry is 1024 × 1536 px and is downsampled at every placement.
- The approved gallery crop of the original drawing is 350 × 350 native pixels from the unchanged 588 × 1280 source. It is placed no larger than 350 × 350 and its aspect ratio is preserved.
- The PDF contains one 2625 × 2625, 8-bit DeviceRGB full-page image per page. Transparency is flattened when each page is converted to RGB.

The machine-readable evidence is in `docs/wheelchair-full-review-manifest.json` and `output/pdf/halloween-monster-night-wheelchair-production-candidate-v2.json`.

## Passed digital checks

- 32 pages and 28 required child pages.
- 12 distinct seated poses.
- Crop and safe-area checks on all placed art.
- Text-fit checks on all pages.
- Movement-neutral manuscript check.
- Native 300 DPI background check.
- At least 300 effective DPI for every placed raster.
- Original-drawing aspect-ratio check.
- PDF page count, media-box, embedded-image dimensions, RGB color space, and 8-bit component checks.

## Still required before enabling the wheelchair option

1. Human approval of all 32 background candidates and composed pages. Automated checks cannot approve art direction or composition.
2. Exact cover-spread dimensions from Lulu's cover-dimensions endpoint for each intended binding. Interior dimensions do not determine spine/case-wrap geometry.
3. A finished cover PDF using those provider dimensions.
4. Lulu sandbox validation of the exact final interior and cover URLs.
5. A separately authorized physical proof order and review for printed color, paper, binding, trim variance, gutter behavior, and legibility. No physical proof was ordered here.
6. Page-by-page production approval after any physical-proof corrections.

Until those gates pass, the customer editor remains honest: the wheelchair choice is visible but disabled, and live paid fulfillment remains off.
