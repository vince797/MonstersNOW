# AI endpoint abuse protection

The paid OpenAI calls happen in two endpoints:

| Endpoint | OpenAI calls per request |
| --- | --- |
| `POST /api/convert-monster` | drawing check (`gpt-4.1-mini` vision) + monster image + optional coloring page |
| `POST /api/render-child-character` | one 1024×1536 image edit |

Both endpoints already require a saved monster submission (`submissionId` +
token). Submissions are created by `POST /api/monster-submissions` (drawing
upload), so that upload is the gate and is protected too.

## Limits (application layer)

Each request consumes one hit in every bucket for its scope. A request is
refused if **any** bucket is full, and a refused request uses up nothing.

| Scope | Per IP / hour | Per IP / day | Per submission / 24 h | Global daily cap |
| --- | --- | --- | --- | --- |
| Drawing upload | 15 | 40 | – | – |
| Monster preview | 20 | 60 | 8 | shared |
| Child character render | 30 | 80 | 12 | shared |

- **Global daily cap:** `AI_GLOBAL_DAILY_LIMIT` (default **1000** AI requests
  per UTC day across both AI endpoints; `off` disables it). Resets at midnight
  UTC (8 pm ET).
- A normal customer uses 1 upload, up to 3 monster previews, and a handful of
  child renders. The per-submission limits leave room for retries after errors.
- IPv6 clients are grouped by /64. IPs are stored only as keyed hashes
  (`AI_RATE_LIMIT_SECRET`, falling back to `ORDER_ACCESS_SECRET`).
- Limits are checked after the submission token is verified and **before any
  OpenAI call**, including the drawing check.
- Limited visitors get HTTP 429, a `Retry-After` header, and a friendly
  message (for example "Whoa, that's a lot of monster magic in a short time!
  Please take a little break and try again in about 20 minutes.").

### Storage

Counters live in `public.ai_rate_limits`, updated atomically by
`public.consume_ai_rate_limits(jsonb)` (migration
`supabase/migrations/20261008150000_add_ai_rate_limits.sql`). The function is
callable only with the service-role key.

Until the migration is applied, or if Supabase is slow (>2.5 s) or unavailable,
the same limits are enforced **in memory per function instance**. That is
weaker, so generation keeps working, and a warning is logged:
`AI rate limit table is not installed ... Apply migration 20261008150000`.

Emergency switch: `AI_RATE_LIMITS_ENABLED=false` disables all application
limits. The Vercel firewall rule below still applies.

## Optional bot check (Cloudflare Turnstile)

Off by default. It turns on only when all three are set:

```
TURNSTILE_ENABLED=true
TURNSTILE_SITE_KEY=<site key>
TURNSTILE_SECRET_KEY=<secret key>
```

When it is on, the storefront shows an "interaction-only" Turnstile check
before a drawing upload (most visitors see nothing). The server verifies the
token with Cloudflare `siteverify` (action `monster_upload`). Both AI endpoints
require the resulting submission, so the check covers them without challenging
every generation. If Cloudflare is unreachable, the upload is allowed and the
rate limits still apply.

To set it up: Cloudflare dashboard → Turnstile → Add widget. Use hostnames
`monstersnow.com` and `www.monstersnow.com` (add the Vercel preview domain if
you want to test there) and widget mode **Managed**. Add the three env vars in
Vercel and redeploy. The CSP in `vercel.json` already allows
`https://challenges.cloudflare.com` (script and frame).

Vercel BotID is an alternative, but it is built around Next.js and the
`botid` package; Turnstile fits this static-HTML site with no build step.

## Recommended Vercel firewall rule (edge layer)

This rule stops floods before they reach a function (and before any database
call). Set it in Vercel → Project → **Firewall** → Configure → **+ New Rule**:

- **Name:** AI endpoints burst limit
- **If** Request Path **Matches Expression**
  `^/api/(convert-monster|render-child-character|monster-submissions)$`
  **AND** Request Method **Equals** `POST`
- **Then** Rate Limit → Fixed Window, **600 s** window, **20** requests, key
  **IP** → action **Too Many Requests (429)**
- Save, then **Publish**.

Or with the Vercel CLI (rules are staged; publish to apply):

```bash
vercel firewall rules add "AI endpoints burst limit" \
  --condition '{"type":"path","op":"re","value":"^/api/(convert-monster|render-child-character|monster-submissions)$"}' \
  --condition '{"type":"method","op":"eq","value":"POST"}' \
  --action rate_limit \
  --rate-limit-window 600 \
  --rate-limit-requests 20 \
  --rate-limit-keys ip \
  --rate-limit-action rate_limit \
  --yes
vercel firewall diff
vercel firewall publish --yes
```

Notes:

- Hobby allows one rate-limit rule per project (10-minute max window); Pro
  allows more. On Pro, add a second identical rule keyed by **JA4 Digest**
  (for example 60 requests / 600 s) to catch one bot spread across many IPs.
- Don't use the **Challenge** action on these API paths. The storefront calls
  them with `fetch`, which can't solve a browser challenge.
- Use the Firewall overview (filter by this rule) to check traffic for a few
  days and tune the numbers.
