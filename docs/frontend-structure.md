# Frontend structure (grill outcome, 2026-11-05)

These are structural decisions only. The look (type, color, layout feel, motion) is designed in Figma and may differ completely from any wireframe. Terms follow `GLOSSARY.md`. Decision records are in `docs/adr/0100–0102`, and the backend ones in `0001–0007`.

## Pages (Turkish paths, no locale prefix; English later under `/en`)

| Path | Contents, top to bottom |
|---|---|
| `/` | The owner's FLOW (see "Home FLOW" below): **Showreel** (muted loop; "watch with sound" still to be placed) → one-line statement with the reel inline → **Featured Works** → short About (portrait + short bio). |
| `/isler` (menu: İşler; "Portfolio" in the English placeholder) | All Works in Editor drag order, newest first as fallback. Discipline filter `Tümü · Kurgu · Motion · Grafik` as links (`?disiplin=kurgu\|motion\|grafik`), server-rendered, works without JS. Cards show cover image or **Preview loop**, title, Disciplines and year. |
| `/isler/[slug]` | Main media (MP4, click-to-load external video, or image, in its own aspect ratio: 16:9, 9:16 or square) → title, Disciplines, year, client → role and credits → short description → gallery of stills → next Work. Only title and main media are required. Old slugs get a 301. |
| `/galeri` (menu: Galeri) | All **Gallery items** (photography plus personal and experimental pieces, never Works) in Editor drag order, newest first as fallback, no filters. Clicking one opens it full-screen over the grid (a lightbox dialog: arrows, swipe, Esc closes, focus stays inside, Safari focus fix). There is no page per item. Loops follow the Preview loop rules (silent, play in view, poster under reduced motion). Without JS, items link to the full-size file. |
| `/hakkimda` (menu: Hakkımda) | The full About: portrait + bio → one line per Discipline → client list (names or logos) → contact (email + socials). This is contact's main home; later designs may add it elsewhere too. |
| `/gizlilik` | Short notice naming Cloudflare Web Analytics and Sentry. Nothing is collected from visitors. |
| 404 | Server-rendered not-found page |

No blog route and no nav slot until a blog is built.

