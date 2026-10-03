# Story artwork background plates

All story interiors use three independent visual layers:

1. A reusable illustrated environment plate with supporting characters, setting, props, lighting, and story action.
2. The customer's approved child character, composited using the page's `childPlacement` data.
3. The customer's approved monster, composited using the page's `monsterPlacement` data.

The environment asset itself must never contain the starring child, a demo monster, substitute characters, silhouettes, outlines, or visible placeholders. The dashed `CHILD` and `MONSTER` zones in Admin are editor-only placement guides; they are not part of customer or print artwork.

## Visual direction

Use the Halloween sequence as the current story-art north star: premium tactile soft-3D children's-book illustration, warm expressive faces, cinematic but kid-safe lighting, strong page-turn moments, clear visual storytelling, and protected negative space for copy and the personalized monster. Preserve each story's own palette and setting rather than copying Halloween decorations into other titles.

Each scene should reserve two grounded landing zones: one for the personalized child and one large enough for monsters with very different silhouettes. Keep supporting faces, essential clues, important props, and text-safe areas outside those zones. Avoid actions that require the monster to have specific limbs, facial features, clothing, or abilities.

## Production prompt rule

> Create a reusable environment plate only. Do not render the personalized child, personalized monster, substitute starring characters, silhouettes, outlines, or baked-in placeholders. Keep the specified child and monster zones clear, grounded, and naturally lit so both approved character layers can be composited there later. The Admin placement guides must never appear in the artwork.

For an existing scene that already contains fixed starring characters, use a precise-object edit: remove the recurring child and demo monster, reconstruct the occluded setting, preserve generic supporting characters and story details, and leave both former character areas naturally open.

## Halloween background set

The 14 reusable Halloween environment plates are:

- `pages-04-05-environment-v1.png`
- `pages-06-07-environment-v1.png`
- `pages-08-09-environment-v1.png`
- `pages-10-11-environment-v1.png`
- `pages-12-13-environment-v1.png`
- `pages-14-15-environment-v1.png`
- `pages-16-17-environment-v1.png`
- `pages-18-19-environment-v1.png`
- `pages-20-21-environment-v1.png`
- `pages-22-23-environment-v1.png`
- `pages-24-25-environment-v1.png`
- `pages-26-27-environment-v1.png`
- `pages-28-29-environment-v1.png`
- `pages-30-31-environment-v1.png`

They live in `assets/storybook/halloween-monster-night/`. The older `master-v*.png` files retain both fixed starring characters and are historical source/reference art only.

## Review checklist

- No starring child, monster, or character-shaped artifact is baked into the environment.
- Both reserved zones have believable ground, perspective, light direction, and room for silhouette variation.
- The child and monster can be placed without covering faces, clues, key props, story text, or the center gutter.
- The scene does not imply anatomy-specific contact such as gripping, pointing, carrying, or wearing an item.
- Child and supporting-character continuity matches adjacent spreads.
- No generated lettering, watermark, scary imagery, or unapproved franchise character appears.
- Art is reviewed as a two-page spread and as each cropped square page.
