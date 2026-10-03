# MonstersNOW

Starter website for MonstersNOW.

## Files

- `index.html` - page structure and content
- `monsters.html` - before and after monster gallery
- `styles.css` - layout, responsive styling, and visual design
- `scripts/main.js` - small browser behaviors
- `api/convert-monster.js` - Vercel serverless AI converter endpoint
- `api/storybook-interest.js` - server-side print interest email endpoint
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
previews, approval/revision previews, and kid-safe story scenes can reuse
the same prompt language.

## Storybook checkout and interest

The create flow builds a signed 32-page review proof before posting the approved
selection to `/api/storybook-checkout`. That checkout route verifies the proof,
published master, and exact saved monster before it records the order and starts
Stripe Checkout. Configure these Vercel environment variables:

```text
STRIPE_SECRET_KEY
STRIPE_STORYBOOK_SHIPPING_RATE_IDS
STRIPE_WEBHOOK_SECRET
STRIPE_AUTOMATIC_TAX_ENABLED
STORYBOOK_CHECKOUT_ALLOWED_COUNTRIES
STORYBOOK_CHECKOUT_SITE_URL
STORYBOOK_LIVE_CHECKOUT_ENABLED
STORYBOOK_CUSTOMER_SITE_URL
ORDER_ACCESS_SECRET
```

`STRIPE_STORYBOOK_SHIPPING_RATE_IDS` is a comma-separated list of Stripe
shipping rate IDs. Keep `STORYBOOK_LIVE_CHECKOUT_ENABLED` unset until the final
PDF renderer and printer validation have passed a physical proof order; set it
to `true` only when paid fulfillment is ready. Register `https://www.monstersnow.com/api/stripe-webhook`
as a Stripe webhook for `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`checkout.session.expired`, `refund.created`, and `charge.dispute.created`, then store its signing secret in
`STRIPE_WEBHOOK_SECRET`. Direct checkout stores its order before returning a
Stripe URL. Customers use the private `order.html` portal to see redacted
status, open a time-limited PDF proof, approve its exact fingerprint, or
request changes. Apply every Supabase migration before enabling checkout,
including the private customer-proof bucket migration. See
`docs/DIRECT_COMMERCE_OPERATIONS.md` for the API contract and operator runbook.

If checkout is not configured, the browser posts to `/api/storybook-interest`
instead. Configure these variables to send that
request by email through Resend:

```text
RESEND_API_KEY
STORYBOOK_INTEREST_FROM_EMAIL
STORYBOOK_INTEREST_TO_EMAIL
```

If neither server path is configured, the browser clearly reports that no
payment was taken and directs the family to contact MonstersNOW.

## Lulu sandbox

See `LULU_SANDBOX.md` for the server-side Lulu Print API sandbox setup. The
sandbox routes use `LULU_SANDBOX_CLIENT_KEY` and
`LULU_SANDBOX_CLIENT_SECRET`, never browser-exposed keys. The configured
storybook variants are an 8.5 x 8.5 in premium-color softcover and hardcover.
The sandbox storybook order route can generate signed proof PDFs, start Lulu
file validations, and optionally submit a sandbox print job.
