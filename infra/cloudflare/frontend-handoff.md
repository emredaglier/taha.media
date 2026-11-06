# Frontend handoff: Sentry and Web Analytics

For whoever builds the web layout. The two script tags belong in the frontend, not in infra ([ADR-0007](../../docs/adr/0007-observability-free-tier.md)). Cloudflare's automatic injection is turned off by `settings.sh`, so the tag must be explicit in code.

## Cloudflare Web Analytics

- Cookieless. Load an explicit `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "<TOKEN>"}'>` in the root layout, in production only.
- Input: the **site token** from the dashboard (Analytics & Logs, Web Analytics, taha.media, Manage site). It is public by design (it appears in the page), so it may be a build-time `NEXT_PUBLIC_` variable.
- Do not enable the dashboard's "automatic setup".

## Sentry

- Free plan, browser side only: `@sentry/nextjs` client config, no server or edge init, no session replay, no cookies. Keep the tracing sample rate low.
- Input: the project **DSN** (public by design, so a `NEXT_PUBLIC_` variable is fine).
- Source-map upload needs a Sentry **auth token** (`SENTRY_AUTH_TOKEN`), org and project. This is a secret: it lives only in the CI secrets, never in the image or the repo. Skip upload if the token is missing.
- Scrub personal data before sending (no IP, no cookies, no user object).
- The privacy page must name Sentry and Cloudflare.

## CSP entries

Only if the web app sets a Content-Security-Policy:

| Directive                          | Entry                                                                                                | For                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| `script-src`                       | `https://static.cloudflareinsights.com`                                                              | Web Analytics tag              |
| `connect-src`                      | `https://cloudflareinsights.com`                                                                     | Web Analytics                  |
| `connect-src`                      | `https://*.ingest.sentry.io` (or the exact DSN host, for example `https://o123.ingest.de.sentry.io`) | Sentry events                  |
| `script-src`                       | `https://cdn.taha.media`                                                                             | Next.js chunks (`assetPrefix`) |
| `img-src`, `media-src`, `font-src` | `https://cdn.taha.media`                                                                             | R2 media and fonts             |

If the Sentry SDK is bundled (the default), no Sentry script host is needed in `script-src`. Check the DSN host's region before shipping; the EU and US ingest hosts differ.
