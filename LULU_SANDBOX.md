# Lulu Sandbox Integration

This project uses Lulu's Print API sandbox through server-side Vercel API routes.
Do not call Lulu directly from browser JavaScript because the client secret must
stay server-side.

## Environment Variables

Create a separate sandbox developer account at:

```text
https://developers.sandbox.lulu.com/
```

Then add these variables locally and in Vercel Development/Preview:

```text
LULU_SANDBOX_API_BASE_URL=https://api.sandbox.lulu.com
LULU_SANDBOX_CLIENT_KEY=your-sandbox-client-key
LULU_SANDBOX_CLIENT_SECRET=your-sandbox-client-secret
LULU_SANDBOX_CONTACT_EMAIL=ops@monstersnow.com
LULU_SANDBOX_ENDPOINT_SECRET=choose-a-random-admin-secret
STORYBOOK_PRINT_FILE_SECRET=optional-separate-signing-secret
```

`LULU_SANDBOX_ENDPOINT_SECRET` protects the sandbox endpoints from public use.
Send it as:

```text
x-lulu-sandbox-secret: your-random-admin-secret
```

The print-job endpoint refuses to run unless this secret is configured and sent.
`STORYBOOK_PRINT_FILE_SECRET` is optional. If omitted, the print-file URL
signer uses `LULU_SANDBOX_ENDPOINT_SECRET`.

## Current Endpoints

### Product Variants

```bash
curl -s http://localhost:3000/api/lulu-sandbox-products
```

Configured storybook variants:

```text
softcover: $24.99 + shipping, 0850X0850.FC.PRE.PB.080CW444.MXX
hardcover: $39.99 + shipping, 0850X0850.FC.PRE.CW.080CW444.MXX
```

Both are 8.5 x 8.5 in, premium full color, 80# coated white paper, matte cover.
The default page count is 32. Send `cover_type` as `softcover` or `hardcover`
to choose the package. If no `cover_type` is sent, softcover is used.

These SKUs come from Lulu's current Print API product specification sheet:

```text
https://assets.lulu.com/media/specs/lulu-print-api-spec-sheet.xlsx
```

### Health Check

```bash
curl -s http://localhost:3000/api/lulu-sandbox-health \
  -H "x-lulu-sandbox-secret: your-random-admin-secret"
```

This verifies credentials by requesting an OAuth token and reading one page of
Print Jobs from the sandbox.

### Shipping Options

```bash
curl -s http://localhost:3000/api/lulu-sandbox-shipping-options \
  -H "Content-Type: application/json" \
  -H "x-lulu-sandbox-secret: your-random-admin-secret" \
  -d '{
    "currency": "USD",
    "line_items": [
      {
        "cover_type": "softcover",
        "page_count": 32,
        "quantity": 1
      }
    ],
    "shipping_address": {
      "country": "US",
      "state": "FL",
      "postcode": "32712"
    }
  }'
```

### Cost Calculation

```bash
curl -s http://localhost:3000/api/lulu-sandbox-cost \
  -H "Content-Type: application/json" \
  -H "x-lulu-sandbox-secret: your-random-admin-secret" \
  -d '{
    "shipping_option": "MAIL",
    "line_items": [
      {
        "cover_type": "hardcover",
        "page_count": 32,
        "quantity": 1
      }
    ],
    "shipping_address": {
      "street1": "101 Independence Ave SE",
      "city": "Washington",
      "state_code": "DC",
      "country_code": "US",
      "postcode": "20540",
      "phone_number": "+1 206 555 0100"
    }
  }'
```

### Cover Dimensions

```bash
curl -s http://localhost:3000/api/lulu-sandbox-cover-dimensions \
  -H "Content-Type: application/json" \
  -H "x-lulu-sandbox-secret: your-random-admin-secret" \
  -d '{
    "cover_type": "hardcover",
    "interior_page_count": 32,
    "unit": "pt"
  }'
```

Use the returned dimensions when generating the single-page cover spread PDF.

### File Validation

Create an interior validation:

