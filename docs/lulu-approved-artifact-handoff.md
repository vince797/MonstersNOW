# Approved Lulu artifact handoff (local contract)

## Current behavior

The historical order path accepted a customer proof hash and generated unrelated
shape-only PDFs. It is now closed: every `submit_print_job` / `submitPrintJob`
request returns HTTP 409 **before any Lulu network request**. There is no flag to
reopen that path. The current application cannot fulfill a production order.

`lib/storybook-print-files.js` exports a local integrity contract. Passing it
proves consistency of supplied trusted records and exact bytes, not actual
artwork quality, independently inspected PDF contents, authorized actors,
hosting, successful Lulu normalization, or permission to buy anything. Its result
always has `readyForSubmission: false` while the authenticated artifact handoff
is unimplemented. It performs no upload, storage mutation, or network request.

## Local API

- `fingerprintApprovedPrintManifest(manifest)` returns a canonical JSON SHA-256.
  Object key order does not matter; arrays preserve order. Only JSON values are
  supported. The manifest must not contain its own resulting fingerprint.
- `validateApprovedPrintArtifacts({ order, manifest, artifacts, approvals })`
  throws on any missing/mismatched required record, or returns the verified
  artifact-set fingerprint, format, SKU and file hashes with the submission block.
- `artifacts` contains exact local PDF `Buffer`/`Uint8Array` bytes for `interior`,
  `cover`, and `coverTemplate`. Files are hashed without transformations.

### Manifest, version `approved-print-artifacts-v1`

Required fields:

- `schemaVersion: "approved-print-artifacts-v1"`, `purpose: "production"`,
  immutable `artifactSetId`, versioned `rendererVersion` (not a demo/placeholder)
- `format`: `softcover` or `hardcover`; corresponding exact `podPackageId`
- `pageCount: 32`; `trim: { widthPt: 612, heightPt: 612 }`
- `identity`: `submissionId`, `storyId`, positive integer `masterVersion`,
  `monsterSubmissionId`, `selectedPreviewId`, explicit `childCharacterId`
  (including `none` when intentionally selected), `childName`, `monsterName`,
  and 64-character lowercase SHA-256 `personalizationFingerprint` from the
  complete approved personalized render manifest
- `readiness`: every one of `copyReady`, `artworkReady`, `monsterReady`,
  `childReady`, `rendererReady`, `productionReady` must be exactly `true`,
  and `blockers` must be an empty array
- `interior`: immutable `artifactId` and `versionId`, exact `sha256`, `byteLength`,
  `pageCount: 32`, `widthPt: 630`, `heightPt: 630`, `layout: "single-pages"`
- `cover`: its own immutable ID/version/hash/length, `pageCount: 1`, exact
  template-derived `widthPt`/`heightPt`, `layout: "back-spine-front"`

Each interior/cover descriptor also requires `preflight`: `status: "passed"`,
matching `artifactSha256`, actual `engine`, immutable `reportId`, `reportSha256`,
`checkedAt`, and checks `pageCount`, `dimensions`, `bleed`, `fontsEmbedded`,
`images300Dpi`, `noPrinterMarks`, and `contentMatchesApprovedRender` all exactly
`true`. These must come from a trusted preflight pipeline. This helper verifies
record consistency; it is **not** that pipeline and does not open/parse those
report records. Never pass client-claimed readiness or preflight assertions.

`coverTemplate` requires:

- `source: "lulu-binding-specific-template"`, immutable `templateId`, exact
  template-PDF `sha256`, `format`, `podPackageId`, `binding` matching
  `getStorybookProductVariant(format)`, and `interiorPageCount: 32`
- `widthPt`/`heightPt` matching the cover PDF canvas
- `panels.back`, `panels.spine`, `panels.front`, each with explicit template-derived
  `xPt`, `yPt`, `widthPt`, `heightPt`; positive, in bounds, ordered left to right
  without overlap. Hardcover wraps/hinges can occupy the remaining canvas.

The renderer must read actual binding/SKU/page-count-specific template geometry.
A calculator result or a generic equation is not a template. Softcover and
hardcover get separate cover artifacts, hashes, manifests, and approvals, even
when they share interior bytes. Request current cover dimensions and actual
Lulu templates for each product rather than sharing a fixed cover canvas.

