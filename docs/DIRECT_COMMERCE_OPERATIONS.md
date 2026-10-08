# Direct commerce and operations runbook

This lane covers orders placed directly on MonstersNOW. Etsy and marketplace
orders are intentionally outside this workflow.

## System boundary

- The public Create flow owns monster selection, personalization, and the call
  to `POST /api/storybook-checkout`.
- Stripe Checkout owns payment collection, shipping-address collection,
  configured shipping rates, and automatic tax.
- Stripe webhooks are the source of truth for paid, failed, expired, refunded,
  and disputed payment state.
- Supabase stores private orders, customer artwork, and customer proof PDFs.
- Admin owns proof production, customer proof publication, final production
  approval, and the existing Lulu **sandbox** handoff.
- No route in this repository submits a live printer order.

## Required sequence

1. The checkout endpoint derives a server-authenticated order identity and
   customer portal credential. It stores the initial order before creating the
   Stripe Checkout Session.
2. The customer pays in Stripe. Do not treat the browser redirect as proof of
   payment.
3. The signed webhook verifies the stored order, product subtotal, currency,
   PaymentIntent, and live-mode session before marking it paid.
4. In Admin, move a paid order to `proofing` and produce the exact PDF the
   customer should review. Upload that PDF in the order drawer.
5. The server stores the PDF privately, records its SHA-256 fingerprint, and
   returns a bearer link. Send that link only to the ordering customer.
6. The customer opens `order.html`, downloads the signed proof, and either
   approves the exact fingerprint or requests changes. Publishing any revised
   PDF resets the customer decision.
7. After customer approval, Admin performs the final artwork and master-story
   readiness check and locks the same PDF fingerprint for production.
8. Lulu sandbox submission remains a distinct, explicit action. Do not add live
   Lulu credentials until the real cover/interior renderer and provider setup
   have passed preflight.

## Public API contract

`POST /api/storybook-checkout` returns the existing `checkoutUrl`,
`checkoutSessionId`, `orderId`, and warnings fields. One required security field
was added to its input: `monsterSubmissionToken`, the opaque token returned when
the private monster submission is created. The server rechecks that token, the
finalized selected preview, names, email, story, and format before creating a
Stripe session. The client-provided `submissionId` is now nonce material; the
persisted order `submission_id` is server-derived. This prevents callers from
overwriting another order and makes retries deterministic.

`GET /api/customer-order` requires `Authorization: Bearer <order token>` and
returns a redacted order view. It never returns email, shipping address, Stripe
IDs, internal notes, or Supabase object paths.

`POST /api/customer-order` uses the same bearer header. Supported actions are:

- `approve` with the current `fingerprint`
- `request_changes` with the current `fingerprint` and 3–1,000 characters of
  notes

The storefront/book-engine inputs are unchanged: story ID, names, selected
preview ID, child-character object, format, and monster submission ID retain
their existing shapes. The proof workflow consumes a finished PDF and therefore
does not change the personalized-book render manifest.

## Admin orders view

Admin opens on **Orders**: a status-filtered, searchable list with a
"Needs action" tab. Clicking an order opens one panel with the customer, book,
chosen monster, child character, original drawing, payment, proof, and Lulu
print details, plus these actions:

- **Copy proof link** / **Email link to customer**. The email action opens a
  prefilled draft in the operator's own mail app; nothing is sent
  automatically.
- **Generate print PDFs** mints fresh 7-day signed interior and cover URLs
  (requires `STORYBOOK_PRINT_FILE_SECRET`; the cover link also needs the Lulu
  sandbox credentials for cover dimensions). It never changes order status.
- **Mark status** offers only the transitions the server allows.

Lulu live status and tracking are shown as placeholders until tracking
ingestion exists.

### Saved child character

Checkout stores the exact child render from the signed proof in the private
`monster-submissions` bucket (`<monster submission id>/child/<hash>.<ext>`, or
`checkout/<submission id>/child-<hash>.<ext>` without a saved monster) and
records the path in `storybook_orders.child_image_path` (migration
`20261008120000_add_order_child_image.sql`). Until that migration is applied,
checkout keeps working and stores the path in `child_character.imagePath`
instead; the migration backfills it into the new column.

Admin sign-in failures are limited to 10 per client IP per 15 minutes (HTTP
429 with `Retry-After`). The counter lives in function memory, so it is
per-instance; a WAF rule is still recommended for production.

## Security and recovery

- Keep `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
  `ORDER_ACCESS_SECRET` server-only.
- Customer tokens are opaque bearer credentials. The database stores only
  SHA-256 hashes. The browser removes the token from the address bar and keeps
  it in tab session storage.
- Customer proof files are private and exposed only through 15-minute signed
  URLs.
- A refund, dispute, amount mismatch, currency mismatch, or missing
  PaymentIntent blocks proofing and print progression.
- Checkout and proof operations are retry-safe. A repeated checkout nonce maps
  to the same server order and Stripe idempotency key.
- If a webhook returns `503`, leave Stripe retries enabled. Do not manually mark
  paid until the order and Stripe event have been reconciled.

## External launch blockers

- Live Stripe account activation, verified business details, live shipping
  rates, Stripe Tax registration/configuration, and the production webhook.
- A production Supabase project with every migration applied and backup/
  retention settings reviewed.
- Print-ready art and a validated proof for the personalized PDFs. The
  compositor and preflight exist (`docs/PRINT_PIPELINE.md`), but they need:
  - 300 PPI background plates and cover wraps
  - transparent child and monster masters
  - Lulu sandbox file validation
  - a physical proof

  The Lulu integration is still sandbox-only and must not be promoted to live.
- Live print-provider credentials, product/package confirmation, shipping SLA,
  cancellation policy, and tracking ingestion.
- A transactional customer-email channel for automatically delivering the
  private proof link. Admin can copy the link today, but sending it is an
  explicit operator step.
- Production rate limiting/WAF rules for checkout, customer-order, and admin
  routes. The paid AI endpoints and drawing upload have application limits;
  see `docs/AI_ABUSE_PROTECTION.md` for their migration and recommended
  firewall rule.
