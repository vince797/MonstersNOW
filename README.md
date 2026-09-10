# MonstersNOW

Starter website for MonstersNOW.

## Files

- `index.html` - page structure and content
- `monsters.html` - before and after monster gallery
- `styles.css` - layout, responsive styling, and visual design
- `scripts/main.js` - small browser behaviors
- `api/convert-monster.js` - Vercel serverless AI converter endpoint
- `api/storybook-interest.js` - server-side Halloween print waitlist email endpoint
- `api/storybook-checkout.js` - server-side Stripe Checkout endpoint for storybook orders
- `api/lulu-sandbox-*.js` - server-side Lulu Print API sandbox endpoints
- `lib/` - shared server-side helpers for API routes, including the MonstersNOW image style prompt
- `assets/` - images, icons, downloads, and other static files

## Run locally

Open `index.html` in a browser.

The static page also works through a simple local server, but the AI converter
endpoint needs Vercel's local runtime:

```bash
vercel dev
```

## AI converter

Set `OPENAI_API_KEY` in Vercel before using the real converter. Without that
environment variable, `/api/convert-monster` returns a configuration error
instead of showing demo artwork as if it came from the upload.

The converter uses the uploaded child drawing as the source of truth and the
Soft 3D Storybook Monster images in `assets/master-references/` as style references. The
default brand direction is centralized as `Soft 3D Storybook Monster` in
`lib/monster-style.js` so character previews, story scenes, book pages, product
previews, approval/revision previews, and kid-safe Halloween scenes can reuse
the same prompt language.

## Halloween print waitlist

The create flow first posts selected previews to `/api/storybook-checkout` to
start Stripe Checkout. That checkout route validates payment configuration,
sends the selected monster preview to operations through Resend, then returns a
Stripe-hosted checkout URL. Configure these Vercel environment variables:

```text
STRIPE_SECRET_KEY
STRIPE_STORYBOOK_SHIPPING_RATE_IDS
STORYBOOK_CHECKOUT_ALLOWED_COUNTRIES
STORYBOOK_CHECKOUT_SITE_URL
```

`STRIPE_STORYBOOK_SHIPPING_RATE_IDS` is a comma-separated list of Stripe
shipping rate IDs. If checkout is not configured, the browser posts to
`/api/storybook-interest` instead. Configure these variables to send that
request by email through Resend:

```text
RESEND_API_KEY
STORYBOOK_INTEREST_FROM_EMAIL
STORYBOOK_INTEREST_TO_EMAIL
```

If neither server path is configured, the browser falls back to a prefilled
email draft so families can still contact MonstersNOW.

## Lulu sandbox

See `LULU_SANDBOX.md` for the server-side Lulu Print API sandbox setup. The
sandbox routes use `LULU_SANDBOX_CLIENT_KEY` and
`LULU_SANDBOX_CLIENT_SECRET`, never browser-exposed keys. The configured
storybook variants are an 8.5 x 8.5 in premium-color softcover and hardcover.
