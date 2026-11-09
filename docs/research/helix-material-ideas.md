# Helix material ideas to replace liquid glass

Researched 2026-11-09 for taha.media. Repo facts come from `composite.ts`, `renderer.ts`, issue #45 and issue #63. Technique facts come from the pages linked per candidate. Costs and phone risk are my estimates, not measurements: nothing was run.

## What the new material must read

The composite already receives per-pixel melt inputs `gone, dimmed, hovered, deep` (`MELT_INPUTS_GLSL`) plus the Showreel's centre/reach, `melt`, `speed`, `shift` and a ripple texture. Every candidate below is a new `FRAGMENT` reading those same inputs, so `meltAt()` (the one scalar `m`, 0 sharp to 1 gone) stays. What changes is **what `m` does to a pixel**: liquid glass warps, blurs and splits colour. Ticket #63 adds a requirement: pixels just outside a card need a little of the material, or the outline stays straight. Each candidate says how it does that.

## Short answer: top 3

1. **Film burn (emulsion burn with light leak).** Best fit. Burning is a threshold on noise, so "gone" is natural. The ragged ember edge is organic on any rectangle. Film-burn and light-leak transitions are a standard editor's tool, so it speaks the owner's language. No simulation needed.
2. **Halftone print.** A real print lineage. Dots shrinking to nothing is a clean "gone". Edges break into dots, and the interior can stay sharp. Risk: it can look like a filter if the dot grid is visible at rest. Keep it to the melt band.
3. **Long exposure / slit-scan trails.** The only candidate where turning speed is the main driver. Cards streak along the turning direction as light trails. It needs a feedback buffer and has the weakest "dissolve", so it is the most ambitious pick.

