# Menu prototype 3 (desk menus): contract between the shell and each menu script

THROWAWAY prototype. The site's Home is becoming the Edit Room: Taha's room at night, a desk with three
monitors, lamp, speakers, tablet, phone, prints on the wall (see `docs/design/home2/editroom.js` for the
look; read it only for the picture, you do not use its code). The menu belongs to that world. The idea
the owner approved: **opening the menu is leaning back from the screen**. Whatever page the visitor is
on becomes a thing in the room (the picture on a monitor, a sheet, a drive), and the links are other
things in the room.

Shell: `docs/design/prototype-menu-3.html` (the lead wrote it; read it, never edit it). Each menu is one
classic script `docs/design/menu3/<name>.js` loaded by a `<script src>` tag: no ES modules, no imports,
no fetch, no extra CDN loads. Wrap the file in an IIFE.

## The hard rule: CSS 3D only

The menu must work on EVERY page of the site, including plain text pages where no 3D code is loaded.
So: DOM elements, CSS transforms (`perspective`, `rotateX/Y`, `translateZ`, `preserve-3d`), CSS
gradients, masks, filters, `clip-path`, blend modes, and at most small 2D canvases for the moving
previews. **No WebGL, no THREE, no `<canvas>` 3D.** `gsap` 3.13 core is available as a global.
Animate transforms and opacity only (no layout properties per frame), promote moving layers with
`will-change`, and keep `filter: blur` off large moving layers.

## Register

```js
MENU3.register({
  name: 'Lean Back',
  create(ctx) {
    // build everything inside ctx.stage, in the CLOSED state, nothing visible
    return { open() {}, close() {}, dispose() {} }
  },
})
```

- `create(ctx)`: the menu was picked (keys 1-6). Fonts are ready. Build your DOM in `ctx.stage`.
- `open()` / `close()`: MENU or Escape. Either can arrive while the other still animates: reverse from
  the current state, no jump, never stuck. Spamming MENU must always end in the right state.
- `dispose()`: another menu was picked. Kill tweens, cancel rAF, remove listeners, undo every style
  you put on `ctx.page`. The shell empties `ctx.stage` after.
- Link activated (click, tap, Enter): `preventDefault`, play your leave animation (at most 900 ms), end
  in the CLOSED state, then call `ctx.arrive(link)`. The shell swaps the fake page under you. Design the
  leave so the new page is what the view pushes INTO (the thing you picked becomes the screen).

## ctx

| Field | What |
|---|---|
| `stage` | Empty `div`, `position:fixed; inset:0; z-index:40; overflow:hidden`. The header (logo + MENU word, z 50, `mix-blend-mode:difference`) and the TV grain (z 100) sit above it. The shell sets `pointer-events:auto` on it at `open()` and `none` at `close()`. |
| `page` | The current page as ONE fixed, view-sized box (`position:fixed; inset:0`), below the stage. Transform it freely with CSS 3D (shrink it into a monitor, tilt it, slide it): it stays live while transformed (the 3D Home keeps rendering, a text page keeps its text). Restore it on close and dispose. Its scrolling is locked by the shell while the menu is open. |
| `kind()` | `'room'` (the 3D Edit Room, an iframe), `'works'` (a card page) or `'text'` (a text page). The owner switches it with keys z / x / c. Your menu must look right over all three; do not build three menus. |
| `links` | `[{href:'/isler',label:'İşler'},{href:'/galeri',label:'Galeri'},{href:'/hakkimda',label:'Hakkımda'}]` |
| `legal` | `{href:'/gizlilik',label:'Gizlilik'}` |
| `copyright` | `'© 2026 Taha Çiftçi'` |
| `previews` | Six 480x270 canvases with moving grey stand-in loops, animated by the shell while the menu is open. `links[i]` owns `previews[2*i]` and `previews[2*i+1]`. Draw copies with `drawImage` into your own small canvases; never append the originals. |
| `button` | The MENU element (for its rect). |
| `pointer` | `{x, y, down}` live viewport px, mouse and touch. |
| `touch` | `true` when the device has no hover. |
| `arrive(link)` | Call after your leave animation. |
| `cursor.hover(on)` | The shell's Drop cursor swells on `a` and `button` by itself; call this only for other hit targets. |

CSS variables on `:root`: `--bg #000`, `--t #ededed`, `--mu #8f8f8f`, `--rs #1a1a1a`, `--ph #2a2a2a`,
`--serif` (Instrument Serif), `--sans` (Geist), `--gut` (16px, 32px from 768px), `--hh` (header height),
`--ease`. Class `.m` is the tiny Geist caps style. Colours: these tokens and the greys between them
only. No warm lamp light, no colour.

## Must hold for every menu

1. Real `<a href>` for İşler, Galeri, Hakkımda and Gizlilik, plus the © line, inside `ctx.stage`, in that
   tab order, each with a visible focus state. The shell traps focus and focuses the first `a` on open.
2. Links are clickable within 300 ms of `open()`, even while the animation still runs.
3. 60 fps in Chromium and WebKit on a laptop. One rAF loop at most, running only while open or animating.
   Handle `resize`.
4. Phone portrait (390 x 844) with touch: the same idea reframed (stack the things vertically), link
   words large, nothing under the header (keep content below y = 130 px), every hover idea has a touch
   version.
5. The room is drawn with CSS: monitors are rounded dark slabs with a thin bezel, a stand and a soft
   glow under them; the desk is a dark plane with a faint mirror of what stands on it; the lamp is a
   soft light pool (radial gradient); depth comes from perspective, dimming with distance and soft
   shadows. It must look heavy and stay light.
6. Link words are big serif type and readable at once; the thing is the frame, the word is the star.
7. Four designed moments: open (lean back), hover/focus, close (lean in again), leave (push into the
   picked thing). Lots of motion with weight: overshoot, stagger, parallax with the pointer.
8. Flash safety: no more than 3 flashes a second, no big-area flash. No sound. No TV/CRT gimmicks.
9. Nobody tests this for you; the owner opens it directly. `node --check`, then a mocked pass in Node
   with a small DOM stub if you can (create, open, close, open, a link click, dispose) to catch
   exceptions.
