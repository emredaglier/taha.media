// THROWAWAY menu prototype 3: Pinboard. Contract: docs/design/menu3/CONTRACT.md. CSS 3D only (transform + perspective(), no WebGL).
// Idea: opening the menu pins the page to his wall. The live page shrinks to ~30% of the view, tilts a few degrees and is pinned to the board
// as one printed sheet (white-ish border drawn around it in the stage, a pin, a soft shadow, one swing as it lands). The board is lit from
// below, so every shadow rises up the wall. The three links are big printed frames (preview loops playing like a live photo, the word in
// big serif on a strip of masking tape over the lower edge), strings run from the page's pin to each link's pin; around them sticky notes
// (Gizlilik + the © line is one), a storyboard strip of empty panels and a paper clip.
// Every sheet hangs from its pin: a hinge per sheet (angle + angular velocity, damped, plus a lift that tips it off the board with
// rotateX). The pointer is a draught: its velocity pushes and lifts the sheets near it, a fast sweep sends a wave of lifting paper
// across the board. Hover/focus: that print stops swinging, lifts flat toward you and grows, its shadow spreads, the lamp concentrates
// on it, its string pulls taut, the rest dim. Close: the page-sheet comes off its pin, straightens and grows back into the full page,
// the rest fall away. Leave: the picked print comes off its pin and flies to the view until its picture fills it. Portrait: a loose column.
// FAKE: the sticky-note words ("cuma teslim", "müzik?"). Everything else is the real menu.
;(() => {
  'use strict'
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const lerp = (a, b, t) => a + (b - a) * t
  const sstep = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t) }

  const CSS = `
.pb-root{position:absolute;inset:0;overflow:hidden;visibility:hidden;touch-action:none;user-select:none;-webkit-user-select:none}
.pb-wall{position:absolute;inset:0;opacity:0;pointer-events:none;background:radial-gradient(ellipse 95% 62% at 50% 120%,rgba(237,237,237,.32),rgba(237,237,237,.09) 52%,transparent 78%)}
.pb-wall::before{content:'';position:absolute;inset:0;opacity:.07;background-image:var(--noise)}
.pb-wall::after{content:'';position:absolute;inset:0;box-shadow:inset 0 0 0 1px rgba(237,237,237,.1),inset 0 0 15vmin 2vmin rgba(0,0,0,.65)}
.pb-spot{position:absolute;left:0;top:0;width:var(--sp);height:var(--sp);margin:calc(var(--sp)/-2) 0 0 calc(var(--sp)/-2);border-radius:50%;pointer-events:none;opacity:0;will-change:transform;
  background:radial-gradient(circle,rgba(237,237,237,.3),rgba(237,237,237,.09) 46%,transparent 70%)}
.pb-shadows{position:absolute;inset:0;pointer-events:none}
.pb-sd{position:absolute;left:0;top:0;transform-origin:50% 0;background:rgba(0,0,0,.5);box-shadow:0 -26px 38px -4px rgba(0,0,0,.65),0 -80px 100px -34px rgba(0,0,0,.45);will-change:transform,opacity;opacity:0}
.pb-str{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6;overflow:visible;fill:none;stroke-linecap:round}
.pb-s{position:absolute;left:0;top:0;transform-origin:50% 0;will-change:transform,opacity;opacity:0;pointer-events:none;color:#1a1a1a;display:block}
.pb-pin{position:absolute;left:50%;top:5px;width:13px;height:13px;margin-left:-6.5px;border-radius:50%;z-index:3;pointer-events:none;
  background:radial-gradient(circle at 35% 30%,#ededed,#8f8f8f 55%,#2a2a2a);box-shadow:0 3px 4px rgba(0,0,0,.6)}
.pb-fr{box-sizing:border-box;border:var(--b) solid #e6e6e6;box-shadow:inset 0 0 0 1px rgba(0,0,0,.28)}
.pb-pr,.pb-note,.pb-story{pointer-events:auto}
.pb-pr{background:#e6e6e6;padding:var(--b);box-shadow:inset 0 0 0 1px rgba(0,0,0,.12);box-sizing:border-box}
.pb-pr canvas{display:block;width:100%;height:auto;aspect-ratio:16/9;background:#1a1a1a}
.pb-pr:focus-visible,.pb-note a:focus-visible{outline:2px solid #ededed;outline-offset:6px}
.pb-tape{position:absolute;left:5%;width:90%;bottom:calc(var(--th)*-.42);height:var(--th);display:flex;align-items:center;justify-content:center;transform:rotate(-1.4deg);z-index:2;
  background:linear-gradient(180deg,rgba(237,237,237,.92),rgba(212,212,212,.9));box-shadow:0 2px 4px rgba(0,0,0,.45);
  clip-path:polygon(0 0,100% 0,99% 25%,100% 50%,99% 75%,100% 100%,0 100%,1% 75%,0 50%,1% 25%)}
.pb-tape span{font:400 var(--tf)/1 var(--serif);color:#1a1a1a;letter-spacing:-.015em;white-space:nowrap}
.pb-note{background:#c9c9c9;box-shadow:inset 0 -16px 22px -14px rgba(0,0,0,.22);box-sizing:border-box;padding:16% 10% 0;font:italic 400 var(--nf)/1.02 var(--serif)}
.pb-note.pb-lg{background:#a9a9a9}
.pb-note a{position:absolute;inset:0;padding:16% 10% 0;color:#1a1a1a;font:italic 400 var(--nf)/1.02 var(--serif)}
.pb-cp{position:absolute;left:10%;right:8%;bottom:9%;font:500 9px/1.35 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:#2a2a2a;font-style:normal;pointer-events:none}
.pb-story{background:#cfcfcf;display:flex;gap:3%;padding:3.5%;box-sizing:border-box;align-items:center}
.pb-story i{flex:1;aspect-ratio:16/9;border:1.5px solid #1a1a1a;background:rgba(26,26,26,.05)}
.pb-clip{position:absolute;top:-17px;right:12%;width:22px;height:54px;transform:rotate(6deg);z-index:4;pointer-events:none;fill:none;stroke:#bdbdbd;stroke-width:2.4;stroke-linecap:round;filter:drop-shadow(0 2px 2px rgba(0,0,0,.5))}
`

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const CLIP = '<svg class="pb-clip" viewBox="0 0 20 54" aria-hidden="true"><path d="M6 40V12a6 6 0 0 1 12 0v32a9 9 0 0 1-18 0V10"/></svg>'

  // L = landscape {w: fraction of view width, x,y: pin as view fractions}, P = portrait
  const DEFS = [
    { id: 'page', k: 'page', L: { w: 0.3, x: 0.5, y: 0.105 }, P: { w: 0.36, x: 0.27, y: 0.165 }, rest: -2.5 },
    { id: 'l0', k: 'print', li: 0, L: { w: 0.25, x: 0.15, y: 0.28 }, P: { w: 0.54, x: 0.7, y: 0.18 }, rest: -1.5 },
    { id: 'l1', k: 'print', li: 1, L: { w: 0.25, x: 0.85, y: 0.24 }, P: { w: 0.56, x: 0.68, y: 0.4 }, rest: 2 },
    { id: 'l2', k: 'print', li: 2, L: { w: 0.27, x: 0.45, y: 0.6 }, P: { w: 0.58, x: 0.38, y: 0.575 }, rest: -1 },
    { id: 'nA', k: 'note', txt: 'cuma teslim', L: { w: 0.1, x: 0.07, y: 0.7 }, P: { w: 0.2, x: 0.14, y: 0.735 }, rest: -4 }, // FAKE
    { id: 'nB', k: 'note', txt: 'müzik?', L: { w: 0.09, x: 0.78, y: 0.58 }, P: { w: 0.2, x: 0.88, y: 0.6 }, rest: 3 }, // FAKE
    { id: 'st', k: 'story', L: { w: 0.26, x: 0.21, y: 0.85 }, P: { w: 0.5, x: 0.3, y: 0.9 }, rest: 1 },
    { id: 'gz', k: 'legal', L: { w: 0.13, x: 0.86, y: 0.76 }, P: { w: 0.3, x: 0.78, y: 0.76 }, rest: -2 },
  ]

  window.MENU3.register({
    name: 'Pinboard',
    create(ctx) {
      const { stage, page, links, legal, copyright, previews } = ctx
      const ptr = ctx.pointer
      const style = el('style'); style.textContent = CSS; stage.append(style)
      const root = el('div', 'pb-root'); stage.append(root)
      const wallEl = el('div', 'pb-wall'), spotEl = el('div', 'pb-spot'), shadows = el('div', 'pb-shadows')
      const svgNS = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('class', 'pb-str'); svg.setAttribute('aria-hidden', 'true')
      root.append(wallEl, spotEl, shadows, svg)

      // ---- sheets
      const sheets = []
      for (const d of DEFS) {
        const s = { d, id: d.id, k: d.k, rest: d.rest, rest0: d.rest, a: d.rest, w: 0, l: 0, lv: 0, hv: 0, dim: 0, en: d.k === 'page' ? 1 : 0, dir: -1, fl: 0, landed: false,
          link: d.k === 'print' ? links[d.li] : d.k === 'legal' ? legal : null, li: d.li, hoverable: d.k === 'print' || d.k === 'legal', o: -1, cv: null, g: null,
          x: 0, y: 0, w0: 0, h: 0, cx: 0, cy: 0, fillY: 0, fillW: 0, fillH: 0, S: 1, dx: 0, dy: 0 }
        let e
        if (d.k === 'page') { e = el('div', 'pb-s pb-fr', '<i class="pb-pin"></i>') }
        else if (d.k === 'print') {
          e = el('a', 'pb-s pb-pr'); e.href = s.link.href
          s.cv = el('canvas'); s.cv.width = 320; s.cv.height = 180; s.g = s.cv.getContext('2d')
          e.append(el('i', 'pb-pin'), s.cv, el('div', 'pb-tape', `<span>${s.link.label}</span>`))
          if (d.li === 0 || d.li === 1) e.insertAdjacentHTML('beforeend', CLIP)
        } else if (d.k === 'note') { e = el('div', 'pb-s pb-note', '<i class="pb-pin"></i>' + d.txt); e.setAttribute('aria-hidden', 'true') }
        else if (d.k === 'story') { e = el('div', 'pb-s pb-story', '<i class="pb-pin"></i><i></i><i></i><i></i><i></i><i></i>'); e.setAttribute('aria-hidden', 'true') }
        else { e = el('div', 'pb-s pb-note pb-lg', '<i class="pb-pin"></i>'); const a = el('a', '', legal.label); a.href = legal.href; e.append(a, el('span', 'pb-cp', copyright)) }
        s.el = e
        s.sd = el('div', 'pb-sd'); shadows.append(s.sd)
        root.append(e)
        sheets.push(s)
      }
      const page0 = sheets[0], prints = sheets.filter((s) => s.k === 'print')
      sheets.forEach((s, i) => { s.z = i + 1; s.el.style.zIndex = s.z })
      const paths = prints.map(() => { const p = document.createElementNS(svgNS, 'path'); svg.append(p); return p })

      // ---- layout
      let vw = 1, vh = 1, K = 1, PP = 1100, b = 12, portrait = false, s1 = 0.3, Ox = 0, Oy = 0, T1x = 0, T1y = 0
      let openState = false, leaving = null, hov = null, raf = 0, last = 0, hovTimer = 0, fading = false, pageOn = false
      const spot = { x: 0, y: 0, a: 0 }, wall = { a: 0 }, pg = { t: 0 }, str = { o: 1 }
      let vx = 0, vy = 0, prevX = ptr.x, prevY = ptr.y, gusts = [], lastGust = 0

      function layout() {
        vw = stage.clientWidth || innerWidth; vh = stage.clientHeight || innerHeight
        portrait = vh > vw * 1.15
        K = portrait ? Math.min(vw / 390, vh / 844) : Math.min(vw / 1440, vh / 900)
        PP = 1100 * K; b = Math.round(12 * K)
        root.style.setProperty('--b', b + 'px'); root.style.setProperty('--sp', Math.round(Math.max(vw, vh) * 0.42) + 'px')
        for (const s of sheets) {
          const L = portrait ? s.d.P : s.d.L
          s.w0 = L.w * vw; s.x = L.x * vw; s.y = L.y * vh
          if (s.k === 'page') { const inW = s.w0 - 2 * b; s.h = (inW * vh) / vw + 2 * b; s1 = inW / vw }
          else if (s.k === 'print') { const iw = s.w0 - 2 * b; s.h = (iw * 9) / 16 + 2 * b; s.fillY = b + (iw * 9) / 32; s.fillW = iw; s.fillH = (iw * 9) / 16; s.el.style.setProperty('--th', s.w0 * 0.26 + 'px'); s.el.style.setProperty('--tf', Math.min(s.w0 * 0.26 * 0.78, (s.w0 * 0.84) / (s.link.label.length * 0.47)) + 'px') }
          else if (s.k === 'story') s.h = s.w0 * 0.2
          else s.h = s.w0 * 0.92
          if (s.k === 'note' || s.k === 'legal') { s.el.style.setProperty('--nf', Math.min(s.w0 * 0.2, (s.w0 * 0.8) / (((s.d.txt || legal.label).length) * 0.42)) + 'px'); s.fillY = s.h / 2; s.fillW = s.w0; s.fillH = s.h }
          s.cx = s.x; s.cy = s.y + s.h / 2
          s.S = Math.max(vw / (s.fillW || 1), vh / (s.fillH || 1)) * 1.04
          s.dx = vw / 2 - s.x; s.dy = vh / 2 - s.S * s.fillY - s.y
          for (const e of [s.el, s.sd]) { e.style.left = s.x - s.w0 / 2 + 'px'; e.style.top = s.y + 'px'; e.style.width = s.w0 + 'px'; e.style.height = s.h + 'px' }
        }
        // the page sits under the stage at full size; it is scaled into the frame, pivoting on the frame's pin
        T1x = page0.x - vw / 2; T1y = page0.y + b / s1; Ox = vw / 2 - page0.x; Oy = -b / s1 - page0.y
        if (pageOn) page.style.transformOrigin = `50% ${-b / s1}px`
        render()
      }

      // ---- the hinge: angle + angular velocity around the pin, damped; lift tips the sheet off the board
      function hinge(s, dt, now) {
        const hv = s.hv
        const dx = s.cx - ptr.x, dy = s.cy - ptr.y
        const R = vw * (portrait ? 0.5 : 0.2)
        const fo = Math.exp(-((dx * dx + dy * dy) / (R * R)))
        const sp = Math.hypot(vx, vy)
        let aAcc = -vx * 0.12 * fo + vy * 0.03 * fo * (dx > 0 ? 1 : -1) // wind to the right swings the bottom left (negative angle)
        let lAcc = (sp / 1000) * 320 * fo
        for (const g of gusts) { // a wave: the sheet is hit when the front crosses it
          const r = ((now - g.t0) / 1000) * 1500
          if (!g.hit.has(s) && Math.hypot(s.cx - g.x, s.cy - g.y) < r) {
            g.hit.add(s)
            const gd = Math.hypot(s.cx - g.x, s.cy - g.y) / (vw * 0.6), fg = Math.exp(-gd * gd)
            s.w -= g.dir * 70 * g.amp * fg; s.lv += 4.5 * g.amp * fg
          }
        }
        s.w += (-(34 + 260 * hv) * (s.a - s.rest * (1 - hv)) - (1.5 + 16 * hv) * s.w + aAcc * (1 - hv)) * dt
        s.a = clamp(s.a + s.w * dt, -42, 42)
        s.lv += (-(70 + 200 * hv) * s.l - (5 + 10 * hv) * s.lv + lAcc * (1 - hv)) * dt
        s.l = clamp(s.l + s.lv * dt, -0.15, 1.5)
      }

      // ---- render
      function render() {
        const wa = wall.a
        wallEl.style.opacity = wa
        spotEl.style.opacity = spot.a * wa; spotEl.style.transform = `translate(${spot.x}px,${spot.y}px)`
        for (const s of sheets) {
          if (s.k === 'page') continue
          const e = s.en, d = s.dir
          const fy = d * (1 - e) * vh * 0.7, rot = s.a + d * (1 - e) * 16
          const lift = s.l * 24 * (1 - s.hv)
          const fl = s.fl
          const sc = lerp((1 + 0.24 * s.hv) * (1 - 0.035 * s.dim), s.S, fl)
          const tx = s.dx * fl, ty = fy + s.dy * fl
          const z = s.hv * 90 * K
          s.el.style.transform = `translate(${tx}px,${ty}px) perspective(${PP}px) rotate(${rot * (1 - fl)}deg) rotateX(${lift * (1 - fl)}deg) translateZ(${z}px) scale(${sc})`
          const o = clamp(e * 2.2, 0, 1) * (1 - 0.55 * s.dim)
          if (Math.abs(o - s.o) > 0.004) { s.o = o; s.el.style.opacity = o }
          const up = 4 + s.l * 46 * K + s.hv * 38 * K
          s.sd.style.transform = `translate(${tx}px,${ty - up * (1 - fl)}px) rotate(${rot * (1 - fl)}deg) scale(${sc * (1 + s.l * 0.06 + s.hv * 0.1)})`
          s.sd.style.opacity = o * (0.8 - s.l * 0.25) * (1 - fl)
        }
        renderPage()
        for (let i = 0; i < prints.length; i++) {
          const s = prints[i], x0 = page0.x, y0 = page0.y + 9, x1 = s.x, y1 = s.y + 9
          const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dist = Math.hypot(x1 - x0, y1 - y0)
          const taut = s.hv
          const bow = i === 2 ? -dist * 0.3 : 0 // the string to the bottom print bows round the sheet
          const sag = dist * 0.11 * (1 - taut) + Math.abs(s.l) * 8
          const p = paths[i]
          p.setAttribute('d', `M${x0} ${y0}Q${mx + bow + (s.a + page0.a) * 2.2} ${my + sag} ${x1} ${y1}`)
          p.setAttribute('stroke', 'rgba(237,237,237,' + (0.5 + 0.45 * taut) * str.o * wa + ')')
          p.setAttribute('stroke-width', 1.2 + 0.8 * taut)
        }
      }
      function renderPage() {
        const s = page0, t = pg.t, e = s.en
        if (t <= 0.0004) {
          if (pageOn) { page.style.transform = ''; page.style.transformOrigin = ''; page.style.willChange = ''; pageOn = false }
          s.el.style.opacity = 0; s.sd.style.opacity = 0
          return
        }
        if (!pageOn) { page.style.transformOrigin = `50% ${-b / s1}px`; page.style.willChange = 'transform'; pageOn = true }
        const d = 1, fy = d * (1 - e) * vh * 0.7, k = clamp(t * 1.2, 0, 1)
        const rot = s.a * k + (1 - e) * 16, lift = s.l * 24 * k
        const sc = lerp(1, s1, t)
        const tail = `perspective(${PP}px) rotate(${rot}deg) rotateX(${lift}deg) scale(`
        page.style.transform = `translate(${T1x * t}px,${T1y * t + fy}px) ${tail}${sc})`
        s.el.style.transform = `translate(${(1 - t) * Ox}px,${(1 - t) * Oy + fy}px) ${tail}${sc / s1})`
        const o = clamp((t - 0.5) * 3, 0, 1) * clamp(e * 2.2, 0, 1)
        s.el.style.opacity = o
        const up = 4 + s.l * 46 * K
        s.sd.style.transform = `translate(${(1 - t) * Ox}px,${(1 - t) * Oy + fy - up}px) rotate(${rot}deg) scale(${sc / s1})`
        s.sd.style.opacity = o * 0.8
      }

      function paint(s, now) {
        const g = s.g, w = s.cv.width, h = s.cv.height, m = sstep(0.5 + 0.5 * Math.sin(now / 1400 + s.li * 2))
        g.globalAlpha = 1; g.drawImage(previews[2 * s.li], 0, 0, w, h)
        g.globalAlpha = m; g.drawImage(previews[2 * s.li + 1], 0, 0, w, h)
        g.globalAlpha = 1
      }

      // ---- loop
      function tick(now) {
        raf = requestAnimationFrame(tick)
        const dt = Math.min(0.033, (now - last) / 1000 || 0.016); last = now
        const rvx = (ptr.x - prevX) / dt, rvy = (ptr.y - prevY) / dt; prevX = ptr.x; prevY = ptr.y
        vx = lerp(vx, clamp(rvx, -4000, 4000), 0.35); vy = lerp(vy, clamp(rvy, -4000, 4000), 0.35)
        if (openState && !leaving && Math.abs(vx) > 1500 && now - lastGust > 160 && Math.abs(ptr.x - prevX) < vw * 0.4) {
          lastGust = now; gusts.push({ x: ptr.x, y: ptr.y, t0: now, dir: Math.sign(vx) || 1, amp: clamp(Math.abs(vx) / 3000, 0.4, 1.2), hit: new Set() }); if (gusts.length > 4) gusts.shift()
        }
        gusts = gusts.filter((g) => now - g.t0 < 1400)
        for (const s of sheets) {
          if (s.k === 'page' && pg.t < 0.3) continue
          hinge(s, dt, now)
          if (!s.landed && s.k !== 'page' && s.en > 0.85 && openState) { s.landed = true; s.w += (sheets.indexOf(s) % 2 ? -1 : 1) * (22 + 18 * ((s.cx * 7) % 1)) } // pinned: a small swing
        }
        if (!page0.landed && pg.t > 0.78 && openState) { page0.landed = true; page0.w += -48 } // the page swings once as it lands
        render()
        if (openState || leaving) for (const s of prints) if (s.en > 0.05 || s === leaving) paint(s, now)
      }
      const start = () => { if (!raf) { last = performance.now(); prevX = ptr.x; prevY = ptr.y; raf = requestAnimationFrame(tick) } }
      const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0 }

      // ---- hover: the print stops, lifts flat toward you, the lamp concentrates, the rest hang back
      function setHover(s) {
        if (leaving || s === hov) return
        hov = s
        for (const t of sheets) {
          if (t.k === 'page') continue
          gsap.to(t, { hv: t === s ? 1 : 0, dim: s && t !== s ? 1 : 0, duration: t === s ? 0.45 : 0.5, ease: 'power3.out', overwrite: 'auto' })
          t.el.style.zIndex = t === s ? 9 : t.z
        }
        if (s) gsap.to(spot, { x: s.cx, y: s.cy + s.h * 0.1, a: 1, duration: 0.5, ease: 'power3.out', overwrite: 'auto' })
        else gsap.to(spot, { a: 0, duration: 0.5, overwrite: 'auto' })
      }

      // ---- leave: the picked sheet comes off its pin and flies until its picture fills the view
      function leave(s) {
        if (leaving || !openState) return
        leaving = s; hov = s
        gsap.killTweensOf(sheets, 'hv,dim')
        s.el.style.zIndex = 20
        s.dir = 1
        const others = sheets.filter((t) => t !== s)
        others.forEach((t) => { t.dir = 1 })
        const tl = gsap.timeline({ onComplete: () => finishLeave(s.link) })
        tl.to(others, { en: 0, duration: 0.45, ease: 'power2.in', stagger: 0.03 }, 0)
          .to(s, { fl: 1, hv: 0, dim: 0, en: 1, duration: 0.72, ease: 'power3.in' }, 0.1)
          .to(str, { o: 0, duration: 0.3 }, 0)
          .to(spot, { a: 0, duration: 0.3 }, 0)
      }
      function finishLeave(link) {
        openState = false; gsap.killTweensOf(pg); pg.t = 0; renderPage()
        ctx.arrive(link)
        fading = true
        gsap.to(root, { opacity: 0, duration: 0.22, ease: 'power1.out', onComplete: resetClosed })
      }
      function resetClosed() {
        fading = false; leaving = null; hov = null; gusts = []
        gsap.killTweensOf(root); gsap.killTweensOf(sheets); gsap.killTweensOf(pg); gsap.killTweensOf(wall); gsap.killTweensOf(spot); gsap.killTweensOf(str)
        for (const s of sheets) { Object.assign(s, { a: s.rest0, rest: s.rest0, w: 0, l: 0, lv: 0, hv: 0, dim: 0, en: s.k === 'page' ? 1 : 0, dir: -1, fl: 0, landed: false, o: -1 }); s.el.style.zIndex = s.z }
        pg.t = 0; wall.a = 0; spot.a = 0; str.o = 1
        root.style.opacity = ''; root.style.visibility = 'hidden'
        render(); stop()
      }

      // ---- events
      for (const s of sheets) {
        if (!s.link) continue
        const e = s.el
        e.addEventListener('click', (ev) => {
          const a = ev.target.closest && ev.target.closest('a'); if (!a) return
          ev.preventDefault(); leave(s)
        })
        e.addEventListener('pointerenter', () => { clearTimeout(hovTimer); setHover(s) })
        e.addEventListener('pointerleave', () => { clearTimeout(hovTimer); hovTimer = setTimeout(() => { if (hov === s) setHover(null) }, 90) })
        e.addEventListener('pointerdown', () => { if (openState && !leaving) { clearTimeout(hovTimer); setHover(s) } })
        e.addEventListener('focusin', (ev) => { let fv = false; try { fv = ev.target.matches(':focus-visible') } catch (err) { fv = true } if (fv) setHover(s) })
        e.addEventListener('focusout', () => { if (hov === s) setHover(null) })
      }
      addEventListener('resize', layout)
      layout()

      return {
        open() {
          if (fading) { gsap.killTweensOf(root); resetClosed() }
          if (openState) return
          openState = true
          root.style.visibility = 'visible'; root.style.opacity = ''
          layout(); start()
          page0.rest = page0.rest0; page0.landed = false
          const rest = sheets.filter((s) => s.k !== 'page')
          rest.forEach((s) => { s.dir = -1; s.landed = false })
          gsap.to(wall, { a: 1, duration: 0.8, ease: 'power2.out', overwrite: 'auto' })
          gsap.to(pg, { t: 1, duration: 0.95, ease: 'back.out(1.05)', overwrite: 'auto' })
          gsap.to(rest, { en: 1, duration: 0.7, ease: 'back.out(1.15)', stagger: 0.07, delay: 0.3, overwrite: 'auto' })
        },
        close() {
          if (!openState || leaving) return
          openState = false
          clearTimeout(hovTimer); hov = null
          for (const t of sheets) if (t.k !== 'page') gsap.to(t, { hv: 0, dim: 0, duration: 0.2, overwrite: 'auto' })
          gsap.to(spot, { a: 0, duration: 0.2, overwrite: 'auto' })
          page0.rest = 0 // straightens as it comes off the pin
          page0.landed = true
          const rest = sheets.filter((s) => s.k !== 'page')
          rest.forEach((s) => { s.dir = 1 })
          gsap.to(rest, { en: 0, duration: 0.55, ease: 'power2.in', stagger: { each: 0.04, from: 'end' }, overwrite: 'auto' })
          gsap.to(pg, { t: 0, duration: 0.85, delay: 0.2, ease: 'power3.inOut', overwrite: 'auto', onComplete: () => { if (!openState && !leaving) resetClosed() } })
          gsap.to(wall, { a: 0, duration: 0.45, delay: 0.5, ease: 'power1.in', overwrite: 'auto' })
        },
        dispose() {
          stop(); clearTimeout(hovTimer)
          gsap.killTweensOf(sheets); gsap.killTweensOf(pg); gsap.killTweensOf(wall); gsap.killTweensOf(spot); gsap.killTweensOf(str); gsap.killTweensOf(root)
          removeEventListener('resize', layout)
          page.style.transform = ''; page.style.transformOrigin = ''; page.style.willChange = ''
        },
      }
    },
  })
})()
