# MonstersNOW

Starter website for MonstersNOW.

## Files

- `index.html` - page structure and content
- `styles.css` - layout, responsive styling, and visual design
- `scripts/main.js` - small browser behaviors
- `api/convert-monster.js` - Vercel serverless AI converter endpoint
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
environment variable, `/api/convert-monster` returns demo artwork so the page
continues to work.

The converter uses the uploaded child drawing as the source of truth and the
cropped images in `assets/master-references/` as light style references.
