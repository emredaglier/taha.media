# Frontend structure (grill outcome, 2026-11-05)

These are structural decisions only. The look (type, color, layout feel, motion) is designed in Figma and may differ completely from any wireframe. Terms follow `GLOSSARY.md`. Decision records are in `docs/adr/0100–0103`, and the backend ones in `0001–0013`.

## Pages (Turkish paths, no locale prefix; English later under `/en`)

| Path | Contents, top to bottom |
|---|---|
| `/` | The **Helix** (see "Home Helix" below): the **Showreel** full-bleed with the name and statement; on scroll it zooms out into the Helix of Featured Works, then melts away. Nothing follows the Helix and there is no footer. |
| `/isler` (menu: İşler; "Portfolio" in the English placeholder) | All Works in Editor drag order, newest first as fallback. Discipline filter `Tümü · Kurgu · Motion · Grafik` as links (`?disiplin=kurgu\|motion\|grafik`), server-rendered, works without JS. Cards show cover image or **Preview loop**, title, Disciplines and year. |
| `/isler/[slug]` | Main media (MP4, click-to-load external video, or image, in its own aspect ratio: 16:9, 9:16 or square) → title, Disciplines, year, client → role and credits → short description → gallery of stills → next Work. Only title and main media are required. Old slugs get a 301. |
| `/galeri` (menu: Galeri) | All **Gallery items** (photography plus personal and experimental pieces, never Works) in Editor drag order, newest first as fallback, no filters. Clicking one opens it full-screen over the grid (a lightbox dialog: arrows, swipe, Esc closes, focus stays inside, Safari focus fix). There is no page per item. Loops follow the Preview loop rules (silent, play in view, poster under reduced motion). Without JS, items link to the full-size file. |
| `/hakkimda` (menu: Hakkımda) | The full About: portrait + bio → one line per Discipline → client list (names or logos) → contact (email + socials). This is contact's main home; later designs may add it elsewhere too. |
| `/gizlilik` | Short notice naming Cloudflare Web Analytics and Sentry. Nothing is collected from visitors. Once Hand control ships, a paragraph on its on-device camera use (see "Hand control"). |
| 404 | Server-rendered not-found page |

No blog route and no nav slot until a blog is built.

