# Home prototype 2 (worlds): contract between the shell and each example script

THROWAWAY prototype. Ten small-scale worlds as landing pages for taha.media, all Three.js, all behind
one shared curved-TV glass. Shell: `docs/design/prototype-home-2.html` (the lead writes it; read it, never edit
it). Each example is one classic script `docs/design/home2/<name>.js` loaded by a `<script src>` tag:
no ES modules, no imports, no fetch, no extra CDN loads. Wrap the file in an IIFE.

Globals: `THREE` 0.160 global build (core only: no addons, loaders, controls, postprocessing, troika),
`gsap` 3.13 core, `HOME.register(def)`.

## The shell owns the renderer and the glass

The shell has the one `THREE.WebGLRenderer`. Each frame it calls your `update`, renders your `scene`
with your `camera` into its own render target (4x MSAA, depth), then draws that picture to the screen
through the CRT pass: barrel bend, red/cyan fringe that grows toward the edges, scanlines, grain,
vignette. You never create a renderer or a canvas for output and never draw CRT effects yourself.

Colour is passed through untouched (`ColorManagement` off, linear output): `0xededed` in a material is
`#ededed` on screen. Do not set `colorSpace` on anything.

## Register

```js
HOME.register({
  name: 'Tunnel',
  create(ctx) {
    return {
      scene, camera,
      update(t, dt) {},   // every frame, seconds; advance your motion here (and any gsap-driven state)
      resize(w, h) {},    // CSS px; called once right after create, then on every resize. Set camera.aspect here.
      tap() {},           // a click or a finger tap (not a drag). Find what is under ctx.pointer yourself.
      focus(i) {},        // keyboard focus is on Work i (-1: none). Show it like a hover.
      activate(i) {},     // Work i was chosen by keyboard. Same path as a tap on it.
      back(i) {},         // the fake Work page was closed. Play your return to the scene.
      dispose() {},       // free your geometries, materials, textures, tweens, listeners. Not ctx's.
    }
  },
})
```

Choosing a Work (tap on it or `activate(i)`): play your fly-in (at most 900 ms), then call
`ctx.enter(i)`. The shell shows a fake Work page over the scene; on its Back button it calls `back(i)`.

The opening: `create` starts it by itself. Showreel full screen (`ctx.showreel.texture` filling the
view), then 2 to 3 seconds in which it turns into your scene. A `tap()` during the opening skips to
the rest state. Works must be choosable within 1 second after the opening ends.

## ctx

| Field | What |
|---|---|
| `renderer` | The shell's renderer, for extra passes of your own inside `update` (your own render targets). The shell sets its target again after `update`. |
| `works` | Eight Featured Works: `[{ title, kind, year, href }]` (fake titles). |
| `hero` | The Home hero sentence (string). Show it in the scene (it must be readable at rest), with `ctx.text`. |
| `atlas` | One `THREE.CanvasTexture`, 4 columns x 2 rows, holding the eight moving loops; the shell repaints and uploads it every frame. Work `i` is column `i % 4`, row `floor(i / 4)`. |
| `loopRect(i)` | `[u0, v0, su, sv]`: Work i's cell in the atlas in UV space, for your shaders (`uv * rect.zw + rect.xy`) and instanced attributes. |
| `loopGeometry(i, w, h, sw, sh)` | A `PlaneGeometry` whose UVs already point at Work i's cell: use it with a plain `MeshBasicMaterial({ map: ctx.atlas })`. All loops are 16:9. |
| `showreel.texture` | A moving 16:9 `CanvasTexture` (the Showreel stand-in), repainted by the shell. |
| `text(str, opts)` | Draws text to a canvas, returns `{ texture, aspect, canvas }`. `opts`: `size` (px, default 160), `font` (`'serif'` default, or `'sans'`), `color` (default `#ededed`), `caps` (tiny Geist caps meta style). Transparent background. Dispose the texture yourself. |
| `pointer` | `{ x, y, nx, ny, dx, dy, down, inside }`. `x, y`: CSS px. `nx, ny`: NDC of the PICTURE under the pointer, already mapped back through the bend: pass these to `raycaster.setFromCamera`. `dx, dy`: movement this frame in px. |
| `scroll` | `{ y, v }`. The page never scrolls (Home holds the screen). Wheel and vertical touch drag feed a virtual, unbounded, smoothed scroll: `y` in px, `v` in px/s. |
| `crt` | `{ push, glow }`. `push`: write 0 to 1 to push the glass (more bulge, more fringe) on speed or impact; the shell eases it; 0 at rest. `glow`: strength of the shell's glow pass (bright parts of your picture bleed light), default 0.7, range 0 to 2; anything brighter than about 55% grey glows, so keep big dim surfaces under that and let screens and lamps be the bright things. |
| `cursor.hover(on)` | The Drop cursor swells while a Work is under the pointer. Call it on enter/leave. |
| `enter(i)` | Call after your fly-in. |
| `touch` | `true` when the device has no hover. |
| `reduced` | `true` under reduced motion: start in the rest state, no opening; the shell renders a single still frame. |
| `size` | `{ w, h, dpr }` live. |

