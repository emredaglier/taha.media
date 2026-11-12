# infra

Server bootstrap, Compose, Caddy, Litestream, media backup, the release-gate smoke, CI delivery and the deploy with rollback live here.

## Contents

- [Compose](#compose): the stack, images, env files, local run
- [Backups: Litestream](#backups-litestream)
- [Release-gate smoke](#release-gate-smoke) and [What the frontend must provide](#what-the-frontend-must-provide)
- [CI and deploy](#ci-and-deploy): the pipeline, static assets on R2, deploy and rollback, secrets
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

**Images.** One `Dockerfile`, three targets, built from the repository root. CI builds them for `linux/arm64` on `ubuntu-24.04-arm` ([CI and deploy](#ci-and-deploy)); on an arm64 Mac the native build is the same platform. `web` and `cms` are Next.js standalone servers (`NEXT_STANDALONE=1`); `migrate` has the `cms-config` source and its production dependencies only. Build arguments `ASSET_PREFIX` and `DEPLOYMENT_ID` set Next's `assetPrefix` and `deploymentId` (ADR-0005); CI passes them for each release (`infra/assets.sh build-args`). All images run as uid 10001.

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
- **Flush before a risky step** (the deploy runs it before migrating): `infra/litestream/snapshot.sh -f infra/compose.yaml`. Exit 0 only when the replica is current.
- **Drill:** `infra/litestream/drill.sh` writes content through `cms`, replicates to the local S3 stand-in, restores, and checks the restored file (integrity, WAL, content), twice. Needs Docker, the `:local` images, `curl` and `sqlite3`. `infra/litestream.test.ts` covers the config and the two scripts against a fake `docker`.

## Release-gate smoke

`pnpm smoke` is the release gate (CODING_STANDARDS, "Smoke specs"; ADR-0010). Desktop Chromium only. Needs Docker and `pnpm exec playwright install chromium` once.

1. Migrates a temp database and fills it with `pnpm seed`, then `smoke:prepare` adds a never-published Work and renames a published one, and writes the manifest (`packages/cms-config/src/seed/smoke.ts`). The spec reads titles, slugs and page texts from that manifest, so editing the seed never needs a spec change.
2. Builds the `web` image with `ASSET_PREFIX=https://cdn.taha.media/releases/smoke` and `DEPLOYMENT_ID=smoke` (skipped with `SMOKE_WEB_IMAGE` plus `SMOKE_ASSET_PREFIX` and `SMOKE_DEPLOYMENT_ID`, which is what CI does: `infra/ci.sh smoke <sha>`).
3. Starts `web`, `web-preview` and Caddy (the local Caddyfile and `site.caddy`, as in Compose) on one Docker network.
4. Warms the cache, saves one retitled Work through the Local API with the revalidate call aimed at the container, and runs `smoke/smoke.spec.ts`.

What it asserts: every public route (`/`, `/galeri`, `/hakkimda`, `/gizlilik` and `/isler/<slug>` for each published Work) loads with its content, no console error, no failed request and no 404; a renamed Work's old slug redirects; a never-published Work and an unknown path are 404 with content; no admin, API, internal or preview route on the public instance (and no admin or API on `web` itself); the revalidate route answers 401 without or with a wrong secret and Caddy refuses it publicly; the preview instance shows the draft after `/preview?path=...` and is noindex on every response; no route sets a cookie; static assets come from the CDN prefix with `?dpl=<this deployment id>`; Home and a Work page render `<html data-dpl-id="<id>">` and answer a client navigation (an RSC request) with `x-nextjs-deployment-id: <id>` (the stale-tab check, see [Stale tabs](#stale-tabs-across-a-deploy)); one CMS edit reaches the prerendered pages. Seeded media is served to the browser from the seed's folder (the demo seed refuses R2 settings, so its files stay on local disk).

The failure rules are unit-tested without a browser (`smoke/failure-rules.test.ts`: a console error, a 404 or a reachable admin route fails the run; `smoke/manifest.test.ts`: an empty or half-written manifest stops the run).

**The smoke cannot pass against the empty `web` shell, and it is meant to fail there.** The shell serves `<main />` on `/` and 404 on `/galeri`, `/hakkimda`, `/gizlilik` and every `/isler/<slug>`, so the route tests fail on missing pages and missing content. It does not skip, and it does not pass on an empty page.

### What the frontend must provide

For `pnpm smoke` to pass, `apps/web` must:

1. **Routes.** `/`, `/galeri`, `/hakkimda`, `/gizlilik` and `/isler/<slug>` for every published Work (`generateStaticParams`, ADR-0012). `/isler` may exist; the smoke does not check it.
2. **Content in the server HTML**, inside a `<main>` element, not only after hydration: Home shows the title of every Featured Work and links each to `href="/isler/<slug>"`; a Work page shows the Work's title in an `<h1>` inside `<main>`; `/galeri` shows the caption of every Gallery item that has one (the smoke seed holds captioned items, and the gate fails if it has none); `/hakkimda` shows the first words of the About text (`bio`); `/gizlilik` shows the first words of the Privacy text (`body`). Titles and texts are the Turkish ones in the database; the spec compares the HTML-escaped text.
3. **404.** An unknown path, an unpublished slug and an unknown slug answer HTTP 404 with a visible page that has an `<h1>` in the server HTML (not a blank body).
4. **Old slugs.** `/isler/<old slug>` of a Work whose slug changed answers a 301 or 308 to `/isler/<new slug>` (`getWorkBySlug` already returns the redirect).
5. **A clean console.** No `console.error`, uncaught error, failed request or 4xx/5xx response on any of those pages, including images, video posters and fonts. Image and video URLs from the data module (`/api/images/file/...` in the smoke database) are answered from the seed folders inside the browser; with R2 they are `MEDIA_ORIGIN` URLs.
6. **No cookies** on any response, and **no `noindex`** (header or meta tag) on the public instance. The preview instance (`PREVIEW=1`) already sends `X-Robots-Tag: noindex, nofollow` (`proxy.ts`); it must also render `<meta name="robots" content="noindex...">` (the root layout does).
7. **Assets under the prefix.** Every `/_next/static` URL in the HTML of Home starts with `ASSET_PREFIX` and carries `?dpl=<deployment id>` (set by `assetPrefix` and `deploymentId`, already wired in `next.config.ts`; `data-dpl-id` and the navigation header come from Next with nothing to add). Fonts and CSS `url()` must resolve under the prefix too.
8. **No database at build time.** `docker build` runs `next build` with no `DATABASE_PATH`, so pages must not read content while building; otherwise the build either fails or bakes build-time content into the image. Pages render and cache on first request (`unstable_cache` with tags, `dynamicParams`), or `generateStaticParams` returns an empty list when there is no database. The smoke's cache-warming step and its live edit check this behaviour.
9. **Drafts on the preview instance.** After `/preview?path=/isler/<slug>`, the preview instance renders a never-published Work at that path (HTTP 200, title in the HTML). The public instance answers 404 for it. The smoke's draft has a cover and main media: the preview leaves out a draft that lacks them (it cannot render it yet), so that one is a 404 there too.
10. **`proxy.ts` keeps the preview header** on every response (already in place).

The post-deploy check on the server (`infra/smoke.sh`, [CI and deploy](#ci-and-deploy)) also needs, once Works are published: a link `href="/isler/<slug>"` on Home or on `/isler`, and on that Work page an `<img>`, `<video>` or `<source>` whose `src` or `poster` is an absolute R2 media URL (`MEDIA_ORIGIN`) in the server HTML.

## CI and deploy

`.github/workflows/ci.yml` orchestrates; each delivery step is a command of `infra/ci.sh` (ADR-0010). The release id is the git SHA: it is the image tag, the deployment id (`DEPLOYMENT_ID`) and the static-asset folder (`ASSET_PREFIX=https://cdn.taha.media/releases/<sha>`), set by `infra/assets.sh build-args`.

| Job      | Runner             | Runs on          | Does                                                                                                                                                                                                                                               |
| -------- | ------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check`  | `ubuntu-24.04`     | PRs and main     | actionlint, `pnpm lint`, `typecheck`, `test`, `build`                                                                                                                                                                                              |
| `build`  | `ubuntu-24.04-arm` | PRs and main     | builds `web`, `cms`, `migrate` for `linux/arm64` natively, runs `pnpm check:shaders` (the Helix's WebGL2 in headless Chromium), then `pnpm smoke` against that `web` image on the same runner; on main pushes the `<sha>` tags to GHCR (by digest) |
| `upload` | `ubuntu-24.04`     | main, after both | copies `/_next/static` out of the published `web` image and uploads it to R2 under `releases/<sha>/_next/static/`                                                                                                                                  |
| `push`   | `ubuntu-24.04`     | main             | moves the `main` tags to the published digests, registry-side                                                                                                                                                                                      |
| `deploy` | `ubuntu-24.04`     | main             | joins the tailnet (`tag:ci`), copies `infra/` to the server, runs `deploy.sh deploy <sha>`, then prunes old static releases                                                                                                                        |

**The smoke gate is required, always.** Nothing is published, uploaded, tagged `main` or deployed unless `pnpm smoke` passed against the images that ship. There is no variable to skip or soften it, and `infra/ci.test.ts` fails if the smoke step gets a condition or `continue-on-error`. **Until the frontend serves real pages ([What the frontend must provide](#what-the-frontend-must-provide)), the smoke fails, `build` is red on every run and main is not deployable. That is intended.** Pull requests stay red on `build` for the same reason; `check` tells whether the code itself is fine.

**The shader check.** `build` runs `pnpm check:shaders` after the Playwright install and before the smoke, on every pull request and main push, with no condition. A Helix shader that fails to compile or link only makes the Helix fall back to the static Home, which the unit tests (jsdom has no WebGL) and the smoke (it accepts the fallback) both pass. The check (`scripts/check-shaders/`) bundles the real renderer, runs it in headless Chromium on SwiftShader, and fails on a compile or link error (the GL info log is printed), a GL error while drawing, a card frame with no opaque pixel or with invalid premultiplied colour, or an empty scene that leaves any alpha. Its two screenshots go to `scripts/check-shaders/.output/` and, on failure, are uploaded with the smoke's `smoke-output` artifact. `check` has no browser, so it cannot run it. `infra/ci.test.ts` pins the step's place.

**Secrets not set yet.** `upload` and `deploy` check their secrets first (`infra/ci.sh gate`). While any is missing they skip their remaining steps with a `::warning` naming the missing ones (shown on the run's summary page), and those jobs stay green. That is a setup state, not a test result: the smoke gate never skips.

### ARM runner and the QEMU fallback

`build` runs on GitHub's native arm64 runner `ubuntu-24.04-arm` (ADR-0010; it works in private repositories and uses the plan's included minutes). If a run stays queued with no runner matching `ubuntu-24.04-arm`, the plan does not offer it. The fallback is several times slower for the Next.js builds, so tell the owner before merging it: in the `build` job set `runs-on: ubuntu-24.04` and add `- uses: docker/setup-qemu-action@v4` before `docker/setup-buildx-action`. `infra/ci.sh build` already passes `--platform linux/arm64`, so the images stay arm64, and the smoke runs the arm64 `web` image under emulation (slow, but the same test). Nothing else changes: `upload` creates (never starts) the arm64 image with `--platform linux/arm64`, and `push` and `deploy` run no images.

### Static assets on R2 (ADR-0005)

- **Where.** Bucket `taha-media` (override with the repository variable `ASSETS_BUCKET`), keys `releases/<sha>/_next/static/...`, `Cache-Control: public, max-age=31536000, immutable`. `cdn.taha.media` must be that bucket's custom domain; the Cloudflare cache rule for the CDN host already caches it (`infra/cloudflare/README.md`). The nightly media backup skips `_next/**`, so releases are never copied to `taha-backup`.
- **Order.** `upload` runs before `deploy`, so every chunk is on the CDN before any page references it. It only writes.
- **CORS: fonts and media.** Pages on `taha.media` read two kinds of files from `cdn.taha.media` across origins: fonts, and the media the Helix draws through WebGL (Preview loops, their posters, the Showreel). WebGL can only read a picture's pixels when the host allows the page's origin, and video requests send a `Range` header. So bucket `taha-media` carries one CORS rule (owner, once; set 2026-11-09 for #50): dashboard, R2, the bucket, Settings, CORS policy, allowed origin `https://taha.media`, methods `GET` and `HEAD`, allowed header `Range`. Add the preview instance's origin only if previewed media should play in the Helix. Local development serves media from the same origin and needs none of this. Check it with a preflight, which answers `204` with `access-control-allow-origin: https://taha.media` (a `403` means no rule matched; a fresh rule can take a minute): `curl -sI -X OPTIONS https://cdn.taha.media/x -H 'Origin: https://taha.media' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: range'`. The post-deploy check tests neither fonts nor media.
- **30 days.** After each healthy deploy, `infra/ci.sh deploy` runs `assets.sh prune --keep <previous live>,<live>`: it deletes every release whose newest file is older than 30 days, except the live and the previous live release whatever their age, and touches nothing outside `releases/`. There is deliberately no R2 lifecycle rule for this: a rule expires by upload age only, so after 30 days without a deploy it would delete the live release's chunks under every open page. (The `trash/` rule in `infra/media-trash/lifecycle.json` is unrelated; its `PUT` replaces the bucket's whole rule list.) `infra/release-assets.test.ts` covers the retention against an S3 stub.
- **Key.** `R2_ASSETS_WRITE_KEY_ID` and `R2_ASSETS_WRITE_SECRET` need Object Read & Write on the bucket (prune lists and deletes). R2 tokens cannot be limited to a prefix, so this key could also delete media. It lives only in GitHub secrets and is used only by main-branch jobs, and `taha-backup` (never deletes) holds every media file.

### Stale tabs across a deploy

A tab opened before a deploy keeps working because (1) its chunks stay on the CDN under their own release folder for at least 30 days, and the previous live release is always kept; (2) every page carries the release's deployment id (`<html data-dpl-id="<sha>">`, `?dpl=<sha>` on assets), and every client navigation is answered with `x-nextjs-deployment-id: <sha>`. When that differs from the tab's own id, Next loads the target page in full instead of mixing two builds. What is checked:

- **Release gate** (`smoke/smoke.spec.ts`, against the image that ships): every `/_next/static` URL on Home is under the release's prefix with `?dpl=<sha>`; Home and a Work page render `data-dpl-id="<sha>"` and answer an RSC request with `x-nextjs-deployment-id: <sha>`.
- **Post-deploy check** (`infra/smoke.sh`, on the server): the live Home names the release just deployed (`data-dpl-id`), and its chunk is under `https://cdn.taha.media/releases/<sha>/` with `?dpl=<sha>` and answers 200 from the CDN. A swap that left the old containers serving fails here and rolls back.
- **Retention** (`infra/release-assets.test.ts`): the live and previous live releases survive any age, others go after 30 days.
- **Not automated:** a real browser tab held open across two real releases. Check by hand after the first real deploys: open the site, deploy, click a link in the old tab, and expect one full reload with no console error.

### Deploy: `infra/deploy.sh`

`infra/ci.sh deploy` copies `infra/` (without tests) to `/opt/taha/infra/releases/<sha>/` on the server and runs that copy: `deploy.sh deploy <sha>`. In order:

1. Lock (`/opt/taha/state/deploy.lock`; one deploy at a time, a stale lock is taken over).
2. Pull `migrate`, `web` and `cms` for `<sha>`.
3. Flush Litestream (`litestream/snapshot.sh`) and print the restore point. Skipped with a notice only while Litestream is not running (first deploy).
4. Copy the database (`VACUUM INTO`, integrity-checked) to `/opt/taha/data/pre-migrate/`, keeping 5.
5. Migrate with the new `migrate` image. **Additive only** (ADR-0003): the previous release must keep working on the new schema, because a rollback never migrates back. `infra/migrations.test.ts` fails on a `DROP TABLE`, `DROP COLUMN` or `RENAME` in a migration's `up()` unless the file says `// ADR-0003 contract step: <why no live or previous release reads it>`.
6. Swap: copy the release's config to `/opt/taha/infra/live/` and `docker compose up -d --wait` every service on `<sha>` (Caddy reloaded and Litestream recreated when their config changed).
7. Post-deploy check (`infra/smoke.sh https://taha.media`, resolved to this server's Caddy): home answers 200; the deployment id is `<sha>`; one static chunk from Home answers from the CDN under this release; one Work (a `/isler/<slug>` link on Home, else on `/isler`) answers 200; one R2 file shown on that Work page answers 200 with an image or video type. While no Work is published (launch), the Work and R2 checks are skipped with a notice.

If steps 2 to 5 fail, the deploy stops with nothing swapped (the old release keeps running) and sends an alert. A failed swap or check swaps back to the previous release, checks it again, sends an alert ("Rolled back to ..." or "... ALSO fails") and exits 1, so the CI job is red. `infra/deploy.test.ts` covers these paths with a fake `docker` and a stub site.

**Alerts.** `/opt/taha/env/deploy.env` (owner, once): `ALERT_WEBHOOK_URL=` a webhook (Slack, Discord, Telegram `sendMessage?chat_id=...`; JSON body `{"text","content"}`), or an ntfy topic with `ALERT_WEBHOOK_FORMAT=text`. Without it the alert is only printed in the CI log, loudly.

**By hand on the server** (`cd /opt/taha/infra/live`):

- `./deploy.sh status`: the release history, last line live.
- `./deploy.sh rollback`: back one release, no migrations, checked. If the target fails, it returns to the current release and alerts.
- **Roll forward by hand:** the server has no registry login of its own (CI's token ends with the job). If the images are still on the server (`docker image ls | grep <sha>`): `cd /opt/taha/infra/releases/<sha> && DEPLOY_PULL=0 IMAGE_PREFIX=ghcr.io/<owner>/taha ./deploy.sh deploy <sha>`. Otherwise re-run that commit's CI run.
- **A bad migration:** the pre-migration copy is in `/opt/taha/data/pre-migrate/`, and Litestream restores to the printed restore point ([Backups](#backups-litestream)).

### Setup (owner, once at cutover)

On the server, as the admin user from `bootstrap.sh` (it is in the `docker` group): `sudo mkdir -p /opt/taha/infra /opt/taha/state && sudo chown "$USER" /opt/taha/infra /opt/taha/state`, write `/opt/taha/env/deploy.env`, and create a key pair for CI (`ssh-keygen -t ed25519 -f ci-deploy -C ci@taha.media`; append `ci-deploy.pub` to the admin user's `~/.ssh/authorized_keys`).

Tailscale: an ACL tag `tag:ci` that may reach the server on port 22 (for example `"tagOwners": {"tag:ci": ["autogroup:admin"]}` and a grant or ACL rule from `tag:ci` to `<server>:22`), and an OAuth client that may create auth keys for `tag:ci` (admin console, Settings, OAuth clients).

GitHub, repository settings, Secrets and variables, Actions:

| Name                     | Kind     | Value                                                                                                                                                         |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R2_ACCOUNT_ID`          | secret   | Cloudflare account id (already used by the media backup)                                                                                                      |
| `R2_ASSETS_WRITE_KEY_ID` | secret   | R2 API token, Object Read & Write on the assets bucket                                                                                                        |
| `R2_ASSETS_WRITE_SECRET` | secret   | its secret                                                                                                                                                    |
| `TS_OAUTH_CLIENT_ID`     | secret   | the Tailscale OAuth client                                                                                                                                    |
| `TS_OAUTH_SECRET`        | secret   | its secret                                                                                                                                                    |
| `DEPLOY_SSH_KEY`         | secret   | the private key `ci-deploy`                                                                                                                                   |
| `DEPLOY_HOST_KEY`        | secret   | the server's known_hosts line: `ssh-keyscan -t ed25519 <tailnet name>` from a tailnet device, compared with `/etc/ssh/ssh_host_ed25519_key.pub` on the server |
| `DEPLOY_HOST`            | variable | the server's tailnet (MagicDNS) name, the same one used in `DEPLOY_HOST_KEY`                                                                                  |
| `DEPLOY_USER`            | variable | the admin user                                                                                                                                                |
| `ASSETS_BUCKET`          | variable | optional; default `taha-media`                                                                                                                                |

GHCR needs nothing: the jobs push and pull with their own `GITHUB_TOKEN`, and the packages (`ghcr.io/<owner>/taha/{web,cms,migrate}`) stay private.

### Not verified by tests

The workflow has not run on GitHub yet. The ARM runner's availability on the plan, the GHCR push and pull, the R2 upload with a real key, the tailnet join and the SSH deploy run for the first time on the first main run with the secrets set. The scripts are tested with fakes (`infra/ci.test.ts`, `deploy.test.ts`, `smoke.test.ts`, `assets.test.ts`, `release-assets.test.ts`); the workflow is linted (actionlint) and its shape is guarded by `infra/ci.test.ts`.

## Revalidation

`cms` tells `web` which cache tags a publish touched by POSTing to `web`'s `/internal/revalidate` (ADR-0001, ADR-0012). Editing or deleting an Image or Video also notifies: it touches every published Work and page that shows it (an Image also through the Videos it is the poster of), the Works list, and Home when one of those Works is featured. More than 20 tags go out in several requests. Requirements:

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
