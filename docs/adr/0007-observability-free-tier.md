# 7. Observability on free tiers

Date: 2026-11-05 · Status: accepted (copied from daglier.com ADR-0011)

Sentry runs on the free plan, browser side only, with no session replay and no cookies. Cloudflare Web Analytics is cookieless and is loaded as an explicit script tag in code, not auto-injected. UptimeRobot checks `/`, one Work page and one static chunk. Deploy smoke checks and rollback alerts cover releases. The privacy page must name Sentry and Cloudflare.
