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
```

`LULU_SANDBOX_ENDPOINT_SECRET` protects the sandbox endpoints from public use.
Send it as:

```text
x-lulu-sandbox-secret: your-random-admin-secret
```

The print-job endpoint refuses to run unless this secret is configured and sent.

## Current Endpoints

### Product Variants

```bash
curl -s http://localhost:3000/api/lulu-sandbox-products
```

Configured storybook variants:

```text
softcover: $39.99 + shipping, 0850X0850.FC.PRE.PB.080CW444.MXX
hardcover: $59.99 + shipping, 0850X0850.FC.PRE.CW.080CW444.MXX
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

The sandbox API is now ready for credentials and Lulu calls. The next missing
piece is print-ready PDF generation and hosting:

1. Choose the final `pod_package_id`.
2. Generate an interior PDF that exactly matches that product trim/page specs.
3. Use Lulu's cover dimensions endpoint to generate the cover PDF at the correct
   spread size.
4. Host both PDFs where Lulu can download them.
5. Validate interior and cover.
6. Submit the sandbox print job.