Gallery backend (provisional, task0, 2026-11-06; don't cite as final until the backend ticket exists): collection `gallery`, read `getGalleryItems()`, cache tag `gallery`. Each item has `kind` image|video, optional `caption` and `year`. The owner chose its own loop caps (2026-11-06): ≤15 s, 1080p, silent, about 10 MB, because loops play full-screen in the lightbox. These go into the backend Gallery ticket.

Backend spec (issue #1) facts the frontend relies on: its "Data module contract" section lists the reads we use. Each Video declares a use (`previewLoop | showreel | main`). Featuring fewer than 4 or more than 8 Works only warns the Editor, so Home must render any count from 0 upward gracefully.

## Chrome

- **Header** (changed 2026-11-06 by FLOW): name/logo (home link) and a MENU button at every width. MENU opens a full-screen menu with İşler, Galeri and Hakkımda, each a separate page (daglier's MobileMenu restyled, keeping the Safari focus fix). Once Hand control ships, desktop visitors with a camera also see its toggle, "Elinle gez", next to MENU (see "Hand control").
- **Footer** (2026-11-06, changed 2026-11-08): on every page except Home, holding the Gizlilik link and ©. Its design isn't done yet. Gizlilik and © are also in the menu, so Home reaches them without a footer. Email and socials live on Hakkımda first.
- **Layouts** (2026-11-08, #48): one root layout (skip link, header), so moving between Home and other pages stays client-side. A nested layout can't remove the parent's footer, so the footer isn't in the root: the `app/(site)/` route group's layout adds `main` and the footer for every page except Home (İşler, a Work, Galeri, Hakkımda, Gizlilik). Home sits outside the group and renders its own `main`. The not-found page replaces everything below the root layout, so it brings its own `main` and footer. The page-HTML test seam wraps each page in every layout on its path.
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
- Home Helix spec #45, tickets #48–#59 (2026-11-08). #42 (Statement as one text field) blocks #49, the static Home. #43 (featuring needs a 16:9 Preview loop) blocks #52, the first Helix ticket. #44 (Featured count warning 6–12) only changes an Editor warning and blocks nothing. #46 (a replaced loop file isn't rechecked for 16:9) blocks nothing, because the Helix crops media that isn't quite 16:9. #48–#50 and #52–#55 block the cutover #19; Hand control (#56–#59) doesn't.
- #19 cutover (ready-for-human): add the frontend tickets that make public pages real as its blockers.

## Figma

https://www.figma.com/design/gvdJI4fxrFprmtyYz1sdln. Page "01 — Wireframe" holds lo-fi wireframes of every page at 1440 and 390. Page "02 — Scroll fikirleri" holds 12 scroll ideas as storyboards. The user designs the look on top. One scroll idea becomes the Home signature object and one becomes the Work-to-Work transition.

## Home Helix (owner's redesign, grill 2026-11-08)

Replaces the Home FLOW below. Decision record: ADR-0103 (Home holds the screen). Reference: the owner's hero screenshot (name bottom left, statement bottom right, © under the name) and the 21st.dev "dither helix carousel" component, whose helix geometry and input carry over but whose dither look does not.

- **Home is only the Showreel and the Helix.** The FLOW statement section, the A/B/C Featured cards, the short About and the "Tüm işler" link leave Home. About lives on `/hakkimda`, İşler in the menu.
- **What rides the Helix:** Featured Works in Editor order. The CMS refuses to publish a featured Work without a 16:9 Preview loop (drafts need no loop; only the loop's shape counts, width within 2 px of height × 16/9; backend #43). The Featured count warning becomes 6–12 (saving still works outside it; backend #44): with 6 or more, no Work is on screen twice.
- **Fewer than 10:** the list repeats in order until there are at least 10 cards. The counter and screen readers count real Works. With 0 Featured Works, Home is the Showreel alone, without scroll.
- **Scroll:** the zoom follows the scroll (scroll up reverses it). When the Showreel sits in the front slot, the melt plays by itself (about 1–1.5 s) and that is the point of no return. After it, the page never scrolls: the wheel, a drag or the arrow keys turn the Helix, endless both ways. The logo or a reload brings the Showreel back.
- **Showreel landing:** it shrinks onto the front slot while the other cards appear around it, then melts away and reveals the first Featured Work in that slot. There is no timed intro on page load.
- **Overlays:** the header (logo, MENU) stays throughout. The name, statement, © and "Sesli izle" leave with the zoom. Once the Helix is in place: the front Work's title, Disciplines and client bottom left, the counter bottom right. Exact positions wait for the owner's per-breakpoint design.
- **Statement:** one text field, not `{before, after}` (the reel no longer sits inside it; backend #42).
- **Cards:** all 16:9, playing their Preview loop only in the sharp middle band; the rest show a still frame.
- **Clicks and keys:** the front card opens its Work page; any other card turns to the front. Arrow keys turn, Enter opens.
- **Back from a Work page** restores the Helix with the same Work in front, skipping the Showreel. The URL doesn't change per card.
- **Phones** that pass the device check get the Helix. The zoom starts from the 16:9 Showreel cropped to the tall screen and widens into the card; `showreelPhone` is used only in the fallback. Finger scroll drives the zoom, vertical drag turns the Helix.
- **Fallback (ADR-0101):** reduced motion, Save-Data, a weak device, no WebGL2 or no JavaScript get a static Home: the hero with the Showreel poster, then the same Works as plain cards (`FeaturedWorks`). It is also the server HTML every visitor gets first (#49). The hero has the name as the page's only `h1` with © under it bottom left, and the Statement bottom right when set; with 0 Featured Works it fills the screen alone. The cards are 16:9 (media that isn't quite 16:9 is cropped, never stretched) in Editor order, one column on phones, two from 700px, three from 1100px, each with title, Disciplines and client. A featured Work without a Preview loop is left out (a guard for older data; the CMS refuses to publish one).
- **The melt:** one melt material does every job: removing the Showreel, hiding the Helix's top and bottom edges (required, or cards visibly wrap), pushing far cards back, dimming cards you aren't pointing at, and making cards appear. It reacts to the cursor and to turning speed (on phones, the drag). Chosen 2026-11-09 from the live sketches in `docs/design/prototype-home-helix.html`: **analogue signal** with **Scanline** front-card edges (#64; it replaced the liquid glass chosen on 2026-11-08). A signal failing: per-line jitter (re-rolled on every drawn frame, #66), chroma bleed, a rolling tracking band, with no static (the owner removed the tape noise and grey snow on 2026-11-09, #65; the melt now fades the picture out from 0.55 where the snow used to take over). The cursor bumps the tracking and jitter through a heat trail, turning raises the jitter, and the Showreel drops out line by line behind a jittering ring from its centre. Sharp cards (hovered, in the sharp band, the front card at rest) keep straight top and bottom edges while their left and right edges shift per scanline row, about 2 px at rest; everything else tears along its outline. Sliders at the prototype's defaults (line jitter 1, chroma bleed 1, cursor tracking bump 1).
- **Validated in the prototype (owner's QA, 2026-11-08):**
  - Input works from the moment the melt starts (wheel, drag, arrow keys, click, Hand control): the Helix turns while the Showreel melts, and the melting Showreel rides on its card. The melt starts as soon as the zoom is nearly done; the zoom's smoothing is time-based, not per frame.
  - Settling into a card: when input ends (at once after a drag or pinch, about 110 ms after the last wheel tick), a critically damped spring takes over from the current speed and settles on the next card in the direction of travel, unless the move left the last card by less than about an eighth of a card. Settle time about 0.55 s. A single wheel notch advances one card, a tiny accidental nudge springs back, and there is no stop-then-snap.
  - The zoom is a camera pull-back with a constant-rate (exponential) scale, and the Helix spins about 2.5 cards while zooming.
  - Cards past the side of the cylinder show their back: un-mirror them (the 21st.dev component doesn't).
  - On narrow screens the front card fits within about 86% of the width.
  - Starting values (prototype sliders): sharp band 0.25, far cards 0.7, cards not pointed at 0.55, Showreel melt 1.3 s, zoom scroll length 140vh.

## Hand control (grill 2026-11-08): an optional follow-up after the Helix launches

**Hand control** (GLOSSARY) lets a desktop visitor browse the whole site with a hand in front of the camera. It ships after the Home Helix, as its own tickets, and the Helix launch doesn't wait for it. The behaviour was tested in `docs/design/prototype-home-helix.html` (Home only there). Research behind it:
  - [WCAG 2.2, SC 2.5.4 Motion Actuation](https://www.w3.org/WAI/WCAG22/Understanding/motion-actuation): functions driven by user motion need a normal control and a way to turn the motion off.
  - [Apple HIG, Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures.md): look or point, then pinch; pinch and drag to scroll.
  - [Ultraleap hand poses](https://docs.ultraleap.com/xr-guidelines/Interactions/hand_poses.html): clear visual feedback that a pose was recognised; signal tracking loss.
  - [Mid-air selection study](https://escholarship.org/content/qt4v91504d/qt4v91504d.pdf): pinch is fast but error-prone and demanding; dwell is slowest but most accurate.
  - [Consumed Endurance (Hincapié-Ramos et al.)](https://researchr.org/publication/Hincapie-RamosGI14/bibtex): raised arms tire fast ("gorilla arm"), so keep hand movements small and let the elbow rest.

- **Toggle:** "Elinle gez" in the header next to MENÜ on every page, from the first moment. Shown only on desktop (mouse or trackpad pointer) with a camera, and never under Save-Data or on a weak device. It stays available under reduced motion, where only the ring's animations switch off. It is a real toggle button (`aria-pressed`) with status changes announced politely in Turkish. Mouse and keyboard keep working, so the camera is never the only way (WCAG 2.5.4).
- **Before the browser prompt:** the first click opens a short note ("Kameran yalnızca elini görmek için açılır; görüntü cihazından çıkmaz") with Aç / Vazgeç. Only Aç asks the browser.
- **Files:** the hand-tracking files (~18 MB, MediaPipe, version pinned) are self-hosted on `cdn.taha.media` and load only after Aç, into the browser's cache (never the Downloads folder). Later visits reuse the cache.
- **First use:** the pinch threshold calibrates from the visitor's open thumb-index gap (about a third of it), with no slider. A skippable three-step coach (point to explore, pinch and move to scroll, quick pinch to click) shows once per browser; a "?" next to the preview replays it.
- **Gestures, everywhere:** the index fingertip is the cursor (exploring: hover effects, Preview loops on cards, and on Home the focus and the signal's tracking bump); pinch and move scrolls the page (on Home it scrubs the Showreel zoom and turns the Helix); a quick pinch clicks whatever is under the cursor (links, cards, filters, MENÜ and the menu). Click is a quick pinch, never dwell. Letting go of a pinch-drag lets a long page glide on briefly; the Helix keeps its settling. In the Galeri lightbox, pinching and moving left or right goes to the previous or next item. A quick pinch plays or pauses our own videos. Inside a loaded Vimeo or YouTube player the hand can't reach (browser security), and a hint says "Oynatıcının içinde fareyi kullan".
- **On screen while on:** a small mirrored preview in a corner with the hand dots and an × (it is also the camera-on indicator). The ring is hollow while exploring, filled while grabbing, pings on a click and fades when tracking is lost. Hints appear when tracking is poor ("Biraz yaklaş", "Daha çok ışık"). The look comes from Figma.
- **Lifetime:** it stays on across pages in the same tab, and after a full reload in that tab it comes back on by itself while the browser still has permission. It turns off when the visitor turns it off, when the tab is hidden, after 30 s with no hand in view, or when the page can't stay smooth (under ~40 fps for 3 s, with the note "Bu cihazda akıcı çalışmıyor"). A new tab or visit starts with it off.
- **Privacy:** `/gizlilik` gets a paragraph saying the camera turns on only when the visitor chooses, the picture is processed on the device, and nothing is recorded or sent.
- **Headers:** the site sets no CSP or `Permissions-Policy` today. If a CSP is added, Hand control needs `'wasm-unsafe-eval'` in `script-src` and the model host in `connect-src`, and the site must never send `Permissions-Policy: camera=()`.

## Home FLOW (owner's design, 2026-11-06; superseded on Home by the Helix, 2026-11-08)

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
- **Featured count (answered 2026-11-06; superseded by ADR-0103, the static Home now shows plain 16:9 cards and no "All works" link):** the A/B/C card arrangement repeats for each further group of 3, so any count renders. With 0 Featured Works the section is skipped. An "All works" link to `/isler` follows the cards. The owner may design positions 4–6 later.
- **Not drawn:** the menu, the contact strip and footer, "watch with sound" on the showreel, the transition into About, the phone layout, İşler, and the Work page.
- **Bio:** the bio in FLOW #13 is placeholder text from another person's site, so it must be replaced.
- **Parallax speeds:** FLOW 9–12 don't imply one constant speed per card. The prototype has sliders for this.

## Next

1. (Done 2026-11-06.) Gray-box wireframes in a new Figma file: every page above at 1440 and 390 widths, plus a 9:16 Work page variant. Real Turkish labels. Color and type variables named like the future Tailwind tokens.
2. The user designs in Figma.
3. `/to-spec` and `/to-tickets` from the Figma design and this file.
