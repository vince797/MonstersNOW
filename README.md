# MonstersNOW

Starter website for MonstersNOW.

## Files

- `index.html` - page structure and content
- `monsters.html` - before and after monster gallery
- `styles.css` - layout, responsive styling, and visual design
- `scripts/main.js` - small browser behaviors
- `api/convert-monster.js` - Vercel serverless AI converter endpoint
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
previews, and approval/revision previews can reuse the same prompt language.

## Lulu sandbox

See `LULU_SANDBOX.md` for the server-side Lulu Print API sandbox setup. The
sandbox routes use `LULU_SANDBOX_CLIENT_KEY` and
`LULU_SANDBOX_CLIENT_SECRET`, never browser-exposed keys. The configured
storybook variants are an 8.5 x 8.5 in premium-color softcover and hardcover.
