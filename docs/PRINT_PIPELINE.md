# Print pipeline (personalized interior + cover PDFs)

This pipeline turns one master story plus one order (child character,
selected monster preview, and names) into the two files Lulu prints:

- **Interior**: one PDF page per book page, each with full bleed.
- **Cover**: a single-page wrap (back + spine + front) for softcover or
  hardcover.

Halloween Monster Night is the first configured book and the pipeline test
book. Other books use the same code, and each can add a small config.

## What the files contain

| | Interior | Softcover cover (32 pp) | Hardcover cover (32 pp) |
|---|---|---|---|
| Lulu package | `0850X0850.FC.PRE.PB.080CW444.MXX` | same | `0850X0850.FC.PRE.CW.080CW444.MXX` |
| Trim | 8.5 x 8.5 in | | |
| Page / spread size | 8.75 x 8.75 in (630 x 630 pt) | 17.382 x 8.750 in | 19.000 x 10.250 in |
| Bleed / wrap | 0.125 in on every side | 0.125 in | 0.75 in wrap, 0.125 in board overhang |
| Spine | | pages / 444 + 0.06 in = 0.1321 in | 0.25 in (Lulu table for 24–84 pp) |
| Safety | 0.5 in inside trim (+ gutter for >60 pp) | 0.5 in per panel | 0.5 in per panel |
| Raster | one 2625 x 2625 px JPEG per page (300 PPI) | 5215 x 2625 px | 5700 x 3075 px |
| Boxes | MediaBox = BleedBox, TrimBox inset 9 pt | TrimBox inset 9 pt | TrimBox inset 54 pt |

The formulas live in `lib/lulu-print-specs.js` and cite Lulu's Book Creation
Guide and the print-API cover-dimension docs. When an order already has
Lulu's `/cover-dimensions/` response, the cover uses Lulu's numbers after
checking that they agree with the formula within 2 pt. A bigger difference is
an error, not a guess.

How each file is built:

- All artwork on a page (background, child, monster, text cards, frames) is
  flattened into one opaque 300 PPI image, so the PDF has no live
  transparency. That is Lulu's flatten-transparency rule.
- Text stays vector and uses fully embedded static TrueType fonts:
  `assets/fonts/fredoka/print/` (static Fredoka instances, OFL) and Lilita One.
- Fonts that can't print a name are refused instead of silently dropping
  letters. Today that means anything outside WinAnsi, such as emoji or CJK.
