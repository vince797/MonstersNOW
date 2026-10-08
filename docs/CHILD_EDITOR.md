# Character Studio (child editor) v2

The step after a family confirms their monster: they design the child's
storybook character, paint 2–3 versions in the book's animated-film look,
pick one, and carry it into the proof and the printed book.

## Pieces

| File | Role |
| --- | --- |
| `scripts/child-sketch.js` | Layered SVG "live sketch". Every option is a layer or a CSS variable, so the preview changes instantly and offline. |
| `scripts/child-selector.js` | The form: options, tabs, quick-start looks, undo/reset, swipe hints, special detail (sanitized exactly like the server), local profile (`monstersnow_child_character_profile_v3`). |
| `scripts/child-studio.js` | Painting: versions, progress, cancel/retry, errors, version strip, sticky mini preview on phones, restore after refresh. |
| `scripts/main.js` | Create flow; saves/restores the monster session (`resource=session`) and hands the chosen version to the proof. |
| `api/render-child-character.js` | One function, routed by `?resource=`: `render` (POST), `session` / `image` (GET, monster submission token headers), `presets` (GET public manifest, POST admin generation). |
| `lib/child-characters.js` | Canonical options, validation, profile keys, detail sanitizer. |
| `lib/child-character-style.js` | Render prompt (animated-film look from PR #8; no studio names). |
| `lib/child-detail-moderation.js` | Special-detail screen (brands, instructions, unsafe words) + OpenAI moderation (fails open after 4 s; the local screen still applies). |
| `lib/child-renders.js` | Storage of renders, metadata codec, 2× print master. |
| `lib/child-presets.js` | The 12 quick-start looks and their painted examples. |
| `lib/order-child-image.js` | At checkout: 2× print master from the chosen render, falling back to the approved image. |

## What the preview shows

1. **Live sketch** (default). Reflects every choice immediately. Labelled
   "Live sketch" so nobody mistakes it for the final art.
2. **Painted example**. Only when the current choices exactly match a
   quick-start look that has painted art (see "Quick-start art" below). Any
   edit returns to the sketch. A broken/expired image falls back to the sketch.
3. **Painted character**. The chosen painted version for the current choices.
   After edits, a small "Painted version · earlier choices" card offers to go
   back to those choices.

## Versions and limits

- "Paint 2 Versions" sends two parallel render requests; "Paint Another
  Version" adds a third. At most 3 versions per look; up to 12 kept per monster.
- Each version is one request against the existing `child` limits
  (12 per monster session per day, plus IP and global limits in
  `lib/ai-abuse-protection.js`). Automatic and manual retries count too.
- The first finished version is selected automatically; families can pick
  another, and the choice is remembered per look.

## Timing, retries, errors

- `vercel.json`: `maxDuration` 150 s for `api/render-child-character.js`.
  The image request gets 130 s minus time already spent (20 s reserve for
  post-processing and uploads). The browser gives up at 165 s, so the server
  always answers first.
- One automatic retry (after 2.5 s) only for network drops and 500/502.
  None for busy (503), timeouts, policy blocks, 4xx, or rate limits; those
  show a specific message and a "Try Again" button (or "Paint the Missing
  Version" after a partial failure).
- "Cancel" aborts in-flight requests and restores the editor immediately.
  (A request the server already started may still count toward the limit.)

## Persistence (survives refresh)

Private bucket `monster-submissions` (images only, 8 MB), next to the monster:

```
<submission>/child/render-<id>.png           lossless PNG from the model (master)
<submission>/child/render-<id>.<meta>.webp   WebP q90 display copy
<submission>/child/print-<id>-2x.png         2× print master, made at checkout
```

`<meta>` is a compact code (version + one character per option + base64url
detail) so no database table is needed. **Option tables in
`lib/child-characters.js` are append-only**; `tests/child-editor-v2.test.js`
pins the encoding. File names stay under 255 characters (the detail is capped
at 80 characters / 150 UTF-8 bytes).

The browser keeps the submission id/token (already used by the create flow),
the editor state, and which version was chosen per look
(`monstersnow_child_render_ref_v1`). On reload, `resource=session` returns the
monster previews and renders, and the images are fetched with the token.
Admin "delete monster" removes `<submission>/child/` as before.

**No database migration is needed.**

## Print quality

Renders are requested as lossless PNG with a transparent background at
1024×1536, quality `high` (unless the `CHILD_CHARACTER_IMAGE_QUALITY` env var
overrides it). At checkout, the chosen render named in the signed proof
(`childRenderId`) is upscaled 2× (2048×3072, high-quality resampling) and
stored as PNG for the print pipeline. This is interpolation, not new detail.
If anything fails, checkout stores the approved display image exactly as
before, so orders never fail because of it.

## Quick-start art (admin, run once)

The quick-start looks work without art (they show sketches). To give them
painted examples, an admin runs the generator against a deployment that has
`OPENAI_API_KEY` and `ADMIN_PASSWORD` set (the server uses its own key; the
script never sees it):

```
SITE_URL=https://monstersnow.com ADMIN_PASSWORD='…' node scripts/generate-child-presets.js --dry-run
SITE_URL=https://monstersnow.com ADMIN_PASSWORD='…' node scripts/generate-child-presets.js
```

- 12 looks, one image generation each (~1–2 min each, run one at a time).
- Finished looks are skipped, so re-running after an error is safe;
  `--only=finn,zuri` and `--force` are available.
- Gated by the admin password (with its lockout after failed attempts) and
  the `preset` rate limit (40/hour, 100/day per IP, plus the global cap).
- Art is stored at `presets/child-editor-v2/<id>.webp`; the public manifest
  hands out short-lived signed links and is cached for about 5 minutes.

## Tests

- `npm test`: unit tests, including `tests/child-editor-v2.test.js`
  (options, keys, sanitizer, moderation, prompt, storage codec, render API
  error mapping, session/image auth, presets, proof, print master).
- `npm run test:e2e`: headless Chromium, desktop 1440 px and iPhone 13. Runs
  the real render/proof/checkout handlers against in-memory mocks (no
  network, no Lulu, no email). Needs the `playwright` package and a Chromium
  build (not a repo dependency):

  ```
  npm i --no-save playwright && npx playwright install chromium
  CHILD_EDITOR_SCREENS=/tmp/screens npm run test:e2e
  ```

  It covers every option in every category (and every costume), live preview
  layers, special detail, undo/reset, quick-start looks, painting 2 versions,
  choosing, the 3-version cap, refresh restore, auto-retry, busy/timeout/
  policy/rate-limit/detail errors, cancel, partial failure, phone tap targets,
  swipe rows, the sticky mini preview, the proof → test checkout path with
  the 2× print master, and the monster-only story.

## Known limits

- Safari before 16 has no `overflow: clip`, so the phone mini preview is not
  sticky there (it still works as a normal block).
- The static sample images in `assets/child-editor/` are unchanged; the
  e2e "painting" uses them as mock output.
- New aids (walker, prosthetic leg, leg braces) and the new extras rely on
  the prompt; they do not have the per-profile admin review gates that the
  wheelchair and forearm-crutch references have.
