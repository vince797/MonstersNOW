# Private exact-byte review packages

Status: implemented as local server code plus an **unapplied migration**. No live
schema, storage bucket, credential, deployment, or printer job was changed.
These packages are watermarked review candidates, never production-ready files.

## Authorized API contract

All admin actions use the existing authenticated admin endpoint:
`PATCH /api/storybook-interest?resource=orders&id=<order UUID>`.

- `{ "action": "render_job" }`: claim/resume a saved per-order job and run the
  review renderer. All personalizations, selected image paths, version, and
  binding come from saved server records; no client source URL/path is accepted.
- `{ "action": "artifact_status" }`: return the current job and package.
- `{ "action": "approve_artifact_package", "packageId": "…", "packageHash": "…" }`:
  record the shared authenticated administrator role's candidate review.
- `{ "action": "request_artifact_changes", "packageId": "…", "packageHash": "…", "notes": "…" }`:
  record requested changes against that exact package.
- `{ "action": "get_customer_proof_link" }`: existing private order portal link.

Responses remain `{ order }`, with `order.artifact_job`,
`order.artifact_package`, `order.artifact_workflow_unavailable` on admin lists, and optionally `order.artifact_error`. A job contains
`id`, `status`, `attempts`, `errorCode`, `retryable`, and `retryAfter`.
The package contains `id`, `packageHash`, `status`, `format`, `reviewOnly:true`,
`productionReady:false`, `blockers`, `interior` and `cover` (each with a five-minute
signed URL, byte hash, length, and page count), `customerApproval`, and
`adminApproval`. Internal object paths/source snapshots are not returned in
these package views. Do not interpret review approval as production permission.

Customers use their existing opaque order-token authentication:
`GET/POST /api/storybook-interest?resource=customer-order`.
GET returns `order.proof.package` with the same exact files/package hash.
POST accepts `{ action: "approve" | "request_changes", packageId, packageHash,
notes? }`. Once the workflow starts, a persisted start marker prevents a missing/stale package
from falling back to an old manual proof. A manually uploaded legacy PDF can be
viewed/revised only outside package workflow, but cannot be
approved as an artifact package. Neither old `approve_proof` nor manual upload
can bypass the package workflow. Paid production approval remains closed.

## Snapshot, jobs, storage, and retries

`lib/order-artifacts.js` loads the saved order, saved 32-page master, and exactly
the selected preview row constrained to the saved monster submission. It reads
that preview's server-recorded `preview_path` from the configured
`monster-submissions` bucket. Background objects come only from saved
`artworkPath` values in `story-artwork`, or canonical local `/assets/` paths.
Arbitrary remote URLs, client paths, redirects, traversal, and out-of-root
symlinks are not supported. Canonical child assets keep their candidate/sample
statuses.

The input fingerprint includes order revision, names, character selection,
format, master/version/copy/layout, pose/crop fields, exact selected image and
all other image hashes, template and font hashes, renderer implementation, and
runtime versions. Buffers are frozen before rendering. A second snapshot is
checked after uploads and before commit.

The new private tables are `order_render_jobs` and `order_artifact_packages`.
Both enable RLS and grant no browser roles access. Transactional service-role
RPCs claim an exclusive ten-minute lease, reuse completed jobs for an unchanged
fingerprint, and recover failed/expired attempts without duplicating a set.
A terminated function may leave a running lease; the UI reports its retry-after
time, and the next administrator retry can reclaim it after expiration.

The migration creates the private `order-artifacts` bucket with the existing
20 MiB per-file cap. The application always writes with `x-upsert:false` to
order/input/hash-scoped paths. An upload retry verifies an existing object's
hash instead of overwriting it. Every upload is read back and hashed. Stored
PDFs and canonical manifest JSON are re-read and checked before signed review
links are issued. This is application-level immutability, not a cloud WORM
retention certification. A privileged out-of-band storage mutation is detected
on the next read. URLs expire after five minutes.

A package stores one 32-page interior and **only the order's chosen binding
cover**, plus a canonical JSON manifest binding source/personalization/render
fingerprints and exact stored byte hashes. The package hash covers that JSON.
Package content cannot be updated in place by the server's normal SQL path;
only review/status fields can change. A new source fingerprint creates a new
version and invalidates old approvals.

Order-input, master-story, and preview changes invalidate package pointers and
both approvals. Finish/review RPCs lock the order and recheck order revision,
master version/time, selected preview ownership/path/status, and format. Source
bytes are checked before rendering and every review; normal image-writing APIs
also never overwrite existing source paths. Candidate approvals leave the
order in `proofing` and do not set any production-ready flag or printer job.

## Verification and release boundary

Run `node --test tests/order-artifacts.test.js` for mock-only storage, SHA,
ownership, version, binding, approval, lease, duplicate, interrupted upload,
lost commit response, stale source, and authorization cases. These tests use
synthetic buffers and never touch a live database or real child data.

Migration `20261003213513_order_artifact_review_packages.sql` was generated with
official Supabase CLI 2.119.0 (temporary writable HOME), then edited
locally. It has not been applied or tested against a running database. Review
and authorized staging validation are still required before release. No live
project linking, grants, bucket creation, or migration application is part of
this milestone. Shipping this server code before its reviewed migration is
applied will fail closed.

Vercel packaging must include `lib/**`, the Fredoka/Chewy font files, canonical
character assets, both exact Lulu template PDFs, and any canonical local
background plates used by the saved master. The synchronous render path needs
an adequate function duration/memory budget. Production readiness still needs
approved art, native-resolution masters, independent prepress and physical
proofing, plus a separately authorized production handoff.

## API key headers

Per the official [Supabase API key documentation](https://supabase.com/docs/guides/getting-started/api-keys#known-limitations),
opaque `sb_secret_` / `sb_publishable_` keys travel only in the `apikey` header,
not as JWT Bearer tokens. The shared server helper preserves Bearer support for
legacy service-role JWT configuration. This change reads no actual key during
implementation, rotates no credential, and changes no connection settings.