Gallery backend (provisional, task0, 2026-11-06; don't cite as final until the backend ticket exists): collection `gallery`, read `getGalleryItems()`, cache tag `gallery`. Each item has `kind` image|video, optional `caption` and `year`. The owner chose its own loop caps (2026-11-06): ≤15 s, 1080p, silent, about 10 MB, because loops play full-screen in the lightbox. These go into the backend Gallery ticket.

Backend spec (issue #1) facts the frontend relies on: its "Data module contract" section lists the reads we use. Each Video declares a use (`previewLoop | showreel | main`). Featuring fewer than 4 or more than 8 Works only warns the Editor, so Home must render any count from 0 upward gracefully.

## Chrome

- **Header** (changed 2026-11-06 by FLOW): name/logo (home link) and a MENU button at every width. MENU opens a full-screen menu with İşler, Galeri and Hakkımda, each a separate page (daglier's MobileMenu restyled, keeping the Safari focus fix).
- **Footer** (2026-11-06): there will be one on every page, holding the Gizlilik link and ©. Its design isn't done yet. Email and socials live on Hakkımda first.
- One theme, no toggle (likely dark, but Figma decides). Tokens stay structured so a second theme can be added later.

## Behavior

- Quality floor (ADR-0101): WCAG 2.2 AA, content readable without JS, Safari and iOS work. Motion and 3D are enhancements, off under reduced motion, Save-Data or a weak device.
- Video: native `<video muted loop playsinline>` with a required poster. It plays only while in view, and cards play on hover for fine pointers. Under reduced motion or Save-Data, the poster shows instead. The box is reserved from stored width and height.
- Full-length external video (ADR-0102): our own poster plus a play button. On click, a Vimeo `dnt=1` or `youtube-nocookie` iframe loads.
- Video sources (backend ADR-0008): MP4 (H.264) on R2. Each Video has width, height, duration and a required poster Image. Caps: Preview loop ≤10 s, 720p, silent. Showreel loop ≤30 s, 1080p, with an optional mobile variant. Work main video ≤3 min, 1080p, with sound. Anything longer is an external link.
- Images: Payload WebP sizes via srcset, with focal-point crops on cards, alt text required.
- Contact: `mailto:` and social links only, no forms. Socials are a CMS list, filled in later.
- Analytics: Cloudflare Web Analytics, cookieless.
- `<html lang="tr">` so `i`/`ı` case correctly. Fonts must cover ı İ ğ ş ç ö ü.

## Build

- Next.js app `apps/web` in daglier.com's monorepo shape (backend ADR-0001). Tailwind v4 with tokens as CSS variables.
- The frontend plumbing is copied once from daglier.com, and none of its look carries over (ADR-0100).

## Open

- Rendering and revalidation are in task0's next round. The proposal is static pages revalidated by tag. Note: `/isler?disiplin=` reads searchParams, so it renders per request, with cached data.
- Social profiles and email: the user fills them in later.
- Motion ambition is mid-heavy with possible 3D on scroll, shelved until the Figma design exists.

## Backend tickets to cite as blockers (sub-issues of #1)

- #2: monorepo scaffold + empty web shell. Blocks every frontend ticket.
- #3: first data-module reads. Blocks any page that reads content.
- #11: cache tags + revalidate route. Blocks anything that depends on tags.
- #12: preview instance. Blocks preview behaviour.
- #13: seeds with demo content.
- #18: leaves the Sentry and Cloudflare Web Analytics script tags to our layout, and documents their inputs and CSP.
- #19 cutover (ready-for-human): add the frontend tickets that make public pages real as its blockers.

## Figma

https://www.figma.com/design/gvdJI4fxrFprmtyYz1sdln. Page "01 — Wireframe" holds lo-fi wireframes of every page at 1440 and 390. Page "02 — Scroll fikirleri" holds 12 scroll ideas as storyboards. The user designs the look on top. One scroll idea becomes the Home signature object and one becomes the Work-to-Work transition.

## Home FLOW (owner's design, 2026-11-06)

Figma page `flow` (exported to `docs/design/flow/FLOW #1–#13.png`; every image there is a video) is the Home scroll:

1. A full-bleed showreel with the name and intro over it.
2. The reel letterboxes, then shrinks to the centre while the text slides down and out.
3. The reel lands as an inline clip in a one-line statement.
4. A grey section rises over the pinned statement.
5. Three featured cards (16:9, 16:9 and 9:16) move at different speeds and overlap. Each card is labelled with its Disciplines (left) and client (right).
6. About ends the page: a centred portrait with the bio overlapping its bottom.

The prototype is `docs/design/prototype-home-flow.html`. Double-click it to open. It is a grey-box GSAP ScrollTrigger build, and its yellow bar jumps to each FLOW frame and overlays the PNG.

Open questions raised by FLOW:
- **Copy language (answered 2026-11-06):** the site stays Turkish-only (ADR-0002). FLOW's English copy is placeholder. Its intro calls Taha "a hybrid production company", which the real copy should settle.
- **Discipline labels (answered 2026-11-06):** FLOW's labels are placeholder. Cards show the Work's Disciplines (Kurgu, Motion, Grafik) on the left and the client on the right.
- **Header (answered 2026-11-06):** FLOW is the Home page only. MENU opens İşler (`/isler`, all Works), Galeri (`/galeri`) and Hakkımda (`/hakkimda`, the full About; Home keeps only the short version). Contact lives on Hakkımda. Galeri holds Gallery items (see the pages table and `GLOSSARY.md`).
- **Featured count (answered 2026-11-06):** the A/B/C card arrangement repeats for each further group of 3, so any count renders. With 0 Featured Works the section is skipped. An "All works" link to `/isler` follows the cards. The owner may design positions 4–6 later.
- **Not drawn:** the menu, the contact strip and footer, "watch with sound" on the showreel, the transition into About, the phone layout, İşler, and the Work page.
- **Bio:** the bio in FLOW #13 is placeholder text from another person's site, so it must be replaced.
- **Parallax speeds:** FLOW 9–12 don't imply one constant speed per card. The prototype has sliders for this.

## Next

1. (Done 2026-11-06.) Gray-box wireframes in a new Figma file: every page above at 1440 and 390 widths, plus a 9:16 Work page variant. Real Turkish labels. Color and type variables named like the future Tailwind tokens.
2. The user designs in Figma.
3. `/to-spec` and `/to-tickets` from the Figma design and this file.
