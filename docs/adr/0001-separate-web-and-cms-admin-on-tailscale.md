# 1. Public site and admin are separate apps; the admin is reachable only over Tailscale

Date: 2026-11-05 · Status: accepted

The site follows the shape of daglier.com. A pnpm monorepo holds `apps/web`, `apps/cms` and `packages/cms-config`, the content schema both apps share. Payload 3 runs on one SQLite file on a single Hetzner VPS: `cms` writes to it, and `web` opens it read-only through the Payload Local API. It is not a headless API over HTTP. `web` is public and has no `/admin` and no `/api` routes. `cms` binds only to the Tailscale interface, and Taha reaches it through the Tailscale app on his own devices. Payload's login stays as a second layer. Drafts and versions are on. Unpublished changes are shown by a second container from the same `web` image (`PREVIEW=1`), also Tailscale-only. The public instance never serves drafts. `cms` tells `web` to revalidate over the internal Docker network.

## Considered options

- **Payload inside the public Next.js app** (Payload's default): one process, but `/admin` and the whole REST API are public.
- **Cloudflare Access in front of `admin.taha.media`**: nothing for Taha to install, but the admin hostname is public and depends on edge configuration. Rejected in favour of no public admin surface at all, at the cost of one app install for the only Editor.

## Consequences

Both apps must run on the same host because they share the SQLite file. Losing Tailscale access means losing admin access; recovery is SSH from the Hetzner console.
