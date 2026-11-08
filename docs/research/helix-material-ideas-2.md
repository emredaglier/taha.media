# Helix material ideas, round 2

Researched 2026-11-09 for taha.media. Round 1 is `helix-material-ideas.md`. Excluded as already covered: liquid glass, drip, fluid smear, liquefy, film burn, halftone, long exposure/slit-scan, rack focus, datamosh, analogue/VHS, torn paper, dither.

## How to read the evidence

- Awwwards "element" pages (awwwards.com/inspiration/...) confirm that a studio shipped an effect of that kind, with its tags. They carry **no description and no award status**; I did not verify any Site of the Day for these pages. Where I say "award-recognised" I mean "listed on Awwwards", nothing more.
- Codrops (tympanus.net) returned HTTP 403 to every fetch. Codrops facts below come from search-result summaries only, so they are second-hand. Treat them as pointers.
- GLSL approaches, costs, phone risk and slider ranges are my own design estimates. Nothing was run or measured.
- Precedent is for the look, not for the five jobs. No precedent covers all five jobs as one material, so every "how it does the jobs" paragraph is design reasoning.

Conventions in the GLSL notes: `m = meltOf(uv)`, `c = sceneAt(uv, lod)`, `uSim` is the cursor texture (read as `s`), `uSpeed` the turning speed, `reelAt`/`uMelt`/`uReelCenter` the Showreel. "Edge band" means the few pixels around a card outline where `m` is nudged up by a noise or cell value, so no outline stays a clean rectangle. The edge band needs a few extra taps of the card alpha or a distance falloff, the same trick as round 1.

## Short answer: top 5 for this owner

