// THROWAWAY prototype, menu 3 "Lean Back". Opening the menu = leaning back from the screen. The page shrinks (live) into the centre
// monitor of his desk, the room appears around it: left monitor = Işler, right monitor = Galeri, tablet = Hakkimda, sticky note on the
// centre bezel = Gizlilik. CSS 3D only. The page is under the stage, so the page transform and the stage elements share ONE transform
// chain (same perspective, same parallax, same placement) and the centre bezel is a ring with a transparent hole over the page.
// FAKE: the previews (the shell's grey loops), the glow and the reflections (flat gradient decals on the desk, not a mirror).
;(() => {
  'use strict'
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const lerp = (a, b, t) => a + (b - a) * t
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
  const div = (cls, parent, css, tag) => {
    const e = document.createElement(tag || 'div')
    if (cls) e.className = cls
    if (css) e.style.cssText = css
    if (parent) parent.append(e)
    return e
  }
  // a box centred on its parent's centre: transforms (gsap x/y/z) then move it from the view centre
  const box = (cls, parent, w, h) => div(cls, parent, `width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px`)
  const fit = (label, w, h, cap) => Math.round(Math.min(w * cap, (w * 0.86) / (label.length * 0.42), h * 0.7))

  const CSS = `
.lb{position:absolute;inset:0;visibility:hidden;pointer-events:none;color:#ededed}
.lb div,.lb a,.lb span,.lb canvas{box-sizing:border-box}
.lb .d3{position:absolute;inset:0;transform-style:preserve-3d;will-change:transform}
.lb .p3{position:absolute;left:50%;top:50%;transform-style:preserve-3d;will-change:transform}
.lb .a{position:absolute}
.lb .bd{border-radius:11px;background:linear-gradient(160deg,#181818,#090909);box-shadow:inset 0 0 0 1px #2c2c2c,inset 0 1px 0 rgba(255,255,255,.08),0 26px 40px -18px #000}
.lb .tab .bd{border-radius:20px}
.lb .scr{position:absolute;display:block;overflow:hidden;border-radius:4px;background:#050505;color:#ededed;pointer-events:auto;cursor:pointer;transform:translateZ(1px);-webkit-tap-highlight-color:transparent;outline:none}
.lb .scr:focus-visible{outline:2px solid #ededed;outline-offset:-8px}
.lb .lp{position:absolute;inset:0;opacity:.28}
.lb .lp canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.lb .w{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-weight:400;line-height:1;letter-spacing:-.01em;text-shadow:0 0 .5em rgba(0,0,0,.85);white-space:nowrap}
.lb .n{position:absolute;left:12px;top:9px;opacity:.55}
.lb .gl{position:absolute;inset:0;background:linear-gradient(125deg,rgba(255,255,255,.08),transparent 40%);pointer-events:none}
.lb .dm{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none}
.lb .neck{background:linear-gradient(90deg,#070707,#232323 45%,#0a0a0a)}
.lb .base{border-radius:50%;background:radial-gradient(ellipse at 50% 40%,#242424,#0b0b0b 72%);box-shadow:0 0 0 1px #2a2a2a}
.lb .csh{border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.95),rgba(0,0,0,0) 68%)}
.lb .refl{border-radius:10px;background:linear-gradient(180deg,rgba(237,237,237,.2),rgba(237,237,237,0) 88%)}
.lb .pool{border-radius:50%;background:radial-gradient(ellipse,rgba(237,237,237,.2),rgba(237,237,237,.06) 45%,rgba(237,237,237,0) 70%)}
.lb .desk{background:radial-gradient(ellipse 55% 100% at 50% 0,rgba(237,237,237,.07),rgba(237,237,237,0) 70%),linear-gradient(180deg,#000 0%,#0d0d0d 22%,#181818 62%,#0f0f0f 100%);-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 28%);mask-image:linear-gradient(180deg,transparent 0,#000 28%)}
.lb .cv{opacity:var(--v,0)}
.lb .ring{border-style:solid;border-color:#0b0b0b;border-radius:13px;box-shadow:0 0 0 1px #262626,inset 0 0 0 1px #202020,0 0 80px 8px rgba(237,237,237,.09),0 30px 50px -20px #000}
.lb .hole{overflow:hidden;border-radius:4px}
.lb .chit{position:absolute;inset:0;cursor:pointer;pointer-events:auto}
.lb .nt{border-radius:3px;background:linear-gradient(165deg,#dcdcdc,#bcbcbc);box-shadow:0 10px 22px -6px rgba(0,0,0,.8),inset 0 -14px 20px -12px rgba(0,0,0,.25);color:#0a0a0a;padding:14px 14px 10px;display:flex;flex-direction:column;justify-content:space-between;pointer-events:none}
.lb .nt a{font:400 30px/1 var(--serif);color:#0a0a0a;pointer-events:auto;outline:none;cursor:pointer}
.lb .nt a::after{content:'';position:absolute;inset:0;pointer-events:auto}
.lb .nt .m{color:#2a2a2a;font-size:9px;position:relative}
.lb .nt:has(a:focus-visible){outline:2px solid #ededed;outline-offset:5px}
.lb .lamp{background:linear-gradient(90deg,#0a0a0a,#262626 50%,#0a0a0a)}
.lb .hood{background:linear-gradient(180deg,#242424,#0a0a0a);clip-path:polygon(28% 0,72% 0,100% 100%,0 100%)}
.lb .cone{clip-path:polygon(62% 0,82% 0,100% 100%,0 100%);background:linear-gradient(180deg,rgba(237,237,237,.13),rgba(237,237,237,0))}
`

  MENU3.register({
    name: 'Lean Back',
    create(ctx) {
      const { stage, page, links, legal, copyright, previews, pointer, touch } = ctx
      const styleEl = div('', null, '', 'style')
      styleEl.textContent = CSS
      stage.append(styleEl)
      const root = div('lb', stage)

      // want: the visitor's last wish (open or closed); leaving: the push into a link is running
      const S = { want: false, leaving: false, hv: -1, tOpen: 0, ticking: false, n: 0 }
      const cm = { L: 0, T: 0, out: 0, fade: 0 } // the centre monitor: L lean 0..1 (overshoots), T tilt, out/fade for the leave
      const par = { ax: 0, ay: 0, k: 1 }
      let W = 0, H = 0, P = 0, portrait = false, C = null
      let d3, frame, hole, cdim, items = [], room = [], tls = [], fadeT = null
      let rz = 0 // the lamp pool

      const killTLs = () => { tls.forEach((t) => t.kill()); tls = [] }

      // ---------------------------------------------------------------- the things (monitors, tablet, note)
      function thing(o) {
        const bw = o.w + 2 * o.b, bh = o.h + 2 * o.b
        const it = { o, i: o.i, bw, bh, fx: [], dec: [], g: null }
        const reg = (el, base, dec) => { el._o = base == null ? 1 : base; it.fx.push(el); if (dec) it.dec.push(el); return el }
        it.pos = box('p3', d3, bw, bh)
        it.rot = box('p3', it.pos, bw, bh)
        it.hov = box('p3', it.rot, bw, bh)
        const dl = bh / 2 + (C.D - o.y) // the desk line, measured from the top of the box
        if (!portrait) {
          it.pool = reg(div('a pool', it.pos, `left:${bw / 2 - o.pw / 2}px;top:${dl - 2 - o.pd / 2}px;width:${o.pw}px;height:${o.pd}px;transform:translateZ(${o.pz}px) rotateX(90deg)`), 0.6, true)
        }
        if (o.kind === 'mon' && !portrait) {
          const neck = dl - bh
          reg(div('a neck', it.hov, `left:${bw / 2 - 13}px;top:${bh - 6}px;width:26px;height:${neck + 6}px;transform:translateZ(-12px)`), 1, true)
          reg(div('a csh', it.hov, `left:${bw / 2 - 150}px;top:${dl - 3 - 80}px;width:300px;height:160px;transform:rotateX(90deg)`), 1, true)
          reg(div('a base', it.hov, `left:${bw / 2 - 80}px;top:${dl - 2 - 45}px;width:160px;height:90px;transform:rotateX(90deg)`), 1, true)
          it.refl = reg(div('a refl', it.hov, `left:${bw * 0.03}px;top:${dl - 2}px;width:${bw * 0.94}px;height:${bh * 0.9}px;transform:translateZ(${bh * 0.45}px) rotateX(90deg)`), 0.5, true)
        }
        if (o.kind === 'note') {
          const nt = reg(div('a nt', it.hov, `left:0;top:0;width:${bw}px;height:${bh}px`))
          const a = div('', nt, '', 'a')
          a.href = o.link.href
          a.textContent = o.link.label
          const cp = div('m', nt)
          cp.textContent = copyright
          it.dm = div('dm', nt)
          it.a = a
        } else {
          reg(div('a bd', it.hov, 'inset:0'))
          const a = div('scr', it.hov, `left:${o.b}px;top:${o.b}px;width:${o.w}px;height:${o.h}px`, 'a')
          a.href = o.link.href
          reg(a)
          const lp = div('lp', a)
          it.cv = [0, 1].map(() => { const c = div('', lp, '', 'canvas'); c.width = 256; c.height = 144; return c })
          it.g = it.cv.map((c) => c.getContext('2d'))
          div('gl', a)
          const w = div('w', a, `font-size:${fit(o.link.label, o.w, o.h, 0.3)}px${o.kind === 'tab' ? ';transform:scaleY(1.45)' : ''}`)
          w.textContent = o.link.label
          const n = div('n m', a)
          n.textContent = '0' + (o.i + 1)
          it.dm = div('dm', a)
          it.lp = lp
          it.w = w
          it.a = a
          if (o.kind === 'tab') it.pos.classList.add('tab')
        }
        gsap.set([it.rot, it.hov], { transformOrigin: o.origin })
        return it
      }

      // ---------------------------------------------------------------- build (also on resize)
      function build() {
        W = innerWidth; H = innerHeight
        portrait = H > W * 1.05
        P = Math.round(1.15 * Math.max(W, H))
        root.replaceChildren()
        items = []; room = []; rz = 0
        root.style.perspective = P + 'px'
        d3 = div('d3', root)
        const b = portrait ? 8 : Math.max(8, Math.round(W * 0.0075))
        const rad = Math.PI / 180
        const spec = []
        if (!portrait) {
          const cmW = 0.34 * W, cmH = (cmW * H) / W, cmY = -0.22 * H, neckC = 0.13 * H
          const D = cmY + cmH / 2 + b + neckC
          const sW = 0.25 * W, sH = (sW * H) / W, sY = cmY + 0.03 * H
          const tW = 0.26 * W, tH = tW * 0.62, tRx = 66
          const tY = D - Math.cos(tRx * rad) * (tH + 2 * b) / 2 - 4
          C = { D, b, cmW, cmH, cmY, kF: cmW / W, rx: 4.5, visH: cmH, neck: neckC, crop: 0 }
          const side = (i, sg) => ({ kind: 'mon', i, link: links[i], w: sW, h: sH, b, x: sg * 0.315 * W, y: sY, z: -60, D, pw: sW * 1.5, pd: 460, pz: 230,
            origin: `50% ${sH / 2 + b + D - sY}px`,
            c: { x: sg * 0.1 * W, y: sY, z: -330 }, n: { x: sg * 0.315 * W, y: sY, z: -60 },
            cr: { rotationY: sg * -82 }, nr: { rotationY: sg * -24 }, t: 0.62 + (sg > 0 ? 0.1 : 0), ease: 'back.out(1.7)',
            on: { rotationY: sg * 18, z: 120, y: -8, scale: 1.07 }, off: { rotationY: 0, z: 0, y: 0, scale: 1 } })
          spec.push(side(0, -1), side(1, 1))
          spec.push({ kind: 'tab', i: 2, link: links[2], w: tW, h: tH, b, x: -0.06 * W, y: tY, z: 250, D, pw: tW * 1.5, pd: 380, pz: 170,
            origin: '50% 100%',
            c: { x: -0.06 * W, y: tY + 420, z: 520 }, n: { x: -0.06 * W, y: tY, z: 250 },
            cr: { rotationX: 88 }, nr: { rotationX: tRx }, t: 0.88, ease: 'back.out(1.5)',
            on: { rotationX: -26, y: -26, z: 80, scale: 1.06 }, off: { rotationX: 0, y: 0, z: 0, scale: 1 } })
          const nw = 150, nh = 112
          spec.push({ kind: 'note', i: 3, link: legal, w: nw - 2, h: nh - 2, b: 1, x: cmW / 2 - 66, y: cmY + cmH / 2 + b - 4, z: 14, D, pw: 0, pd: 0, pz: 0,
            origin: '50% 0%',
            c: { x: cmW / 2 - 66, y: cmY + cmH / 2 + b - 4, z: 14, scale: 0 }, n: { x: cmW / 2 - 66, y: cmY + cmH / 2 + b - 4, z: 14, scale: 1 },
            cr: { rotationZ: 30 }, nr: { rotationZ: -5 }, t: 1.2, ease: 'back.out(2.2)',
            on: { rotationX: -22, z: 40, scale: 1.12 }, off: { rotationX: 0, z: 0, scale: 1 } })
        } else {
          const cmW = 0.5 * W, visH = cmW * 0.62
          const cmY = 138 + visH / 2 - H / 2
          C = { D: 0, b, cmW, cmH: visH, cmY, kF: cmW / W, rx: 0, visH, neck: 0, crop: 1 }
          const sw = 0.86 * W
          const slab = (kind, i, link, h, yv, ry) => ({ kind, i, link, w: sw, h, b, x: 0, y: yv - H / 2, z: 0, D: 0, pw: 0, pd: 0, pz: 0,
            origin: '50% 50%',
            c: { x: 0, y: yv - H / 2 + 300, z: -260 }, n: { x: 0, y: yv - H / 2, z: 0 },
            cr: { rotationX: 78, rotationY: 0 }, nr: { rotationX: 14, rotationY: ry }, t: 0.6 + i * 0.12, ease: 'back.out(1.5)',
            on: { rotationX: -14, rotationY: -ry, z: 70, scale: 1.04 }, off: { rotationX: 0, rotationY: 0, z: 0, scale: 1 } })
          spec.push(slab('mon', 0, links[0], 96, 346, 3), slab('mon', 1, links[1], 96, 478, -3), slab('tab', 2, links[2], 110, 618, 2))
          spec.push({ kind: 'note', i: 3, link: legal, w: 168, h: 82, b: 1, x: 0.17 * W, y: 742 - H / 2, z: 14, D: 0, pw: 0, pd: 0, pz: 0,
            origin: '50% 0%',
            c: { x: 0.17 * W, y: 742 - H / 2, z: 14, scale: 0 }, n: { x: 0.17 * W, y: 742 - H / 2, z: 14, scale: 1 },
            cr: { rotationZ: 30 }, nr: { rotationZ: -4 }, t: 1.1, ease: 'back.out(2.2)',
            on: { rotationX: -22, z: 40, scale: 1.1 }, off: { rotationX: 0, z: 0, scale: 1 } })
        }

        // the room: desk, lamp (landscape only), then the centre monitor frame, then the things (tab order: İşler, Galeri, Hakkımda, Gizlilik)
        if (!portrait) {
          const dk = div('a desk', d3, `left:50%;top:50%;width:3000px;height:1900px;margin:-950px 0 0 -1500px;transform:translate3d(0,${C.D}px,450px) rotateX(90deg)`)
          dk._o = 1; room.push(dk)
          const lx = 0.44 * W, lz = -210
          const lamp = div('p3', d3, `transform:translate3d(${lx}px,${C.D}px,${lz}px)`)
          const lf = (cls, css, o) => { const e = div('a ' + cls, lamp, css); e._o = o == null ? 1 : o; room.push(e); return e }
          lf('csh', 'left:-90px;top:-70px;width:180px;height:140px;transform:rotateX(90deg)')
          lf('base lamp', 'left:-50px;top:-47px;width:100px;height:90px;transform:rotateX(90deg)')
          lf('lamp', 'left:-3px;top:-200px;width:6px;height:200px;transform-origin:50% 100%;transform:rotate(-8deg)')
          lf('lamp', 'left:-31px;top:-388px;width:6px;height:190px;transform-origin:50% 100%;transform:rotate(-58deg)')
          lf('hood', 'left:-247px;top:-326px;width:116px;height:70px;transform:rotate(32deg)')
          lf('cone', 'left:-420px;top:-292px;width:330px;height:292px')
          rz = lf('pool', 'left:-560px;top:-183px;width:620px;height:360px;transform:translateZ(250px) rotateX(90deg)', 1)
        }
        // centre monitor frame: a ring with a transparent hole, sized for its final spot; transform comes from tick()
        const cw = C.cmW + 2 * b, ch = C.cmH + 2 * b
        frame = box('p3', d3, cw, ch)
        div('a ring cv', frame, `inset:0;border-width:${b}px`)
        hole = div('a hole cv', frame, `left:${b}px;top:${b}px;width:${C.cmW}px;height:${C.cmH}px`)
        div('gl', hole)
        cdim = div('dm', hole)
        const chit = div('chit', hole)
        chit.addEventListener('click', () => { if (!S.leaving) ctx.button.click() })
        chit.addEventListener('pointerenter', () => ctx.cursor.hover(true))
        chit.addEventListener('pointerleave', () => ctx.cursor.hover(false))
        if (!portrait) {
          div('a neck cv', frame, `left:${cw / 2 - 13}px;top:${ch - 6}px;width:26px;height:${C.neck + 6}px;transform:translateZ(-12px)`)
          div('a csh cv', frame, `left:${cw / 2 - 170}px;top:${ch + C.neck - 3 - 90}px;width:340px;height:180px;transform:rotateX(90deg)`)
          div('a base cv', frame, `left:${cw / 2 - 90}px;top:${ch + C.neck - 2 - 50}px;width:180px;height:100px;transform:rotateX(90deg)`)
          div('a refl cv', frame, `left:${cw * 0.03}px;top:${ch + C.neck - 2}px;width:${cw * 0.94}px;height:${ch * 0.9}px;transform:translateZ(${ch * 0.45}px) rotateX(90deg);--o:.5`).style.opacity = 'calc(var(--v,0) * .5)'
          div('a pool cv', frame, `left:${cw / 2 - cw * 0.8}px;top:${ch + C.neck - 2 - 240}px;width:${cw * 1.6}px;height:480px;transform:translateZ(240px) rotateX(90deg)`).style.opacity = 'calc(var(--v,0) * .6)'
        }
        spec.forEach((o) => items.push(thing(o)))
        items.forEach((it) => hook(it))
        setClosed()
      }

      // ---------------------------------------------------------------- states
      function setClosed() {
        cm.L = 0; cm.T = 0; cm.out = 0; cm.fade = 0
        S.hv = -1
        items.forEach((it) => {
          gsap.set(it.pos, Object.assign({ scale: 1, scaleX: 1, scaleY: 1, rotation: 0 }, it.o.c))
          gsap.set(it.rot, Object.assign({ rotationX: 0, rotationY: 0, rotationZ: 0 }, it.o.cr))
          gsap.set(it.hov, { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, scale: 1 })
          gsap.set(it.fx, { opacity: 0 })
          if (it.dm) gsap.set(it.dm, { opacity: 0 })
          if (it.lp) gsap.set(it.lp, { opacity: 0.28 })
          if (it.w) gsap.set(it.w, { scaleX: 1, scaleY: it.o.kind === 'tab' ? 1.45 : 1 })
          if (it.a && it.o.kind !== 'note') gsap.set(it.a, { backgroundColor: '#050505' })
        })
        gsap.set(room, { opacity: 0 })
        gsap.set(cdim, { opacity: 0 })
      }

      function focus(i, force) {
        if (S.hv === i && !force) return
        S.hv = i
        items.forEach((it) => {
          const on = it.i === i, other = i >= 0 && !on
          gsap.to(it.hov, Object.assign({ duration: on ? 0.8 : 0.9, ease: on ? 'back.out(1.4)' : 'power3.out', overwrite: 'auto' }, on ? it.o.on : it.o.off))
          if (it.dm) gsap.to(it.dm, { opacity: other ? 0.6 : 0, duration: 0.5, overwrite: 'auto' })
          if (it.lp) gsap.to(it.lp, { opacity: on ? 0.95 : 0.28, duration: 0.6, overwrite: 'auto' })
          if (it.pool) gsap.to(it.pool, { opacity: on ? 1 : other ? 0.2 : 0.6, duration: 0.7, overwrite: 'auto' })
          if (it.refl) gsap.to(it.refl, { opacity: on ? 1 : other ? 0.2 : 0.5, duration: 0.7, overwrite: 'auto' })
        })
        gsap.to(cdim, { opacity: i >= 0 ? 0.55 : 0, duration: 0.6, overwrite: 'auto' })
      }

      function hook(it) {
        const a = it.a
        const over = () => { if (!S.leaving) focus(it.i) }
        const out = () => { if (S.hv === it.i && !S.leaving) focus(-1) }
        a.addEventListener('pointerenter', over)
        a.addEventListener('pointerleave', out)
        a.addEventListener('focusin', () => { if (performance.now() - S.tOpen > 1400) over() })
        a.addEventListener('focusout', out)
        a.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') over() })
        a.addEventListener('pointercancel', out)
        a.addEventListener('click', (e) => {
          e.preventDefault()
          if (S.leaving || !S.want) return
          leave(it)
        })
      }

      // ---------------------------------------------------------------- the one loop
      function tick(time, dtMs) {
        const dt = Math.min((dtMs || 16) / 1000, 0.05)
        // parallax: the whole desk turns a few degrees around the centre; depth does the rest
        const tx = touch && !pointer.down ? 0 : pointer.x / W - 0.5
        const ty = touch && !pointer.down ? 0 : pointer.y / H - 0.5
        const f = Math.min(1, dt * 5)
        par.ay += (tx * 7 + Math.sin(time * 0.35) * 0.5 - par.ay) * f
        par.ax += (-ty * 4.5 + Math.cos(time * 0.3) * 0.3 - par.ax) * f
        const pk = clamp(cm.L * 1.2, 0, 1) * par.k
        const ax = par.ax * pk, ay = par.ay * pk
        d3.style.transform = `rotateX(${ax.toFixed(3)}deg) rotateY(${ay.toFixed(3)}deg)`
        // the centre monitor: the page and its frame follow the same chain
        const L = cm.L, k = lerp(1, C.kF, L)
        const fr = C.crop ? lerp(1, C.visH / (H * C.kF), L) : 1 // visible fraction of the page height (portrait crops it)
        const y = L * C.cmY + (H * k / 2) * (1 - fr) * (C.crop ? 1 : 0)
        const z = cm.out
        const rx = cm.T * C.rx
        const chain = `translate3d(0,${y.toFixed(2)}px,${z.toFixed(2)}px) rotateX(${rx.toFixed(3)}deg) scale(${k.toFixed(5)})`
        page.style.transform = `perspective(${P}px) rotateX(${ax.toFixed(3)}deg) rotateY(${ay.toFixed(3)}deg) ${chain}`
        page.style.clipPath = `inset(0% 0% ${((1 - fr) * 100).toFixed(2)}% 0% round ${(L * 5 / k).toFixed(2)}px)`
        page.style.opacity = String(1 - cm.fade)
        const kr = k / C.kF
        frame.style.transform = `translate3d(0,${(L * C.cmY).toFixed(2)}px,${z.toFixed(2)}px) rotateX(${rx.toFixed(3)}deg) scale(${kr.toFixed(5)},${(C.crop ? kr * fr / (C.visH / (H * C.kF)) : kr).toFixed(5)})`
        frame.style.setProperty('--v', (sm(0.5, 0.92, L) * (1 - cm.fade)).toFixed(3))
        // previews: copy the shell's loops into the small canvases, crossfade the pair
        if ((S.n++ & 1) === 0) {
          for (const it of items) {
            if (!it.g) continue
            it.g[0].drawImage(previews[2 * it.i], 0, 0, 256, 144)
            it.g[1].drawImage(previews[2 * it.i + 1], 0, 0, 256, 144)
          }
        }
        for (const it of items) if (it.cv) it.cv[1].style.opacity = (0.5 + 0.5 * Math.sin(time * 0.9 + it.i * 2.1)).toFixed(3)
      }
      const startTick = () => { if (!S.ticking) { S.ticking = true; gsap.ticker.add(tick) } page.style.willChange = 'transform' }
      const stopTick = () => { if (S.ticking) { S.ticking = false; gsap.ticker.remove(tick) } }
      function restorePage() {
        page.style.transform = ''; page.style.clipPath = ''; page.style.opacity = ''; page.style.willChange = ''
      }
      function show() { if (fadeT) { fadeT.kill(); fadeT = null; setClosed() } root.style.visibility = 'visible'; root.style.opacity = '' }
      function finishClosed() {
        if (S.want) return
        root.style.visibility = 'hidden'
        stopTick(); restorePage(); setClosed()
      }

      // ---------------------------------------------------------------- open / close / leave
      function open(instant) {
        S.want = true
        if (S.leaving) return
        killTLs(); show(); startTick()
        S.tOpen = performance.now()
        const tl = gsap.timeline()
        tls.push(tl)
        tl.to(cm, { L: 1, duration: 1.3, ease: 'back.out(1.5)' }, 0) // the lean back overshoots and settles
          .to(cm, { T: 1, duration: 1.2, ease: 'back.out(2.4)' }, 0.12)
          .to(par, { k: 1, duration: 0.1 }, 0)
          .to(room.filter((e) => e.classList.contains('desk')), { opacity: 1, duration: 0.9, ease: 'power2.out' }, 0.3)
        items.forEach((it) => {
          const o = it.o, t = o.t
          tl.to(it.pos, Object.assign({ duration: o.kind === 'note' ? 0.6 : 1.0, ease: o.kind === 'mon' ? 'power3.out' : o.ease }, o.n), t)
          tl.to(it.rot, Object.assign({ duration: 1.15, ease: o.ease }, o.nr), t)
          tl.to(it.fx, { opacity: (i, el) => el._o, duration: 0.45, ease: 'power1.out' }, t)
        })
        const lampFx = room.filter((e) => !e.classList.contains('desk') && e !== rz)
        tl.to(lampFx, { opacity: 1, duration: 0.7 }, 1.0)
        if (rz) tl.to(rz, { opacity: 1, duration: 1.3, ease: 'power1.inOut' }, 1.35) // the lamp pool fades up last
        if (instant) tl.progress(1)
      }

      function close() {
        S.want = false
        if (S.leaving) return
        killTLs(); startTick()
        focus(-1, true)
        const tl = gsap.timeline({ onComplete: finishClosed })
        tls.push(tl)
        items.forEach((it, n) => {
          const o = it.o, t = n * 0.05
          tl.to(it.rot, Object.assign({ duration: 0.7, ease: 'power3.in' }, o.cr), t)
          tl.to(it.pos, Object.assign({ duration: 0.7, ease: 'power3.in' }, o.c), t)
          tl.to(it.fx, { opacity: 0, duration: 0.4, ease: 'power1.in' }, t + 0.3)
        })
        tl.to(room, { opacity: 0, duration: 0.5 }, 0)
        tl.to(cm, { T: 0, duration: 0.8, ease: 'power3.inOut' }, 0.2)
        tl.to(cm, { L: 0, duration: 1.0, ease: 'power3.inOut' }, 0.25)
      }

      function leave(it) {
        S.leaving = true
        killTLs(); startTick()
        focus(it.i, true)
        const o = it.o
        const sx = (W / o.w) * 1.04, sy = (H / o.h) * 1.04
        const d = 0.78
        const tl = gsap.timeline({ onComplete: () => finishLeave(it) })
        tls.push(tl)
        // the picked thing flies to the view centre and becomes the screen
        tl.to(it.pos, { x: 0, y: 0, z: 0, scaleX: sx, scaleY: sy, duration: d, ease: 'power4.inOut' }, 0)
          .to(it.rot, { rotationX: 0, rotationY: 0, rotationZ: 0, duration: d * 0.8, ease: 'power3.inOut' }, 0)
          .to(it.hov, { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, scale: 1, duration: d * 0.8, ease: 'power3.inOut', overwrite: true }, 0)
          .to(par, { k: 0, duration: d * 0.9, ease: 'power2.inOut' }, 0)
          .to(it.dec, { opacity: 0, duration: 0.3 }, 0)
          .to(it.dm, { opacity: o.kind === 'note' ? 0.9 : 0, duration: o.kind === 'note' ? d : 0.3 }, 0)
        if (it.lp) tl.to(it.lp, { opacity: 1, duration: d, ease: 'power1.in' }, 0)
        // the word keeps its proportions while the slab stretches to the view's shape
        if (it.w) tl.to(it.w, { scaleX: Math.min(sx, sy) / sx, scaleY: Math.min(sx, sy) / sy, duration: d, ease: 'power3.inOut' }, 0)
        if (o.kind === 'note') tl.to(it.a, { color: '#ededed', duration: d, ease: 'power2.in' }, 0)
        items.forEach((other) => {
          if (other === it) return
          tl.to(other.pos, { z: other.o.n.z + 420, y: '+=50', duration: 0.5, ease: 'power3.in' }, 0)
          tl.to(other.fx, { opacity: 0, duration: 0.3 }, 0.04)
        })
        tl.to(room, { opacity: 0, duration: 0.3 }, 0)
        tl.to(cm, { out: 520, fade: 1, duration: 0.6, ease: 'power3.in' }, 0)
      }

      function finishLeave(it) {
        // the page is hidden behind the filled screen: put it back, swap pages, then let the screen dissolve onto the new page
        stopTick(); restorePage()
        S.leaving = false; S.want = false
        ctx.cursor.hover(false)
        ctx.arrive(it.o.link)
        fadeT = gsap.to(root, { opacity: 0, duration: 0.32, delay: 0.04, ease: 'power1.out', onComplete: () => {
          fadeT = null; root.style.visibility = 'hidden'; root.style.opacity = ''; setClosed()
        } })
      }

      // ---------------------------------------------------------------- resize, dispose
      let rzT = 0
      const onResize = () => {
        clearTimeout(rzT)
        rzT = setTimeout(() => {
          const wasOpen = S.want && !S.leaving
          killTLs(); gsap.killTweensOf(root.querySelectorAll('*'))
          build()
          if (wasOpen) { show(); open(true) } else if (S.ticking && !S.want) { finishClosed() }
        }, 120)
      }
      addEventListener('resize', onResize)

      build()

      return {
        open() { open() },
        close() { close() },
        dispose() {
          clearTimeout(rzT)
          removeEventListener('resize', onResize)
          killTLs(); stopTick()
          if (fadeT) fadeT.kill()
          gsap.killTweensOf([cm, par, page, root])
          gsap.killTweensOf(root.querySelectorAll('*'))
          restorePage()
          ctx.cursor.hover(false)
          root.remove(); styleEl.remove()
        },
      }
    },
  })
})()
