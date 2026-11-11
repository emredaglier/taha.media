# 14. Ponytail is on for this repo only, pinned, at `full`

Date: 2026-11-12 · Status: accepted

Ponytail is a Claude Code plugin: a "lazy senior dev" ruleset that makes an agent stop at the first rung that holds (no code, reuse, stdlib, platform feature, installed dependency, one line, the minimum) and never cut validation, error handling, security or accessibility. Every agent working on taha.media uses it. Issue #92.

## Decision

- **Scope: this repo.** `.claude/settings.json` (checked in) declares the marketplace in `extraKnownMarketplaces` and turns the plugin on in `enabledPlugins` (`ponytail@ponytail`). Both keys are valid in the shared project file; the marketplace entry waits for workspace trust. Other projects on the Mac (daglier.com) are not touched.
- **Pin: tag `v5.3.3`** (commit `7801d061243d7b753bad0e0b3c057cd250b11755`, npm `@dietrichgebert/ponytail` 5.3.3, the latest release on 2026-11-12; the ticket named 4.9.0, which is old). A marketplace source takes `ref` (branch or tag) but not `sha`; the plugin entry is a relative path (`./`), so the plugin files come from the pinned clone. A tag can be moved by its owner. A sha pin needs an inline `settings`-type marketplace with a `github` plugin source carrying `sha`; not done, because it replaces the upstream catalog with one we maintain. Upgrading is a one-line `ref` change plus a re-read of `hooks/` (this ADR's review).
- **Mode: `full`**, set explicitly with `PONYTAIL_DEFAULT_MODE=full` in the project `env`, so a `defaultMode: ultra` in `~/.config/ponytail/config.json` cannot leak into this repo. `ultra` also questions the request itself, which the owner's Figma-led design work does not want.
- **Who gets the ruleset (subagents):** every subagent except the read-only ones. `PONYTAIL_SUBAGENT_MATCHER` is a case-insensitive regex on the agent type, unanchored; ours is a deny-list: `^(?!(explore|plan|researcher|reviewer|architect|mechanical|claude-code-guide|web-fetch|statusline-setup)$)`. Reasons: a read-only agent writes no code, so the ruleset only costs tokens and bends its report; `reviewer` judges against `CODING_STANDARDS.md` and the ticket, and Ponytail's own review lens (`/ponytail-review`) stays available to the owner and lead as a separate pass; `mechanical` is told to make no judgement calls, and "find a smaller way" invites one. `implementer`, `implementer-hard`, `setup`, `diagnoser`, `general-purpose` and `claude` get it. A deny-list fails open: a new agent gets the ruleset until it is added here.

## What the hooks do (reviewed at v5.3.3)

Read from source, never run. Three Node hooks plus one UI module; none touches the network unless a webhook is configured.

- **SessionStart** (`ponytail-activate.js`; startup, resume, clear, compact): reads `PONYTAIL_DEFAULT_MODE`, `~/.config/ponytail/config.json`, `~/.claude/settings.json` (statusLine check). Writes `~/.claude/.ponytail-active` (shared flag), `~/.claude/ponytail-modes/<sha256 of project dir>`, and, once, a copy of `ponytail-statusline.sh` into `~/.claude/` plus `~/.claude/.ponytail-statusline-nudged`. Emits the ruleset plus a codebase map (`ponytail-map.js`: `git ls-files` and the first 64 KiB of each source file, top-level exports only, 2000 characters, 3 s limit; `PONYTAIL_MAP=0` turns it off). With no `statusLine` in user settings it also tells the model to offer to edit `~/.claude/settings.json`; workers must decline that.
- **UserPromptSubmit** (`ponytail-mode-tracker.js`): reads the prompt; acts only on `/ponytail ...` and "stop ponytail" / "normal mode". Writes the same flag files; `/ponytail default <mode>` writes `~/.config/ponytail/config.json`; `/ponytail band` writes `~/.claude/.ponytail-band`; `/ponytail band import` starts a detached reader of past transcripts.
- **SubagentStart** (`ponytail-subagent.js`): reads the flag and the agent type from stdin, prints the ruleset. The matcher runs under a 100 ms `vm` timeout and fails open.
- **Band module** (`hooks/band/register.tsx`, a Claude Code UI module, not a shell hook): after every turn it writes the task's row (cost, turns, tokens, session name, model, files created or reused) to `~/.config/ponytail/band/<project>.csv` and rebuilds `board.html` there; reads `~/.claude/projects/*` transcripts (via `grep`) to find the session name and model. Network: only if a `webhookUrl` is set (default empty; https only); the token would go to the keychain. No other host is contacted.
- **Outside `~/.config/ponytail`:** writes under `~/.claude/` (the flag files and statusline copy above); reads `~/.claude/settings.json` and `~/.claude/projects/`. Nothing under the repo is written. Env honoured: `PONYTAIL_DEFAULT_MODE`, `PONYTAIL_SUBAGENT_MATCHER`, `PONYTAIL_MAP`, `PONYTAIL_MAP_CHARS`, `PONYTAIL_HIDE_STATUS`, `PONYTAIL_QUIET_STARTUP`, `XDG_CONFIG_HOME`, `CLAUDE_CONFIG_DIR`, `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`.
- Skills: `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`. Review and audit return findings and change nothing.

Limits of this scope: the plugin's own options (`ledger`, `webhookUrl`) live in `pluginConfigs`, which Claude Code reads from user or managed settings only, so the repo cannot turn the ledger off. The mode flag file is per user, so two sessions in this repo share one mode. Project-enabled plugins are not downloaded for a collaborator until they run `claude plugin install ponytail@ponytail --scope project` once per clone.

## Consequences

- Ponytail marks deliberate shortcuts with a code comment `shortcut: <the limit>, <when to upgrade>` (older releases: `ponytail:`), and its audit and review skip those unless the load already crosses the limit.
- The audit (issue #92, part 2) runs after this merges, in a fresh session. Its out-of-bounds list stands: Helix and hand-control motion, anything ADR-0011 protects, validation, auth, admin, backups.

## Open questions for the owner

Where Ponytail and `CODING_STANDARDS.md` or an ADR pull apart. Each is the owner's call; `CODING_STANDARDS.md` is unchanged.

1. **Tests.** Ponytail: new non-trivial logic leaves "one small test or an assert-based self-check". Standards: look, layout and motion get no automated test; pure maths is tested by properties; `pnpm test` stays near a minute. Does the Standards rule win for motion and shader code, and is an in-source assert ever acceptable (the repo has none)?
2. **Smoke specs.** Ponytail's missing-test finding could ask for a spec per route or interaction; Standards: the smoke spec stays small and gets no specs for look, motion or interaction.
3. **Fallbacks.** ADR-0101 requires a designed static fallback for every 3D or scroll effect. A lean audit reads that as duplicate or "speculative" code. Should the audit treat everything under the reduced-motion, Save-Data and weak-device paths as protected, like the Helix itself?
4. **Repo guards and pinned device setup** (`infra/ci.test.ts`, `apps/web/src/test/device-setup.ts`) scan source or pin values on purpose; a delete-list may call them yagni. Protect them by name?
5. **`shortcut:` comments.** Standards say nothing on comments. Accept the `shortcut:` form, and does a lint or review rule need to know it (a new tag nobody greps)?
6. **Delete-lists.** `/ponytail-review` and `/ponytail-audit` end with `Lean: -N lines` and a delete-list. Standards say review reads the Standards and Spec axes; who acts on a delete-list, and does it become tickets only (as in #92) or also feed `/code-review`?
7. **Reply shape.** Ponytail wants every reply to end with a line on what was skipped or unchecked; the global rules want the lead's closing lines (Model, Session, Skill, Next) last, and workers hand back a fixed report. Which ends the message?
8. **"Standards are read during review, not while implementing"** against Ponytail's rules, which act while implementing. Fine as is (they stack), or should the Standards intro say so?
9. **User-level install.** Ponytail was already enabled in the owner's `~/.claude/settings.json` (and its marketplace declared there without a `ref`) when this was written. For "other repos are unaffected" to hold, the owner removes it there; this change does not.
