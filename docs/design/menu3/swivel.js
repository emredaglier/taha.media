// THROWAWAY prototype, menu 3 "Swivel". Opening the menu = he turns his chair to the right. The page swings away to the left and stays at the
// left edge as the dimmed, live monitor he just turned from; the wall beside the desk swings in with three framed prints hung from nails
// (İşler, Galeri, Hakkımda), a shelf with drives and a plant, and Gizlilik + © as a label on the shelf edge. CSS 3D only.
// One camera: the whole room sits in a group that rotates about the camera (translateZ(P) rotateY translateZ(-P)); the page gets the same
// chain in its own transform, so both stay in step. The frames are real pendulums (tiny spring loop in tick): swivel acceleration, head
// turns and the pointer rushing past push them.
// FAKE: the previews (the shell's grey loops), the wall, shelf, drives, plant, desk (flat CSS shapes).
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
  const box = (cls, parent, w, h) => div(cls, parent, `width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px`)

  const CSS = `
.sw{position:absolute;inset:0;visibility:hidden;pointer-events:none;color:#ededed}
.sw div,.sw a,.sw span,.sw canvas{box-sizing:border-box}
.sw .d3{position:absolute;inset:0;transform-style:preserve-3d;will-change:transform}
.sw .p3{position:absolute;left:50%;top:50%;transform-style:preserve-3d;will-change:transform}
.sw .a{position:absolute}
.sw .wall{background:linear-gradient(90deg,rgba(0,0,0,.92),rgba(0,0,0,0) 5%),radial-gradient(70% 90% at 0% 30%,rgba(237,237,237,.22),rgba(237,237,237,.07) 45%,rgba(237,237,237,0) 80%),linear-gradient(180deg,#121212,#070707)}
.sw .desk{background:linear-gradient(90deg,rgba(237,237,237,.07),rgba(237,237,237,0) 80%),linear-gradient(180deg,#000 0%,#0d0d0d 22%,#181818 65%,#0f0f0f 100%);-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 30%);mask-image:linear-gradient(180deg,transparent 0,#000 30%)}
.sw .cv{opacity:var(--v,0)}
.sw .neck{background:linear-gradient(90deg,#070707,#232323 45%,#0a0a0a)}
.sw .base{border-radius:50%;background:radial-gradient(ellipse at 50% 40%,#242424,#0b0b0b 72%);box-shadow:0 0 0 1px #2a2a2a}
.sw .csh{border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.95),rgba(0,0,0,0) 68%)}
.sw .ring{border-style:solid;border-color:#0b0b0b;border-radius:13px;box-shadow:0 0 0 1px #262626,inset 0 0 0 1px #202020,0 0 60px 4px rgba(237,237,237,.06),0 30px 50px -20px #000}
.sw .hole{overflow:hidden;border-radius:4px}
.sw .chit{position:absolute;inset:0;cursor:pointer;pointer-events:auto}
.sw .gl{position:absolute;inset:0;background:linear-gradient(125deg,rgba(255,255,255,.08),transparent 40%);pointer-events:none}
.sw .dm{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none}
.sw .fa{display:block;border-radius:2px;background:linear-gradient(145deg,#2e2e2e,#0e0e0e);box-shadow:inset 0 0 0 1px #3b3b3b,0 1px 0 #000;pointer-events:auto;cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent;color:#0a0a0a}
.sw .fa:focus-visible{outline:2px solid #ededed;outline-offset:7px}
.sw .mat{position:absolute;background:linear-gradient(180deg,#e2e2e2,#cbcbcb);box-shadow:inset 0 0 0 1px rgba(0,0,0,.3),inset 0 3px 8px rgba(0,0,0,.2)}
.sw .win{position:absolute;overflow:hidden;background:#050505;box-shadow:0 0 0 1px rgba(0,0,0,.5),0 1px 0 rgba(255,255,255,.5)}
.sw .win::after{content:'';position:absolute;inset:0;box-shadow:inset 0 5px 14px rgba(0,0,0,.65);pointer-events:none}
.sw .lp{position:absolute;inset:0;opacity:.5}
.sw .lp canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.sw .wd{position:absolute;display:flex;align-items:center;font-family:var(--serif);font-weight:400;line-height:1;letter-spacing:-.01em;white-space:nowrap;color:#0a0a0a}
.sw .n{position:absolute;color:#2a2a2a}
.sw .lit{position:absolute;inset:0;background:linear-gradient(100deg,rgba(255,255,255,.14),rgba(255,255,255,0) 45%);pointer-events:none}
.sw .fall{position:absolute;inset:0;background:#000;pointer-events:none}
.sw .sh{background:#000;box-shadow:0 0 34px 18px #000;opacity:.62}
.sw .nail{border-radius:50%;background:radial-gradient(circle at 35% 30%,#bbb,#444 60%,#111)}
.sw .board{background:linear-gradient(180deg,#242424,#121212 40%,#0a0a0a);box-shadow:inset 0 1px 0 rgba(237,237,237,.2),inset 0 -1px 0 #000}
.sw .btop{background:linear-gradient(90deg,#303030,#181818 50%,#0d0d0d);box-shadow:inset 0 0 0 1px #2a2a2a}
.sw .dr{border-radius:3px;background:linear-gradient(100deg,#262626,#0e0e0e 62%);box-shadow:inset 0 0 0 1px #2b2b2b,inset 2px 0 0 rgba(237,237,237,.12)}
.sw .dr::before{content:'';position:absolute;left:12%;right:32%;top:16%;height:14%;background:#8f8f8f;opacity:.6}
.sw .dr::after{content:'';position:absolute;right:12%;bottom:14%;width:5px;height:5px;border-radius:50%;background:#ededed;opacity:.7}
.sw .pot{background:linear-gradient(100deg,#222,#0c0c0c);clip-path:polygon(0 0,100% 0,84% 100%,16% 100%)}
.sw .leaf{background:#0c0c0c;border-radius:50% 50% 50% 50%/78% 78% 22% 22%;transform-origin:50% 100%;box-shadow:inset 3px 0 0 rgba(237,237,237,.15)}
.sw .lbl{display:block;background:linear-gradient(165deg,#dcdcdc,#bdbdbd);color:#0a0a0a;font:400 20px/24px var(--serif);text-align:center;border-radius:2px;pointer-events:auto;cursor:pointer;outline:none;overflow:hidden;white-space:nowrap;box-shadow:0 2px 0 rgba(0,0,0,.6)}
.sw .lbl:focus-visible{outline:2px solid #ededed;outline-offset:5px;overflow:visible}
.sw .cp{color:#8f8f8f;font-size:10px;white-space:nowrap}
`

  MENU3.register({
    name: 'Swivel',
    create(ctx) {
      const { stage, page, links, legal, copyright, previews, pointer, touch } = ctx
      const styleEl = div('', null, '', 'style')
      styleEl.textContent = CSS
      stage.append(styleEl)
      const root = div('sw', stage)

      const S = { want: false, leaving: false, hv: -1, tOpen: 0, ticking: false, n: 0 }
      const cm = { L: 0, yaw: 0, fade: 0 } // L: the page monitor shrinks into its spot; yaw: the chair turn in degrees (overshoots)
      const par = { ax: 0, ay: 0, k: 1 }
      let W = 0, H = 0, P = 0, portrait = false, C = null
      let head, cam, frame, cdim, frames = [], lbl = null, room = [], tls = [], fadeT = null
      let prevYaw = 0, prevVel = 0, accS = 0, stretch = 1, prevAy = 0, prevAyVel = 0, headAcc = 0

      const killTLs = () => { tls.forEach((t) => t.kill()); tls = [] }
      const reg = (el, base) => { el._o = base == null ? 1 : base; room.push(el); return el }

      // a flat leaf in the camera group at a view-space spot (x, y, z) with its own size
      const leaf = (cls, w, h, x, y, z, css, base) => {
        const e = box('a ' + cls, cam, w, h)
        e.style.transform = `translate3d(${x}px,${y}px,${z}px)${css ? ' ' + css : ''}`
        return reg(e, base)
      }

      // ---------------------------------------------------------------- a framed print on a nail
      function makeFrame(i, f) {
        const it = { i, f, fx: [], th: 0, om: 0, zt: 0.13, zeta: 0.13, w0: 3.7 + i * 0.35, cd: 0, lock: false }
        const fr = (it.fr = div('p3', cam))
        const fw = f.fw, fh = f.fh, e = f.fb + f.fp
        const r = (el, base) => { el._o = base == null ? 1 : base; it.fx.push(el); return el }
        it.sh = r(div('a sh', fr, `left:${-fw / 2}px;top:${f.wire}px;width:${fw}px;height:${fh}px;transform-origin:0 0`), 0.62)
        r(div('a nail', fr, 'left:-4px;top:-4px;width:8px;height:8px'))
        it.sg = div('p3', fr)
        it.hv = div('p3', it.sg)
        gsap.set([it.sg, it.hv], { transformOrigin: '0 0' })
        const half = fw * 0.36
        const wire = r(div('a', it.sg, `left:${-half}px;top:0;width:${half * 2}px;height:${f.wire}px`))
        wire.innerHTML = `<svg width="${half * 2}" height="${f.wire}" viewBox="0 0 ${half * 2} ${f.wire}" style="display:block"><path d="M${half} 0L0 ${f.wire}M${half} 0L${half * 2} ${f.wire}" stroke="#8f8f8f" stroke-width="1" fill="none" opacity=".8"/></svg>`
        const a = (it.a = div('a fa', it.hv, `left:${-fw / 2}px;top:${f.wire}px;width:${fw}px;height:${fh}px`, 'a'))
        a.href = links[i].href
        r(a)
        div('mat', a, `left:${f.fb}px;top:${f.fb}px;right:${f.fb}px;bottom:${f.fb}px`)
        const win = div('win', a, `left:${e}px;top:${e}px;width:${f.winW}px;height:${f.winH}px`)
        const lp = (it.lp = div('lp', win))
        it.cv = [0, 1].map(() => { const c = div('', lp, '', 'canvas'); c.width = 256; c.height = 144; return c })
        it.g = it.cv.map((c) => c.getContext('2d'))
        div('gl', win)
        const wd = div('wd', a, `left:${e}px;top:${e + f.winH + f.gap}px;width:${f.winW}px;height:${f.wordH}px;font-size:${f.fs}px`)
        wd.textContent = links[i].label
        const n = div('n m', a, `right:${e}px;top:${e + f.winH + f.gap + 6}px`)
        n.textContent = '0' + (i + 1)
        div('lit', a)
        div('fall', a, `opacity:${f.shade}`)
        it.dm = div('dm', a)
        // the nail point in the camera group; hv lifts toward the visitor
        gsap.set(fr, { x: f.x, y: f.y, z: f.z })
        gsap.set(it.sh, { x: 36, y: 14, z: -14, scaleX: 1.06, scaleY: 1.02 })
        it.wy = f.wire + e + f.winH / 2 // window centre below the nail, for the push-in
        return it
      }

      // ---------------------------------------------------------------- build (also on resize)
      function build() {
        W = innerWidth; H = innerHeight
        portrait = H > W * 1.05
        P = Math.round(1.15 * Math.max(W, H))
        const rad = Math.PI / 180
        root.replaceChildren()
        frames = []; room = []; lbl = null
        root.style.perspective = P + 'px'
        head = div('d3', root)
        cam = div('d3', head)
        const b = portrait ? 8 : Math.max(8, Math.round(W * 0.0075))
        // the page monitor, at the left edge: where it ends up in view space (apparent size -> world size through the depth)
        const vz = portrait ? 60 : 90, sc = P / (P - vz), ryp = portrait ? 18 : 20
        const kF = portrait ? 0.34 : 0.22 / (Math.cos(ryp * rad) * sc)
        const vx = (portrait ? -0.43 : -0.385) * W / sc, vy = portrait ? 0 : -0.03 * H
        const cw = kF * W, ch = kF * H, neck = portrait ? 0 : 60
        const D = vy + ch / 2 + b + neck
        C = { Yf: portrait ? 30 : 36, kF, vx, vy, vz, ryp, cw, ch, b, neck, D }

        // wall (starts right of the page monitor, so the page is never under it), desk, shelf
        const wz = -120, scw = P / (P - wz)
        const wl = (-0.2 * W) / scw // wall left edge in world x
        const ww = 1.6 * W, wh = 1.8 * H
        leaf('wall', ww, wh, wl + ww / 2, 0, wz)
        if (!portrait) {
          const dw = 1970
          leaf('desk', dw, 1500, -2300 + dw / 2, C.D, 150, 'rotateX(90deg)')
        }
        // frames
        const fz = wz + 16, scf = P / (P - fz)
        const spec = portrait
          ? { fw: 0.66 * W, fb: 7, fp: 14, winH: 74, wordH: 46, gap: 6, wire: 22, fsCap: 44, xs: [52, 70, 58], ys: [136, 334, 532] }
          : { fw: 0.18 * W, fb: 9, fp: 20, winH: 0, wordH: 64, gap: 10, wire: 44, fsCap: 60, xs: [-40, 240, 520], ys: [-341, -263, -359] }
        for (let i = 0; i < 3; i++) {
          const e = spec.fb + spec.fp
          const winW = spec.fw - 2 * e
          const winH = portrait ? spec.winH : Math.round(winW * 0.62)
          const fh = 2 * e + winH + spec.gap + spec.wordH
          const label = links[i].label
          const fs = Math.round(Math.min(spec.fsCap, (winW * 0.86) / (label.length * 0.42), spec.wordH * 0.95))
          const apY = portrait ? spec.ys[i] - H / 2 : spec.ys[i]
          frames.push(makeFrame(i, { fw: spec.fw, fh, fb: spec.fb, fp: spec.fp, winW, winH, wordH: spec.wordH, gap: spec.gap, wire: spec.wire, fs,
            x: (spec.xs[i] * (P - fz)) / P, y: (apY * (P - fz)) / P, z: fz, shade: [0, 0.14, 0.28][i] }))
        }
        // shelf: a board with a top you can see, three drives and a plant; the label is Gizlilik, the © sits on the board
        const sz = -60
        const ap = (v) => (v * (P - sz)) / P
        const bx0 = portrait ? -70 : -190, bx1 = portrait ? 200 : 700
        const byTop = portrait ? 772 - H / 2 : 150
        const bwid = ap(bx1 - bx0), bcx = ap((bx0 + bx1) / 2), bh = ap(34)
        const brd = leaf('board', bwid, bh, bcx, ap(byTop) + bh / 2, sz)
        leaf('btop', bwid, 70, bcx, ap(byTop), sz - 35, 'rotateX(90deg)')
        if (!portrait) {
          ;[[-130, 72, 54], [-52, 66, 62], [34, 78, 50]].forEach(([x, w, h]) => leaf('dr', ap(w), ap(h), ap(x), ap(byTop) - ap(h) / 2, sz - 35))
          const px = ap(560), pb = ap(byTop)
          ;[[-26, 78, 20], [-8, 104, 20], [10, 92, 20], [24, 62, 18]].forEach(([deg, h, w]) => {
            leaf('leaf', w, h, px, pb - ap(40) - h / 2, sz - 35, `rotate(${deg}deg)`)
          })
          leaf('pot', ap(56), ap(44), px, pb - ap(22), sz - 35)
        }
        const cp = div('a cp m', brd, `right:12px;top:50%;margin-top:-6px`)
        cp.textContent = copyright
        // the Gizlilik label: its own 3D thing so it can come forward and fill the view
        const lw = ap(portrait ? 96 : 118), lh = ap(24)
        const lx = ap(portrait ? bx0 + 70 : bx0 + 80), ly = ap(byTop) + bh / 2
        const lo = { w: lw, h: lh }
        lbl = { i: 3, o: lo, fx: [], link: legal }
        lbl.pos = box('p3', cam, lw, lh)
        lbl.hov = box('p3', lbl.pos, lw, lh)
        lbl.a = div('lbl', lbl.hov, `inset:0;transform:translateZ(2px)`, 'a')
        lbl.a.href = legal.href
        lbl.a.textContent = legal.label
        lbl.a.style.position = 'absolute'
        lbl.a._o = 1
        lbl.fx.push(lbl.a)
        lbl.dm = div('dm', lbl.a)
        Object.assign(lbl, { x: lx, y: ly, z: sz + 3 })
        gsap.set(lbl.pos, { x: lbl.x, y: lbl.y, z: lbl.z })
        // the page monitor: ring with a transparent hole, in the camera group; its transform comes from tick()
        frame = box('p3', cam, cw + 2 * b, ch + 2 * b)
        div('a ring cv', frame, `inset:0;border-width:${b}px`)
        const hole = div('a hole cv', frame, `left:${b}px;top:${b}px;width:${cw}px;height:${ch}px`)
        div('gl', hole)
        cdim = div('dm', hole)
        const chit = div('chit', hole)
        chit.addEventListener('click', () => { if (!S.leaving) ctx.button.click() })
        chit.addEventListener('pointerenter', () => ctx.cursor.hover(true))
        chit.addEventListener('pointerleave', () => ctx.cursor.hover(false))
        if (!portrait) {
          div('a neck cv', frame, `left:${cw / 2 + b - 13}px;top:${ch + 2 * b - 6}px;width:26px;height:${neck + 6}px;transform:translateZ(-12px)`)
          div('a csh cv', frame, `left:${cw / 2 + b - 150}px;top:${ch + 2 * b + neck - 3 - 80}px;width:300px;height:160px;transform:rotateX(90deg)`)
          div('a base cv', frame, `left:${cw / 2 + b - 80}px;top:${ch + 2 * b + neck - 2 - 45}px;width:160px;height:90px;transform:rotateX(90deg)`)
        }
        frames.forEach((it) => hook(it))
        hook(lbl)
        setClosed()
      }

      // ---------------------------------------------------------------- states
      function setClosed() {
        cm.L = 0; cm.yaw = 0; cm.fade = 0
        S.hv = -1
        prevYaw = 0; prevVel = 0; accS = 0; stretch = 1
        gsap.set(room, { opacity: 0 })
        frames.forEach((it) => {
          it.th = 0; it.om = 0; it.lock = false; it.zt = 0.13
          gsap.set(it.fx, { opacity: 0 })
          gsap.set(it.fr, { x: it.f.x, y: it.f.y, z: it.f.z })
          gsap.set(it.sh, { x: 36, y: 14, scaleX: 1.06, scaleY: 1.02 })
          gsap.set(it.hv, { x: 0, y: 0, z: 0, scale: 1 })
          gsap.set(it.dm, { opacity: 0 })
          gsap.set(it.lp, { opacity: 0.5 })
          it.sg.style.transform = ''
        })
        gsap.set(lbl.fx, { opacity: 0 })
        gsap.set(lbl.pos, { x: lbl.x, y: lbl.y, z: lbl.z, scaleX: 1, scaleY: 1 })
        gsap.set(lbl.hov, { x: 0, y: 0, z: 0, scale: 1 })
        gsap.set(lbl.dm, { opacity: 0 })
        gsap.set(lbl.a, { color: '#0a0a0a' })
        gsap.set(cdim, { opacity: 0 })
      }

      function focus(i, force) {
        if (S.hv === i && !force) return
        S.hv = i
        frames.forEach((it) => {
          const on = it.i === i, other = i >= 0 && !on
          gsap.to(it.hv, { z: on ? 90 : other ? -26 : 0, scale: on ? 1.04 : other ? 0.97 : 1, y: on ? -4 : 0, duration: on ? 0.8 : 0.9, ease: on ? 'back.out(1.4)' : 'power3.out', overwrite: 'auto' })
          gsap.to(it.dm, { opacity: other ? 0.55 : 0, duration: 0.5, overwrite: 'auto' })
          gsap.to(it.lp, { opacity: on ? 1 : 0.5, duration: 0.6, overwrite: 'auto' })
          gsap.to(it.sh, on ? { x: 96, y: 38, scaleX: 1.22, scaleY: 1.1, opacity: 0.5, duration: 0.8, overwrite: 'auto' }
            : { x: other ? 22 : 36, y: other ? 8 : 14, scaleX: other ? 1 : 1.06, scaleY: other ? 1 : 1.02, opacity: other ? 0.4 : 0.62, duration: 0.8, overwrite: 'auto' })
          it.zt = on ? 0.9 : 0.13 // hovered: straightens fast
        })
        const on = i === 3, other = i >= 0 && !on
        gsap.to(lbl.hov, { z: on ? 60 : 0, y: on ? -4 : 0, scale: on ? 1.1 : 1, duration: on ? 0.7 : 0.8, ease: on ? 'back.out(1.6)' : 'power3.out', overwrite: 'auto' })
        gsap.to(lbl.dm, { opacity: other ? 0.55 : 0, duration: 0.5, overwrite: 'auto' })
        gsap.to(cdim, { opacity: i >= 0 ? 0.68 : S.want ? 0.45 : 0, duration: 0.6, overwrite: 'auto' })
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

      // the pointer rushing past a print sets it swaying
      let lpx = 0, lpt = 0
      const onMove = (e) => {
        const now = performance.now(), dt = now - lpt
        const vx = dt > 0 && dt < 80 ? (e.clientX - lpx) / dt : 0
        lpx = e.clientX; lpt = now
        if (!S.want || S.leaving || Math.abs(vx) < 0.6) return
        for (const it of frames) {
          if (it.cd > 0) continue
          const r = it.a.getBoundingClientRect()
          if (e.clientX > r.left - 14 && e.clientX < r.right + 14 && e.clientY > r.top && e.clientY < r.bottom) {
            it.om += clamp(vx * 22, -60, 60) // deg/s
            it.cd = 0.35
          }
        }
      }
      addEventListener('pointermove', onMove, { passive: true })

      // ---------------------------------------------------------------- the one loop
      function tick(time, dtMs) {
        const dt = Math.min((dtMs || 16) / 1000, 0.05)
        const f = Math.min(1, dt * 5)
        // the pointer is his head: it turns the view a few degrees
        const tx = touch && !pointer.down ? 0 : pointer.x / W - 0.5
        const ty = touch && !pointer.down ? 0 : pointer.y / H - 0.5
        par.ay += (tx * 7 + Math.sin(time * 0.35) * 0.5 - par.ay) * f
        par.ax += (-ty * 4 + Math.cos(time * 0.3) * 0.3 - par.ax) * f
        const pk = clamp(cm.L * 1.2, 0, 1) * par.k
        const ax = par.ax * pk, ay = par.ay * pk
        head.style.transform = `rotateX(${ax.toFixed(3)}deg) rotateY(${ay.toFixed(3)}deg)`
        // the chair: yaw velocity and acceleration (smoothed) drive the stretch and the pendulums
        const vel = (cm.yaw - prevYaw) / dt
        accS += (clamp((vel - prevVel) / dt, -900, 900) - accS) * 0.25
        prevYaw = cm.yaw; prevVel = vel
        stretch += (1 + clamp(Math.abs(vel) / 700, 0, 1) * 0.07 - stretch) * 0.35
        const avel = (ay - prevAy) / dt
        headAcc += (clamp((avel - prevAyVel) / dt, -400, 400) - headAcc) * 0.25
        prevAy = ay; prevAyVel = avel
        const Yf = C.Yf, L = cm.L, k = lerp(1, C.kF, L)
        const sx = stretch.toFixed(4)
        cam.style.transform = `scale(${sx},1) translate3d(0,0,${P}px) rotateY(${(cm.yaw - Yf).toFixed(3)}deg) translate3d(0,0,${-P}px)`
        const place = `translate3d(${(L * C.vx).toFixed(2)}px,${(L * C.vy).toFixed(2)}px,${(L * C.vz).toFixed(2)}px) rotateY(${(L * C.ryp).toFixed(3)}deg)`
        page.style.transform = `perspective(${P}px) rotateX(${ax.toFixed(3)}deg) rotateY(${ay.toFixed(3)}deg) scale(${sx},1) translate3d(0,0,${P}px) rotateY(${(cm.yaw - L * Yf).toFixed(3)}deg) translate3d(0,0,${-P}px) ${place} scale(${k.toFixed(5)})`
        page.style.clipPath = `inset(0 round ${(L * 5 / k).toFixed(2)}px)`
        page.style.opacity = String(1 - cm.fade)
        frame.style.transform = `translate3d(0,0,${P}px) rotateY(${(Yf * (1 - L)).toFixed(3)}deg) translate3d(0,0,${-P}px) ${place} scale(${(k / C.kF).toFixed(5)})`
        frame.style.setProperty('--v', (sm(0.35, 0.8, L) * (1 - cm.fade)).toFixed(3))
        // pendulums: damped springs, pushed by the swivel and by head turns
        const drive = -accS * 1.1 - headAcc * 0.6
        for (const it of frames) {
          if (it.cd > 0) it.cd -= dt
          if (it.lock) { it.th *= 1 - Math.min(1, dt * 10); it.om = 0 } else {
            it.zeta += (it.zt - it.zeta) * Math.min(1, dt * 6)
            const acc = -it.w0 * it.w0 * it.th - 2 * it.zeta * it.w0 * it.om + drive
            it.om += acc * dt
            it.th = clamp(it.th + it.om * dt, -28, 28)
          }
          it.sg.style.transform = `rotate(${it.th.toFixed(3)}deg)`
        }
        // previews
        if ((S.n++ & 1) === 0) {
          for (const it of frames) {
            it.g[0].drawImage(previews[2 * it.i], 0, 0, 256, 144)
            it.g[1].drawImage(previews[2 * it.i + 1], 0, 0, 256, 144)
          }
        }
        for (const it of frames) it.cv[1].style.opacity = (0.5 + 0.5 * Math.sin(time * 0.9 + it.i * 2.1)).toFixed(3)
      }
      const startTick = () => { if (!S.ticking) { S.ticking = true; gsap.ticker.add(tick) } page.style.willChange = 'transform' }
      const stopTick = () => { if (S.ticking) { S.ticking = false; gsap.ticker.remove(tick) } }
      function restorePage() { page.style.transform = ''; page.style.clipPath = ''; page.style.opacity = ''; page.style.willChange = '' }
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
        tl.to(cm, { L: 1, duration: 0.85, ease: 'power3.out' }, 0) // the page shrinks into its monitor first
          .to(cm, { yaw: C.Yf, duration: 1.5, ease: 'back.out(1.35)' }, 0.25) // then the chair swings, overshoots, settles
          .to(par, { k: 1, duration: 0.1 }, 0)
          .to(cdim, { opacity: 0.45, duration: 0.8 }, 0.7)
          .to(room, { opacity: (i, el) => el._o, duration: 0.55, ease: 'power1.out' }, 0.5)
        frames.forEach((it, n) => {
          tl.to(it.fx, { opacity: (i, el) => el._o, duration: 0.5, ease: 'power1.out' }, 0.6 + n * 0.08)
          tl.call(() => { if (!it.lock) { it.th += (n % 2 ? -1 : 1) * (9 - n * 1.5) } }, null, 1.05 + n * 0.22) // they arrive swinging, one after another
        })
        tl.to(lbl.fx, { opacity: 1, duration: 0.5 }, 1.2)
        if (instant) tl.progress(1)
      }

      function close() {
        S.want = false
        if (S.leaving) return
        killTLs(); startTick()
        focus(-1, true)
        const tl = gsap.timeline({ onComplete: finishClosed })
        tls.push(tl)
        tl.to(cm, { yaw: 0, duration: 1.05, ease: 'power3.inOut' }, 0) // the chair swivels back
          .to(cm, { L: 0, duration: 0.8, ease: 'power3.inOut' }, 0.6) // the page swings in from the left and fills the view
          .to(cdim, { opacity: 0, duration: 0.6 }, 0.4)
          .to(room, { opacity: 0, duration: 0.5 }, 0.5)
        frames.forEach((it) => tl.to(it.fx, { opacity: 0, duration: 0.5 }, 0.5))
        tl.to(lbl.fx, { opacity: 0, duration: 0.4 }, 0.5)
      }

      function leave(it) {
        S.leaving = true
        killTLs(); startTick()
        focus(it.i, true)
        const d = 0.78
        const tl = gsap.timeline({ onComplete: () => finishLeave(it) })
        tls.push(tl)
        const isFrame = it !== lbl
        const others = frames.filter((o) => o !== it)
        if (isFrame) {
          // the view pushes into the print until its picture fills the view
          const f = it.f
          const s = Math.max(W / f.winW, H / f.winH) * 1.04
          it.lock = true
          tl.to(it.fr, { x: 0, y: -s * it.wy, z: 0, duration: d, ease: 'power4.inOut' }, 0)
            .to(it.hv, { x: 0, y: 0, z: 0, scale: s, duration: d, ease: 'power4.inOut', overwrite: true }, 0)
            .to(it.lp, { opacity: 1, duration: d, ease: 'power1.in' }, 0)
            .to(it.dm, { opacity: 0, duration: 0.3 }, 0)
            .to(it.sh, { opacity: 0, duration: 0.3 }, 0)
        } else {
          const sx = (W / lbl.o.w) * 1.04, sy = (H / lbl.o.h) * 1.04
          tl.to(lbl.pos, { x: 0, y: 0, z: 0, scaleX: sx, scaleY: sy, duration: d, ease: 'power4.inOut' }, 0)
            .to(lbl.hov, { x: 0, y: 0, z: 0, scale: 1, duration: d, ease: 'power3.inOut', overwrite: true }, 0)
            .to(lbl.dm, { opacity: 0.9, duration: d, ease: 'power2.in' }, 0)
            .to(lbl.a, { color: '#ededed', duration: d, ease: 'power2.in' }, 0)
        }
        tl.to(par, { k: 0, duration: d * 0.9, ease: 'power2.inOut' }, 0)
        others.forEach((o) => {
          tl.to(o.fr, { z: '+=260', duration: 0.5, ease: 'power3.in' }, 0)
          tl.to(o.fx, { opacity: 0, duration: 0.3 }, 0.04)
        })
        if (isFrame) tl.to(lbl.fx, { opacity: 0, duration: 0.3 }, 0)
        else frames.forEach((o) => tl.to(o.fx, { opacity: 0, duration: 0.3 }, 0))
        tl.to(room, { opacity: 0, duration: 0.3 }, 0)
        tl.to(cm, { fade: 1, duration: 0.5, ease: 'power2.in' }, 0)
      }

      function finishLeave(it) {
        stopTick(); restorePage()
        S.leaving = false; S.want = false
        ctx.cursor.hover(false)
        ctx.arrive(it.link || links[it.i])
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
          removeEventListener('pointermove', onMove)
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