### Order and approval records

The current trusted order supplies all identity fields above, explicit `format`,
`pageCount: 32`, and `approvedArtifactFingerprint` equal to the canonical manifest
hash. The helper accepts common snake_case aliases for order fields. It does not
accept a legacy combined customer `proofFingerprint` in place of the approved
interior-and-cover pair fingerprint.

`approvals.customer` and `approvals.administrator` each require
`status: "approved"`, the exact manifest `fingerprint`, authenticated `actorId`,
and valid non-future `approvedAt`. The application must load these from
trusted, authorized storage and establish whose approval the order requires;
the helper itself cannot authenticate an actor or authorize an order.

Any change to names, child choice, selected monster, master/render version,
format, SKU, geometry, bytes, file versions, template, or preflight record changes
the approved manifest fingerprint. Republish and collect fresh approvals.

## Synthetic sandbox demonstration only

The legacy regeneration route remains available for **explicit synthetic demos**:

```json
{
  "purpose": "sandbox-demo",
  "synthetic_data": true,
  "format": "softcover",
  "page_count": 32,
  "validate_files": false
}
```

This example is an interface description, not authorization to call the service.
The demo preparation flow requests Lulu sandbox cover dimensions. With validation
on, it also queues sandbox PDF validations; a queued response is not a passed
normalization or production approval. It never prepares or submits a print job.
Child/customer/order/proof/shipping fields are rejected before network access.

Generated PDFs carry `SANDBOX DEMO - NOT AN APPROVED PRODUCTION FILE` on every
interior page and the cover. They have generic shapes, not approved art. The
production validator rejects their marker even if someone supplies their hash.
`createStorybookInteriorPdf` / `createStorybookCoverPdf` require
`purpose: "sandbox-demo"`; no default production rendering exists.

Signed regeneration URLs are version 2, explicitly demo-scoped, and contain no
child names or selected-monster/order identifiers. Version 1 URLs are rejected.
The base URL must be an explicit trusted HTTPS origin in
`STORYBOOK_PRINT_FILE_BASE_URL`, `STORYBOOK_CHECKOUT_SITE_URL`, or `SITE_URL`.
Request Host/forwarded headers are not trusted as the pull destination. Changing
format, dimensions, expiry, or scope invalidates the signature; duplicate and
unknown query parameters are rejected.

## Remaining production plumbing

1. Produce final art and composited print PDFs from the exact reviewed manifest,
   using true font embedding and suitable print image resolution. Preserve every
   child's and monster's selected identity consistently.
2. Obtain and archive exact Lulu cover templates for both bindings; render separate
   complete back/spine/front covers, including casewrap-specific wrap/hinge areas.
3. Run genuine PDF/artwork preflight on final bytes and store its immutable reports.
   Manually inspect print proofs; do not turn a preview's readiness bits into
   evidence of these checks.
4. Build a review that displays the exact interior and cover bytes, records both
   customer and administrator approval of the full artifact manifest, and pins the
   order to that immutable artifact-set fingerprint.
5. Implement authenticated immutable artifact storage and a least-data signed
   download resolver that serves those exact bytes, never regenerating/replacing
   them from mutable query parameters. Recheck approvals and hashes on submission.
6. Submit final file URLs to Lulu validation and poll to the documented successful
   terminal `NORMALIZED` state for **both** files; errors, queued/processing states,
   expired URLs, or stale artifact IDs remain blockers.
7. Implement an idempotent approved-artifact order handoff separately, then verify
   the chosen binding with an explicitly authorized physical proof before enabling
   paid fulfillment. No print order is authorized by this local implementation.

## Verification

Run `node --test tests/lulu-approved-artifacts.test.js`.
Tests use synthetic local PDF bytes and mocked network functions. The test
preflight/approval records are fixtures only; they are not genuine production
reports or proof of final-art readiness. Coverage includes both formats, exact
byte hashes, identity/version changes, readiness, approvals, cover-template
mismatch, bleed single-page geometry, demo watermark rejection, signed URL
privacy/tampering, and zero-network failure of every submission path.
