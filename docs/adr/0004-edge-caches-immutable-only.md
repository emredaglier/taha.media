# 4. Cloudflare caches immutable files only; settings as code

Date: 2026-11-05 · Status: accepted (copied from daglier.com ADR-0006)

Caching HTML at the edge can serve pages that point at deleted chunks, and Cloudflare features that rewrite or challenge requests have broken daglier.com before. Only `/_next/static/*` and R2 media are cached, as immutable. HTML and RSC are never cached at the edge, so publishing needs no purge. Bot Fight Mode, Rocket Loader, Email Obfuscation and Always Online are off. Cloudflare's always-on DDoS protection stays, and there is no rate limiting at the origin. A script applies the settings with an API token, and the repo documents them.
