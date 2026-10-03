# Isolated review preview

This branch is a synthetic review candidate, not a production release.

## Isolation

- `middleware.ts` intercepts all API paths before normal handlers or rewrites in Vercel Preview. It does not use request headers to decide the deployment environment.
- Every API handler also calls `guardReviewPreview` before its original logic, so invoking a function without middleware cannot activate its normal Preview behavior.
- The fixture handler imports only local proof/composition/geometry helpers. It has no database, mail, payment, image-generation, print, or network client.
- Proof choices consist of a canonical illustrated-child ID and binding format. All names and artwork are bundled synthetic examples. Proof receipts are inert strings, never real signed checkout tokens.
- All mutation/admin/upload/payment/print routes are blocked. The original API credentials are never read by the fixture implementation.
- The preview UI disables personal-data and upload fields, explains the synthetic mode, and reconstructs allowed API requests without private form values or authentication headers. The eight illustrated choices and monster-only choice remain available. A normal-production 404 status probe restores normal UI behavior.
- Protected Preview URLs must stay behind the project's existing Vercel Authentication. Do not enable bypass secrets, change protection, promote the branch, or alias it to production.

## Tests

Run `node --test tests/review-preview-isolation.test.js tests/review-preview-ui.test.js` for middleware, direct handler, synthetic-data, production-pass-through, and browser-request tests.

Run `CHROMIUM_PATH=/path/to/chromium node tests/review-preview-browser.js` for a real-browser customer/admin smoke. It blocks off-origin requests. A launch failure is not a browser pass.

After deployment, check the exact commit, READY status, protection, every denied API family, both formats, all character choices, and browser console/network behavior. Local tests do not establish Vercel behavior.

## Renderer runtime limits and outstanding verification

The PDF renderer in `lib/composed-book-pdf.js` uses Node.js, `sharp`/libvips, `pdf-lib`, `@pdf-lib/fontkit`, and local font/template/image bytes. It does not invoke Poppler. `pdftoppm` is used only by the local inspection helper `scripts/render-review-pdf-previews.js`; it is not a deployment dependency.

The project is configured for Node 24 in Vercel. The lockfile includes Sharp's platform-specific optional packages. Deployment must install for Vercel's Linux architecture and successfully load Sharp, rather than copying this machine's node_modules.

`api/storybook-interest.js` declares 60 seconds and explicit inclusion of the library, fonts, characters, props, Lulu templates, and Halloween background plates. The synthetic middleware also needs its manuscript and bundled sample image included. Check the built function traces; source include patterns are not proof of the deployed bundle.

At review time, the relevant source groups are approximately 28 MiB of character candidates, 32 MiB of Halloween environment plates, 2.4 MiB of props, 0.32 MiB of fonts, 0.16 MiB of templates, and 33 MiB of locally installed native image libraries. These are source measurements, not the built bundle. Other dependencies and duplicate traced files increase the deployed size. All assets total roughly 265 MiB, so a wholesale CLI source upload may exceed the Hobby source-upload allowance. Do not solve that by dropping required art or switching to a paid plan without review.

Vercel documents a standard 250 MiB uncompressed function limit and a 4.5 MiB non-streaming payload limit. A full book/PDF response may exceed the payload limit even when the function bundle fits. The normal API has a 60-second configured timeout. This review does not establish peak memory, cold-start performance, full renderer execution within that timeout, successful private artifact persistence, or printer acceptance in Vercel.

The synthetic status endpoint deliberately reports `rendererRuntimeVerified: false`. A representative fully local render in the deployed isolated runtime, with duration/memory/bundle evidence and no production data or services, is still required before changing that claim. No hosted storage grants or SQL migrations are applied by this review branch.

References: https://vercel.com/docs/routing-middleware/api ; https://vercel.com/docs/project-configuration/vercel-json ; https://vercel.com/docs/functions/limitations ; https://vercel.com/docs/limits