Tokens (the only colours): `0x000000` bg, `0xededed` text, `0x8f8f8f` muted, `0x1a1a1a` raised,
`0x2a2a2a` placeholder. The red/cyan fringe belongs to the glass, not to you.

## Must hold for every example

1. It is a landing page: at rest the visitor reads the hero sentence, sees moving Works, and understands
   they can be chosen. Each of the eight Works is reachable and shows its title (and kind/year small)
   when hovered or focused.
2. Scroll (`ctx.scroll`) is the main drive, the pointer reacts, drag works where it makes sense. On a
   phone (390 px wide, portrait, touch) everything stays inside the view and is reachable by drag + tap.
3. 60 fps on a laptop in Chromium and WebKit; a phone must hold 50+. The shell caps DPR (2, touch 1.5).
   Keep draw calls low (instancing for many screens), no per-frame allocations, no per-frame geometry rebuilds.
4. Four designed moments, each with its own motion: opening, browse (scroll/drag), hover/focus, fly-in to
   a Work and the return.
5. Lots of motion, but it must read: bright where it counts (Works near full brightness, not grey on
   black), text fully inside the viewport, smooth surfaces (compute normals properly; no accidental
   faceting), nothing upside down or mirrored (a `CanvasTexture` on a `BackSide` or a flipped plane mirrors).
6. Flash safety (WCAG 2.3.1): no more than 3 flashes in any second, no big-area flashes.
7. No sound. No DOM of your own (the shell has the header, the hidden links, the Work page).

## This batch: worlds, small scale

Taha is a freelance video editor, motion designer and designer who works alone, from his own room, for
small to mid clients. Every example is a PLACE or an OBJECT from that life, at that scale: nothing grand,
no studios, no cities of screens. The Works sit on real things in the scene.

1. Built in code only: boxes, planes, cylinders, lathes, extrudes, rounded shapes you generate. No model
   files, no image files, no loaders. Stylised and clean, not photoreal. Invented details (labels, shop
   names, note texts) are fine; mark each in a code comment as `fake`.
2. It must LOOK heavy and RUN light. No real lights, no shadow maps, no PBR. Use `MeshBasicMaterial` and
   your own small shaders, and fake the weight: baked-style shading (vertex colours or gradients for
   ambient occlusion in corners and under objects), soft contact-shadow quads, screens that light what
   is near them (a glow quad on the desk, wall or floor tinted by nothing but brightness), a mirror
   floor or glossy desk done with a flipped dim copy, fog and depth fade, light shafts as additive
   planes, distance blur faked by dimming and softening far things. Merge static geometry: aim for
   under 60 draw calls and under 150k triangles (half on `ctx.touch`).
3. Colours: the tokens only (black, `0x1a1a1a`, `0x2a2a2a`, `0x8f8f8f`, `0xededed`) and the greys
   between them. No warm lamp light, no neon.
4. Moving through it: scroll moves the camera along a fixed path through the place (ease, inertia,
   clamp or loop at the ends), the pointer looks around with weight (about 8 to 14 degrees), a click on
   a Work flies in. No free walking. Objects may also answer the hand (push, lift, open) where the
   example says so.
5. All eight Works are in the scene on things, each reachable along the path, each showing its loop
   bright and upright in true 16:9 (or as its brief says), with title + kind/year shown when hovered or
   focused. The hero sentence is in the scene and readable at rest (on a wall, a note, a sign).
6. Phone portrait (390 x 844): a lighter version (fewer objects), framed so the main object fills the
   width; keep labels and hero below y = 130 px and 16 px inside the view.
7. Nobody tests this for you; the owner opens it directly. It must run on first load: `node --check`,
   then a mocked Node pass (stub `ctx`; create, resize, 300 frames of update, tap, focus, activate,
   back, dispose) with no exception and no NaN.
