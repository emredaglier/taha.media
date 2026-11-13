// THROWAWAY prototype 3: Desk Drop. Opening the menu = he looks down from the screen to the desk. The page tilts back and rises
// until only the lower edge of the monitor is left at the top of the view (a strip of the live page, bezel, stand, a glow falling
// on the desk). The desk top below is seen from above at a slight angle, lamp-lit from the upper left. The links are loose objects
// on it: a drive (İşler), a contact sheet (Galeri), a notebook (Hakkımda), a sticky note (Gizlilik + ©), plus a mug and a pen.
// Top-down rigid bodies (circles, impulses, friction, walls), all transforms only. CSS 3D only: one rotateX plane in a perspective.
// fake: every object, the label texts, the keyboard, the cable, the mug. Contract: docs/design/menu3/CONTRACT.md.
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t
  const STRIP = 0.18 // share of the view height that keeps showing the live page
  const PAGE_TILT = 20 // deg the page leans back while it rises

  const CSS = `
.dd{position:absolute;inset:0;visibility:hidden;overflow:hidden;color:var(--t);font-family:var(--sans);-webkit-user-select:none;user-select:none}
.dd *{box-sizing:border-box}
.dd-shift{position:absolute;inset:0;will-change:transform}
.dd-glass{position:absolute;left:0;right:0;top:0;pointer-events:none;background:linear-gradient(to bottom,rgba(0,0,0,.72),rgba(0,0,0,.12) 72%,rgba(0,0,0,0)),linear-gradient(104deg,transparent 26%,rgba(255,255,255,.05) 35%,transparent 46%)}
.dd-bezel{position:absolute;left:-2%;right:-2%;pointer-events:none;border-radius:0 0 14px 14px;background:linear-gradient(#303030,#121212 55%,#070707);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 10px 34px rgba(0,0,0,.85)}
.dd-world{position:absolute;inset:0;pointer-events:none}
.dd-plane{position:absolute;inset:0;will-change:transform;pointer-events:none}
.dd-top{position:absolute;left:-40%;width:180%;height:320%;background:repeating-linear-gradient(90deg,rgba(255,255,255,.014) 0 2px,transparent 2px 9px),linear-gradient(#141414,#0a0a0a 40%,#050505)}
.dd-glow{position:absolute;pointer-events:none;background:linear-gradient(to bottom,rgba(237,237,237,.22),rgba(237,237,237,.05) 60%,transparent);-webkit-mask-image:radial-gradient(ellipse 62% 100% at 50% 0,#000 30%,transparent 100%);mask-image:radial-gradient(ellipse 62% 100% at 50% 0,#000 30%,transparent 100%)}
.dd-lamp{position:absolute;left:0;top:0;border-radius:50%;pointer-events:none;will-change:transform;background:radial-gradient(circle,rgba(237,237,237,.17),rgba(237,237,237,.075) 32%,rgba(237,237,237,.02) 55%,transparent 70%)}
.dd-stand{position:absolute;pointer-events:none;background:linear-gradient(90deg,#0b0b0b,#2c2c2c 40%,#161616 70%,#080808)}
.dd-foot{position:absolute;pointer-events:none;border-radius:50%;background:radial-gradient(ellipse,#2a2a2a,#111 70%);box-shadow:0 .7rem 1.4rem rgba(0,0,0,.8)}
.dd-kb{position:absolute;pointer-events:none;border-radius:14px 14px 0 0;background:repeating-linear-gradient(90deg,transparent 0 55px,#040404 55px 58px),repeating-linear-gradient(0deg,transparent 0 50px,#040404 50px 53px),linear-gradient(#1c1c1c,#0e0e0e);box-shadow:0 -10px 30px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.1)}
.dd-cable{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
.dd-stain{position:absolute;border-radius:50%;pointer-events:none;border:.35em solid rgba(237,237,237,.07)}
.dd-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 85% 75% at 42% 52%,transparent 45%,rgba(0,0,0,.72) 100%)}
.dd-o{position:absolute;left:0;top:0;width:0;height:0}
.dd-sh{position:absolute;pointer-events:none;background:#000;will-change:transform,opacity}
.dd-sh.t{box-shadow:0 0 .5em .12em #000}
.dd-sh.w{box-shadow:0 0 2.6em .7em #000}
.dd-body{position:absolute;will-change:transform,opacity}
.dd-body>*{position:absolute}
.dd-hit{position:absolute!important;pointer-events:auto;inset:0;display:block;border-radius:inherit;color:inherit;touch-action:none;-webkit-user-drag:none;-webkit-tap-highlight-color:transparent;cursor:grab;z-index:3}
.dd-hit:active{cursor:grabbing}
.dd-hit:focus-visible{outline:2px solid #ededed;outline-offset:.45em}
.dd-dim{inset:0;border-radius:inherit;background:#000;pointer-events:none;z-index:4}
.dd-word{position:absolute;display:flex;align-items:center;justify-content:center;font-family:var(--serif);line-height:1;white-space:nowrap;pointer-events:none}
.dd-word i{display:inline-block;font-style:inherit}
/* the drive: brushed grey slab, a label-maker strip with the word, a little window that plays the loop */
.dd-drive{border-radius:1.1em;background:linear-gradient(135deg,#767676,#9a9a9a 16%,#5a5a5a 44%,#8c8c8c 70%,#474747);box-shadow:inset 0 0 0 .12em rgba(255,255,255,.2),inset 0 -.35em .7em rgba(0,0,0,.45),inset 0 .2em .3em rgba(255,255,255,.18)}
.dd-drive .tape{left:1.4em;top:3.1em;width:18.8em;height:5.6em;background:linear-gradient(#f0f0f0,#d8d8d8);border-radius:.2em;box-shadow:0 .1em .3em rgba(0,0,0,.55)}
.dd-drive .tape::before,.dd-drive .tape::after{content:'';position:absolute;top:.35em;bottom:.35em;width:.12em;background:rgba(0,0,0,.2)}
.dd-drive .tape::before{left:.55em}.dd-drive .tape::after{right:.55em}
.dd-drive .win{left:21.3em;top:3.1em;width:7.3em;height:4.1em;background:#060606;border-radius:.2em;overflow:hidden;box-shadow:inset 0 0 .4em #000,0 0 0 .12em #3a3a3a}
.dd-drive .win canvas,.dd-sheet canvas,.dd-book canvas{display:block;width:100%;height:100%;transition:opacity .4s}
.dd-drive .led{left:25.6em;top:1.2em;width:.7em;height:.7em;border-radius:50%;background:#ededed;box-shadow:0 0 .8em .2em rgba(237,237,237,.5)}
.dd-drive .scr{width:.9em;height:.9em;border-radius:50%;background:radial-gradient(#222,#050505);box-shadow:inset 0 0 0 .1em #777}
.dd-drive .cap{left:1.5em;top:9.6em;font:500 .7em/1 var(--sans);letter-spacing:.2em;color:#101010;opacity:.7;text-transform:uppercase}
/* the contact sheet: a printed page, the word in the header, a film strip of four frames */
.dd-sheet{border-radius:.15em;background:linear-gradient(160deg,#dadada,#c4c4c4);box-shadow:inset 0 0 0 .1em rgba(0,0,0,.1)}
.dd-sheet .film{left:1em;right:1em;top:8.7em;height:7em;background:#0b0b0b;border-radius:.2em}
.dd-sheet .holes{position:absolute;left:0;right:0;height:.55em;background:repeating-linear-gradient(90deg,transparent 0 .5em,#cfcfcf .5em 1em,transparent 1em 1.5em);opacity:.55}
.dd-sheet .fr{position:absolute;top:1.25em;width:7.3em;height:4.1em;background:#060606;overflow:hidden;border-radius:.1em}
.dd-sheet .ring{border:.18em solid rgba(20,20,20,.75);border-radius:50%}
.dd-sheet .meta{right:1.4em;top:1.3em;font:500 .6em/1.5 var(--sans);letter-spacing:.2em;text-align:right;color:#222;text-transform:uppercase;opacity:.7}
/* the notebook: two ruled pages, the word hand-lettered across, a taped-in frame */
.dd-book{border-radius:.3em;background:linear-gradient(90deg,#bcbcbc,#d6d6d6 44%,#8e8e8e 49.4%,#4a4a4a 50%,#8e8e8e 50.6%,#d0d0d0 56%,#bababa);box-shadow:inset 0 0 0 .12em rgba(0,0,0,.14),0 .15em 0 -.02em #7a7a7a}
.dd-book .rule{inset:1.2em 1.3em 1.2em 1.3em;background:repeating-linear-gradient(to bottom,transparent 0 1.55em,rgba(0,0,0,.17) 1.55em calc(1.55em + 1px));-webkit-mask-image:linear-gradient(90deg,#000 47%,transparent 47.6%,transparent 52.4%,#000 53%);mask-image:linear-gradient(90deg,#000 47%,transparent 47.6%,transparent 52.4%,#000 53%)}
.dd-book .shot{right:2.1em;top:1.7em;width:6.4em;height:3.6em;background:#060606;transform:rotate(4deg);box-shadow:0 .15em .4em rgba(0,0,0,.5);overflow:hidden}
.dd-book .tp{right:1.6em;top:1.2em;width:2.4em;height:.9em;background:rgba(240,240,240,.55);transform:rotate(-24deg)}
.dd-book .tp2{right:7.2em;top:4.9em;width:2.2em;height:.9em;background:rgba(240,240,240,.5);transform:rotate(30deg)}
.dd-book .scrib{left:1.7em;bottom:1.9em;font:italic 400 1.4em/1 var(--serif);color:#2a2a2a;opacity:.7;transform:rotate(-2deg)}
/* the sticky note */
.dd-note{background:linear-gradient(160deg,#cdcdcd,#b2b2b2);box-shadow:inset -.2em -.2em .6em rgba(0,0,0,.14)}
.dd-note::after{content:'';position:absolute;right:0;bottom:0;width:2.4em;height:2.4em;background:linear-gradient(135deg,transparent 50%,rgba(0,0,0,.22) 50.5%,#e0e0e0);pointer-events:none}
.dd-note .strip{left:0;right:0;top:0;height:1.2em;background:rgba(0,0,0,.07)}
.dd-note .copy{left:1.1em;right:2.6em;bottom:1.1em;font:500 .62em/1.4 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:#1a1a1a;opacity:.75;z-index:5;pointer-events:none}
/* props: mug (ring stain stays where it was), pen */
.dd-mug{border-radius:50%;background:radial-gradient(circle,#050505 0 36%,#5e5e5e 37% 41%,#c2c2c2 42% 47%,#8a8a8a 48%,#505050 100%);box-shadow:inset 0 0 .5em rgba(255,255,255,.2)}
.dd-mug::after{content:'';position:absolute;right:-1.9em;top:1.9em;width:2.4em;height:3em;border:.6em solid #7c7c7c;border-left:0;border-radius:0 1.6em 1.6em 0}
.dd-pen{border-radius:.45em;background:linear-gradient(90deg,#ededed 0 10%,#1a1a1a 10% 80%,#8f8f8f 80% 85%,#d8d8d8 85%);box-shadow:inset 0 .12em 0 rgba(255,255,255,.35),inset 0 -.12em 0 rgba(0,0,0,.4)}
.dd.pt .dd-kb{display:none}
.dd.lv .dd-hit{pointer-events:none}
@media (max-width:767px){.dd-hit:focus-visible{outline-offset:.3em}}
`

  const hand = (s) => [...s].map((ch, i) => { const r = Math.sin(i * 12.9898 + 3.1); return `<i style="transform:translateY(${(r * 0.05).toFixed(3)}em) rotate(${(r * 3).toFixed(2)}deg)">${ch}</i>` }).join('')

  // each body: size in em, link index (or 'legal'), html. The `a.dd-hit` covers the body and holds the word.
  function spec(ctx) {
    const [l0, l1, l2] = ctx.links, lg = ctx.legal
    const hit = (l, inner) => `<a class="dd-hit" href="${l.href}" draggable="false">${inner}</a>`
    return [
      { id: 'drive', w: 30, h: 12.5, r: 1.1, link: l0, prev: [[0, '.win']],
        html: `<div class="dd-body dd-drive"><i class="led"></i><i class="scr" style="left:1.4em;top:1.2em"></i><i class="scr" style="left:27.7em;top:10.6em"></i><i class="scr" style="left:1.4em;top:10.6em"></i><div class="tape"></div><div class="win"><canvas width="240" height="135"></canvas></div><span class="cap">Taha Ç. / 01</span>${hit(l0, `<span class="dd-word" style="left:1.4em;top:3.1em;width:18.8em;height:5.6em;font-size:4.5em;color:#111;letter-spacing:.01em">${l0.label}</span>`)}<i class="dd-dim"></i></div>` },
      { id: 'sheet', w: 36, h: 17, r: 0.15, link: l1, prev: [[2, '.f0'], [3, '.f1'], [2, '.f2'], [3, '.f3']],
        html: `<div class="dd-body dd-sheet"><span class="meta">Contact sheet<br>Taha Çiftçi</span><div class="film"><i class="holes" style="top:.25em"></i><i class="holes" style="bottom:.25em"></i>${[0, 1, 2, 3].map((k) => `<div class="fr f${k}" style="left:${0.5 + k * 8.2}em;top:1.45em"><canvas width="240" height="135"></canvas></div>`).join('')}<i class="ring" style="left:${0.5 + 2 * 8.2 - 0.6}em;top:.9em;width:8.5em;height:5.2em;position:absolute"></i></div>${hit(l1, `<span class="dd-word" style="left:1.3em;top:.8em;width:auto;height:7em;font-size:6.2em;justify-content:flex-start;color:#0e0e0e">${l1.label}</span>`)}<i class="dd-dim"></i></div>` },
      { id: 'book', w: 34, h: 20, r: 0.3, link: l2, prev: [[4, '.shot']],
        html: `<div class="dd-body dd-book"><div class="rule"></div><div class="shot"><canvas width="240" height="135"></canvas></div><i class="tp"></i><i class="tp2"></i><span class="scrib">notlar, notlar</span>${hit(l2, `<span class="dd-word" style="left:1.9em;top:5.2em;width:auto;height:8em;font-size:7.4em;font-style:italic;color:#101010;transform:rotate(-5deg);justify-content:flex-start">${hand(l2.label)}</span>`)}<i class="dd-dim"></i></div>` },
      { id: 'note', w: 12, h: 12, r: 0.1, link: lg, prev: [],
        html: `<div class="dd-body dd-note"><i class="strip"></i><span class="copy">${ctx.copyright}</span>${hit(lg, `<span class="dd-word" style="left:.5em;top:2.4em;width:11em;height:4em;font-size:3.5em;font-style:italic;color:#151515;transform:rotate(-4deg)">${hand(lg.label)}</span>`)}<i class="dd-dim"></i></div>` },
      { id: 'mug', w: 7, h: 7, r: 3.5, link: null, prev: [], html: `<div class="dd-body dd-mug"><i class="dd-dim"></i></div>` },
      { id: 'pen', w: 12, h: 0.9, r: 0.45, link: null, prev: [], html: `<div class="dd-body dd-pen"><i class="dd-dim"></i></div>` },
    ]
  }

  MENU3.register({
    name: 'Desk Drop',
    create(ctx) {
      const { stage, page, pointer } = ctx
      const gs = window.gsap
      const S = { mon: 0, tilt: 1, fill: 0 } // mon: 0 page full view .. 1 monitor strip; tilt: desk tilt; fill: leave
      let W = 0, H = 0, deskY = 0, bz = 0, P = 0, THETA = 16, portrait = false, wy = 0
      let isOpen = false, leaving = false, leaveB = null, ticking = false, disposed = false, fadeTw = null
      let ptrB = null, focB = null, hoverB = null, down = null, drag = null, zTop = 10, prevUntil = 0
      const pv = { x: 0, y: 0 }, last = { x: 0, y: 0, ok: false }, lamp = { x: 0, y: 0, tx: 0, ty: 0, r: 0 }
      let bounds = { x0: 0, x1: 0, y0: 0, y1: 0 }

      const root = document.createElement('div')
      root.className = 'dd'
      root.innerHTML = `<style>${CSS}</style><div class="dd-shift"><div class="dd-glass"></div><div class="dd-bezel"></div><div class="dd-world"><div class="dd-plane"><div class="dd-top"></div><div class="dd-glow"></div><svg class="dd-cable" aria-hidden="true"><path class="c1" fill="none" stroke="#0b0b0b" stroke-width="12" stroke-linecap="round"/><path class="c2" fill="none" stroke="#2b2b2b" stroke-width="2.5" stroke-linecap="round"/></svg><div class="dd-stand"></div><div class="dd-foot"></div><div class="dd-kb"></div><div class="dd-stain"></div></div></div></div><div class="dd-vig"></div>`
      stage.append(root)
      const $ = (s) => root.querySelector(s)
      const shift = $('.dd-shift'), glass = $('.dd-glass'), bezel = $('.dd-bezel'), world = $('.dd-world'), plane = $('.dd-plane')
      const top = $('.dd-top'), glow = $('.dd-glow'), stand = $('.dd-stand'), foot = $('.dd-foot'), kb = $('.dd-kb'), stain = $('.dd-stain'), cable = $('.dd-cable')
      const lampEl = document.createElement('div'); lampEl.className = 'dd-lamp'; plane.append(lampEl)

      // ---- bodies ------------------------------------------------------------------------------------------------------
      const bodies = spec(ctx).map((sp) => {
        const o = document.createElement('div'); o.className = 'dd-o'
        o.innerHTML = `<div class="dd-sh w"></div><div class="dd-sh t"></div>${sp.html}`
        plane.append(o)
        const body = o.querySelector('.dd-body'), sh = [...o.querySelectorAll('.dd-sh')]
        const b = { sp, el: o, body, sh2: sh[0], sh1: sh[1], dim: o.querySelector('.dd-dim'), hit: o.querySelector('.dd-hit'), link: sp.link,
          x: 0, y: 0, a: 0, vx: 0, vy: 0, va: 0, hov: 0, enter: 0, dimv: 0.22, N: 16, w: 0, h: 0, m: sp.w * sp.h, im: 0, ii: 0, circ: [], wc: [],
          canv: sp.prev.map(([k, sel]) => { const c = body.querySelector(sel + ' canvas') || body.querySelector(sel); return { k, g: c.getContext('2d'), w: c.width, h: c.height, el: c } }),
          lastDim: -1, hx: 0, hy: 0, ha: 0, wasDrag: false }
        b.im = 1 / b.m
        return b
      })
      const links = bodies.filter((b) => b.link)
      const byEl = new Map(links.map((b) => [b.hit, b]))

      // ---- geometry: the desk plane is rotateX(THETA) about the monitor's foot line, in a perspective -----------------------
      // screen -> plane, exact inverse of the projection (used for the pointer, the home spots and the walls)
      function toPlane(sx, sy, th, off) {
        const t = (th * Math.PI) / 180, s = Math.sin(t), c = Math.cos(t)
        const ry = sy - off - deskY, rx = sx - W / 2
        const dy = (ry * P) / (P * c + ry * s), sc = P / (P - dy * s)
        return { x: W / 2 + rx / sc, y: deskY + dy }
      }
      const planeAt = (sx, sy) => toPlane(sx, sy, THETA * S.tilt, wy)

      function circles(b) {
        const w = b.w, h = b.h, r = Math.max(h / 2, b.sp.id === 'pen' ? 0.7 * b.N : 0), span = Math.max(0, w - 2 * r)
        const n = span < 1 ? 1 : Math.ceil(span / Math.max(r, 1)) + 1
        b.circ = Array.from({ length: n }, (_, i) => ({ x: n === 1 ? 0 : -span / 2 + (span * i) / (n - 1), y: 0, r }))
        b.wc = b.circ.map(() => ({ x: 0, y: 0, r: 0 }))
      }

      function layout() {
        W = innerWidth; H = innerHeight
        portrait = W < 768 && W < H
        const strip = STRIP * H
        bz = Math.round(clamp(H * 0.022, 12, 24)); deskY = strip + bz
        P = 1.6 * H; THETA = portrait ? 9 : 16
        root.classList.toggle('pt', portrait)
        glass.style.height = strip + 'px'
        Object.assign(bezel.style, { top: strip + 'px', height: bz + 'px' })
        world.style.perspective = P + 'px'; world.style.perspectiveOrigin = `50% ${deskY}px`
        plane.style.transformOrigin = `50% ${deskY}px`
        top.style.top = deskY + 'px'
        const gw = W * (portrait ? 0.9 : 0.62)
        Object.assign(glow.style, { left: (W - gw) / 2 + 'px', top: deskY + 'px', width: gw + 'px', height: H * 0.5 + 'px' })
        const sw = clamp(W * 0.045, 40, 78)
        Object.assign(stand.style, { left: W / 2 - sw / 2 + 'px', top: deskY - 2 + 'px', width: sw + 'px', height: H * 0.085 + 'px', clipPath: 'polygon(12% 0,88% 0,100% 100%,0 100%)' })
        Object.assign(foot.style, { left: W / 2 - sw * 1.6 + 'px', top: deskY + H * 0.075 + 'px', width: sw * 3.2 + 'px', height: sw * 0.55 + 'px' })

        const u = Math.min(W / 1440, H / 900) * 0.94
        const place = (b, sx, sy, deg, N) => {
          b.N = N; b.w = b.sp.w * N; b.h = b.sp.h * N
          b.el.style.fontSize = N + 'px'
          const m = b.body.style
          m.width = b.sp.w + 'em'; m.height = b.sp.h + 'em'; m.left = -b.sp.w / 2 + 'em'; m.top = -b.sp.h / 2 + 'em'; m.borderRadius = b.sp.r + 'em'
          for (const s of [b.sh1, b.sh2]) Object.assign(s.style, { width: b.sp.w + 'em', height: b.sp.h + 'em', left: -b.sp.w / 2 + 'em', top: -b.sp.h / 2 + 'em', borderRadius: b.sp.r + 'em' })
          const p = toPlane(sx, sy, THETA, 0)
          b.hx = b.x = p.x; b.hy = b.y = p.y; b.ha = b.a = (deg * Math.PI) / 180; b.vx = b.vy = b.va = 0
          circles(b)
          b.I = b.m * (b.w * b.w + b.h * b.h) / 12; b.ii = 1 / b.I
        }
        const [drive, sheet, book, note, mug, pen] = bodies
        if (!portrait) {
          const N = 16 * u
          place(drive, W * 0.25, H * 0.4, -4, N); place(sheet, W * 0.7, H * 0.38, 3, N); place(book, W * 0.36, H * 0.74, -2, N)
          place(note, W * 0.83, H * 0.72, 6, N); place(mug, W * 0.66, H * 0.7, 0, 16 * u); place(pen, W * 0.6, H * 0.57, -20, 16 * u)
          Object.assign(kb.style, { left: W * 0.16 + 'px', width: W * 0.68 + 'px', height: H * 0.3 + 'px' })
          const k = toPlane(W / 2, H * 0.93, THETA, 0); kb.style.top = k.y + 'px'; kb.style.transform = `rotate(-1.5deg)`
        } else {
          // one column. Every object is as wide as the view allows, then the whole column is fitted under the header.
          const items = [drive, sheet, book], fit = (b) => (W - 28) / b.sp.w
          const gap = 18, start = Math.max(deskY + 12, 140)
          let tot = 0; items.forEach((b) => { tot += b.sp.h * fit(b) }); tot += 3 * gap + 12 * 10
          const k = Math.min(1, (H - 12 - start) / (tot * 1.1)) * 0.96
          let y = start
          items.forEach((b, i) => { const N = fit(b) * k; const hh = b.sp.h * N; place(b, W / 2 + (i - 1) * 3, y + hh / 2, [-2, 2, -1.5][i], N); y += hh + gap })
          const nN = Math.min(11 * k, 12); place(note, W - 12 * nN * 0.55 - 14, y + 6 * nN, 5, nN)
          place(mug, W - 48, deskY + 52, 0, 7 * k + 1); place(pen, 22, H * 0.55, 80, 10 * k + 2)
        }
        // walls, in plane coords (the magnified bottom edge decides how far left and right things may go)
        const bot = toPlane(W / 2, H - 6, THETA, 0), sB = P / (P - (bot.y - deskY) * Math.sin((THETA * Math.PI) / 180))
        const xl = W / 2 / sB
        bounds = { x0: W / 2 - xl + 6, x1: W / 2 + xl - 6, y0: deskY + 8, y1: bot.y }
        const lp = toPlane(W * 0.2, H * 0.3, THETA, 0)
        lamp.tx = lamp.x = lp.x; lamp.ty = lamp.y = lp.y; lamp.r = Math.max(W, H) * 0.85
        lampEl.style.width = lampEl.style.height = lamp.r * 2 + 'px'
        const st = toPlane(W * 0.62, H * 0.55, THETA, 0); mugStain(st)
        // cable from the stand foot, wandering out of the view on the left
        const c0 = toPlane(W / 2, H * 0.27, THETA, 0), c1 = toPlane(W * 0.35, H * 0.5, THETA, 0), c2 = toPlane(W * 0.12, H * 0.45, THETA, 0), c3 = toPlane(-W * 0.04, H * 0.62, THETA, 0)
        const d = `M${c0.x},${c0.y} C${c1.x},${c1.y} ${c1.x - 120},${c2.y + 80} ${c2.x},${c2.y} S${c3.x + 60},${c3.y - 30} ${c3.x},${c3.y}`
        cable.querySelector('.c1').setAttribute('d', d); cable.querySelector('.c2').setAttribute('d', d)
        cable.style.width = W + 'px'; cable.style.height = H * 2 + 'px'
        lastDim()
      }
      function mugStain(p) { const n = bodies[4].N; Object.assign(stain.style, { width: 7.4 * n + 'px', height: 7.4 * n + 'px', left: p.x - 3.7 * n + 'px', top: p.y - 3.7 * n + 'px' }) }
      const lastDim = () => bodies.forEach((b) => { b.lastDim = -1 })

      // ---- hover / focus / press ---------------------------------------------------------------------------------------
      function refreshHover() {
        const b = (drag && drag.b) || ptrB || focB || null
        if (b === hoverB) return
        hoverB = b
        for (const o of bodies) {
          const lit = o === b
          gs.to(o, { hov: lit ? 1 : 0, dimv: lit ? 0 : b ? 0.55 : 0.22, duration: lit ? 0.55 : 0.6, ease: lit ? 'back.out(1.6)' : 'power3.out', overwrite: 'auto' })
        }
        if (b) { b.el.style.zIndex = ++zTop }
      }
      const focusVisible = (b) => { try { return b.hit.matches(':focus-visible') } catch { return true } }
      for (const b of links) {
        const h = b.hit
        h.addEventListener('pointerenter', (e) => { if (e.pointerType === 'touch') return; ptrB = b; refreshHover() })
        h.addEventListener('pointerleave', (e) => { if (e.pointerType === 'touch') return; if (ptrB === b) ptrB = null; refreshHover() })
        h.addEventListener('focus', () => { if (focusVisible(b)) { focB = b; refreshHover() } })
        h.addEventListener('blur', () => { if (focB === b) focB = null; refreshHover() })
        h.addEventListener('pointerdown', (e) => {
          if (leaving || e.button > 0) return
          const p0 = planeAt(e.clientX, e.clientY)
          b.wasDrag = false; down = { b, sx: e.clientX, sy: e.clientY, gx: b.x - p0.x, gy: b.y - p0.y, moved: false, touch: e.pointerType !== 'mouse' }
          try { h.setPointerCapture(e.pointerId) } catch {}
          if (down.touch) { ptrB = b; refreshHover() }
          b.el.style.zIndex = ++zTop
        })
        h.addEventListener('click', (e) => { e.preventDefault(); if (b.wasDrag) { b.wasDrag = false; return } go(b) })
        h.addEventListener('dragstart', (e) => e.preventDefault())
      }
      const onUp = () => {
        if (!down) return
        const d = down; down = null
        if (d.moved) {
          d.b.wasDrag = true
          const sp = Math.hypot(pv.x, pv.y), cap = Math.min(1, 1900 / (sp || 1))
          d.b.vx = pv.x * cap * 0.9; d.b.vy = pv.y * cap * 0.9
        }
        drag = null
        if (d.touch && ptrB === d.b) ptrB = null
        refreshHover()
      }
      addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp)

      // ---- physics: a few circles per body, impulses with spin, friction, walls ----------------------------------------------
      function wcircles(b) {
        const c = Math.cos(b.a), s = Math.sin(b.a)
        for (let i = 0; i < b.circ.length; i++) { const k = b.circ[i], w = b.wc[i]; w.x = b.x + k.x * c - k.y * s; w.y = b.y + k.x * s + k.y * c; w.r = k.r }
      }
      const imOf = (b) => (drag && drag.b === b ? b.im * 0.18 : b.im)
      function collide(A, B) {
        const imA = imOf(A), imB = imOf(B), wsum = imA + imB
        for (const ca of A.wc) for (const cb of B.wc) {
          const dx = cb.x - ca.x, dy = cb.y - ca.y, rr = ca.r + cb.r, d2 = dx * dx + dy * dy
          if (d2 >= rr * rr) continue
          const d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d, pen = rr - d
          A.x -= nx * pen * (imA / wsum) * 0.85; A.y -= ny * pen * (imA / wsum) * 0.85
          B.x += nx * pen * (imB / wsum) * 0.85; B.y += ny * pen * (imB / wsum) * 0.85
          const px = ca.x + nx * ca.r, py = ca.y + ny * ca.r
          const rax = px - A.x, ray = py - A.y, rbx = px - B.x, rby = py - B.y
          const vn = (B.vx - B.va * rby - (A.vx - A.va * ray)) * nx + (B.vy + B.va * rbx - (A.vy + A.va * rax)) * ny
          if (vn >= 0) continue
          const rnA = rax * ny - ray * nx, rnB = rbx * ny - rby * nx
          const j = (-(1.3) * vn) / (imA + imB + rnA * rnA * A.ii + rnB * rnB * B.ii)
          A.vx -= j * nx * imA; A.vy -= j * ny * imA; A.va -= j * rnA * A.ii
          B.vx += j * nx * imB; B.vy += j * ny * imB; B.va += j * rnB * B.ii
        }
      }
      function walls(b) {
        wcircles(b)
        let l = 0, r = 0, t = 0, d = 0 // the deepest circle on each side decides, so the push happens once
        for (const c of b.wc) { l = Math.max(l, bounds.x0 - (c.x - c.r)); r = Math.max(r, c.x + c.r - bounds.x1); t = Math.max(t, bounds.y0 - (c.y - c.r)); d = Math.max(d, c.y + c.r - bounds.y1) }
        if (l > 0) { b.x += l; b.vx = Math.abs(b.vx) * 0.35 }
        if (r > 0) { b.x -= r; b.vx = -Math.abs(b.vx) * 0.35 }
        if (t > 0) { b.y += t; b.vy = Math.abs(b.vy) * 0.35 }
        if (d > 0) { b.y -= d; b.vy = -Math.abs(b.vy) * 0.35 }
      }
      const inside = (b, p) => { const c = Math.cos(b.a), s = Math.sin(b.a), dx = p.x - b.x, dy = p.y - b.y; return Math.abs(dx * c + dy * s) < b.w / 2 && Math.abs(-dx * s + dy * c) < b.h / 2 }

      function physics(dt) {
        if (!last.ok) { last.x = pointer.x; last.y = pointer.y; last.ok = true }
        pv.x += ((pointer.x - last.x) / dt - pv.x) * Math.min(1, dt * 14); pv.y += ((pointer.y - last.y) / dt - pv.y) * Math.min(1, dt * 14)
        last.x = pointer.x; last.y = pointer.y
        if (leaving) return
        const pp = planeAt(pointer.x, pointer.y)
        if (down && !down.moved && Math.hypot(pointer.x - down.sx, pointer.y - down.sy) > (down.touch ? 9 : 6)) {
          down.moved = true; drag = { b: down.b, gx: down.gx, gy: down.gy }; refreshHover()
        }
        if (!ctx.touch && !drag && S.mon > 0.6) { // the pointer nudges what it passes: slides, spins a little, settles
          const sp = Math.hypot(pv.x, pv.y), k = 1 - Math.exp(-10 * dt)
          if (sp > 70) for (const b of bodies) if (inside(b, pp)) {
            b.vx += pv.x * 0.08 * k; b.vy += pv.y * 0.08 * k
            const rx = pp.x - b.x, ry = pp.y - b.y
            b.va = clamp(b.va + ((rx * pv.y - ry * pv.x) / ((b.w * b.w + b.h * b.h) / 4)) * 0.35 * k, -2, 2)
          }
        }
        const sub = 2, h = dt / sub
        for (let s = 0; s < sub; s++) {
          for (const b of bodies) {
            if (drag && drag.b === b) { b.vx = clamp((pp.x + drag.gx - b.x) * 18, -3200, 3200); b.vy = clamp((pp.y + drag.gy - b.y) * 18, -3200, 3200); b.va *= Math.exp(-9 * h) } else { const f = Math.exp(-4.6 * h); b.vx *= f; b.vy *= f; b.va *= Math.exp(-6.5 * h) }
            b.x += b.vx * h; b.y += b.vy * h; b.a += b.va * h
            wcircles(b)
          }
          for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) { collide(bodies[i], bodies[j]); wcircles(bodies[i]); wcircles(bodies[j]) }
          for (const b of bodies) walls(b)
        }
      }

      // ---- render ------------------------------------------------------------------------------------------------------
      function render(dt) {
        const strip = STRIP * H, run = H - strip
        wy = run * (1 - S.mon)
        shift.style.transform = `translate3d(0,${wy}px,0)`
        page.style.transform = `translate3d(0,${-run * S.mon}px,0) perspective(${1.3 * H}px) rotateX(${PAGE_TILT * S.mon}deg)`
        plane.style.transform = `rotateX(${THETA * S.tilt}deg)`
        // the lamp pool leans a little toward the pointer
        const lh = toPlane(W * 0.2 + (pointer.x - W / 2) * 0.07, H * 0.3 + (pointer.y - H / 2) * 0.07, THETA, 0)
        const k = 1 - Math.exp(-3.5 * dt)
        lamp.x += (lh.x - lamp.x) * k; lamp.y += (lh.y - lamp.y) * k
        lampEl.style.transform = `translate3d(${lamp.x - lamp.r}px,${lamp.y - lamp.r}px,0)`
        for (const b of bodies) renderBody(b)
      }
      function renderBody(b) {
        const E = b.enter, L = b.hov + (1 - E) * 0.9, Lc = Math.max(0, L), f = S.fill
        let x = b.x, y = b.y, sc = 1 + 0.07 * (b.hov + (1 - E) * 0.5), ang = b.a * (1 - 0.85 * b.hov), op = clamp(E * 2.2, 0, 1), so = 1
        if (leaving) {
          if (b === leaveB) { x = lerp(x, W / 2, f); y = lerp(y, H / 2, f); sc = lerp(sc, Math.max(W / b.w, H / b.h) * 1.1, f); ang *= 1 - f; so = 1 - f } else op *= 1 - f
        }
        b.el.style.transform = `translate(${x}px,${y}px)`
        b.body.style.transform = `rotate(${ang}rad) scale(${sc})`
        b.body.style.opacity = op
        const dx = x - lamp.x, dy = y - lamp.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, N = b.N
        const k1 = 0.32 * N * (1 + Lc * 0.4), k2 = N * (1 + 2.8 * Lc) * (0.8 + Math.min(d / 900, 0.7))
        b.sh1.style.transform = `translate(${ux * k1}px,${uy * k1}px) rotate(${ang}rad) scale(${sc})`
        b.sh1.style.opacity = (0.72 / (1 + 1.3 * Lc)) * op * so
        b.sh2.style.transform = `translate(${ux * k2}px,${uy * k2}px) rotate(${ang}rad) scale(${sc * (1 + 0.05 * Lc)})`
        b.sh2.style.opacity = (0.34 + 0.1 * Lc) * op * so
        if (b.lastDim !== b.dimv) { b.dim.style.opacity = b.dimv; b.lastDim = b.dimv }
        if (b.canv.length) {
          const live = b.hov > 0.02 || performance.now() < prevUntil
          if (live) for (const c of b.canv) c.g.drawImage(ctx.previews[c.k], 0, 0, c.w, c.h)
          const o = String(0.28 + 0.72 * clamp(b.hov, 0, 1)); if (b.pop !== o) { b.pop = o; for (const c of b.canv) c.el.style.opacity = o }
        }
      }
      function tick(_t, ms) {
        const dt = Math.min((ms || 16.7) / 1000, 1 / 30)
        physics(dt); render(dt)
      }
      const start = () => { if (!ticking) { ticking = true; last.ok = false; gs.ticker.add(tick) } }
      const stop = () => { gs.ticker.remove(tick); ticking = false }

      // ---- states: open, close, leave ------------------------------------------------------------------------------------
      function resetBodies() {
        for (const b of bodies) { b.x = b.hx; b.y = b.hy; b.a = b.ha; b.vx = b.vy = b.va = 0; b.hov = 0; b.enter = 0; b.dimv = 0.22; b.lastDim = -1; b.el.style.zIndex = ''; b.body.style.willChange = '' }
      }
      function toClosed() {
        if (fadeTw) { fadeTw.kill(); fadeTw = null }
        gs.killTweensOf(S); bodies.forEach((b) => gs.killTweensOf(b))
        S.mon = 0; S.fill = 0; S.tilt = 1; leaving = false; leaveB = null; isOpen = false
        ptrB = focB = hoverB = null; down = drag = null
        root.classList.remove('lv'); root.style.visibility = 'hidden'; root.style.opacity = ''
        page.style.transform = ''; page.style.transformOrigin = ''
        resetBodies(); stop()
      }
      function open() {
        if (disposed) return
        if (leaving) toClosed()
        const fresh = root.style.visibility !== 'visible'
        isOpen = true
        if (fresh) { layout(); resetBodies(); root.style.visibility = 'visible'; S.mon = 0; S.tilt = 1 }
        page.style.transformOrigin = '50% 100%'
        prevUntil = performance.now() + 1500
        start()
        gs.to(S, { mon: 1, tilt: 1, duration: 1.05, ease: 'power4.out', overwrite: 'auto' })
        bodies.forEach((b, i) => gs.to(b, { enter: 1, duration: 0.95, ease: 'back.out(1.3)', delay: 0.1 + i * 0.07, overwrite: 'auto' }))
      }
      function close() {
        if (disposed || leaving || !isOpen) return
        isOpen = false; ptrB = focB = null; down = drag = null; refreshHover()
        gs.to(S, { mon: 0, duration: 0.82, ease: 'power3.inOut', overwrite: 'auto', onComplete: () => { if (!isOpen && !leaving) toClosed() } })
        gs.to(bodies, { enter: 0, duration: 0.8, ease: 'power2.in', stagger: 0.03, overwrite: 'auto' })
      }
      function go(b) {
        if (leaving || disposed) return
        leaving = true; leaveB = b; down = drag = null; root.classList.add('lv')
        b.el.style.zIndex = 999; b.body.style.willChange = 'auto' // re-raster as it grows, so the word stays sharp
        gs.killTweensOf(S)
        const tl = gs.timeline({ onComplete: finish })
        tl.to(S, { tilt: 0, mon: 1, duration: 0.78, ease: 'power3.inOut' }, 0)
          .to(S, { fill: 1, duration: 0.78, ease: 'power3.inOut' }, 0)
          .to(b, { hov: 1, dimv: 0.35, duration: 0.78, ease: 'power2.out' }, 0)
        for (const o of bodies) if (o !== b) gs.to(o, { dimv: 0.7, duration: 0.5, overwrite: 'auto' })
        prevUntil = performance.now() + 1200
      }
      function finish() {
        page.style.transform = '' // hidden behind the picked face for the moment it takes the shell to swap pages
        ctx.arrive(leaveB.link)
        fadeTw = gs.to(root, { opacity: 0, duration: 0.28, ease: 'power1.out', onComplete: toClosed })
      }

      addEventListener('resize', onResize)
      function onResize() { if (disposed) return; layout(); if (!isOpen && !leaving) resetBodies() }
      layout()

      return {
        open, close,
        dispose() {
          disposed = true
          removeEventListener('resize', onResize); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp)
          if (fadeTw) fadeTw.kill()
          gs.killTweensOf(S); bodies.forEach((b) => gs.killTweensOf(b)); stop()
          page.style.transform = ''; page.style.transformOrigin = ''; page.style.willChange = ''
          root.remove()
        },
      }
    },
  })
})()
