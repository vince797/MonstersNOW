# Halloween Monster Night test-order flow

Open `/create.html?test=halloween`, upload a drawing, generate and select a monster, enter names and email, choose a format, and build the book proof. Review all 32 pages, approve the layout, and continue to Stripe test checkout.

This flow uses the approved local Halloween manuscript, not the generic story label or the fixed Mia/Moxie illustrated PDF. The selected monster is displayed consistently as a vignette. These are layout-review pages, not personalized scene illustrations or Lulu-ready files. The original drawing and final cover are not yet included.

## Server configuration

- `STORYBOOK_PROOF_SECRET`: a strong random server-only secret; signs a one-hour receipt binding names, monster image, format, and manuscript version.
- `STRIPE_TEST_SECRET_KEY`: an `sk_test_` key. Live keys are rejected, with no fallback to the production key.
- `STRIPE_TEST_STORYBOOK_SHIPPING_RATE_IDS`: comma-separated shipping rates created in the same Stripe test environment.
- `STRIPE_TEST_WEBHOOK_SECRET`: signing secret for `/api/stripe-test-webhook`; subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
- Existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, with the existing `storybook_orders` table accessible to the server.
- Existing `STORYBOOK_CHECKOUT_SITE_URL`: the canonical HTTPS site URL.

No intake email is sent in the test path. Orders have `test-` submission IDs and a test flag, proof hash, manuscript version, and disabled-fulfillment note in the existing notes field. Payment events update only matching test orders. No endpoint here submits to Lulu.

Proof content is kept in session storage in the same browser tab, not in cloud storage. Save a PDF from the proof page to retain it. Changing names, image, format, or manuscript invalidates approval; receipts expire after one hour. This is not a production asset-retention workflow.

## Verification and release gate

Run `node --test tests/halloween-test.test.js`. Local tests use synthetic images and mock Stripe/database calls; they do not charge, email, or print.

Before deployment acceptance, configure the test variables and webhook, complete one hosted Stripe test checkout, confirm the matching admin order becomes paid, and replay the webhook to check that it does not regress later statuses. Check the proof at mobile and desktop widths and retain the printed PDF.

Production release additionally requires consistent personalized scene art, original-drawing pages, durable private asset storage, a final cover, print-resolution PDF generation, Lulu validation, and a separately authorized real sample order. Do not point the existing sandbox placeholder-PDF endpoint at a real customer order.
