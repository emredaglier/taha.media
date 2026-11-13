# taha.media

Portfolio of Taha, rebuilt as a pnpm monorepo. Terms: [`GLOSSARY.md`](GLOSSARY.md); decisions:
[`docs/adr/`](docs/adr/); conventions: [`CODING_STANDARDS.md`](CODING_STANDARDS.md).

## Setup

Node and pnpm are pinned (`.node-version`, `packageManager`). With Corepack enabled:

```sh
pnpm install
pnpm check   # lint, typecheck, test, build
pnpm dev     # web on http://localhost:3000
pnpm dev:full   # web on :3000 and the admin on http://localhost:3001/admin; media plays
```

`pnpm dev:full` needs `apps/web/.env` (gitignored): copy `apps/web/.env.example` to `apps/web/.env` and
set `PAYLOAD_SECRET` to the value in `apps/cms/.env`.

Admin: copy `apps/cms/.env.example` to `apps/cms/.env`, run `pnpm --filter @taha/cms dev` and open
http://localhost:3001/admin (the first visit creates the first Editor). After a schema change in
`packages/cms-config`, run `pnpm --filter @taha/cms migrate:create <name>`, change the generated
file's first line to `import { type MigrateUpArgs, type MigrateDownArgs, sql } ...` (those names are
types only, and loading the migration fails without `type`), then `generate:types` (and `generate:importmap` when admin
components change).

## Preview instance

The same `web` build runs as the draft preview when started with `PREVIEW=1` (ADR-0001, Tailscale
only). It is read once at startup, never from a request. With it, every data-module read returns
the latest drafts, uncached; without it, drafts can't be read. The admin's preview button (cms
`PREVIEW_URL`) opens `<PREVIEW_URL>/preview?path=/isler/<slug>` (or `/`, `/hakkimda`, `/gizlilik`):
that route turns on Next's draft mode so prerendered pages render per request, and answers 404 on
the public instance. Every preview response carries `X-Robots-Tag: noindex, nofollow`
(`apps/web/src/proxy.ts`) and the root layout adds a robots `noindex` meta tag.

## Layout

| Path                  | Role                                                                              |
| --------------------- | --------------------------------------------------------------------------------- |
| `apps/web`            | Public Next.js site; `src/data/` is the backend-owned read module                 |
| `apps/cms`            | Thin Payload admin host (`pnpm --filter @taha/cms dev`, port 3001)                |
| `packages/cms-config` | Content schema, access, validation, migrations, test harness                      |
| `infra/`              | Compose, Caddy, Litestream, server scripts ([`infra/README.md`](infra/README.md)) |
| `smoke/`              | Release-gate smoke spec and runner (`pnpm smoke`)                                 |
| `Dockerfile`          | `web`, `cms` and `migrate` images (`--target`)                                    |

## CI

Pull requests and main run `pnpm check` (job `check`) and, beside it, build the arm64 images and
run the release-gate smoke against them (job `build`). On main the smoke-tested images go to GHCR,
their static files to R2, and the release is deployed with automatic rollback
([`infra/README.md`, "CI and deploy"](infra/README.md#ci-and-deploy)). **Until the frontend serves
real pages, `build` fails on the smoke gate and main is not deployable; that is intended.**

A PR that changes only `docs/` starts no CI run, so it needs no check to merge: leave the `check`
job out of the required checks for such PRs (GitHub can't waive a required check in code).
