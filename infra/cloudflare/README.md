# Cloudflare settings

`infra/cloudflare/settings.sh` applies and re-checks every setting below ([ADR-0004](../../docs/adr/0004-edge-caches-immutable-only.md)). It needs `bash`, `curl` and `jq`.

```sh
export CLOUDFLARE_API_TOKEN=...      # see "Token" below
export CLOUDFLARE_ZONE_ID=...        # dashboard: taha.media > Overview > API
export CLOUDFLARE_ACCOUNT_ID=...     # same panel

infra/cloudflare/settings.sh            # plan: reads only, prints what would change
infra/cloudflare/settings.sh --apply    # apply the planned changes
```

Run the plan first. Run it again after `--apply`: it should print `0 change(s) planned`. Re-run the plan any time to find drift (a setting someone changed in the dashboard). The script only changes what differs, so it is safe to repeat. Agents never run it against the real API; the owner does. Tests run it against a local mock (`infra/cloudflare/settings.test.ts`).

Optional overrides: `MAIN_DOMAIN` (taha.media), `CDN_HOST` (cdn.taha.media). R2 buckets are not part of this script.

## Zone settings

| Setting                      | Value         | Why                                                                                                               |
| ---------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| SSL/TLS mode                 | Full (strict) | The origin has a valid certificate (Caddy); strict stops a downgrade to unverified TLS.                           |
| Bot Fight Mode               | off           | It can challenge subresource requests, and the free plan can't exempt paths. Always-on DDoS protection stays.     |
| Rocket Loader                | off           | Rewrites script tags and changes their load order.                                                                |
| Email Obfuscation            | off           | Injects a script and rewrites the HTML.                                                                           |
| Always Online                | off           | Serves stale HTML copies, which can point at deleted chunks.                                                      |
| Web Analytics auto-injection | off           | Analytics loads from an explicit script tag in code ([ADR-0007](../../docs/adr/0007-observability-free-tier.md)). |

There is no rate limiting at the origin.

## Cache rules

The script owns the whole cache-rules phase (`http_request_cache_settings`). Rules added by hand there are replaced on `--apply`.

1. **CDN host** (`http.host eq "cdn.taha.media"`): cache, edge and browser TTL respect the origin. R2 media and `/_next/static` releases have unique keys and immutable headers ([ADR-0005](../../docs/adr/0005-static-assets-and-media-on-r2.md)).
2. **Main domain, `/_next/static/` only**: cache, respect the origin. Immutable, content-hashed files.
3. **Main domain, everything else**: bypass. HTML and RSC are never cached at the edge, so publishing needs no purge and no page can point at a deleted chunk. Rule 3 excludes the static path, because Cloudflare applies every matching cache rule and a later one overrides an earlier one.

Nothing else is cached.

## Token

Create one API token only for this script, scoped to the taha.media zone and the account. Names are as in the dashboard's token builder; check them there.

| Scope | Permission           | Used for                                             |
| ----- | -------------------- | ---------------------------------------------------- |
| Zone  | Zone Settings: Edit  | SSL, Rocket Loader, Email Obfuscation, Always Online |
| Zone  | Bot Management: Edit | Bot Fight Mode                                       |
| Zone  | Cache Rules: Edit    | Cache rules phase                                    |

Web Analytics auto-injection may not be manageable by any API token: on daglier.com `/rum/site_info/list` answered 403 whatever the permissions. The plan then prints a `WARN` line and carries on. Turn it off by hand: dashboard, Analytics & Logs, Web Analytics, taha.media, Manage site, automatic setup off.

Set an expiry, keep the token in a password manager, and revoke it when you are done. It is separate from the R2 access keys the apps use at runtime.

## Verifying the API calls

The script was written against the Cloudflare API reference and tested only against a mock, never the real API. If the first real plan fails on an endpoint, the error shows the HTTP status and Cloudflare's message; the calls live in the `ensure_*` functions in `settings.sh`.

## More

- [UptimeRobot setup](uptimerobot.md)
- [Frontend handoff: Sentry and Web Analytics](frontend-handoff.md)
