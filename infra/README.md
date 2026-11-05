# infra

Server bootstrap, Compose, Caddy, Litestream, media backup and the release-gate smoke live here. Deploy and rollback arrive with #17.

## Contents

- [Compose](#compose): the stack, images, env files, local run
- [Backups: Litestream](#backups-litestream)
- [Release-gate smoke](#release-gate-smoke) and [What the frontend must provide](#what-the-frontend-must-provide)
- [Revalidation](#revalidation)
- [Server bootstrap](#server-bootstrap-infrabootstrapsh)
- [Media: soft delete, backup, restore](#media-soft-delete-backup-restore-adr-0006)

## Compose

`infra/compose.yaml` runs `caddy`, `web`, `web-preview`, `cms`, `litestream` and a one-off `migrate` (ADR-0001, ADR-0003, ADR-0009). Every long-running service has a memory limit, a health check and `restart: unless-stopped`; every one of them waits for `migrate` to complete first, and `caddy` waits for `web` to be healthy. `infra/compose.test.ts` checks these invariants without Docker.

| Service       | Image                                | Reaches it                                                         | Notes                                                                                       |
| ------------- | ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `caddy`       | `caddy:2.11.7-alpine`                | public 80 and 443                                                  | Only service on a public port. Proxies to `web` only; 404 for `/internal/*` and `/preview*` |
| `web`         | `${IMAGE_PREFIX}/web:${RELEASE}`     | Docker network only                                                | Published content only                                                                      |
| `web-preview` | the same `web` image, `PREVIEW=1`    | `127.0.0.1:3002`, put on the tailnet by `infra/tailscale-serve.sh` | Drafts, noindex                                                                             |
| `cms`         | `${IMAGE_PREFIX}/cms:${RELEASE}`     | `127.0.0.1:3001`, put on the tailnet by `infra/tailscale-serve.sh` | The only writer. No public port                                                             |
| `litestream`  | `litestream/litestream:0.5.17`       | none                                                               | Replicates the database to R2                                                               |
| `migrate`     | `${IMAGE_PREFIX}/migrate:${RELEASE}` | none                                                               | One-off: `payload migrate`, then exits 0                                                    |

**Read-only database.** `web` and `web-preview` open the SQLite file read-only at connection level: the `web` role runs `PRAGMA query_only = ON` on every connection (`packages/cms-config/src/db.ts`, covered by the Seam 1 tests). The data volume is deliberately mounted writable in those two services, as in daglier.com: a WAL reader has to use the `-shm` file, and a `:ro` mount would make it read pages that a checkpoint may reuse. They mount nothing else, and get no write secrets (no `S3_*`, no `SEED_*`, no `REVALIDATE_URL`).

**Images.** One `Dockerfile`, three targets, built from the repository root. CI builds them for `linux/arm64` on `ubuntu-24.04-arm` (#17); on an arm64 Mac the native build is the same platform. `web` and `cms` are Next.js standalone servers (`NEXT_STANDALONE=1`); `migrate` has the `cms-config` source and its production dependencies only. Build arguments `ASSET_PREFIX` and `DEPLOYMENT_ID` set Next's `assetPrefix` and `deploymentId` (ADR-0005); CI passes them in #17. All images run as uid 10001.

```sh
docker build --target web     -t taha/web:local .
docker build --target cms     -t taha/cms:local .
docker build --target migrate -t taha/migrate:local .
```

**On the server** (after `infra/bootstrap.sh`), settings live outside the repo in `/opt/taha/env`, one file per service (`ENV_DIR` overrides it). Generate secrets with `openssl rand -hex 32`.

| File             | Variables                                                                                                                                                                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cms.env`        | `PAYLOAD_SECRET`, `CMS_ORIGINS` (the tailnet HTTPS URL of the admin, for example `https://<name>.<tailnet>.ts.net:9443`), `REVALIDATE_SECRET`, `PREVIEW_URL` (`https://<name>.<tailnet>.ts.net:8443`), `MEDIA_ORIGIN`, `S3_*` (R2), `SEED_*` once. Read by `cms` and `migrate`. `apps/cms/.env.example` documents each |
| `web.env`        | `PAYLOAD_SECRET` (its own, never the cms one: web signs nothing), `REVALIDATE_SECRET` (equal to cms's), `MEDIA_ORIGIN` (equal to cms's)                                                                                                                                                                                |
| `litestream.env` | `LITESTREAM_BUCKET` (`taha-db-backups`), `LITESTREAM_ENDPOINT` (`https://<account>.r2.cloudflarestorage.com`), `LITESTREAM_REGION` (`auto`), `LITESTREAM_ACCESS_KEY_ID`, `LITESTREAM_SECRET_ACCESS_KEY` (a key scoped to that bucket)                                                                                  |

Then, once: `sudo chown 10001:10001 /opt/taha/data` (the images' app user owns the database folder), put the Cloudflare Origin CA certificate and key in `/opt/taha/certs/origin.pem` and `origin.key` (`CERTS_DIR`), run `infra/tailscale-serve.sh`, and start the stack with `RELEASE=<tag> docker compose -f infra/compose.yaml up -d --wait`. The first start also needs the production seed (ADR-0013): `docker compose -f infra/compose.yaml run --rm migrate node node_modules/payload/bin.js run seed-production.ts` with `SEED_*` set in `cms.env`.

**Locally.** `infra/compose.local.yaml` swaps in the `:local` images, dummy secrets, a Docker-managed data volume, plain HTTP on `http://127.0.0.1:8080` and an S3 stand-in for Litestream:

```sh
IMAGE_PREFIX=taha RELEASE=local docker compose -f infra/compose.yaml -f infra/compose.local.yaml up --wait
```

Admin: `http://127.0.0.1:3001/admin`, preview: `http://127.0.0.1:3002`. The migrate container runs with `NODE_ENV=production`, so the migrated database is empty: create the first Editor in the admin (first visit).

**Ports.** Published container ports bypass `ufw`, so `cms` and `web-preview` bind `127.0.0.1` only and `tailscale serve` is their only way out (HTTPS on 9443 and 8443, never 443: Caddy owns it). `infra/tailscale-serve.test.ts` keeps the script and the Compose ports in step.

## Backups: Litestream

`litestream` streams the database to the private R2 bucket every 5 seconds, with a full snapshot every 6 hours kept for 7 days (`infra/litestream/litestream.yml`; credentials come from `litestream.env`, never the file). Litestream owns checkpoints: nothing may run `PRAGMA wal_checkpoint(TRUNCATE|RESTART)`.

- **Restore** into an empty directory (never over the live file): `infra/litestream/restore.sh -f infra/compose.yaml -- /opt/taha/restored [-timestamp 2026-11-01T10:00:00Z]`. To put it live: stop `web`, `web-preview`, `cms` and `litestream`, move the restored `taha.db*` into `/opt/taha/data` (owner 10001), start the stack.
- **Flush before a risky step** (the deploy uses it, #17): `infra/litestream/snapshot.sh -f infra/compose.yaml`. Exit 0 only when the replica is current.
- **Drill:** `infra/litestream/drill.sh` writes content through `cms`, replicates to the local S3 stand-in, restores, and checks the restored file (integrity, WAL, content), twice. Needs Docker, the `:local` images, `curl` and `sqlite3`. `infra/litestream.test.ts` covers the config and the two scripts against a fake `docker`.

## Release-gate smoke

`pnpm smoke` is the release gate (CODING_STANDARDS, "Smoke specs"; ADR-0010). Desktop Chromium only. Needs Docker and `pnpm exec playwright install chromium` once.

1. Migrates a temp database and fills it with `pnpm seed`, then `smoke:prepare` adds a never-published Work and renames a published one, and writes the manifest (`packages/cms-config/src/seed/smoke.ts`). The spec reads titles, slugs and page texts from that manifest, so editing the seed never needs a spec change.
2. Builds the `web` image with `ASSET_PREFIX=https://cdn.taha.media/releases/smoke` and a deployment id (skipped with `SMOKE_WEB_IMAGE` plus `SMOKE_ASSET_PREFIX`).
3. Starts `web`, `web-preview` and Caddy (the local Caddyfile and `site.caddy`, as in Compose) on one Docker network.
4. Warms the cache, saves one retitled Work through the Local API with the revalidate call aimed at the container, and runs `smoke/smoke.spec.ts`.

What it asserts: every public route (`/`, `/hakkimda`, `/gizlilik` and `/isler/<slug>` for each published Work) loads with its content, no console error, no failed request and no 404; a renamed Work's old slug redirects; a never-published Work and an unknown path are 404 with content; no admin, API, internal or preview route on the public instance (and no admin or API on `web` itself); the revalidate route answers 401 without or with a wrong secret and Caddy refuses it publicly; the preview instance shows the draft after `/preview?path=...` and is noindex on every response; no route sets a cookie; static assets come from the CDN prefix with `?dpl=`; one CMS edit reaches the prerendered pages. Seeded media is served to the browser from the seed's folder (the demo seed refuses R2 settings, so its files stay on local disk).

The failure rules are unit-tested without a browser (`smoke/failure-rules.test.ts`: a console error, a 404 or a reachable admin route fails the run; `smoke/manifest.test.ts`: an empty or half-written manifest stops the run).

**The smoke cannot pass against the empty `web` shell, and it is meant to fail there.** The shell serves `<main />` on `/` and 404 on `/hakkimda`, `/gizlilik` and every `/isler/<slug>`, so the route tests fail on missing pages and missing content. It does not skip, and it does not pass on an empty page.

### What the frontend must provide

For `pnpm smoke` to pass, `apps/web` must:

1. **Routes.** `/`, `/hakkimda`, `/gizlilik` and `/isler/<slug>` for every published Work (`generateStaticParams`, ADR-0012). `/isler` may exist; the smoke does not check it.
2. **Content in the server HTML**, inside a `<main>` element, not only after hydration: Home shows the title of every Featured Work and links each to `href="/isler/<slug>"`; a Work page shows the Work's title in an `<h1>` inside `<main>`; `/hakkimda` shows the first words of the About text (`bio`); `/gizlilik` shows the first words of the Privacy text (`body`). Titles and texts are the Turkish ones in the database; the spec compares the HTML-escaped text.
3. **404.** An unknown path, an unpublished slug and an unknown slug answer HTTP 404 with a visible page that has an `<h1>` in the server HTML (not a blank body).
4. **Old slugs.** `/isler/<old slug>` of a Work whose slug changed answers a 301 or 308 to `/isler/<new slug>` (`getWorkBySlug` already returns the redirect).
5. **A clean console.** No `console.error`, uncaught error, failed request or 4xx/5xx response on any of those pages, including images, video posters and fonts. Image and video URLs from the data module (`/api/images/file/...` in the smoke database) are answered from the seed folders inside the browser; with R2 they are `MEDIA_ORIGIN` URLs.
6. **No cookies** on any response, and **no `noindex`** (header or meta tag) on the public instance. The preview instance (`PREVIEW=1`) already sends `X-Robots-Tag: noindex, nofollow` (`proxy.ts`); it must also render `<meta name="robots" content="noindex...">` (the root layout does).
7. **Assets under the prefix.** Every `/_next/static` URL in the HTML of Home starts with `ASSET_PREFIX` and carries `?dpl=` (set by `assetPrefix` and `deploymentId`, already wired in `next.config.ts`). Fonts and CSS `url()` must resolve under the prefix too.
8. **No database at build time.** `docker build` runs `next build` with no `DATABASE_PATH`, so pages must not read content while building; otherwise the build either fails or bakes build-time content into the image. Pages render and cache on first request (`unstable_cache` with tags, `dynamicParams`), or `generateStaticParams` returns an empty list when there is no database. The smoke's cache-warming step and its live edit check this behaviour.
9. **Drafts on the preview instance.** After `/preview?path=/isler/<slug>`, the preview instance renders a never-published Work at that path (HTTP 200, title in the HTML). The public instance answers 404 for it.
10. **`proxy.ts` keeps the preview header** on every response (already in place).

## Revalidation

`cms` tells `web` which cache tags a publish touched by POSTing to `web`'s `/internal/revalidate` (ADR-0001, ADR-0012). Requirements:

- **Internal only.** `cms` (and `migrate`, when it seeds) use `REVALIDATE_URL=http://web:3000/internal/revalidate` on the internal Docker network. Caddy must answer `/internal/*` with 404 on every public host, so the route is never reachable from the internet. The smoke spec checks this.
- **Shared secret.** `REVALIDATE_SECRET` holds the same value on `cms`, `migrate` and `web`. The route rejects a missing or wrong secret with 401, and it rejects every request while `web` has no secret set.
- **Not `web-preview`.** The preview instance (`PREVIEW=1`) never caches reads, so it needs no notification.

Tag names live in `packages/cms-config/src/tags.ts`. To refresh by hand (for example after editing the database directly), POST `{"tags":["works","home","page:site"]}` with the `x-revalidate-secret` header from inside the `web` container.

## Server bootstrap: `infra/bootstrap.sh`

Turns a fresh Hetzner ARM VPS (Ubuntu 26.04 LTS) into the Docker host. Not run by tests against a real system; cutover (ADR-0011) runs it once.

What it sets up: an admin user with SSH keys only (no passwords, no root login), Tailscale, ufw with only 80/443 public and SSH on `tailscale0` only, 2G swap, Docker with `live-restore`, `/opt/taha/{data,env}`, security-only unattended upgrades that never reboot or restart the app (Docker packages held back, `needrestart` only lists), and a reboot window at Sunday 04:00 Europe/Istanbul that reboots only when the system says one is required.

### Manual inputs

| Input                  | Flag / env                    | Where it comes from                                                                            |
| ---------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Admin user name        | `--admin-user` / `ADMIN_USER` | Chosen by the owner                                                                            |
| SSH public key(s)      | `--ssh-key` / `SSH_KEY`       | The owner's `.pub` file (a line or a path). Never a private key; the script refuses it         |
| Tailscale auth key     | `TS_AUTHKEY` (env preferred)  | Tailscale admin console, Settings, Keys: one-off, short expiry. Flags show in `ps`, so use env |
| Tailscale machine name | `--hostname` / `TS_HOSTNAME`  | Chosen by the owner; also the MagicDNS name                                                    |

### Run

```
sudo TS_AUTHKEY=tskey-auth-... infra/bootstrap.sh --admin-user NAME --ssh-key ~/key.pub --hostname NAME
```

`--dry-run` prints every action and needs no root. The script is idempotent: re-run it after fixing any error.

### Lockout safety

Public port 22 is closed last, and only after a guard confirms the admin key is installed, Tailscale is Running with an IPv4, `sshd -t` passes and the `tailscale0` SSH rule exists. If the guard fails, SSH stays open and the script stops. If you are locked out anyway: Hetzner Cloud Console (browser console or rescue mode), log in as the admin user, `sudo ufw allow 22/tcp`.

### Tests

`infra/bootstrap.test.ts` runs the script against a fake system: `BOOTSTRAP_ROOT` redirects every written file into a temp dir and recording stubs replace `ufw`, `tailscale`, `systemctl` and the rest on `PATH`.

## Media: soft delete, backup, restore (ADR-0006)

Deleting an Image or Video in the `cms` admin (single, bulk or API) removes the record and **moves** its R2 objects (the original and every generated size) to `trash/<key>` in `taha-media`: a copy, then a delete of the live key. If the copy fails, the failure is logged, the live file stays where it was, and the record is still deleted. Code: `packages/cms-config/src/media-trash.ts`, called from `storage.ts`.

- **30-day expiry.** R2 lifecycle rules match by key prefix only and R2 has no object tagging, so the rule is on the prefix `trash/`. `infra/media-trash/lifecycle.json` is that rule in R2's API shape. The Cloudflare script (`infra/cloudflare/settings.sh`) does not manage R2 buckets, so **the owner applies it once at cutover**: dashboard, R2, `taha-media`, Settings, Object lifecycle rules (delete objects under `trash/` 30 days after creation), or `curl -X PUT -H "Authorization: Bearer $TOKEN" --data @infra/media-trash/lifecycle.json https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/r2/buckets/taha-media/lifecycle`. That PUT replaces the bucket's whole rule list. The 30 days count from the move. The backup bucket never gets a lifecycle rule.
- **Backup.** `.github/workflows/media-backup.yml` runs `infra/media-backup/media-backup.sh` nightly: it copies only new keys from `taha-media` to `taha-backup` (`rclone copy --ignore-existing`), skipping `_next/**` and `trash/**`, then checks every listed object is there. It never deletes, so a file the lifecycle rule removed from `trash/` stays in `taha-backup` under its live key. The backup bucket's write key should have no delete permission. Secrets (set at cutover): `R2_ACCOUNT_ID`, `R2_MEDIA_READ_KEY_ID`, `R2_MEDIA_READ_SECRET`, `R2_BACKUP_WRITE_KEY_ID`, `R2_BACKUP_WRITE_SECRET`. Without them the job skips. Our own variables must never start with `RCLONE_` (rclone reads them as flags); only `RCLONE_CONFIG_<remote>_*` is intended.
- **Restore a deleted file.** The record is gone for good, so moving the objects back changes nothing the site can show. Re-upload the original as a new record:
  1. Find the original. Within 30 days it is in `taha-media` under `trash/` (Cloudflare dashboard, R2; names start with the original file name plus a random suffix, and the original is the one without a size suffix such as `-small`). After 30 days, take it from `taha-backup`, same key without `trash/`. A file deleted before the night's backup ran is in `trash/` only, so restore it within the 30 days.
  2. Download it (dashboard, or `rclone copyto SRC:taha-media/trash/<key> .` with a read key).
  3. Upload it in the `cms` admin as a new Image (add the alt text again) or Video (use and poster again), then put it back in the Works that used it.
- **Tests.** `packages/cms-config/src/media-trash.int.test.ts` (copy then delete, record gone, files under `trash/`, failed copy keeps the file) against the S3 stub; `infra/media-trash/lifecycle.test.ts` (rule matches the prefix and 30 days); `infra/media-backup/media-backup.test.ts` against a fake rclone.
