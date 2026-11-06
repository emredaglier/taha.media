# Agent skills that raise visual design quality

Researched 2026-11-05 for taha.media (Next.js, Tailwind v4, Payload, Figma-first, awwwards-level portfolio). Star counts and push dates come from the GitHub API on that date. SKILL.md text was read directly from each repo unless marked unverified.

## Short answer

1. The skill that best matches the "AI slop" problem is **Impeccable** (pbakaus). It has a portfolio-specific "Experience" mode, a refuse-list that names several tells from the rejected wireframes, a critique/audit loop and a deterministic slop detector.
2. **Anthropic's `frontend-design`** is already on disk in the marketplace clone but is not installed. Its current text is an anti-default-aesthetics checklist and is worth installing.
3. The Figma side has no good community skill. The mature ones are the official Figma plugin skills (already installed), which are mechanical. Design quality in Figma has to come from the brief and direction we feed them.
4. For scroll and motion: **greensock/gsap-skills** (official) and **emilkowalski/skills** for motion taste. For 3D later: CloudAI-X/threejs-skills.

## Already installed or on disk here

| Item | State |
|---|---|
| `figma@claude-plugins-official` 2.2.157 | Installed. Mechanical build skills (figma-use, figma-generate-design, etc.). |
| `mattpocock-skills` 1.3.1 | Installed. Process skills, none about visual design. |
| `frontend-design` plugin | In `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design`, **not installed** (absent from `installed_plugins.json`). |
| `~/.claude/skills/design-direction` | Your own lesson: for a subjective redesign, offer 3-4 named directions with ASCII previews before building; the owner's pick decides the build (source: daglier.com PR 21). |
| `~/.claude/skills/gsap-animation`, `view-transitions`, `canvas-colours` | Your own bug-lesson skills, not design guidance. |

## Catalogue

Fit is for taha.media specifically.