- Output is RGB, not PDF/X (Lulu doesn't require PDF/X), with no marks and no
  security. It is deterministic for the same inputs and creation date.

## Code map

| File | Role |
|---|---|
| `lib/lulu-print-specs.js` | Trim, bleed, safety, gutter, spine, and cover layouts; reconciles against Lulu's dimensions |
| `lib/print-books/` | Per-book config (`defaults.js`, `halloween-monster-night.js`, `index.js`) |
| `lib/print-raster.js` | Image decoding, transparent-background handling, cover-fit drawing, placeholders |
| `lib/storybook-print-files.js` | Interior and cover compositors plus the preflight report |
| `lib/pdf-writer.js` | `createPrintPdfDocument`: embedded TrueType, DCT images, Trim/BleedBox |
| `lib/truetype-font.js` | Minimal TrueType parser used for embedding and measurement |
| `lib/print-assets.js` | Loads art from repo paths or https URLs, with size and time caps |
| `lib/storybook-print-job.js` | Builds a job from an order (Supabase story + selected monster) or a sample |
| `api/lulu-sandbox-storybook-order.js` | Signed GET route that Lulu fetches; streams the PDF in chunks |
| `scripts/build-print-samples.js` | Local sample builder |

## Page templates

Templates come from the book config (`templates`). The default is `story`.

- **story**:
  - The background plate covers the page. A two-page spread plate is split, so
    the even page gets the left half.
  - The text card sits at the top.
  - Child and monster are placed with the Admin placement values (`x` = center
    % of trim width, `y` = baseline %, `scale` = zone width %). They are kept
    below the text card and inside the safety area, and are mirrored when the
    page's `facing` differs from the art's source facing.
- **half-title** (p1), **title-dedication** (p2), **copyright** (p3), and
  **meet-monster** (p32): front and back matter with framed images (the
  original drawing and the monster).

## Transparent backgrounds

| Input | Behavior |
|---|---|
| PNG/WebP with alpha | Used as is; transparent margins are trimmed |
| Flat studio background (for example white) | Keyed out from the image edges only, so white eyes and teeth inside the character stay. Edges are softened, and a soft ground shadow is kept as a translucent shadow. |
| Busy opaque background | Left opaque, with a warning in the preflight report. Generate transparent PNGs instead. |

## Proof vs production mode

- **`proof`**: always renders. Every problem goes into `report.blockers`, and
  each affected page gets a red `PROOF · …` stamp inside the safety area. The
  signed GET route uses proof mode while the integration is sandbox-only.
  - Problems include: placeholder art, any layer under 300 PPI, characters
    shrunk to fit, and text that doesn't fit.
  - The route sends the number of blockers in `X-MonstersNOW-Print-Blockers`.
- **`production`**: throws a `ProductionError` (with the report attached)
  when there is any blocker. Use it before any live print submission.

## Samples

```bash
npm run build:print-samples                    # Halloween, repo art + sample child/monster
node scripts/build-print-samples.js bedtime-monster --out /tmp/out
node scripts/build-print-samples.js halloween-monster-night --placeholders
```

This writes `<slug>-interior-sample.pdf`,
`<slug>-cover-{softcover,hardcover}-sample.pdf`, and `<slug>-preflight.json`
(per-page PPI, placements, and blockers). `samples/` is git-ignored except for
the small PNG previews and the preflight report.

## Adding a book

1. Create `lib/print-books/<slug>.js` with `slug`, `title`, `coverTitleLines`,
   optional `palette`/`copy`/`templates`/`typography` overrides, and
   `localArt`. Register it in `lib/print-books/index.js`. A book without a
   config still renders with `defaults.js` and its catalog title.
2. Give each master page in Admin a print background (`artworkUrl`) that
   meets the pixel sizes below, plus child and monster placements.
3. Run the sample builder and check that `<slug>-preflight.json` has no
   blockers.

## Art required for a print-ready book (all books)

All plates must be child-free and monster-free, RGB, and include the full
bleed. Keep important content 0.5 in (150 px) inside the trim.

| Asset | Pixels (300 PPI) | Notes |
|---|---|---|
| Two-page spread plate | **5250 x 2625** | 17.5 x 8.75 in. Keep faces and text at least 0.5 in (150 px) from the center fold. |
| Single-page plate | **2625 x 2625** | Use for pages that aren't in a spread (Halloween pages 1, 2, 3, and 32) |
| Softcover cover wrap (32 pp) | **5215 x 2625** | Back \| 0.132 in spine \| front, with 0.125 in bleed |
| Hardcover casewrap (32 pp) | **5700 x 3075** | 0.75 in wrap on every edge; Lulu wraps it around the boards |
| Front-only cover art | 2588 x 2625 (PB) / 2813 x 3075 (HC) | Proof aid only. Without a full wrap, the back and spine stay a labelled placeholder (blocker). |
| Child character master | PNG/WebP with alpha, at least 1024 x 1536, figure at least 1450 px tall | Story pages place the child up to about 4.8 in tall. Today's 512 x 768 presets come out at about 170 PPI. |
| Monster render | transparent PNG, at least 1536 x 1536, figure at least 1300 px tall | Cover hero is about 4.0 in tall; 1254 px renders give 247–330 PPI |

A wrap size that depends on page count (spine) is computed by
`calculateCoverLayout`. The sizes above are for 32 pages.

### Halloween Monster Night file list

These print masters are in `assets/storybook/halloween-monster-night/` (built
by `scripts/build_halloween_print_masters.py`, see below):

- `pages-04-05-environment-print.jpg` … `pages-30-31-environment-print.jpg`:
  14 spread plates, **5250 x 2625 px** each. Pairs: 04-05, 06-07, 08-09,
  10-11, 12-13, 14-15, 16-17, 18-19, 20-21, 22-23, 24-25, 26-27, 28-29, 30-31.
  (The `-environment-v1.png` review plates are 1774 x 887, about 101 PPI.)
- `page-01-half-title-background-print.jpg`, **2625 x 2625 px**: the Books cover scene with its title removed
- `page-02-title-dedication-background-print.jpg`, **2625 x 2625 px**: porch-gate plate
- `page-03-copyright-background-print.jpg`, **2625 x 2625 px**: garden-arch plate, lightened for small type
- `page-32-meet-monster-background-print.jpg`, **2625 x 2625 px**: town-square plate
- `cover-softcover-wrap-print.jpg`, **5215 x 2625 px**
- `cover-hardcover-wrap-print.jpg`, **5700 x 3075 px**

Where they are used:

- Sample builds (`npm run build:print-samples`) use them for every page and
  pick the wrap that matches the binding.
- Real orders use each master page's uploaded Admin `artworkUrl` when there is
  one; pages without uploaded art, and the cover, fall back to these shipped
  masters (`withShippedPrintMasters`). The files ship with the
  `lulu-sandbox-storybook-order` function (`vercel.json` `includeFiles`).

Cover: the wraps use the approved Books-page cover
(`cover-series/minimal-concepts/halloween-monster-night-v5`). Its imprint and
title are part of the art, so the config sets `coverArt.titleInArt` and the
compositor only adds the monster (below the title), the "Starring" line, and
the back-cover blurb. The back panel is the same scene with the title removed,
mirrored so it meets the front at the spine.

How the masters were made (no new AI imagery; only upscaling of approved art):

- Spreads: Real-ESRGAN `RealESRGAN_x2plus` on the 1774 x 887 environment plates
  (to 3548 x 1774), then Lanczos + light unsharp mask to 5250 x 2625.
- Singles: `RealESRGAN_x2plus` on the 1254 px cover plates, 2625 x 2625.
- Cover: `RealESRGAN_x4plus` on the 1254 px Books cover (to 5016 px); the title-free back-panel copy uses `RealESRGAN_x2plus`.
- Run `python3 scripts/build_halloween_print_masters.py upscale` then
  `... assemble` (CPU is fine; about 30 minutes).

Replace any of them with higher-quality artist masters at the same pixel size
when available; nothing else needs to change.

## Before going live

- Lulu sandbox file validation for the interior and both covers. Compare the
  `/cover-dimensions/` response against `calculateCoverLayout`.
- A physical proof of each binding: color, gutter, and spine wrap.
- Admin uploads cap artwork at 3 MB, and Vercel request bodies at 4.5 MB.
  300 PPI spread plates need direct, signed storage uploads.
