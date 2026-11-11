# 14. Ponytail is on for this repo only, pinned, at `full`

Date: 2026-11-12 · Status: accepted

Every agent working on taha.media runs the Ponytail plugin, a "lazy senior dev" ruleset: it stops at the first rung that holds (no code, reuse, stdlib, platform feature, installed dependency, one line, the minimum) and never cuts validation, error handling, security or accessibility (#92). It is declared in the checked-in `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`), not in user settings, so other projects on the Mac stay as they are. It needs no user-level `ponytail` marketplace or enable: one with the same name but no `ref` overrides the pin or gets the marketplace ignored. Each clone runs `claude plugin install ponytail@ponytail --scope project` once.

The marketplace is pinned to tag `v5.3.3` (commit `7801d06`). A marketplace source takes a branch or tag `ref`, not a sha; pinning a sha would mean maintaining our own catalog. Upgrading is a `ref` change plus a fresh read of the plugin's `hooks/`. The mode is set to `full` in the project `env` (`PONYTAIL_DEFAULT_MODE`), so a user-level `ultra` can't leak in. `PONYTAIL_SUBAGENT_MATCHER` keeps the ruleset away from agents that don't write product code (Explore, Plan, researcher, reviewer, architect, mechanical and the like): it only costs them tokens and bends their reports, and the reviewer judges against `CODING_STANDARDS.md`. The list is a deny-list, so a new agent gets the ruleset until it is added.

## Consequences

- The plugin writes under `~/.claude/` and `~/.config/ponytail/` (mode flags, a statusline copy, a per-turn cost ledger) and contacts no host unless a webhook is set. The ledger and webhook live in user settings, so the repo can't turn them off.
- Ponytail marks deliberate shortcuts with `shortcut: <limit>, <when to upgrade>` comments.