1. **Glyph mosaic from Taha's own type (#1).** The strongest precedent set on the list: Studio Freight built a custom WebGL ASCII tool for its Dragonfly site, Unseen Studio ships an "ASCII liquid sim" on its 2025 page, and Artefakt runs ASCII post-processing with mouse interaction. Using Taha's own wordmark glyphs instead of a monospace set makes it his, not a template. Cells that drop out give a ragged outline for free.
2. **Grain disintegration (#3).** Picture breaks into drifting grains that leave the card. Gone is literal, the outline is organic by construction, speed pushes grains. Precedent: Unseen Studio's particle slider for Cosmos, Codrops' dissolve tutorial. Cheaper than it looks if grains are faked in the composite rather than simulated.
3. **Ink development (#6).** Picture develops out of, or bleeds back into, wet ink fed by the cursor texture. Soft organic edges, the cursor is the brush. It also suits a motion/graphic designer: the card "develops" like a print. Precedent is thinner (an Awwwards "Ink Effect" hero, Sweetpunk's cursor reveal).
4. **Staggered pixel mosaic (#2).** The most precedented on the list for portfolios (Synthetic Theatre, TELETECH by NaughtyDuk, Ploteum), the cheapest, and the best on a phone. Its edges are stepped, not soft, so it needs the noisy edge band, and it is the most "seen it" of the five.
5. **Voronoi shards (#4).** Crafted, rarer. The picture cracks into cells that drop and fade by cell, so the outline is jagged, never rectangular. Precedent: Uprising's "Shattered Glass Effect". Risk: it reads as glass, close to the excluded liquid glass if the shards are refractive. Keep them opaque and matte.

Reads as a template, said plainly: gradient map/duotone (#10 below, only as a grade) and tile flip (#9). Dropped after checking: see the end of the candidates.

---

## 1. Glyph mosaic (Taha's own type)

**Look.** As `m` rises the picture turns into a grid of letters. Each cell shows one glyph from a small atlas of Taha's own letterforms (wordmark, initials, a few shapes), picked by the cell's luminance and tinted by its colour. At rest the picture is continuous. Gone means the glyphs shrink and vanish, not the picture fading.

**Precedent.**
- Studio Freight, Dragonfly: wrote "a custom tool using WebGL shaders" for ASCII renders; the open-source generator Aniso pixelates the input (glb, jpg or mp4), converts to grayscale and maps each value to a character; the site renders sections to textures in one canvas. https://www.awwwards.com/case-study-dragonfly-by-studio-freight.html (no award stated on the page).
- Unseen Studio, "Ascii Liquid Sim Effect", 2025 Wrapped site (tags WebGL, typography, interactive): https://www.awwwards.com/inspiration/ascii-liquid-sim-effect-unseen-studio-2025-wrapped
- Artefakt (Greg Lallé), ASCII post-processing over particles with mouse interaction: https://www.awwwards.com/inspiration/ascii-post-processing-over-particles-mouse-interaction-artefakt
- Codrops, "Creating an ASCII Shader Using OGL" (search summary only: two shaders, one makes a texture, one maps each pixel to a character): https://tympanus.net/codrops/?p=82209
- Codrops' tag pages also list a shape-aware ASCII renderer (title only, not opened).

**The five jobs and the outline.**
- Edges: cell size and glyph threshold rise with `m`; cells whose luma-vs-threshold test fails go empty, so the band erodes into letters, then paper.
- Far cards: coarser grid, fewer glyph levels.
- Not pointed at: a dim, tracked-out version (glyph weight lowered), image still readable.
- Zoom appearance: glyph cells resolve into pixels, grid fine to continuous, in a noise-staggered order.
- Showreel: a ring of coarse glyphs sweeps out from `uReelCenter`; behind it empty, inside it the picture.
- Outline: cells at the card boundary are drawn only if the cell centre is inside the card, plus a hash-jitter on the cell, so the outline is a row of letters, never a line.

**Drive.** Cursor: `uSim` locally shrinks the grid (pointer "focuses" the picture back). Turning: `uSpeed` slides glyph rows horizontally and adds a flicker to the atlas index.

**GLSL (one pass, no simulation).** Snap `uv` to a cell grid sized by `m`. Read `sceneAt(cellCentre, lod)` with a high lod so one tap gives the cell colour; take luminance, add a hash(cell) offset, index into a glyph atlas texture and sample it with the in-cell coordinate. Final colour = mix(c at pixel, glyph*cellColour, smoothstep(a, b, m)). Cell size = mix(1px, 16px, m). For the Showreel, replace `m` with `max(m, ring(reelAt))`. Glyph mask uses `fwidth` for anti-aliasing.

**Phone cost/risk.** Low to medium: about 2 taps plus 1 atlas tap per pixel. Risk: an atlas texture to ship and a text-heavy look that fights the image if the grid shows at rest. Also moire at 3x screens.

**Sliders.** `cellMax` 6–24 px; `glyphLevels` 2–8; `stagger` 0–1; `jitter` 0–1.

---

## 2. Staggered pixel mosaic

**Look.** The picture breaks into square blocks. Each block changes its own size/blur and disappears at a time set by noise, so the melt arrives as scattered blocks, not a smooth wipe. Hovered cards show a few blocks reacting to the cursor.

**Precedent.**
- Synthetic Theatre (Daniele Buffa), "Pixelated Effect On Mouse Hover", with a related pixelated page transition and loading transition on the same site: https://www.awwwards.com/inspiration/pixelated-effect-on-mouse-hover-synthetic-theatre
- NaughtyDuk for TELETECH, "Pixelated Transition" (tags pixelated, page transition): https://www.awwwards.com/inspiration/pixelated-transition-teletech
- Ploteum (Spasoje Perovic), "Pixel particles displacement" (tags atkinson dithering, 8bit, particles, displacement): https://www.awwwards.com/inspiration/pixel-particles-displacement-ploteum. Note the dither tag: overlap with the excluded dither look.
- Codrops 2020 "Interactive WebGL Hover Effects" (search summary: randomized pixelation around the cursor): https://tympanus.net/codrops/2020/04/14/interactive-webgl-hover-effects/

**Jobs and outline.**
- Edges: block size grows with `m`; each block has a threshold hash, and blocks with hash < `m` drop out.
- Far: blocks bigger, picture mipmapped to block colour.
- Not pointed at: a few blocks dropped and block size up slightly, so the card looks lightly mosaiced.
- Zoom: blocks appear in hash order, large to small.
- Showreel: the ring is where blocks flip; threshold = distance from `uReelCenter` plus hash.
- Outline: block drop-out at the edge band gives a stair-stepped, ragged outline. Honest limit: stepped, not smooth.

**Drive.** Cursor: `uSim` shrinks blocks to the picture under the pointer (magnetic pixel push: add a displacement of the block centre toward the pointer). Turning: block hash is advanced by `uSpeed`, so blocks shimmer when turning.

**GLSL (one pass).** `cell = floor(uv*grid(m))`; colour from `sceneAt(cellCentre, lod)`; `h = hash(cell)`; alpha = step(m, h) smoothed with a half-cell fade; mix pixel-exact `c` with block colour by `smoothstep(0, .5, m)`. The magnetic push is `cellCentre += normalize(p - cellCentre) * s * k` with `s` from `uSim`.

**Phone cost/risk.** Lowest on the list: 1–2 taps. Risk: the most seen look; keep a variable cell size so it is not a retro filter.

**Sliders.** `blockMin` 2–8 px; `blockMax` 12–64 px; `stagger` 0–1; `magnet` 0–1.

---

## 3. Grain disintegration (dust)

**Look.** The picture comes apart into grains that peel off along a noisy front and drift on a flow field, thinning to nothing. The front is bright edge-lit grain, behind it dust, ahead of it the intact picture.

**Precedent.**
- Unseen Studio for Cosmos, "WebGL Particle Image Slider" (tags image slider, WebGL, globe, particles): https://www.awwwards.com/inspiration/webgl-particle-image-slider-cosmos
- Codrops, "Implementing a Dissolve Effect with Shaders and Particles in Three.js" (Feb 2025; search summary: fragment shader discards pixels below a noise-vs-progress threshold, a particle system takes over the edge; 3D mesh, not image): https://tympanus.net/codrops/2025/02/17/implementing-a-dissolve-effect-with-shaders-and-particles-in-three-js/
- Codrops, UntilLabs homepage particle system built from a photograph (search summary only): https://tympanus.net/codrops/2025/12/10/simulating-life-in-the-browser-creating-a-living-particle-system-for-the-untillabs-website/
- A freefrontend Voronoi particle transition: its description warns that vertex count equals image resolution and it is not for high-res mobile. That cost belongs to the real particle version; my approach below avoids it.

**Jobs and outline.**
- Edges: threshold front sweeps with `m`; grains beyond it are offset along the flow and faded.
- Far: sparse dust over a darkened card.
- Not pointed at: a thin layer of drifting grain, picture mostly intact.
- Zoom: grains return to their places (the reverse).
- Showreel: ring front from `uReelCenter`; grains stream outward and away.
- Outline: the front is noise, and the edge band feeds the same noise, so the card border frays into grains.

**Drive.** Cursor: `uSim` pushes grains away from the pointer. Turning: `uSpeed` sets flow direction and strength (dust blows along the turn).

**GLSL (one pass, fake grains; real particles need a separate vertex pass).** Per pixel, sample a flow offset `o = flow(uv, time)*m`; fetch `c = sceneAt(uv + o*dir, lod)` so the picture is dragged, then multiply by a grain mask `step(n(uv*grainScale), 1 - m)` with a bright rim where `n` is within a small band of the threshold. Add `uSim` into `o`. This gives dust-like erosion; it does not give true separate flying particles.

**Phone cost/risk.** Low (fake) to high (real particles; avoid). Risk: reads as "dissolve shader" if the grain is too fine and uniform; tune grain size and add the rim.

**Sliders.** `grainSize` 1–6 px; `drift` 0–120 px; `rimWidth` 0–0.15; `windFromSpeed` 0–2.

---

## 4. Voronoi shards

**Look.** The picture is cracked into irregular cells. As `m` rises, cells shift, tilt a little (lit shades per cell), lose opacity one by one and fall away. Matte, not refractive.

**Precedent.**
- Uprising, "Shattered Glass Effect" (tags webgl, animation, 3d, glsl, portfolio, transition, shader), weareuprising.com: https://www.awwwards.com/inspiration/shattered-glass-effect
- Codrops, "Exploding 3D Objects with Three.js" (2019; search summary: Voronoi diagrams fracture meshes): https://tympanus.net/codrops/2019/03/26/exploding-3d-objects-with-three-js/

**Jobs and outline.**
- Edges: cells drop out in order of `m + hash(cell)*k`.
- Far: fewer, larger cells, darker.
- Not pointed at: hairline cracks only, no drop.
- Zoom: cells fly back and lock, small to big.
- Showreel: crack ring spreads from `uReelCenter`, cells fall outward.
- Outline: the boundary is clipped by the Voronoi cell edges, a jagged polygon edge; an organic-ish shape, but angular, not soft.

**Drive.** Cursor: `uSim` sets the crack origin (cells near the pointer go first). Turning: shard fall direction follows `uSpeed`.

**GLSL (one pass).** Compute the nearest and second-nearest feature point on a jittered grid (3x3 neighbours, 9 hash lookups, no texture); crack line = difference of the two distances. Cell id gives a per-cell offset and a drop time. Fetch `sceneAt(uv - cellOffset(m), lod)`, multiply by a per-cell fade, darken along crack lines. The cell offset is a pure function of the id, so no state.

**Phone cost/risk.** Medium: 9 hash evaluations per pixel plus 1 tap. Risk: close to glass; no refraction or specular, or it is liquid glass again.

**Sliders.** `cellCount` 6–40; `crack` 0–1; `fall` 0–200 px; `tilt` 0–1.

---

## 5. Paper curl / fold

**Look.** The card peels like paper. Its far edge lifts, curls over a cylinder and shows a pale underside with a soft fake shadow. Gone means curled off.

**Precedent.**
- OSMOS, "Paper Curl WebGL Interaction" for the Hearst Exhibit 2026 site (tags webgl, paper, curl), hollywoodexhibit2026.com: https://www.awwwards.com/inspiration/paper-curl-webgl-transition-elle-and-esquire-exhibit-2026
- Codrops, a Nov 2025 portfolio article describing a WebGL fold effect (projects vertices onto a direction, curvature-based fake shadow; search summary only): https://tympanus.net/codrops/2025/11/27/letting-the-creative-process-shape-a-webgl-portfolio/

**Jobs and outline.**
- Edges: the fold line moves with `m`; the picture beyond the line is the curled-over underside, then absent.
- Far: slight curl of the corners, darker.
- Not pointed at: a small lift at one corner plus shadow.
- Zoom: card unrolls into place.
- Showreel: a roll that peels from `uReelCenter` outward.
- Outline: a curl cylinder bends the outline into a curve, but a curl alone leaves the card rectangular on the unlifted part. It needs a noisy fold line or a torn-looking underside. This is its weak point and close to the excluded torn paper.

**Drive.** Cursor: `uSim` sets the curl corner. Turning: `uSpeed` rolls the curl in the turn direction.

**GLSL (one pass, no simulation).** Treat the fold as a function of `d = dot(uv - p, dir)`: for `d < r` sample the picture mapped over a cylinder (`uv' = uv + dir*(pi*r - ...)`), for the curled part sample the back, tinted and shaded by the cylinder normal; shadow from `smoothstep` of `d`. `p` comes from `m`, `dir` from `uSim` or `uSpeed`. Add noise to `d` for a ragged fold.

**Phone cost/risk.** Low to medium. Risk: needs care to avoid a template page-curl look; I would rank it below the first five for this brief.

**Sliders.** `curlRadius` 10–120 px; `foldNoise` 0–1; `shadow` 0–1; `undersideTint` 0–1.

---

## 6. Ink development

**Look.** The picture is held in wet ink. At rest it is clear. As `m` rises, an organic ink stain (soft, feathered edges, tendrils along fibres) spreads over it and the picture goes to black or paper; it develops back the same way. Cursor drops ink or wipes it.

**Precedent.**
- Johanna Arrieta, "Ink Effect" hero (tags hero, shader, webgl, effect, ink): https://www.awwwards.com/inspiration/ink-effect-johanna-arrieta
- Sweetpunk, "Cursor image reveal effect" (tags cursor, effect, WebGL; content unseen): https://www.awwwards.com/inspiration/sweetpunk-cursor-effect
- 21st.dev "Ink Reveal" (a component, not a studio site; per search summary: WebGL ink dissolve from the cursor): https://21st.dev/@ryanonline1234/components/ink-reveal.md

**Jobs and outline.**
- Edges: ink front advances from the edge with `m`.
- Far: faint ink wash over the card.
- Not pointed at: an ink veil that lifts where the pointer is.
- Zoom: the card develops out of black.
- Showreel: ink blooms outward from `uReelCenter` over ~1.3 s.
- Outline: ink fronts are noise-thresholded and feathered, so the border is organic; the edge band feeds the same field.

**Drive.** Cursor: `uSim` is already the right input; reading it as ink density is natural. Turning: `uSpeed` stretches the noise along the turn.

**GLSL (one pass, uses the existing sim).** Build `ink = fbm(uv*scale + flow) + s*gain + edgeBand`; threshold `smoothstep(1-m-w, 1-m+w, ink)` for the stain mask; colour = mix(c, inkColour, mask), plus a darker wick line at the front. Use a baked noise texture (round 1 estimates fbm per pixel at 1.5–3 ms; baked is cheaper). A true diffusion (reaction-diffusion) would need a feedback pass, which I do not recommend.

**Phone cost/risk.** Low with baked noise. Risk: a stock "ink reveal" look. Use Taha's palette and avoid pure black.

**Sliders.** `inkScale` 1–8; `feather` 0.02–0.3; `wick` 0–1; `cursorInk` 0–2.

---

## 7. Smoke mask

**Look.** The picture dissolves into smoke: soft, billowing plumes in the card's own colours, rising and shearing. Outline blurs into plumes.

**Precedent.**
- Awwwards "Smoke effect transition" (tags transition, mask, blurry, smoke effect, typography; linked resource cargothefilm2017.com; studio not named): https://www.awwwards.com/inspiration/smoke-effect-transition
- Awwwards "Smoke Effects Distortion on Scrolling" (WebGL, GLSL, smoke, distortion): https://www.awwwards.com/inspiration/smoke-effects-distortion-on-scrolling
- "Beyond the Fold - Smoke transition": https://www.awwwards.com/inspiration/beyond-the-fold-smoke-transition
- TOOSOON, cursor smoke distortion on a PANAMÆRA project: https://www.awwwards.com/inspiration/cursor-with-smoke-effect-distortion

**Jobs and outline.** Same as ink in structure, but the look is blur plus advected distortion, not a hard stain.
- Edges, far, not pointed: smoke density rises with `m`.
- Zoom: smoke clears.
- Showreel: a plume ring from `uReelCenter`.
- Outline: soft and organic by nature.

**Drive.** Cursor: `uSim` as a disturbance. Turning: `uSpeed` shears plumes.

**GLSL.** Distort the lookup with two octaves of scrolling noise scaled by `m`, sample `sceneAt(uv + warp, lod + m*3)` for the blur, multiply by a noise-thresholded density. A single pass; no simulation.

**Phone cost/risk.** Low to medium. Risk: close to the excluded fluid smear/liquefy and to ink (#6). Pick one of the two. I rank ink higher because the cursor texture suits it.

**Sliders.** `plumeScale` 0.5–4; `warp` 0–0.2; `blurLod` 0–4; `rise` 0–1.

---

## 8. Specular light sweep (flashlight)

**Look.** The card is in the dark and lit by a moving light. A highlight band crosses the picture, and the light follows the cursor; where unlit the card is dim and cool. Gone means unlit and black.

**Precedent.** Build in Amsterdam for Moooi, "Moooi Paper Play", flashlight cursor interaction (tags WebGL, reactive cursor, cursor interaction): https://www.awwwards.com/inspiration/moooi-paper-play-webgl-cursor-interaction (live site https://moooi.com/paper-play). Also Awwwards lists a mouse pointer spotlight element (https://www.awwwards.com/inspiration/mouse-pointer-spotlight), tags only.

**Jobs and outline.**
- Edges, far, not pointed at: light level from `1 - m`; unlit cards go to near black with a rim glint.
- Zoom: light sweeps across as each card appears.
- Showreel: a light ring contracts or expands from `uReelCenter`, extinguishing the picture.
- Outline: lighting alone leaves a clean rectangle. It needs a noisy edge band or a mask on the light, so it is not a standalone material. Best as a layer over another candidate.

**Drive.** Cursor: `uSim` sets the light centre. Turning: `uSpeed` skews the highlight band.

**GLSL.** `light = smoothstep(r, 0, distance(uv, lightPos))` plus a band `smoothstep` along a swept direction; colour = c * mix(ambient, 1, light) + specular term from a noise normal. One pass, one tap.

**Phone cost/risk.** Lowest. Risk: the weakest dissolve and outline of all, so use as a complement only.

**Sliders.** `lightRadius` 0.1–0.8; `ambient` 0–0.4; `bandWidth` 0.02–0.3; `specular` 0–1.

---

## 9. Tile flip (split-flap)

**Look.** The card is cut into a grid of tiles; each tile flips edge-on at its own time and shows nothing or a dark back. Reads like a departures board.

**Precedent (weak).** Awwwards "Tile transition effect" (PracticalVR; tags dot navigation, transition, scroll, webgl, effect): https://www.awwwards.com/inspiration/tile-transition-effect. A WebGL "World Flip" by Unseen Studio appears on the Awwwards WebGL collection page by title only (https://www.awwwards.com/awwwards/collections/webgl/); I did not open it and do not know its mechanics. I found no true split-flap precedent.

**Jobs and outline.** Same hash-staggered logic as #2 but with a tile squeezed in x by `cos(angle)`.
- Outline: tiles squeeze to lines, so the border is a comb of tiles, not organic. Weak on the brief.

**Drive.** Cursor: `uSim` flips tiles near the pointer. Turning: `uSpeed` biases flip direction.

**GLSL.** Per tile, `angle = clamp((m - hash)*k, 0, pi)`; map in-tile x by `(x-0.5)/cos(angle)+0.5`, discard outside [0,1], darken as `cos` falls, back face after pi/2. One pass.

**Phone cost/risk.** Low. Risk: a template look, closest to #2. I do not recommend it over #2.

**Sliders.** `tiles` 4–48; `flipSpan` 0.1–1; `shade` 0–1; `jitter` 0–1.

---

## 10. Gradient map (duotone posterize)

**Look.** As `m` rises, the picture maps to a short colour ramp (shadows to one ink, highlights to another), then posterizes to 3–4 bands that shrink to the palette's lightest colour.

**Precedent (weak).** Awwwards' gradients article names duotone gradients over photos as a trend popularised by Spotify's campaigns (https://www.awwwards.com/gradients-in-web-design-elements.html). That is a 2D grading trend, not a WebGL image-dissolve precedent. I found no studio site using it as a melt.

**Role.** A good colour layer to combine with any other candidate, a poor melt alone: it does not remove pixels, so edges stay rectangular. It reads as a template when it is the whole material.

**GLSL.** `l = luma(c)`; `ramp = texture(uRamp, vec2(floor(l*bands)/bands, .5))`; `out = mix(c, ramp, smoothstep(0,.6,m))`; fade to the lightest ramp stop at `m→1`. One tap plus a ramp tap.

**Phone cost/risk.** Lowest. Risk: template. **Sliders.** `bands` 2–8; `rampMix` 0–1; `lift` 0–0.5; `paperTone` 0–1.

---

## 11. Cloth wave

**Look.** The card behaves like fabric: a travelling wave ripples through it, with lit crests and darker troughs, growing until the cloth lifts away.

**Precedent.** Awwwards "WebGL Cloth Effect on Transition" (tags transition, cloth, distortion, webgl, shaders, brutalism; credited to the Awwwards account; the page links to 2017.venicebiennale.hk but does not state that the effect is from it): https://www.awwwards.com/inspiration/webgl-cloth-effect-on-transition

**Jobs and outline.** Edges: wave amplitude rises with `m`. The outline waves, but a pure displacement of a rectangle stays a smooth rectangle-ish shape. It needs the edge band for tearing or fraying. Close to the excluded liquid glass and fluid smear when the amplitude is high.

**GLSL.** `uv' = uv + n * amp(m) * sin(dot(uv, dir)*freq + t)`; shade by the derivative of the displacement as a fake normal; fade at the largest amplitude. One pass.

**Phone cost/risk.** Low. Risk: overlaps excluded warps. **Sliders.** `amp` 0–60 px; `freq` 1–12; `shade` 0–1; `speedGain` 0–2.

---

## Stencilled typography (considered, not a full candidate)

Image visible only inside letterforms (stencil, text mask). Precedents are listed on Awwwards: RedCollar Font by Red Collar (https://www.awwwards.com/inspiration/typography-webgl-interaction-redcollar-font), "Big image with text reveal on scroll" (https://www.awwwards.com/inspiration/big-image-with-text-reveal-on-scroll-mediterranean-dream), "Typography With 3D Folding Effect" (https://www.awwwards.com/inspiration/typography-with-3d-folding-effect). These are all scroll or hero reveals, not per-card melts. The clean letter outline conflicts with "no clean rectangles" unless letters are a dissolve target. Use the idea inside #1 (glyphs from Taha's type) rather than separately.

## Dropped after checking

- **Pixel sorting.** I found no site that ships it on images. Search results were tools (Pixelizer, Godot, a WGSL shader that fills each run with the ramp a sort would produce, "pseudo" sorting) and an EPIC Agency write-up saying the We Cargo glitch transition is similar to GPU pixel sorting (https://medium.com/epicagency/behind-the-scenes-of-we-cargo-3999f5f559c, title and summary only). A real sort needs many passes. The pseudo version streaks pixels along lines, which round 1's slit-scan covers and which reads as datamosh. Dropped.
- **Refraction through a lens or prism.** Nothing found beyond optics papers; close to excluded liquid glass. Dropped.
- **CRT phosphor.** Overlaps the excluded analogue/VHS. Dropped.
- **Infinite-mirror feedback.** Needs a feedback pass, overlaps long exposure, and I found no precedent. Dropped.
- **Magnetic pixel push.** Folded into #2 as the cursor drive.
- **Immersive Garden.** Its Red Bull case study (Awwwards) describes a shader stretching image pixels across columns with a gradient and Perlin noise for a speed effect (https://www.awwwards.com/case-study-immersive-garden-havas-win-sotm-nov-with-the-new-mobile-workforce.html). That is a streak, so it belongs to the excluded slit-scan.

## Comparison

Cost and phone risk are estimates. "Outline" is how organic the card border gets with the edge band.

| # | Candidate | Passes | Phone cost | Outline | Dissolve strength | Precedent strength | Template risk |
|---|---|---|---|---|---|---|---|
| 1 | Glyph mosaic (own type) | 1 + atlas | Low–med | Strong, ragged | Strong | Strong (Studio Freight, Unseen, Artefakt) | Low if own glyphs |
| 2 | Staggered pixel mosaic | 1 | Lowest | Stepped | Strong | Strong (Synthetic Theatre, NaughtyDuk, Ploteum) | Medium |
| 3 | Grain disintegration | 1 (fake) | Low | Strong | Strong | Medium (Unseen, Codrops) | Medium |
| 4 | Voronoi shards | 1 | Medium | Jagged | Strong | Medium (Uprising) | Medium, near glass |
| 5 | Paper curl | 1 | Low–med | Weak unless noisy | Medium | Medium (OSMOS) | Medium–high |
| 6 | Ink development | 1, uses `uSim` | Low | Strong, soft | Strong | Thin (Arrieta, Sweetpunk) | Medium |
| 7 | Smoke mask | 1 | Low–med | Strong, soft | Strong | Medium (several Awwwards elements) | Medium, near fluid smear |
| 8 | Specular light sweep | 1 | Lowest | Weak | Weak | Medium (Build in Amsterdam) | Low as a layer |
| 9 | Tile flip | 1 | Low | Comb | Medium | Weak | High |
| 10 | Gradient map | 1 | Lowest | None | Weak | Weak | High alone |
| 11 | Cloth wave | 1 | Low | Weak | Medium | Weak | Medium |

## What I could not verify

- Codrops returned 403 on every fetch, so all Codrops technique claims are from search summaries.
- Awwwards element pages carry only tags and credits. I did not confirm any Site of the Day, Developer Award or FWA status for any page cited, and I did not open any live site or watch any effect run. I cannot say that any site uses the effect on video cards, or on all five jobs.
- The searches did not return Lusion, Active Theory, Resn, Locomotive, Obys, Dogstudio, Cuberto, Aristide Benoist, 14islands, Basement, Hello Monday or makemepulse case studies for these effects. I cited no work by them. Only Studio Freight, Unseen Studio, Uprising, Immersive Garden, NaughtyDuk, Build in Amsterdam, OSMOS, Red Collar, Synthetic Theatre and Artefakt appear, each from an Awwwards page. A second pass through those studios' own sites and Awwwards profiles would likely find stronger precedent for #3, #6, #7.
- "World Flip" by Unseen Studio and the Codrops shape-aware ASCII renderer were seen as titles only.
- The credit of the cloth transition to the Venice Biennale site is an inference from a link and is unconfirmed.
- Costs, phone risk and slider ranges are my estimates; no shader was written or run. I did not read `composite.ts` or issue #45 beyond the brief and round 1.
