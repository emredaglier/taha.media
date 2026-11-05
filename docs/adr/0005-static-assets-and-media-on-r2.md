# 5. Static assets and media served from R2; no runtime image optimizer

Date: 2026-11-05 · Status: accepted (copied from daglier.com ADR-0007)

CI uploads each release's `/_next/static` to R2, served from `cdn.taha.media` through `assetPrefix` and kept for 30 days. `deploymentId` is set, so a stale tab reloads cleanly instead of breaking. Images are resized to WebP sizes in `cms` at upload, and `srcset` is built from those sizes. Originals never appear in `srcset`, and `/_next/image` is not used. Videos are stored as uploaded. Object keys are unique per upload, so Cloudflare can cache them as immutable. The VPS does no media work while serving visitors.