Weak or gimmicky, said plainly: analogue signal (VHS) is the most overused look on this list; datamosh is trendy and dissolves poorly (it smears, it doesn't vanish).

## Shared technique notes

- All candidates are one composite pass reading `uScene` (mipmapped) and `uMeltInputs`. Passes below are extra to that.
- **Edge band for #63.** Build a "near a card" value by sampling `uMeltInputs`/scene alpha at 4 to 8 taps a few pixels out, or by writing a small distance falloff in the card pass. Every candidate below uses it the same way: `edgeBand` (0 to 1, spans the card outline, crosses the edge) adds a small amount to `m` for texture and displacement only, never to the fade. Cost: about 4 to 8 extra texture reads. This is a recommendation, not something verified in the code.
- **Fallback.** None needs more than the existing one (static Home under reduced motion, Save-Data, weak device, no WebGL2). Where a candidate needs a float or half-float render target, `EXT_color_buffer_float` / `EXT_color_buffer_half_float` must exist or it takes the static Home. I did not check how `gl.ts` handles this.

---

## 1. Film burn

**Look.** A card dissolves like film stock caught in the gate. A bright ember line travels along a noisy front, white-hot at the edge, orange then deep red behind it, with a charred, porous band where the picture is gone. Light-leak glow bleeds warm colour over cards that are fading. Resting cards are untouched except a faint warm bloom at the rim.

**Jobs.**
- Top/bottom edges: `m` rises with distance from the band, so the burn front is a horizontal ragged line that never sits still. Cards burn out at the screen's top and bottom.
- Depth: far cards are scorched, not blurred: darkened, desaturated, with warm grading, burn threshold just below the front.
- Dimmed: unpointed cards get a low scorch (brown-black toning), no burn-through.
- Appear in zoom: the burn runs backwards, from char to picture, like a film catching light and exposing.
- Showreel dissolve: a ring burn from the Showreel centre (already `uCentre`, `uReach`): the ring is the ember front, about 1.3 s. The existing ring-wobble code maps directly to the front noise.
- Organic edges: the `edgeBand` thresholds the noise at a level that eats 2 to 6 px of the outline, giving a ragged, glowing film edge. Interior stays sharp.

**Cursor and turning.** The cursor heats the front locally (a small ember bloom follows it; the ripple texture can serve as the heat map). Turning speed raises flicker amplitude and pushes the front in the turn direction.

**Technique.** One composite pass. Noise is the cost: the paper-cinder write-up says per-pixel fbm costs 1.5 to 3 ms per pass and a baked tileable noise texture with the same look costs 0.3 to 0.6 ms. Use a baked noise texture, not the current `fbm`. No simulation. Phone risk: low with baked noise, medium with per-pixel fbm. Fallback: none extra.

**References.**
- Remotion film-burn: "procedural film-burn glow overlay with a radial blur blend", shader adapted from the MIT FilmBurn GL Transition by Anastasia Dunbar: https://remotion.dev/docs/transitions/presentations/film-burn
- Remotion light leaks: "animated WebGL2-based light leak overlay", seed and hueShift: https://www.remotion.dev/docs/light-leaks
- Paper-cinder transition (a ragged ember line, single WebGL pass, from the KIBORI timber-workshop page; its performance numbers above): https://www.ui-skills.com/skills/mengto/paper-cinder-transition
- Boris FX Light Leaks Dissolve, the editors' plug-in version: https://borisfx.com/documentation/continuum/bcc-light-leaks-dissolve/

**Honest weakness.** Fire can feel like a template if the palette is stock orange. Grade it to the site's palette, not generic ember. The best-sourced references here are transition components, not portfolio sites.

**Storyboard.**
1. Opening zoom: Showreel shrinks; cards fade in out of dark char with a thin warm edge glow.
2. Showreel dissolve: a ragged ember ring grows from the Showreel's centre, picture behind it gone, first Work visible behind.
3. Turning: top and bottom, cards burn out along a flickering horizontal line, flicker stronger with speed.
4. Hover: hovered card sharp with a faint warm halation at the rim; cursor leaves a small ember glow.

---

## 2. Halftone print

**Look.** The melt is a print breaking up. As `m` rises, the picture turns into a screen of dots: dots grow and merge in shadows, shrink in highlights, then vanish to paper. CMYK rotation (15, 75, 0, 45 degrees) gives rosettes and slight misregistration. At rest the picture is continuous.

**Jobs.**
- Top/bottom edges: dot size and cell size grow with `m`, dots shrink to zero, so the band reads as a printed gradient fading to paper.
- Depth: far cards go to coarse, small dots (a lower-res print).
- Dimmed: dot coverage falls (lighter ink), interior still recognisable.
- Appear in zoom: cards print in, dots swelling from nothing, colour channels registering one by one.
- Showreel dissolve: a ring where cell size sweeps: inside the ring dots shrink to zero, the ring itself is coarse dots. About 1.3 s.
- Organic edges: dots near the outline are sampled at cell centres, so the outline breaks into dots 2 to 6 px out. Because the dot radius follows luminance, the edge is not a mask but ink.

**Cursor and turning.** The cursor enlarges dot gain under it (ink spread), so the picture "inks up" where pointed. Turning speed rotates the screen angle slightly and offsets the colour plates (misregistration).

**Technique.** One pass. Per pixel: sample a cell centre per ink (4 grids, rotated) so 4 to 8 reads of mipmapped scene, a few `smoothstep`s, `fwidth` for anti-aliasing. Heckel notes the gooey/displaced variants need larger neighbour kernels and get expensive; skip those and use the plain 4-ink version. About 1 to 2 ms on a desktop, my guess. No simulation. Phone risk: low to medium. Moire needs care on 3x screens.

**References.**
- Maxime Heckel, "Shades of Halftone" (grid, luma radius, CMYK angles, `fwidth` anti-aliasing, moire, cost notes): https://blog.maximeheckel.com/posts/shades-of-halftone/
- Paper Design halftone shader components (Paper Shaders): https://21st.dev/@paper-design/components/halftone-dots.md
- Remotion `halftone()` effect: https://remotion.dev/docs/effects/halftone
- luma.gl Color Halftone pass: https://luma.gl/docs/api-reference/shadertools/shader-passes/color-halftone

**Honest weakness.** Halftone as a visual is very common on landing pages and is sometimes a bare "retro filter". It earns its place only as a state change (print breaking up), not a constant overlay. The dither look the owner ruled out is related, so check that dots don't read as dither.

**Storyboard.**
1. Opening zoom: Showreel shrinks; cards print in as coarse dots that tighten to continuous tone.
2. Showreel dissolve: a ring of big dots expands from the centre, the Showreel dissolving to paper behind it.
3. Turning: cards at top and bottom coarsen to dots and fade; colour plates slip with speed.
4. Hover: hovered card sharp, edge a thin ring of dots; ink swells under the cursor.

---

## 3. Long exposure / slit-scan trails

**Look.** Light drags. Cards leaving the visible band stretch into streaks along the turn direction, like a long exposure or Trumbull's stargate. The streaks fade to black and then to the page. Resting cards are crisp with a slight afterglow trail only when they move.

**Jobs.**
- Top/bottom edges: the picture is smeared in `y` more and more with `m` (a one-sided directional blur or feedback), until it's a streak and gone.
- Depth: far cards smear a little and darken, like cards further from the lens.
- Dimmed: faint trail and lower exposure.
- Appear in zoom: cards arrive as a streak that resolves into a frame, like an exposure completing.
- Showreel dissolve: a radial slit-scan: radial smear outward from the Showreel centre, growing with `melt`, picture drawn out into rays and gone. About 1.3 s.
- Organic edges: the trail buffer smears the outline in motion; at rest, edges would still be straight unless `edgeBand` adds a short soft blur plus noise-jittered trail. This candidate is the weakest at keeping rest-state edges non-rectangular.

**Cursor and turning.** Turning speed is the main driver: streak length scales with speed and direction. The cursor drags a short trail behind it (a mini feedback stamp).

**Technique.** Two ways. (a) Cheap: a directional blur in the composite, 12 to 16 taps along `y` with length from `m` and `speed`. No simulation. (b) Real: a feedback pass (ping-pong target, read last frame times decay, add current). WebGL forbids sampling a texture attached to the framebuffer being drawn into, so it needs two targets. Cost: one extra full-screen pass plus a target; phone risk medium (bandwidth). Start with (a).

**References.**
- Slit-scan history: Trumbull moved the slit outside the camera for the 2001 stargate, crediting John Whitney's origin: https://www.redsharknews.com/douglas-trumbull-and-how-slit-scan-changed-sfx
- CodePen: Three.js slit-scan with read/write ping-pong render targets: https://codepen.io/Tristan-Schulze/pen/OPyGNMg
- Codrops motion trail on WebGL framebuffers (feedback pattern; text, not video): see the `gnikoloff/text-trail-effect` repo https://relatedrepos.com/gh/gnikoloff/text-trail-effect (summary page; the Codrops article itself was not opened)

**Honest weakness.** I found no good portfolio-site precedent with video cards; the references show the technique, not this use. The directional blur is cheap but reads as "motion blur" and risks looking like a stock effect. The edge requirement is its weak spot.

**Storyboard.**
1. Opening zoom: cards streak in along the zoom axis, then resolve into frames.
2. Showreel dissolve: radial rays pull the picture outward from the centre until the first Work shows.
3. Turning: cards at top and bottom stretch into long vertical streaks; stronger and longer with speed.
4. Hover: hovered card crisp, short afterglow where it moved; cursor drags a thin light trail.

---

## 4. Rack focus (lens bokeh)

**Look.** The Helix is a lens. The front band is in focus. Cards away from it defocus into soft discs: highlights bloom into bokeh, and the picture dissolves into out-of-focus light before it fades. Edges become round blur, never a crisp rectangle.

**Jobs.**
- Top/bottom edges: circle of confusion grows with `m`, discs fade to gone.
- Depth: `deep` drives defocus directly; this is the most literal depth treatment here.
- Dimmed: a gentle defocus on unpointed cards (a rack-focus pull when the pointer chooses a card).
- Appear in zoom: cards pull into focus out of discs.
- Showreel dissolve: a focus ring: defocus sweeps out from the centre, the Showreel becoming bokeh, then fading. About 1.3 s.
- Organic edges: defocus rounds the outline by a few pixels; `edgeBand` can apply a small CoC to the border only, interior sharp.

**Cursor and turning.** The cursor sets the focus point (pointed card sharp, others defocus; a card-level rack focus). Turning speed adds motion-blur-like defocus along `y`.

**Technique.** Gather bokeh. The single-pass gather method uses a golden-angle spiral of samples per pixel; the article's sample code implies a few hundred samples at max radius 20 (that figure is my estimate from the article), and its real version uses two passes at quarter resolution with CoC in alpha. For a phone, use 16 to 32 taps at half resolution on the mipmapped scene and accept grainy discs. About 2 to 4 ms on a desktop, my guess. Phone risk: high unless half-res. Fallback: none extra.

**References.**
- Dennis Gustafsson, "Bokeh depth of field in a single pass" (scatter-as-gather, golden-angle spiral, CoC): https://blog.voxagon.se/2018/05/04/bokeh-depth-of-field-in-single-pass.html
- Blender Workbench DOF commit crediting that post: https://developer.blender.org/rB3f6e14e667c
- Sousa, Crytek CryENGINE 3 Graphics Gems (gather DOF; named by the UE4 gather-DOF patch): https://www.adriancourreges.com/img/blog/2018/ue4-postfx/ue4patch/gatherdof/GatherDOF_UE4.21.patch

**Honest weakness.** Closest in feel to the liquid glass being replaced (both blur). The owner may call it "glass again". The cost is the highest. Strong for a video editor's eye, but I found no portfolio site showing it with video cards.

**Storyboard.**
1. Opening zoom: cards swim in as soft discs and sharpen.
2. Showreel dissolve: focus ring sweeps out; Showreel turns to bokeh and fades.
3. Turning: cards entering and leaving the band defocus to discs, strongest at the edges.
4. Hover: pointed card snaps into focus; neighbours soften.

---

## 5. Datamosh

**Look.** The melt is a codec failure. Blocks lock and smear their pixels across the frame as if the keyframe was lost, each block recovering on its own schedule. Cards break into drifting macroblocks.

**Jobs.**
- Top/bottom edges: block corruption probability rises with `m`; blocks drift away and are replaced with page colour.
- Depth: far cards are corrupted and drift more.
- Dimmed: low corruption plus a colour-sapped smear.
- Appear in zoom: cards assemble from stuck blocks.
- Showreel dissolve: corruption spreads as a ring; smeared blocks fall away. About 1.3 s.
- Organic edges: the outline breaks into jittered block steps. These are rectangles, so it is organic only if blocks are small and irregular. Weakest on "no rectangle" in spirit.

**Cursor and turning.** The cursor bursts corruption in a radius (blocks re-roll near it). Turning speed sets the drift amount and direction (the motion field).

**Technique.** Needs a simulation: a ping-pong feedback target holding the "held frame" per block, plus a motion/velocity input. Codrops' Three.js datamosh builds this feedback loop and notes its motion texture is screen-space velocity, not real codec vectors. The shaders.com DataMosh component exposes `blockSize` (48), `intensity`, `drift`, `churn`. Cost: one extra pass plus target; phone risk medium. May need float or half-float targets for the held positions.

**References.**
- Codrops, "Breaking the Frame: Building a Real-Time Datamosh Effect with Three.js" (2026-09-02): https://tympanus.net/codrops/2026/09/02/breaking-the-frame-building-a-real-time-datamosh-effect-with-three-js/ (the page returned 403 to me; the summary above comes from a search result snippet, so unverified)
- shaders.com DataMosh component (props, behaviour): https://shaders.com/docs/components/datamosh
- Datamosher Pro (tool lineage): https://git.terata.org/eessppeelllloo/Datamosher-Pro

**Honest weakness.** Datamosh is a video-editor in-joke that fits Taha well, but it is at its peak of fashion, it dissolves badly, and it is the most likely of these to read as "glitch template" and to look broken on a real client portfolio.

**Storyboard.**
1. Opening zoom: cards snap in as stuck blocks that settle to clean frames.
2. Showreel dissolve: a ring of corrupted blocks spreads out; blocks slide off.
3. Turning: blocks at the top and bottom smear in the turn direction, drifting off.
4. Hover: hovered card clean; a few blocks near the cursor stutter.

---

## 6. Analogue signal

**Look.** The melt is a signal failing: horizontal line jitter, chroma bleed, a rolling tracking band, ringing and tape noise. Cards lose sync at the edges and roll out.

**Jobs.**
- Top/bottom edges: per-line jitter and tracking tear grow with `m`; at high `m` the line rolls off and drops to noise then black.
- Depth: far cards have chroma bleed and desaturation.
- Dimmed: lowered luma and signal softness.
- Appear in zoom: cards lock in sync, from rolling noise.
- Showreel dissolve: a tracking band sweeps across (not a ring, unless the band is radial); picture drops out line by line.
- Organic edges: line jitter shifts the outline per scanline, so the vertical edges wobble. Horizontal edges stay straight; needs `edgeBand` vertical noise too.

**Cursor and turning.** Turning speed raises jitter and head-switching noise (a natural mapping). The cursor adds a local tracking bump.

**Technique.** One pass, cheap: a few offset taps per channel, a hash per scanline. About 0.5 to 1 ms. No simulation. Phone risk: low. Fallback: none extra.

**References.**
- Godot "VHS CRT Broadcast": chroma shift, horizontal smear, per-line jitter, tracking lines, roll bar: https://godotshaders.com/shader/vhs-crt-broadcast/
- ReShade VHS thread, which credits Shadertoy shaders `ldjGzV` (VCR distortion), `4dBGzK`, `ldXGRf` (NTSC): https://www.reshade.me/forum/shader-presentation/1258-vhs-shader (I could not open the Shadertoy pages, 403)

**Honest weakness.** The most overused look here. It reads as "retro" more than as the owner's craft, and the Showreel dissolve is weak. Cheapest by far, so it is the safe fallback choice.

**Storyboard.**
1. Opening zoom: cards lock in from rolling noise, with chroma smear settling.
2. Showreel dissolve: a tracking band sweeps; the picture drops out line by line.
3. Turning: top and bottom lines jitter and tear, harder with speed.
4. Hover: hovered card in sync; a small tracking wobble at the cursor.

---

## 7. Torn paper / ember-free paper cut

**Look.** The cards are cut or torn paper. The melt peels the picture away along a fibrous, deckled edge, leaving a white fibre rim, then bare paper. Cards read as prints on a paper stock.

**Jobs.**
- Top/bottom edges: a noisy tear line at the band, with a pale fibre rim on the remaining side.
- Depth: far cards gain paper grain and get paler, like faded prints.
- Dimmed: the print is toned down, with paper showing through.
- Appear in zoom: cards are revealed by peeling the tear line back.
- Showreel dissolve: an irregular torn ring opens from the centre; the Showreel curls off. About 1.3 s.
- Organic edges: every outline gets a thin deckle edge from baked noise: the strongest "never a clean rectangle" answer, and the most literal.

**Cursor and turning.** The cursor lifts a paper curl or rips the edge near it (small displacement). Turning speed sets the tear-line wobble.

**Technique.** One pass: noise-threshold mask plus a fibre rim; bake the noise (see cost note in candidate 1). About 0.5 to 1 ms. No simulation. Phone risk: low.

**References.**
- freefrontend, "Tearing paper photo gallery": noise map sets a ragged white edge, threshold cuts pixels: https://freefrontend.com/code/tearing-paper-photo-gallery-2026-01-28/
- Paper-cinder transition (baked noise, ragged front): https://www.ui-skills.com/skills/mengto/paper-cinder-transition
- Remotion `roughen-edges` effect: https://www.remotion.dev/docs/effects/roughen-edges

**Honest weakness.** The weakest craft lineage for motion work. It is a still-image idea, and I found no real portfolio precedent with video cards. Best treated as an edge treatment that could be combined with another material (for example under the film burn), not a stand-alone choice.

**Storyboard.**
1. Opening zoom: cards are revealed by a tear line sliding back.
2. Showreel dissolve: a torn hole opens from the centre; the fibre rim glows white.
3. Turning: cards at the top and bottom are torn away along a wobbling line.
4. Hover: hovered card has a thin deckle outline; the cursor lifts the edge.

---

## Comparison

| Material | Dissolve fit | Organic edge | Turning speed | Sim needed | Phone risk |
|---|---|---|---|---|---|
| Film burn | strong | strong | flicker, push | no | low (baked noise) |
| Halftone | strong | strong | plate slip | no | low-medium |
| Long exposure | weak | weak at rest | strong | optional | medium |
| Rack focus | medium | medium | medium | no | high |
| Datamosh | weak | weak | medium | yes | medium |
| Analogue signal | medium | medium | strong | no | low |
| Torn paper | strong | strongest | weak | no | low |

A cheap hybrid worth drawing: film burn for the dissolve, plus halftone or deckle only on the edge band for #63.

## What I couldn't verify

- No candidate was run. Every millisecond figure and phone-risk rating is my estimate.
- The Codrops datamosh article (403), Shadertoy pages (403) and the GL Transitions page (empty) did not load; their details are from search snippets or secondary pages, as marked.
- I found no portfolio site that uses any of these on video cards. References are demos, components, tutorials and film/print history. The owner should treat "done well" as "done well as a technique".
- How `gl.ts` creates targets, and whether float or half-float targets are available on target phones, was not checked.
- Whether the edge band can be written in the card pass (needs a falloff outside the card quad) was not checked against `renderer.ts`.
- Licences: Remotion's film burn credits an MIT GL Transition; the licences of the other components were not checked. Read source only for ideas unless licences are confirmed.
