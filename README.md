# taha.media

Portfolio of Taha, rebuilt as a pnpm monorepo. Terms: [`GLOSSARY.md`](GLOSSARY.md); decisions:
[`docs/adr/`](docs/adr/); conventions: [`CODING_STANDARDS.md`](CODING_STANDARDS.md).

## Setup

Node and pnpm are pinned (`.node-version`, `packageManager`). With Corepack enabled:

```sh
pnpm install
pnpm check   # lint, typecheck, test, build
pnpm dev     # web on http://localhost:3000
```

Admin: copy `apps/cms/.env.example` to `apps/cms/.env`, run `pnpm --filter @taha/cms dev` and open
http://localhost:3001/admin (the first visit creates the first Editor). After a schema change in
`packages/cms-config`, run `pnpm --filter @taha/cms migrate:create <name>`, change the generated
file's first line to `import { type MigrateUpArgs, type MigrateDownArgs, sql } ...` (those names are
types only, and loading the migration fails without `type`), then `generate:types` (and `generate:importmap` when admin
components change).

## Layout

| Path                  | Role                                                               |
| --------------------- | ------------------------------------------------------------------ |
| `apps/web`            | Public Next.js site; `src/data/` is the backend-owned read module  |
| `apps/cms`            | Thin Payload admin host (`pnpm --filter @taha/cms dev`, port 3001) |
| `packages/cms-config` | Content schema, access, validation, migrations, test harness       |
| `infra/`              | Compose, deploy and server scripts (later tickets)                 |

## CI

Pull requests and main run `pnpm check`. A PR that changes only `docs/` starts no CI run, so it
needs no check to merge: leave the `check` job out of the required checks for such PRs (GitHub
can't waive a required check in code).
