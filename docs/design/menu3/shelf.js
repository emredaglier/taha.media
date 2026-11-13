// THROWAWAY menu prototype 3: Shelf. Contract: docs/design/menu3/CONTRACT.md. CSS 3D only (no WebGL, no canvas 3D).
// Idea: opening the menu puts the page back on the shelf. The live page turns on its vertical axis in perspective and slots into the row
// of external drives as one thin slab (its narrow spine faces you with "Buradasın", a sliver of the live page stays visible on its side
// face). The three links are three big drives with label-maker spines; between them stand thinner filler drives, a box at the end holds
// Gizlilik and the © line. Each drive is a real CSS 3D box (spine, left, right, top, back faces).
// Hand: the pointer running along the row tips each drive it crosses (spring + wobble, LED blink), neighbours lean into each other.
// Hover/focus: the drive slides out toward you and turns to show its screen face (big serif word over its two preview loops), the row
// parts. Press-and-drag pulls it further; release past halfway opens it, before halfway it slides back with a knock that jostles the row.
// Leave: the picked drive's screen comes to the view and fills it, then ctx.arrive(link). Close: the page-drive slides out, turns and
// grows back into the full page. Portrait: two short boards, wider link drives, bigger words.
// FAKE: the filler labels (RAW 2019 ...), the "Buradasın" place label and the place names under it. Everything else is the real menu.
;(() => {
  'use strict'
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const lerp = (a, b, t) => a + (b - a) * t

  const CSS = `
.sf-root{position:absolute;inset:0;overflow:hidden;visibility:hidden;touch-action:none;user-select:none;-webkit-user-select:none;perspective:1600px;perspective-origin:50% 18%}
.sf-lamp{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse 75% 95% at 3% 36%,rgba(237,237,237,.22),rgba(237,237,237,.06) 46%,transparent 74%)}
.sf-world{position:absolute;left:50%;top:50%;width:0;height:0;transform-style:preserve-3d}
.sf-bd{position:absolute;left:0;top:0;width:0;height:0;transform-style:preserve-3d}
.sf-bd i,.sf-bd svg{position:absolute;opacity:var(--wa,1)}
.sf-top{width:3200px;height:640px;left:-1600px;top:-320px;transform:translate3d(0,1.5px,-220px) rotateX(90deg);
  background:radial-gradient(ellipse 38% 85% at 24% 58%,rgba(237,237,237,.18),transparent 70%),repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 2px,transparent 2px 11px),linear-gradient(90deg,#3c3c3c,#282828 38%,#1a1a1a)}
.sf-lip{width:3200px;height:54px;left:-1600px;top:0;transform:translate3d(0,1.5px,90px);background:linear-gradient(180deg,#8f8f8f 0,#8f8f8f 2px,#323232 3px,#1d1d1d 30%,#101010)}
.sf-coil{width:170px;height:110px;left:-85px;top:-55px;border-radius:50%;background:repeating-radial-gradient(ellipse at 50% 50%,#3a3a3a 0 4px,#141414 4px 9px)}
.sf-plant{width:96px;height:176px;left:-48px;top:-176px;fill:#121212;stroke:#3a3a3a;stroke-width:1.2}

.sf-dr{position:absolute;left:0;top:0;width:0;height:0;display:block;transform-style:preserve-3d;will-change:transform;color:inherit;-webkit-tap-highlight-color:transparent;--c1:#262626;--c2:#303030}
.sf-v1{--c1:#333;--c2:#3d3d3d}.sf-v2{--c1:#1c1c1c;--c2:#262626}
.sf-tp,.sf-bx{position:absolute;left:0;top:0;width:0;height:0;transform-style:preserve-3d}
.sf-bx{transform:translateY(calc(var(--h)/-2))}
.sf-f{position:absolute;overflow:hidden;opacity:var(--o,1);backface-visibility:hidden;-webkit-backface-visibility:hidden}
.sf-f::after{content:'';position:absolute;inset:0;background:rgba(0,0,0,var(--dk,0));pointer-events:none}
.sf-sp{width:var(--w);height:var(--h);left:calc(var(--w)/-2);top:calc(var(--h)/-2);transform:translateZ(calc(var(--d)/2));
  background:linear-gradient(180deg,rgba(255,255,255,.07),transparent 28%),linear-gradient(90deg,var(--c2),var(--c1) 45%,#161616)}
.sf-bk{width:var(--w);height:var(--h);left:calc(var(--w)/-2);top:calc(var(--h)/-2);transform:rotateY(180deg) translateZ(calc(var(--d)/2));background:var(--c1)}
.sf-lf{width:var(--d);height:var(--h);left:calc(var(--d)/-2);top:calc(var(--h)/-2);transform:rotateY(-90deg) translateZ(calc(var(--w)/2));
  background:linear-gradient(90deg,#4a4a4a,var(--c2) 12%,var(--c1));box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
.sf-lf.sf-hole{background:transparent;box-shadow:inset 0 0 0 1px rgba(237,237,237,.18)}
.sf-rt{width:var(--d);height:var(--h);left:calc(var(--d)/-2);top:calc(var(--h)/-2);transform:rotateY(90deg) translateZ(calc(var(--w)/2));background:#161616;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.sf-tf{width:var(--w);height:var(--d);left:calc(var(--w)/-2);top:calc(var(--d)/-2);transform:rotateX(90deg) translateZ(calc(var(--h)/2));background:linear-gradient(180deg,#2e2e2e,#555)}
.sf-sh{position:absolute;width:calc(var(--w)*3.4);height:var(--d);left:calc(var(--w)/-2);top:calc(var(--d)/-2);transform:rotateX(90deg);pointer-events:none;opacity:var(--so,1);
  background:linear-gradient(90deg,rgba(0,0,0,.62),rgba(0,0,0,.22) 40%,transparent)}
.sf-led{position:absolute;left:50%;top:calc(var(--h)*.03 + 7px);width:7px;height:7px;margin-left:-3.5px;border-radius:50%;background:#ededed;box-shadow:0 0 9px 2px rgba(237,237,237,.75);opacity:.35}
.sf-lb{position:absolute;left:50%;top:50%;width:var(--lw);height:var(--lh);transform:translate(-50%,-46%);background:#ededed;display:flex;align-items:center;justify-content:center;
  box-shadow:0 2px 5px rgba(0,0,0,.55),inset 0 0 0 1px rgba(0,0,0,.12)}
.sf-lb span{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;font:400 var(--lf)/1 var(--serif);color:#1a1a1a;letter-spacing:-.01em}
.sf-lb small{font:500 .22em/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:#555;margin-bottom:.9em}
.sf-fl{position:absolute;left:50%;top:50%;transform:translate(-50%,-40%);writing-mode:vertical-rl;rotate:180deg;font:500 10px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--mu);white-space:nowrap}
.sf-gz{position:absolute;inset:0;display:flex;align-items:flex-start;padding:14% 10%;font:400 var(--lf)/1 var(--serif);color:#ededed}
.sf-gz:focus-visible{outline:2px solid #ededed;outline-offset:-6px}
.sf-cp{position:absolute;left:10%;right:8%;bottom:9%;font:500 9px/1.35 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--mu);pointer-events:none}
.sf-dr:focus-visible{outline:none}
.sf-dr:focus-visible .sf-sp{outline:2px solid #ededed;outline-offset:-6px}
.sf-rt canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.sf-scrim{position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.78),rgba(0,0,0,.25) 55%,rgba(0,0,0,.35))}
.sf-wd{position:absolute;left:0;right:0;bottom:0;padding:0 7% 5%;font:400 var(--wf)/.95 var(--serif);color:#ededed;letter-spacing:-.015em;text-shadow:0 2px 16px rgba(0,0,0,.7)}
`

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const PLANT = '<svg class="sf-plant" viewBox="0 0 96 176" aria-hidden="true"><path d="M48 128C16 112 6 70 20 22 38 52 46 88 48 128Z"/><path d="M48 128C62 90 70 52 90 30 96 74 74 112 48 128Z"/><path d="M48 128C36 84 40 44 50 6 62 46 58 90 48 128Z"/><path d="M48 128C26 118 8 112 2 86 30 88 44 104 48 128Z"/><path d="M48 128C70 120 88 120 94 96 66 96 52 108 48 128Z"/><path d="M26 128H70L64 174H32Z"/></svg>'
  const PLACE = { room: 'Ev', works: 'İşler', text: 'Hakkımda' } // FAKE place names

  // id, type (f filler, l link, g legal box, p page drive), link index, variant, FAKE spine label, [W,H,D,row,order] landscape, portrait
  const SPEC = [
    ['f1', 'f', -1, 0, 'RAW 2019', [34, 330, 210, 0, 0], [22, 210, 170, 0, 0]],
    ['l0', 'l', 0, 0, '', [150, 500, 320, 0, 1], [98, 250, 190, 0, 1]],
    ['f2', 'f', -1, 1, 'ARŞİV B', [56, 390, 260, 0, 2], [26, 190, 150, 1, 0]],
    ['f3', 'f', -1, 2, '', [30, 300, 200, 0, 3], [20, 160, 130, 1, 1]],
    ['l1', 'l', 1, 0, '', [150, 500, 320, 0, 4], [98, 250, 190, 0, 2]],
    ['f4', 'f', -1, 0, 'PROJE', [44, 360, 250, 0, 5], [30, 200, 160, 1, 2]],
    ['l2', 'l', 2, 0, '', [150, 500, 320, 0, 6], [98, 250, 190, 0, 3]],
    ['f5', 'f', -1, 1, '', [36, 320, 220, 0, 7], [22, 200, 160, 0, 4]],
    ['g', 'g', -1, 2, '', [120, 170, 200, 0, 8], [100, 130, 150, 1, 3]],
    ['pd', 'p', -1, 0, '', [58, 500, 130, 0, 9], [44, 250, 100, 1, 4]],
  ]

  window.MENU3.register({
    name: 'Shelf',
    create(ctx) {
      const { stage, page, links, legal, copyright, previews } = ctx
      const ptr = ctx.pointer
      const style = el('style'); style.textContent = CSS; stage.append(style)
      const root = el('div', 'sf-root'); stage.append(root)
      const lamp = el('div', 'sf-lamp'); const world = el('div', 'sf-world'); root.append(lamp, world)

      // ---- board(s): two in portrait, one in landscape; coil and plant stand on them
      const bds = [0, 1].map(() => { const b = el('div', 'sf-bd', '<i class="sf-top"></i><i class="sf-lip"></i>'); world.append(b); return b })
      const coil = el('i', 'sf-coil'); bds[0].append(coil)
      const plantHost = el('div', '', PLANT); const plant = plantHost.firstChild; bds[0].append(plant)

      // ---- drives
      const items = []
      for (const d of SPEC) {
        const [id, t, li, v, lab] = d
        const link = t === 'l' ? links[li] : t === 'g' ? legal : null
        const dr = el(t === 'l' ? 'a' : 'div', 'sf-dr sf-v' + v)
        if (t === 'l') dr.href = link.href
        if (t === 'f' || t === 'p') dr.setAttribute('aria-hidden', 'true')
        const sh = el('i', 'sf-sh'), tp = el('div', 'sf-tp'), bx = el('div', 'sf-bx')
        const sp = el('i', 'sf-f sf-sp'), lf = el('i', 'sf-f sf-lf' + (t === 'p' ? ' sf-hole' : '')), rt = el('i', 'sf-f sf-rt'), tf = el('i', 'sf-f sf-tf'), bk = el('i', 'sf-f sf-bk')
        const led = el('i', 'sf-led')
        const it = { id, t, li, link, el: dr, sh, sp, lf, rt, led, label: t === 'l' ? link.label : t === 'g' ? link.label : '', hvMax: t === 'g' ? 0.3 : 1, dl: d[5], dp: d[6], cv: null, g: null, small: null, o: -1, so: -1,
          st: { en: 0, hv: 0, pull: 0, lv: 0, lf: 0, sx: 0, lb: 0, ta: 0, tv: 0, la: 0, lw: 0, led: 0 } }
        if (t === 'l') {
          sp.append(el('div', 'sf-lb', `<span>${link.label}</span>`), led)
          const cv = el('canvas'); cv.width = 240; cv.height = 384; it.cv = cv; it.g = cv.getContext('2d')
          rt.append(cv, el('div', 'sf-scrim'), el('div', 'sf-wd', link.label)); rt.lastChild.setAttribute('aria-hidden', 'true')
        } else if (t === 'g') {
          const a = el('a', 'sf-gz', legal.label); a.href = legal.href
          sp.append(a, el('span', 'sf-cp', copyright), led)
          rt.append(el('div', 'sf-wd', legal.label), el('div', 'sf-cp', copyright)); rt.firstChild.setAttribute('aria-hidden', 'true')
        } else if (t === 'p') {
          const lb = el('div', 'sf-lb', '<span>Buradasın <small>İşler</small></span>'); sp.append(lb, led); it.small = lb.querySelector('small')
        } else {
          sp.append(led); if (lab) sp.append(el('span', 'sf-fl', lab))
        }
        bx.append(sp, lf, rt, tf, bk); tp.append(bx); dr.append(sh, tp); world.append(dr)
        it.tp = tp
        items.push(it)
      }
      const byId = (id) => items.find((i) => i.id === id)
      const pd = byId('pd')

      // ---- layout state
      let vw = 1, vh = 1, K = 1, P = 1600, vpY = 0, ZH = 0, ZP = 0, portrait = false
      const floors = [0, 0]
      const pf = { sx: 0.2, sy: 0.5, x: 0, y: 0, ry: -78 } // page slot: fitted onto the page-drive's left face
      const pg = { t: 0 }, wall = { a: 0 }
      let openState = false, leaving = null, hov = null, hoverBy = '', drag = null, raf = 0, last = 0, prevX = ptr.x, suppressUntil = 0, hovTimer = 0, fading = false, pageOn = false, introCalls = []
      let stateTweens = items.map((i) => i.st)

      function layout() {
        vw = stage.clientWidth || innerWidth; vh = stage.clientHeight || innerHeight
        portrait = vh > vw * 1.15
        K = portrait ? Math.min(vw / 390, vh / 844) : Math.min(vw / 1440, vh / 900)
        P = 1600 * K; ZH = 0.34 * P; ZP = 0.16 * P; vpY = vh * (portrait ? 0.08 : 0.18)
        root.style.perspective = P + 'px'; root.style.perspectiveOrigin = `50% ${portrait ? 8 : 18}%`
        floors[0] = portrait ? vh * 0.5 : vh * 0.84; floors[1] = portrait ? vh * 0.9 : vh * 0.84
        const gap = (portrait ? 8 : 16) * K
        const rows = [[], []]
        for (const it of items) { const d = portrait ? it.dp : it.dl; it.W = d[0]; it.H = d[1]; it.D = d[2]; it.row = d[3]; it.ordv = d[4]; rows[it.row].push(it) }
        rows.forEach((r, ri) => {
          r.sort((a, b) => a.ordv - b.ordv)
          let x = -(r.reduce((s, i) => s + i.W * K, 0) + gap * Math.max(0, r.length - 1)) / 2
          r.forEach((it, j) => { it.ord = j; it.mates = r; it.bx = x + (it.W * K) / 2; x += it.W * K + gap; it.floor = floors[ri] })
        })
        for (const it of items) {
          const W = it.W * K, H = it.H * K, D = it.D * K
          const S = Math.max(vw / D, vh / H) * 1.05
          it.zFill = P * (1 - 1 / S) - W / 2
          const s = it.el.style
          s.setProperty('--w', W + 'px'); s.setProperty('--h', H + 'px'); s.setProperty('--d', D + 'px')
          s.setProperty('--dk', clamp(0.02 + 0.42 * (it.bx / vw + 0.5), 0, 0.5))
          const len = it.label.length || 1
          if (it.t === 'l') {
            const lw = W * 0.66, lh = H * 0.8
            s.setProperty('--lw', lw + 'px'); s.setProperty('--lh', lh + 'px'); s.setProperty('--lf', Math.min(W * 0.6, lh / (len * 0.47)) + 'px')
            s.setProperty('--wf', Math.min(D * 0.4, (D * 0.84) / (len * 0.47)) + 'px')
          } else if (it.t === 'g') {
            s.setProperty('--lf', Math.min(W * 0.26, (W * 0.8) / (len * 0.47)) + 'px'); s.setProperty('--wf', Math.min(D * 0.3, (D * 0.84) / (len * 0.47)) + 'px')
          } else if (it.t === 'p') {
            s.setProperty('--lw', W * 0.8 + 'px'); s.setProperty('--lh', H * 0.86 + 'px'); s.setProperty('--lf', Math.min(W * 0.52, (H * 0.5) / (9 * 0.47)) + 'px')
          }
        }
        bds.forEach((b, i) => { b.style.display = i === 1 && !portrait ? 'none' : '' })
        coil.style.transform = `translate3d(${-vw * (portrait ? 0.38 : 0.33)}px,1px,${60 * K}px) rotateX(90deg) scale(${K})`
        plant.style.transform = `translate3d(${vw * (portrait ? 0.4 : 0.41)}px,0,${-150 * K}px) scale(${K * (portrait ? 0.6 : 1.1)})`
        if (portrait) { bds[1].append(coil, plant) } else { bds[0].append(coil, plant) }
        fit()
        render(false)
      }

      // fit the page onto the page-drive's left face (a transparent hole), measured at the rest pose
      function pageTransform(t, sxv) {
        const arc = Math.sin(Math.PI * clamp(t, 0, 1))
        return `translate(${(pf.x + sxv) * t}px,${pf.y * t}px) perspective(${P * 0.9}px) translateZ(${arc * P * 0.1}px) rotateY(${pf.ry * t}deg) scale(${lerp(1, pf.sx, t)},${lerp(1, pf.sy, t)})`
      }
      function fit() {
        render(true)
        const h = pd.lf.getBoundingClientRect()
        if (!h.width || !h.height) return
        pf.sx = 0.2; pf.sy = h.height / vh; pf.x = 0; pf.y = 0
        const keep = page.style.transform
        for (let i = 0; i < 3; i++) {
          page.style.transform = pageTransform(1, 0)
          const r = page.getBoundingClientRect()
          if (!r.width || !r.height) break
          pf.sx *= h.width / r.width; pf.sy *= h.height / r.height
          pf.x += h.left + h.width / 2 - (r.left + r.width / 2); pf.y += h.top + h.height / 2 - (r.top + r.height / 2)
        }
        page.style.transform = keep
      }
      function applyPage() {
        const t = pg.t
        if (t <= 0.0004) { if (pageOn) { page.style.transform = ''; page.style.willChange = ''; pageOn = false } return }
        if (!pageOn) { page.style.willChange = 'transform'; pageOn = true }
        page.style.transform = pageTransform(t, pd.st.sx)
      }

      // ---- render: every drive from its state
      function render(rest) {
        for (const it of items) {
          const s = it.st, W = it.W * K, H = it.H * K, D = it.D * K
          const en = rest ? 1 : s.en, hv = rest ? 0 : s.hv, lv = rest ? 0 : s.lv, pull = rest ? 0 : s.pull
          const tu = Math.max(hv, lv)
          const z = lerp(-D / 2 + hv * ZH + pull * ZP, it.zFill, lv)
          const zf = z + lerp(D / 2, W / 2, clamp(tu, 0, 1))
          const f = P / Math.max(80, P - zf)
          const cy0 = it.floor - H / 2
          const yd = lerp(cy0, vh / 2, clamp(clamp(hv, 0, 1) * 0.85 + lv * 0.15, 0, 1))
          let y = vpY + (yd - vpY) / f + H / 2 - vh / 2
          const x = lerp((it.bx + s.sx) / f, 0, lv)
          if (it.t !== 'p') y += (1 - en) * (H + 140 * K) + (rest ? 0 : s.lf * 30 * K)
          let o = it.t === 'p' ? clamp(pg.t * 1.7 - 0.3, 0, 1) : clamp(en * 2.5, 0, 1)
          if (!rest && it !== leaving) o *= 1 - s.lf
          it.el.style.transform = `translate3d(${x}px,${y}px,${z}px) rotateY(${-90 * tu}deg)`
          const damp = 1 - clamp(tu, 0, 1)
          it.tp.style.transform = `rotateX(${s.ta * damp}deg) rotateZ(${(s.la + s.lb) * damp}deg)`
          if (Math.abs(o - it.o) > 0.004) { it.o = o; it.el.style.setProperty('--o', o) }
          const so = 1 - clamp(tu + pull, 0, 1)
          if (Math.abs(so - it.so) > 0.01) { it.so = so; it.el.style.setProperty('--so', so) }
          it.led.style.opacity = rest ? 0.35 : clamp(0.3 * clamp(en, 0, 1) + 0.7 * s.led + (it.t === 'p' ? 0.5 : 0), 0, 1)
        }
        const a = rest ? 1 : wall.a
        lamp.style.opacity = a
        bds.forEach((b, i) => { b.style.transform = `translate3d(0,${floors[i] - vh / 2 + (1 - a) * 90 * K}px,0)`; b.style.setProperty('--wa', clamp(a * 1.4, 0, 1)) })
      }

      function cover(g, img, dx, dy, dw, dh, drift) {
        const sw = Math.min(480, 270 * (dw / dh)), sh = 270, sx = (480 - sw) / 2 + Math.sin(drift) * (480 - sw) * 0.4
        g.drawImage(img, sx, 0, sw, sh, dx, dy, dw, dh)
      }
      function paint(it, now) {
        const g = it.g, w = it.cv.width, h = it.cv.height, n = now / 1000
        cover(g, previews[2 * it.li], 0, 0, w, h * 0.58, n * 0.5 + it.li)
        cover(g, previews[2 * it.li + 1], 0, h * 0.58 + 3, w, h * 0.42 - 3, -n * 0.45 + it.li)
        g.fillStyle = '#000'; g.fillRect(0, h * 0.58, w, 3)
      }

      // ---- the loop: the hand (pointer along the row), springs, drag, render
      function tick(now) {
        raf = requestAnimationFrame(tick)
        const dt = Math.min(0.033, (now - last) / 1000 || 0.016); last = now
        const dx = ptr.x - prevX, was = prevX; prevX = ptr.x
        if (openState && !leaving && !drag && dx && Math.abs(dx) < vw * 0.4) {
          for (const it of items) {
            if (it.t === 'p' || it.st.hv > 0.2) continue
            const cx = vw / 2 + it.bx + it.st.sx
            if ((was - cx) * (ptr.x - cx) < 0 && ptr.y > it.floor - it.H * K && ptr.y < it.floor + 40 * K) {
              const mag = 26 + Math.min(Math.abs(dx) / dt, 3500) * 0.022
              it.st.tv -= mag; it.st.led = 1
              for (const m of it.mates) { if (m.ord === it.ord - 1) m.st.lw += mag * 0.5; else if (m.ord === it.ord + 1) m.st.lw -= mag * 0.5 }
            }
          }
        }
        if (drag) {
          const d = Math.hypot(ptr.x - drag.x0, ptr.y - drag.y0)
          if (d > 8) drag.moved = true
          if (drag.moved) { const s = drag.it.st; gsap.killTweensOf(s, 'pull'); s.pull += (clamp((d - 8) / (vh * 0.28), 0, 1.15) - s.pull) * Math.min(1, dt * 14) }
        }
        for (const it of items) {
          const s = it.st
          s.tv += (-170 * s.ta - 9 * s.tv) * dt; s.ta = clamp(s.ta + s.tv * dt, -11, 6)
          s.lw += (-120 * s.la - 7 * s.lw) * dt; s.la = clamp(s.la + s.lw * dt, -8, 8)
          s.led *= Math.exp(-5 * dt)
        }
        render(false); applyPage()
        for (const it of items) if (it.cv && (it.st.hv > 0.03 || it.st.lv > 0)) paint(it, now)
      }
      const start = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick) } }
      const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0 }

      // ---- hover: the drive slides out and turns, the row parts around it
      function setHover(it, by) {
        if (leaving) return
        if (it === hov) { if (by) hoverBy = by; return }
        hov = it; hoverBy = it ? by || '' : ''
        applyHover()
      }
      function applyHover() {
        const hi = hov
        for (const it of items) {
          const s = it.st
          let hv = 0, sx = 0, lb = 0
          if (hi && it.row === hi.row) {
            if (it === hi) hv = hi.hvMax
            else { const dir = it.ord < hi.ord ? -1 : 1; sx = dir * hi.hvMax * (((hi.D * K * 1.4 - hi.W * K) / 2) + 14 * K); lb = dir * 3.2 * hi.hvMax }
          }
          const rank = hi ? Math.abs(it.ord - hi.ord) : 0
          const vars = { hv, sx, lb, duration: it === hi ? 0.62 : 0.55, ease: it === hi ? 'back.out(1.25)' : 'power3.out', delay: rank * 0.02, overwrite: 'auto' }
          if (it !== hi) vars.pull = 0
          gsap.to(s, vars)
        }
      }
      function jostle(it, mag) {
        for (const m of it.mates) {
          const d = Math.abs(m.ord - it.ord), v = mag / (1 + d * 1.2)
          m.st.tv -= v; m.st.led = 1
          if (m.ord !== it.ord) m.st.lw += (m.ord < it.ord ? 1 : -1) * v * 0.45
        }
      }
      function knock(it) {
        hov = null; hoverBy = ''; applyHover()
        gsap.to(it.st, { hv: 0, pull: 0, duration: 0.46, ease: 'power3.in', overwrite: 'auto', onComplete: () => jostle(it, 70) })
      }

      // ---- leave: the picked drive's screen fills the view, then the shell swaps the page
      function leave(it) {
        if (leaving || !openState) return
        leaving = it; hov = it; drag = null
        gsap.killTweensOf(stateTweens, 'hv,sx,lb,pull')
        const tl = gsap.timeline({ onComplete: () => finishLeave(it.link) })
        tl.to(it.st, { hv: 1, pull: 0, sx: 0, en: 1, duration: 0.3, ease: 'power2.out' }, 0)
          .to(it.st, { lv: 1, duration: 0.6, ease: 'power3.in' }, 0.16)
          .to(items.filter((i) => i !== it).map((i) => i.st), { lf: 1, duration: 0.4, ease: 'power2.in' }, 0)
      }
      function finishLeave(link) {
        openState = false; gsap.killTweensOf(pg); pg.t = 0; applyPage()
        ctx.arrive(link)
        fading = true
        gsap.to(root, { opacity: 0, duration: 0.22, ease: 'power1.out', onComplete: resetClosed })
      }
      function resetClosed() {
        fading = false; leaving = null; hov = null; hoverBy = ''; drag = null
        gsap.killTweensOf(root); gsap.killTweensOf(stateTweens); gsap.killTweensOf(pg); gsap.killTweensOf(wall)
        for (const c of introCalls) c.kill()
        introCalls = []
        for (const it of items) Object.assign(it.st, { en: 0, hv: 0, pull: 0, lv: 0, lf: 0, sx: 0, lb: 0, ta: 0, tv: 0, la: 0, lw: 0, led: 0 })
        pg.t = 0; wall.a = 0
        root.style.opacity = ''; root.style.visibility = 'hidden'
        render(false); applyPage(); stop()
      }

      // ---- events
      const onClick = (it) => (e) => {
        const a = e.target.closest && e.target.closest('a')
        if (!a || !it.link) return
        e.preventDefault()
        if (performance.now() < suppressUntil) return
        leave(it)
      }
      for (const it of items) {
        const d = it.el
        if (it.link) {
          d.addEventListener('click', onClick(it))
          d.addEventListener('focusin', (e) => { let fv = false; try { fv = e.target.matches(':focus-visible') } catch (err) { fv = true } if (fv) setHover(it, 'key') })
          d.addEventListener('focusout', () => { if (hov === it && hoverBy === 'key') setHover(null) })
          d.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch' && !drag) setHover(it, 'ptr') })
          d.addEventListener('pointerdown', (e) => {
            if (!openState || leaving) return
            drag = { it, x0: e.clientX, y0: e.clientY, moved: false }
            setHover(it, 'ptr')
            try { d.setPointerCapture(e.pointerId) } catch (err) { /* capture is a nicety */ }
          })
        }
      }
      const release = (e) => {
        if (!drag) return
        const { it, moved } = drag; drag = null
        if (!moved) { if (e && e.pointerType === 'touch') { /* the click that follows opens it */ } return }
        suppressUntil = performance.now() + 120
        if (it.st.pull > 0.5) leave(it)
        else { knock(it); if (ctx.touch) setHover(null) }
      }
      const onMove = (e) => {
        const on = e.target.closest && e.target.closest('.sf-dr')
        if (on) { clearTimeout(hovTimer); hovTimer = 0 } else if (hov && hoverBy === 'ptr' && !drag && !hovTimer) hovTimer = setTimeout(() => { hovTimer = 0; if (!drag) setHover(null) }, 220)
      }
      const onLeaveRoot = () => { if (hov && hoverBy === 'ptr' && !drag) setHover(null) }
      addEventListener('pointerup', release); addEventListener('pointercancel', release)
      addEventListener('resize', layout)
      root.addEventListener('pointermove', onMove); root.addEventListener('pointerleave', onLeaveRoot)

      layout()

      return {
        open() {
          if (fading) { gsap.killTweensOf(root); resetClosed() }
          if (openState) return
          openState = true
          if (pd.small) pd.small.textContent = PLACE[ctx.kind()] || ''
          root.style.visibility = 'visible'; root.style.opacity = ''
          layout(); start()
          gsap.to(pg, { t: 1, duration: 1, ease: 'back.out(1.1)', overwrite: 'auto' })
          gsap.to(wall, { a: 1, duration: 0.8, ease: 'power2.out', overwrite: 'auto' })
          gsap.to(stateTweens, { en: 1, duration: 0.85, ease: 'back.out(1.25)', stagger: 0.055, delay: 0.22, overwrite: 'auto' })
          for (const c of introCalls) c.kill()
          introCalls = items.map((it, i) => gsap.delayedCall(0.9 + i * 0.07, () => { it.st.led = 1 })) // LEDs blink on in a run
        },
        close() {
          if (!openState || leaving) return
          openState = false; hov = null; hoverBy = ''; drag = null
          for (const c of introCalls) c.kill()
          applyHover()
          gsap.to(stateTweens, { en: 0, duration: 0.45, ease: 'power2.in', stagger: { each: 0.03, from: 'end' }, overwrite: 'auto' })
          gsap.to(pg, { t: 0, duration: 0.85, delay: 0.12, ease: 'power3.inOut', overwrite: 'auto', onComplete: () => { if (!openState && !leaving) resetClosed() } })
          gsap.to(wall, { a: 0, duration: 0.5, delay: 0.4, ease: 'power1.in', overwrite: 'auto' })
        },
        dispose() {
          stop(); clearTimeout(hovTimer)
          for (const c of introCalls) c.kill()
          gsap.killTweensOf(stateTweens); gsap.killTweensOf(pg); gsap.killTweensOf(wall); gsap.killTweensOf(root)
          removeEventListener('pointerup', release); removeEventListener('pointercancel', release); removeEventListener('resize', layout)
          page.style.transform = ''; page.style.willChange = ''
        },
      }
    },
  })
})()
