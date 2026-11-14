# The site menu is the Pinboard, in CSS 3D over the live page

Status: accepted · 2026-11-14 · builds on ADR-0101 and ADR-0105

The site menu was a plain black panel that belonged to no world. Home is now the Edit Room, Taha's room at night, and the menu belongs to it: opening it pins the page you are on to a board on Taha's wall as a small tilted sheet, with İşler, Galeri and Hakkımda as printed frames around it (see the glossary and the Pinboard spec, #142). Four decisions go with it.

1. **The menu is the Pinboard.** One board on every page. The owner tried six desk menus as prototypes and picked this one (`docs/design/menu3/pinboard.js`, contract `docs/design/menu3/CONTRACT.md`).
2. **CSS 3D only, no GSAP.** Transforms, perspective, gradients and SVG strings, so it runs on every page. No WebGL or Three.js outside Home: ADR-0105 stands. Motion is pure functions in `lib/` (layout, hinge, tween) driven by one `requestAnimationFrame` loop that runs only while the menu is open or animating.
3. **The page is a sheet in one box.** The route's content (`main` and footer, not the header) sits in one page box that the menu transforms into the sheet. A transformed box moves its `position: fixed` children with it, so anything fixed that must stay on the viewport while the menu is open lives outside the box (the Drop cursor). The melt layer stands down while the menu is open.
4. **The resting board is server HTML.** It is the whole menu without JavaScript and under reduced motion, Save-Data or a weak device (ADR-0101). The motion only adds transforms on top of it.

## Considered Options

- **Keep the plain panel**: rejected. It works but belongs to no world.
- **The other five desk menus of prototype 3**: rejected. The owner chose the Pinboard; the files stay, no work.
- **A snapshot image of the page instead of the live page**: rejected. It would go stale (a playing loop, a changed page) and cost a capture on every open.

## Consequences

- The root layout gains the page box; the Drop cursor moves out of `PageMain` into the root layout.
- Every accessibility behaviour of the old menu stays: the `<details>`, focus trap, Escape, focus return, scroll lock. The page sheet, notes, strings and pictures are hidden from screen readers.
- Visitors with no motion see the board at rest and still, with no page shrink.
- The look is ported as it is; the owner tunes it by hand afterwards.
