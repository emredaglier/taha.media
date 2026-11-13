# Coding standards

Read during review (`/code-review` Standards axis), not while implementing. Mechanical rules live
in the linters, not here: `pnpm lint` (ESLint, Prettier).

## Tests

Test behaviour where a user or caller meets it, and keep `pnpm test` near a minute.

- **Look, layout and motion** (visibility, z-order, blur, animation state) get no automated test.
  The owner checks them on web and mobile before pushing.
- **Pure maths** (layouts, easings, curves) is asserted by properties (symmetry, monotonic,
  matches a brute-force sample, clamps) plus a few worked examples. A restated constant fails on
  every deliberate retune.
- **Device capabilities** are pinned in the shared setup (`apps/web/src/test/device-setup.ts`):
  every jsdom test starts on a capable device (twice `WEAK_DEVICE`), because jsdom
  reports the host's real core count and CI runners have fewer. A test of a weak device calls
  `setDevice({ cores, memory })` from `apps/web/src/test/device.ts` (a key left out keeps the
  pinned value; `memory: undefined` means not reported) and never defines `navigator` properties
  itself. The setup resets it before each test.
- **Slow checks** (a `next build`, Docker) run in the smoke spec against the image the gate
  already builds, not in unit tests.
- **Repo guards** (for example `infra/ci.test.ts`) scan source on purpose: they enforce an ADR or
  workflow rule, not behaviour.

## Smoke specs

The smoke spec is the release gate, and it blocks deploys, so it stays small: every public route
loads with its content and no console error or 404, redirects and not-found pages work (a Work
under an old slug redirects to the new one), and assets come from the CDN prefix. It also holds
the request-level checks that need the built image: server HTML and metadata, no admin or API
routes on the public instance, the revalidate secret, no cookies, the preview instance (drafts,
noindex) and one live CMS edit reaching the cached pages. It runs on desktop Chromium only. Do
not add specs for look, motion or interaction.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, test and build (`pnpm check`) on pull requests
and on main. A change only under `docs/` or `.scratch/` starts no run (workflow `paths`). GitHub
cannot waive a required check from code: when a docs-only PR must merge, the check is not marked
required in the branch rules, or the owner merges it by hand.

The `build` job also runs `pnpm check:shaders` (`scripts/check-shaders/`): the real Helix and Edit
Room renderers in headless Chromium on SwiftShader. A shader that fails to compile only drops the
Helix or the room to the static Home, which no unit test or smoke spec notices. A change under
`apps/web/src/components/helix` or `apps/web/src/components/room` (a shader, the renderer or its
frames) must pass it. A worker
without a browser cannot run it (CLAUDE.md, "Memory-heavy commands"), so the lead runs it once
before merging. A new GLSL path that the check's frames don't reach gets a frame that does.
