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

## Layout

| Path                  | Role                                               |
| --------------------- | -------------------------------------------------- |
| `apps/web`            | Public Next.js site (empty shell for now)          |
| `apps/cms`            | Payload admin (placeholder)                        |
| `packages/cms-config` | Content schema, access, validation (placeholder)   |
| `infra/`              | Compose, deploy and server scripts (later tickets) |

## CI

Pull requests and main run `pnpm check`. A PR that changes only `docs/` starts no CI run, so it
needs no check to merge: leave the `check` job out of the required checks for such PRs (GitHub
can't waive a required check in code).