| Skill | Source | Signals | Fit |
|---|---|---|---|
| **Impeccable** | github.com/pbakaus/impeccable | 103.8k stars, pushed 2026-11-05, Apache-2.0, community (Paul Bakaus) | **High.** Portfolio-aware, anti-slop, critique loop, live browser iteration. |
| **frontend-design** (Anthropic) | github.com/anthropics/skills `skills/frontend-design`; also `plugins/frontend-design` in claude-plugins-official | anthropics/skills 187.7k stars; skill last updated 2026-09-03 ("avoid generic design defaults", #1713); official | **High.** Light, cheap, names the exact tells you hit. |
| **emilkowalski/skills** | github.com/emilkowalski/skill | 53.8k stars, pushed 2026-11-04, MIT, community (Emil Kowalski, ex-Vercel/Linear) | **Medium-high.** Motion and interaction taste. App-polish oriented, weaker on expressive layout. |
| **greensock/gsap-skills** | github.com/greensock/gsap-skills | 17.9k stars, pushed 2026-07-29, MIT, official GSAP | **High** for build. Correct ScrollTrigger, timeline, React cleanup. No aesthetic judgment. |
| **UI UX Pro Max** | github.com/nextlevelbuilder/ui-ux-pro-max-skill | 145.7k stars, pushed 2026-11-05, MIT, community | **Low-medium.** Searchable style/palette/font database plus 192 "reasoning rules" (per README). Product/SaaS leaning; SKILL.md not read, so unverified for portfolios. |
| **taste-skill** | github.com/Leonxlnx/taste-skill | 110.6k stars, pushed 2026-11-05, MIT, community | **Low.** Targets company/product sites (figma.com and x.ai are its bar). Its own rules reserve shader/scene effects for tech sites. |
| **web-design-guidelines** (Vercel) | github.com/vercel-labs/agent-skills | 33.6k stars, pushed 2026-10-28, official Vercel | **Low-medium.** UI-code lint (a11y, interaction) fetching rules at run time. Hygiene, not aesthetics. |
| **canvas-design**, **theme-factory** (Anthropic) | github.com/anthropics/skills | official | **Low.** canvas-design makes static PNG/PDF art from a "visual philosophy"; theme-factory has 10 preset font/colour themes. Neither suits a Figma-first site. |
| **CloudAI-X/threejs-skills** | github.com/CloudAI-X/threejs-skills | 4.0k stars, pushed 2026-10-19, community | **Medium, later.** Shaders, R3F, postprocessing, performance for the 3D phase. Only the skill list was read. |
| Awwwards-named skills (SandroHub013, Ga14ctic, Z4YT0N) | e.g. github.com/SandroHub013/awwwards-skill | 9 to 23 stars | **Unverified, low.** Appear to orchestrate the skills above. Not read. Skip. |
| Figma-MCP community skills (warpdotdev/figma-skills etc.) | GitHub search | 17 stars or fewer | **Low.** Plumbing (variables, tokens, specs), not aesthetics. Skip. |

No standalone skill found for moodboards, reference collection, or screenshot-vs-reference comparison. Impeccable (generated decision comps, browser overlay) and taste-skill (photo sourcing, browser checker) each include a partial version. Searches for "moodboard", "art direction" and "typography" skills returned nothing useful. `gh` search is not exhaustive: this means "none found", not "none exist".

## Details on the shortlist candidates

### Impeccable (pbakaus/impeccable)
- **Pitch** (README): "the design vocabulary for your coding agent"; steer with `polish`/`bolder`, review with `critique`/`audit`, catch AI slop. Its before/after example names "cream page, thin serif, italic accent, pill buttons" as the default it replaces.
- **Modes** (SKILL.md). **Experience**: "Portfolios, galleries, showcases. Let the artifact lead from the first viewport; the interface recedes." Persuade and Experience get "full commitment: bold, distinct work with a point of view."
- **Refuse list** (`reference/craft-floor.md`): same-size icon+heading+text cards; hero-metric template; "a kicker or eyebrow above a heading... a ban, not a default"; 01/02/03 section numbers unless the sequence matters; gradient text; decorative glass; "monospace as a costume for 'technical'"; a system display face as display voice; hard offset shadows; "light or dark picked by category" (choose from the use scene).
- **Type and calibration** (`reference/new-work.md`): lists training-data default display faces to avoid (Fraunces, Playfair, Cormorant, Space Grotesk, Instrument Sans, DM Sans, Inter-as-display...). Names the common AI looks: cream + serif + terracotta; near-black + one neon accent; editorial hairlines + italic display serif + small tracked mono labels. The rejected wireframes sit in the last two.
- **New-work flow**: asks 2-3 questions, derives seven visual worlds from the audience's own culture, runs `concept-seed` for a random direction, shows directions on a decision board (generated comps when image generation exists), and records a "direction contract" before any code. This matches your `design-direction` lesson, with a randomizer added.
- **Review tools**: `critique` (heuristic scoring), `audit` (a11y, performance, responsive, ranked P0-P3), `polish`, `overdrive` ("shaders, spring physics, scroll-driven effects"), `live` (pick an element in the running dev server, cycle variants, write back to source). A 62-rule deterministic detector (`npx impeccable detect`, also hook and Chrome extension).
- **Install**: `/plugin marketplace add pbakaus/impeccable`, then `/plugin` to install; or `npx impeccable install`. Then `/impeccable init` writes `PRODUCT.md`; `/impeccable document` writes `DESIGN.md`.
- **Cautions**: Large and fast-moving (24 commands, an engine binary downloaded to `~/.impeccable/bin/`). Per its README, live mode's Apply can spawn `claude`/`codex` with permissions bypassed when no chat agent is polling; set `IMPECCABLE_LIVE_COPY_AGENT=chat`. Review before installing. It is code-first (writes `PRODUCT.md`/`DESIGN.md` and comps under `.impeccable/`), not Figma-first: use it for direction, critique and the code build, not to draw the Figma file.

### Anthropic frontend-design
Read from the local marketplace copy; the `anthropics/skills` copy has the same text.
- Frames the agent as the lead at a studio whose client "has already rejected proposals that felt cliché or templated".
- Ground the design in the subject: its audience, primary job, materials and vernacular.
- Typography: one or two families, "not the default families you would reach for"; avoid accenting one headline word in italic or colour, all-caps labels, and unnecessary labels above content; lines under 80 characters.
- Numbered markers only when the content is a sequence. Motion: "a single orchestrated moment", not fade-and-slide-up on every section.
- Lists the AI-default clusters: cream + serif + terracotta (#D97757); near-black + one acid accent; broadsheet hairlines; SaaS card kit; template chrome (tracked ALL-CAPS eyebrows, middle-dot meta strings, tinted near-black #0B0B0B/#111, mono small labels, "→" on buttons).
- Process: write a compact token plan (4-6 named hex colours, type roles, ASCII layouts), **review the plan against the brief and revise anything generic before building**, build, screenshot and self-critique, "remove one accessory".
- **Install**: `/plugin install frontend-design@claude-plugins-official` (marketplace already present), or copy `skills/frontend-design` from `anthropics/skills` into `~/.claude/skills/`.
- Limit: it is a prompt, not a tool. "The brief's own words always win", so a vague brief gets the defaults back.

### emilkowalski/skills
- 15 skills, including `emil-design-eng`, `animate`, `choreograph`, `animation-vocabulary`, `review-animations`, `improve-animations`, `animation-performance`, `break-ui`.
- `emil-design-eng` (read): "Taste is trained, not innate"; "Unseen details compound"; reviews must be a Before/After/Why table (no `transition: all`, `ease-out` not `ease-in` for entrances, no `scale(0)` entrances, `:active` press states).
- **Install**: `npx skills@latest add emilkowalski/skills`.
- Fit: hover, press and easing details. Tuned to product UI; it will not supply expressive scroll choreography, so pair with GSAP.

### greensock/gsap-skills
- Eight skills: gsap-core, -timeline, -scrolltrigger, -plugins, -react, -frameworks, -performance, -utils. `gsap-scrolltrigger` (read) covers start/end syntax, scrub, pin, `refresh()`.
- README: all GSAP plugins (SplitText, MorphSVG, ...) are now free for commercial use.
- **Install**: `npx skills add https://github.com/greensock/gsap-skills`.
- Pair with your own `gsap-animation` bug-lesson skill.

## Workflow

Skills do not replace taste. Figma comes first, so the design stages happen before code.

1. **Direction** (before any frame). Use Impeccable `init` plus its direction flow, or `frontend-design`'s plan-and-review step, to produce 3-4 named directions as text and ASCII, per your `design-direction` lesson. The owner picks. Feed in 5-10 real reference sites.
2. **Brief to Figma.** Turn the pick into a written contract: palette, type pair, layout concept, the one signature moment, and the explicit ban list (Impeccable craft-floor plus `frontend-design`). Run the installed `figma-use` and `figma-generate-design` with that contract as input. The mechanical skills build; the contract carries the taste.
3. **Critique the Figma output.** Screenshot frames with `get_screenshot`, then run Impeccable `critique` or the `frontend-design` self-critique against the ban list and references. Loop until the frames stop matching the slop clusters.
4. **Build.** `figma-design-to-code`, `gsap-skills`, and emilkowalski/skills for hover/press details; `figma-implement-motion` if motion is specced in Figma.
5. **Verify in the browser.** Impeccable `audit`, `npx impeccable detect http://localhost:3000`, your `visual-bug-verification` skill, and a side-by-side with the references.
6. **Later, 3D:** CloudAI-X/threejs-skills.

## Recommended shortlist

1. **Impeccable**: direction, critique, audit, detector.
2. **Anthropic `frontend-design`**: cheap, already on disk, brief-writing aid.
3. **greensock/gsap-skills**: scroll correctness.
4. **emilkowalski/skills** (optional, selective): interaction taste.
5. **CloudAI-X/threejs-skills**: defer until 3D starts.

Overlap warning: Impeccable and `frontend-design` cover similar ground and may both trigger. Trial them on one section before keeping both. How they interact in one session is unverified.

## What we still have to supply

- **Real references.** No skill fetches good reference sites. The owner or we pick 5-10 and save screenshots in the repo.
- **The owner's taste.** The skills generate options; the owner chooses.
- **Real content.** Actual stills, reels, case studies and Turkish copy. Grey boxes with play icons are the slop; the media is the design (Impeccable's Experience mode: "let the artifact lead").
- **Fonts**: sourcing, licensing and Turkish glyph coverage (ğ, ş, İ, ı). No skill checks this.
- **Figma-side composition craft.** Nothing found improves it beyond the mechanical official skills.

## Not verified

- UI UX Pro Max and taste-skill beyond their descriptions, READMEs and (taste-skill) the start of SKILL.md.
- The Awwwards-named skills, threejs-skills content, and the Vercel guideline rules (fetched at run time from `vercel-labs/web-interface-guidelines`).
- The "100% vs 28%" pass-rate benchmark of frontend-design (dani-z/frontend-design-skill-benchmark, 24 stars, third party): the description was seen, the benchmark not reviewed.
- Whether Impeccable's hook and detector work with this Next.js/Tailwind v4 setup.
- Whether Impeccable is in the official `claude-plugins-official` listing: the install command above is from its own README.