```bash
curl -s http://localhost:3000/api/lulu-sandbox-file-validation \
  -H "Content-Type: application/json" \
  -H "x-lulu-sandbox-secret: your-random-admin-secret" \
  -d '{
    "type": "interior",
    "source_url": "https://example.com/interior.pdf",
    "cover_type": "softcover"
  }'
```

Read a validation result:

```bash
curl -s "http://localhost:3000/api/lulu-sandbox-file-validation?type=interior&id=123" \
  -H "x-lulu-sandbox-secret: your-random-admin-secret"
```

For cover validation, send:

```json
{
  "type": "cover",
  "source_url": "https://example.com/cover.pdf",
  "cover_type": "hardcover",
  "interior_page_count": 32
}
```

### Generate Signed Storybook Print Files

The sandbox storybook order route creates signed, public URLs for Lulu to fetch.
The signed URLs point at:

```text
/api/lulu-sandbox-storybook-order
```

Do not hand-build those GET URLs. They include an HMAC signature and expiration time.
The endpoint generates:

```text
interior: 32-page 8.5 x 8.5 in PDF
cover: single-page cover spread PDF using Lulu cover-dimensions output
```

The current PDFs are sandbox proof files for validating the Lulu pipeline. The
next production step is replacing the proof artwork/text with the paid order's
stored monster art and final story content.

### Prepare a Storybook Sandbox Order

This route asks Lulu for cover dimensions, generates signed interior and cover
PDF URLs, starts Lulu file validations, and returns the print-job payload. Add
`"submit_print_job": true` only when you are ready to create the sandbox print
job.

```bash
curl -s https://www.monstersnow.com/api/lulu-sandbox-storybook-order \
  -H "Content-Type: application/json" \
  -H "x-lulu-sandbox-secret: your-random-admin-secret" \
  -d '{
    "submission_id": "monstersnow-sandbox-001",
    "title": "My Monster Storybook",
    "story_label": "My Monster Storybook",
    "style_label": "Soft 3D Storybook Monster",
    "cover_type": "softcover",
    "page_count": 32,
    "shipping_level": "MAIL",
    "submit_print_job": false,
    "shipping_address": {
      "name": "Test Parent",
      "street1": "101 Independence Ave SE",
      "city": "Washington",
      "state_code": "DC",
      "country_code": "US",
      "postcode": "20540",
      "phone_number": "+1 206 555 0100",
      "email": "test@example.com"
    }
  }'
```

If file validation succeeds, call the same endpoint again with:

```json
{
  "submit_print_job": true
}
```

Keep the same `submission_id` and shipping details so the sandbox print job is
traceable.

### Create Sandbox Print Job

Only call this after the cover and interior PDFs are hosted at URLs Lulu can
download.

```bash
curl -s http://localhost:3000/api/lulu-sandbox-print-job \
  -H "Content-Type: application/json" \
  -H "x-lulu-sandbox-secret: your-random-admin-secret" \
  -d '{
    "external_id": "monstersnow-sandbox-001",
    "shipping_level": "MAIL",
    "line_items": [
      {
        "external_id": "storybook-001",
        "title": "My Monster Storybook",
        "quantity": 1,
        "cover_type": "hardcover",
        "cover_url": "https://example.com/cover.pdf",
        "interior_url": "https://example.com/interior.pdf"
      }
    ],
    "shipping_address": {
      "name": "Test Parent",
      "street1": "101 Independence Ave SE",
      "city": "Washington",
      "state_code": "DC",
      "country_code": "US",
      "postcode": "20540",
      "phone_number": "+1 206 555 0100",
      "email": "test@example.com"
    }
  }'
```

## Next Implementation Step

The sandbox API now has credential checks, PDF generation, signed public file
URLs, validation kickoff, and optional sandbox print-job submission. The next
missing production pieces are:

1. Store the selected monster image and final generated story content after
   checkout starts.
2. Replace the proof PDF content with the stored monster art and final story.
3. Add an idempotent Stripe webhook or order database record before automatic
   paid-order submission.
4. Poll/read Lulu validation results before switching from sandbox proofing to
   real fulfillment.
