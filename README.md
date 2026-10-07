# ip-check-proxy

Free IP geolocation proxy for [info.madmaxlax.com](http://info.madmaxlax.com).

## Why

ip-api.com's free tier blocks HTTPS, so calling it directly from an HTTPS
page fails. This Netlify function calls ip-api.com over plain HTTP
server-side (no key needed) and falls back to other free no-key APIs when
that fails.

## Endpoint

`GET https://ip-check.madmaxlax.com/api/ip`

(a `_redirects` rewrite keeps this clean; the raw function path is
`/.netlify/functions/ip`)

Response:

```json
{
  "ok": true,
  "ip": "203.0.113.42",
  "country": "United States",
  "countryCode": "US",
  "region": "California",
  "city": "San Jose",
  "isp": "Example ISP",
  "org": "Example Org",
  "timezone": "America/Los_Angeles",
  "source": "ip-api.com"
}
```

`source` tells you which upstream answered. On total failure:

```json
{ "ok": false, "error": "all-sources-failed", "ip": "203.0.113.42" }
```

CORS is wide open (`Access-Control-Allow-Origin: *`) so any page can call it.

## Sources (tried in order)

1. `ip-api.com` over HTTP — free, no key, ~45 req/min per IP
2. `ipwho.is` over HTTPS — free 10k/mo, no key
3. `ipapi.co` over HTTPS — free 30k/mo, no key

The client IP comes from Netlify's `x-nf-client-connection-ip` header.

## Deploy

Merges to `main` auto-deploy via `.github/workflows/deploy.yml` (needs a
`NETLIFY_AUTH_TOKEN` repo secret holding a Netlify personal access token).

Manual deploy, no build step, with the Netlify API:

```bash
python3 ~/workspace/skills/netlify/bin/deploy_function.py \
  --site ip-check-madmaxlax \
  --name ip \
  --file netlify/functions/ip.js \
  --wait
```

(`netlify.toml` also maps `/api/ip` to the function for git-connected deploys.)

## Client usage (info.madmaxlax.com)

Replace the direct ip-api.com call with:

```js
fetch("https://ip-check.madmaxlax.com/api/ip")
  .then((r) => r.json())
  .then((loc) => {
    // loc.ip, loc.city, loc.region, loc.country, loc.countryCode,
    // loc.isp, loc.org, loc.timezone
  });
```

Field names are stable across sources (unlike raw ip-api.com responses,
which use `query` and `regionName`).
