# taha.media

Portfolio of Taha (video editor, motion designer, graphic designer). Terms: `GLOSSARY.md`. Decisions: `docs/adr/` (backend 0001–0099, frontend 0100+). Code and test conventions: `CODING_STANDARDS.md`.

Never wipe the production database or R2 objects without confirming with the owner right before (ADR-0011).

## Memory-heavy commands

Subagents and workers (e.g. under `/implement-spec`) must not start Next.js or Docker builds: no `next dev`, `next build`, `pnpm dev`, `pnpm build`, `docker build`/`docker compose build`, and no Playwright or browser runs. Parallel Next processes have crashed the dev machine (lesson from daglier.com). Workers verify with lint, typecheck and unit/integration tests only. Only the lead session runs builds, the smoke spec or Compose, once, after the workers have finished.

The QA build (seeded database, media stand-in with CORS, visible loops, `next start`) is `pnpm qa` (`scripts/qa/`): lead only, once, after the workers have finished. `pnpm qa --reuse` keeps the last QA folder.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on emredaglier/taha.media (private), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
