# 12. Public pages are static and revalidated by tag on publish; /isler renders per request

Date: 2026-11-05 · Status: accepted

`/`, `/isler/[slug]` (through `generateStaticParams`), `/hakkimda` and `/gizlilik` are prerendered. When content is published, `cms` tells `web` over the internal Docker network to revalidate the tags it touched: the Work, the Works list, Home when the Work is featured, and a global's own tag. There is no time-based revalidation. `/isler` reads `?disiplin=`, so Next renders it per request. Its data still comes from tag-cached Local API reads, and HTML isn't edge-cached anyway (ADR-0004). A path segment such as `/isler/motion` was rejected because it would collide with Work slugs. The preview container (ADR-0001) renders drafts on every request.
