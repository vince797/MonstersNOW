# Deploying to Vercel

This project is a static HTML/CSS/JavaScript site and can be hosted directly on
Vercel without a build step.

## Project

- Production domain: `monstersnow.com`
- Recommended secondary domain: `www.monstersnow.com`
- Hosting provider: Vercel
- Registrar/DNS provider for now: GoDaddy

## Deploy from the project folder

From this folder:

```bash
vercel deploy
```

For production:

```bash
vercel deploy --prod
```

## AI environment variable

The monster converter needs this Vercel environment variable:

```text
OPENAI_API_KEY
```

Add it in Vercel under Project Settings > Environment Variables for Production,
Preview, and Development. Keep it server-side only; never add it to browser
JavaScript.

Without `OPENAI_API_KEY`, the API route returns a configuration error. This
prevents the UI from showing sample artwork as if it came from a customer's
upload.

## Storybook checkout and interest variables

The create flow starts with Stripe Checkout and falls back to a server-side
interest email route before opening a prefilled mail draft.

Add these Stripe variables for Production, Preview, and Development:

```text
STRIPE_SECRET_KEY
STRIPE_STORYBOOK_SHIPPING_RATE_IDS
STORYBOOK_CHECKOUT_ALLOWED_COUNTRIES
STORYBOOK_CHECKOUT_SITE_URL
```

`STRIPE_STORYBOOK_SHIPPING_RATE_IDS` must contain one or more Stripe shipping
rate IDs. `STORYBOOK_CHECKOUT_ALLOWED_COUNTRIES` defaults to `US` when omitted.
Use the production domain for `STORYBOOK_CHECKOUT_SITE_URL` in Production.

Add these Resend variables for Production, Preview, and Development:

```text
RESEND_API_KEY
STORYBOOK_INTEREST_FROM_EMAIL
STORYBOOK_INTEREST_TO_EMAIL
```

`STORYBOOK_INTEREST_FROM_EMAIL` must use a sender domain verified in Resend.
`STORYBOOK_INTEREST_TO_EMAIL` can be a comma-separated list for internal order
review recipients.

## Lulu sandbox environment variables

The Lulu sandbox API routes are server-side only. Add these to Development and
Preview while testing:

```text
LULU_SANDBOX_API_BASE_URL=https://api.sandbox.lulu.com
LULU_SANDBOX_CLIENT_KEY
LULU_SANDBOX_CLIENT_SECRET
LULU_SANDBOX_CONTACT_EMAIL
LULU_SANDBOX_ENDPOINT_SECRET
```

Do not add production Lulu credentials until the PDF generation and sandbox
print-job flow have been validated. The sandbox integration supports softcover
and hardcover storybook variants; both should be proofed before enabling paid
checkout.

## Add the domain in Vercel

In the Vercel dashboard, open the project, then go to Settings > Domains and add:

```text
monstersnow.com
www.monstersnow.com
```

Vercel will show the exact DNS records needed. Use those values in GoDaddy.

Typical setup:

```text
Type   Name   Value
A      @      76.76.21.21
CNAME  www    cname.vercel-dns-0.com
```

Use Vercel's dashboard values if they differ from the typical records above.

## GoDaddy DNS

In GoDaddy, open DNS for `monstersnow.com` and update the records Vercel asks
for. Remove or replace conflicting existing `A`, `AAAA`, or `CNAME` records for
`@` and `www` if GoDaddy reports a conflict.

DNS changes can take time to propagate. Vercel will mark the domain as ready
after the records verify.
