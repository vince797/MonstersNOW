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
