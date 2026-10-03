# Public storefront ↔ book engine contract

The public storefront passes story intent without reaching into admin or order internals.

## Current ready story

- Public ID: `halloween-monster-night`
- Public label: `Halloween Monster Night`
- Entry URL: `/create.html?story=halloween-monster-night`
- Proof route currently used by the create flow: `/api/halloween-proof`

The catalog must only show a purchase/personalization action for a story with a working proof route. Preview titles remain visible for discovery, but are labeled `In development` and do not link into checkout.

## Browser-to-server fields

When a parent submits personalization, `scripts/main.js` includes:

- `storyId`
- `storyLabel`
- `personalization.childName`
- `personalization.monsterName`
- `personalization.childCharacter`
- `selectedPreviewId`
- `style`
- `format`
- `monsterImage`
- `featurePermission`

`storyId` is also sent when the saved monster submission is finalized. Story IDs come from the local `publicStoryCatalog` allowlist; arbitrary query-string values are not forwarded.

## Adding the next ready story

Before changing a catalog card from `In development` to `Ready to personalize`:

1. Publish and validate the 32-page story in the book engine.
2. Provide a proof endpoint or a generic proof endpoint that accepts the story ID.
3. Add the ID and customer-facing label to `publicStoryCatalog` in `scripts/main.js`.
4. Route proof generation by that allowlisted ID instead of always calling `/api/halloween-proof`.
5. Add the story-specific `create.html?story=...` link on `books.html`.
6. Extend browser and server tests to prove the selected ID survives preview, personalization, proof, checkout metadata, and saved submission finalization.

Until steps 1–4 are complete, the storefront should not imply that another title can be ordered.

## Isolation

Public-specific CSS lives in `storefront.css`. It is not loaded by `admin.html`, and the public changes do not alter admin UI, fulfillment, payment, or printer logic.
