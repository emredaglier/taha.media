// THROWAWAY prototype 3: Lamp. The screen goes dark and only his desk lamp is on. The page dims and sinks back behind everything
// (a monitor asleep), the stage is the dark room in front of it with ONE light that the visitor holds. The links are big serif
// words stacked down the dark, each standing on a faint desk/wall line with a few drawn objects (monitor, speaker, drive, mug),
// all at ~8% until the light falls on them. Lit: the word is bright, its loop plays inside the letters, long soft shadows swing
// away from the light. Press narrows the beam, release widens it. Leave: the pool swells from the picked word, the loop fills the view.
// Two copies of the same scene: a dim one (the real links) and a bright one inside a masked disc that follows the light; the disc and
// the bright copy move by transform only. The loop inside the letters is canvas + screen/multiply blend (a stand-in for
// background-clip:text, which cannot take a live canvas). Contract: docs/design/menu3/CONTRACT.md. fake: objects, shapes, dust.
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t
  const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
  // brightness at distance t (share of the pool radius), same stops as the mask below
  const bright = (t) => (t < 0.38 ? 1 : t < 0.55 ? lerp(1, 0.75, (t - 0.38) / 0.17) : t < 0.78 ? lerp(0.75, 0.25, (t - 0.55) / 0.23) : t < 1 ? lerp(0.25, 0, (t - 0.78) / 0.22) : 0)

  const OBJ = {
    monitor: '<rect x="14" y="8" width="172" height="104" rx="8"/><path d="M88 112 L76 134 H124 L112 112"/>',
    speaker: '<rect x="44" y="6" width="104" height="130" rx="10"/><circle cx="96" cy="44" r="14"/><circle cx="96" cy="94" r="31"/><circle cx="96" cy="94" r="9"/>',
    drive: '<rect x="8" y="46" width="176" height="66" rx="10"/><rect x="24" y="62" width="82" height="22" rx="3"/><circle cx="152" cy="80" r="6"/>',
    mug: '<circle cx="80" cy="70" r="46"/><circle cx="80" cy="70" r="34"/><path d="M127 50 a26 26 0 0 1 0 40"/>',
  }
  const OBJS = [['monitor', 'drive'], ['speaker', 'mug'], ['drive', 'monitor'], ['mug']]

  const CSS = `
.lp{position:absolute;inset:0;visibility:hidden;overflow:hidden;color:var(--t);-webkit-user-select:none;user-select:none}
.lp *{box-sizing:border-box}
.lp-veil{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none}
.lp-vig{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse 80% 70% at 50% 50%,transparent 35%,rgba(0,0,0,.85) 100%)}
.lp-sc{position:absolute;inset:0;opacity:0}
.lp-dim{position:absolute;inset:0;opacity:.1}
.lp-scene{position:absolute;inset:0;display:flex;flex-direction:column;padding:calc(var(--hh) + 2vh) var(--gut) calc(11vh)}
.lp-row{position:relative;flex:1 1 0;min-height:0;display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:calc(var(--fs,40px) * .1)}
.lp-row.r1{flex-direction:row-reverse}
.lp-surf{position:absolute;left:calc(var(--gut) * -1);right:calc(var(--gut) * -1);top:12%;bottom:0;background:linear-gradient(to bottom,#1b1b1b,#141414 70%,#0d0d0d);border-top:1px solid #2e2e2e}
.lp-surf::after{content:'';position:absolute;left:0;right:0;bottom:0;height:34%;background:linear-gradient(to bottom,#0a0a0a,#171717);border-top:1px solid #333}
.lp-obs{order:1;position:relative;flex:0 0 26vw;height:100%;margin:0 4vw;pointer-events:none}
.lp-ob{position:absolute;bottom:calc(var(--fs,40px) * .1);overflow:visible;fill:#161616;stroke:#c4c4c4;stroke-width:1.6;stroke-linejoin:round;pointer-events:none;aspect-ratio:200/140}
.lp-ob.o0{left:0;height:68%}
.lp-ob.o1{right:0;height:44%}
.lp-ob.sh{fill:#000;stroke:none;filter:blur(5px);will-change:transform,opacity;opacity:0}
.lp-a{position:relative;display:inline-block;z-index:2;color:#ededed;font:400 var(--fs,200px)/.8 var(--serif);letter-spacing:-.01em;white-space:nowrap;transform-origin:50% 88%;transition:transform .7s var(--ease);text-decoration:none}
.lp-row.hov .lp-a{transform:scale(1.045)}
a.lp-a:focus-visible,.lp-row.fv .lp-a{outline:2px solid #ededed;outline-offset:.06em}
.lp-wt{display:block}
.lp-sh{position:absolute;left:0;top:0;z-index:-1;font-style:normal;color:#000;filter:blur(5px);pointer-events:none;will-change:transform,opacity;opacity:0}
.lp-vt{position:absolute;inset:0;display:block;font-style:normal;color:transparent;-webkit-text-fill-color:transparent;background-size:cover;background-position:center;-webkit-background-clip:text;background-clip:text;pointer-events:none;opacity:0}
.lp-foot{position:absolute;left:var(--gut);right:var(--gut);bottom:calc(3vh + 4px);display:flex;justify-content:space-between;align-items:flex-end}
.lp-foot .lp-row{flex:none;padding:0;height:auto;align-items:flex-end}
.lp-foot .lp-obs{flex:none;width:90px;height:64px;margin:0 22px 0 0}
.lp-foot .lp-a{--fs:44px;line-height:.9}
.lp-foot .lp-surf{display:none}
.lp-copy{font:500 11px/1.3 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:#ededed}
.lp-disc{position:absolute;left:0;top:0;width:100px;height:100px;transform-origin:0 0;will-change:transform;pointer-events:none;overflow:hidden;
  -webkit-mask-image:radial-gradient(closest-side,#000 38%,rgba(0,0,0,.75) 55%,rgba(0,0,0,.25) 78%,transparent 100%);mask-image:radial-gradient(closest-side,#000 38%,rgba(0,0,0,.75) 55%,rgba(0,0,0,.25) 78%,transparent 100%)}
.lp-lit{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0;will-change:transform;pointer-events:none}
.lp-lit .lp-surf{background:linear-gradient(to bottom,#242424,#1a1a1a 70%,#121212)}
.lp-sp{position:absolute;width:3px;height:3px;border-radius:50%;background:#ededed;opacity:0;animation:lpd 9s ease-in-out infinite alternate}
@keyframes lpd{0%{transform:translate(0,0);opacity:0}25%{opacity:.7}60%{opacity:.25}100%{transform:translate(var(--dx),var(--dy));opacity:.55}}
.lp:not(.on) .lp-sp{animation-play-state:paused}
.lp-cone{position:absolute;left:0;top:0;width:1100px;height:1000px;margin-left:-550px;transform-origin:50% 0;pointer-events:none;will-change:transform,opacity;opacity:0;
  background:linear-gradient(to bottom,rgba(237,237,237,0),rgba(237,237,237,.09) 75%,rgba(237,237,237,.03));clip-path:polygon(49% 0,51% 0,100% 100%,0 100%)}
.lp-glow{position:absolute;left:0;top:0;width:100px;height:100px;transform-origin:0 0;pointer-events:none;will-change:transform,opacity;background:radial-gradient(circle,rgba(237,237,237,.13),rgba(237,237,237,.05) 40%,transparent 70%)}
.lp-fill{position:absolute;inset:0;pointer-events:none;clip-path:circle(0px at 50% 50%);visibility:hidden}
.lp-fill canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.lp-fill::after{content:'';position:absolute;inset:0;background:rgba(0,0,0,.4)}
.lp.lv .lp-a{pointer-events:none}
.lp.pt .lp-obs{position:absolute;right:0;top:0;width:44vw;height:100%;flex:none;margin:0;opacity:.8}
.lp.pt .lp-foot .lp-obs{position:relative;width:70px;height:50px;opacity:1}
`

  function sceneHTML(ctx, lit) {
    const rows = ctx.links.concat([ctx.legal]).map((l, i) => {
      const word = lit
        ? `<div class="lp-a" data-i="${i}">${[1, 2, 3, 4].map(() => `<i class="lp-sh" aria-hidden="true">${l.label}</i>`).join('')}<span class="lp-wt">${l.label}</span><i class="lp-vt" aria-hidden="true">${l.label}</i></div>`
        : `<a class="lp-a" data-i="${i}" href="${l.href}"><span class="lp-wt">${l.label}</span></a>`
      const obs = lit ? OBJS[i].map((k, j) => `<svg class="lp-ob sh o${j}" viewBox="0 0 200 140">${OBJ[k]}</svg><svg class="lp-ob sh o${j}" viewBox="0 0 200 140">${OBJ[k]}</svg>`).join('') : ''
      const objs = OBJS[i].map((k, j) => `<svg class="lp-ob o${j}" viewBox="0 0 200 140">${OBJ[k]}</svg>`).join('')
      const o = `<div class="lp-obs">${lit ? obs : ''}${objs}</div>`
      return { i, html: `<div class="lp-row r${i % 2}${i === 3 ? ' lg' : ''}" data-i="${i}">${i < 3 ? '<i class="lp-surf"></i>' : ''}${o}${word}</div>` }
    })
    const foot = `<div class="lp-foot">${rows[3].html}<span class="lp-copy">${ctx.copyright}</span></div>`
    return `<div class="lp-scene">${rows.slice(0, 3).map((r) => r.html).join('')}</div>${foot}`
  }

  MENU3.register({
    name: 'Lamp',
    create(ctx) {
      const { stage, page, pointer } = ctx
      const gs = window.gsap
      const S = { open: 0, pool: 0, press: 0, fill: 0 }
      let W = 0, H = 0, D = 1000, portrait = false
      let isOpen = false, leaving = false, leaveI = -1, ticking = false, disposed = false, fadeTw = null
      let have = false, focusI = -1, hoverI = -1, pd = false, pdx = 0, pdy = 0, fillIdx = 0
      const L = { x: 0, y: 0, vx: 0, vy: 0 }

      const root = document.createElement('div')
      root.className = 'lp'
      const dust = Array.from({ length: 30 }, (_, i) => { const a = Math.sin(i * 91.7) * 0.5 + 0.5, b = Math.sin(i * 37.1 + 2) * 0.5 + 0.5, c = Math.sin(i * 53.3 + 1) * 0.5 + 0.5; return `<i class="lp-sp" style="left:${(a * 100).toFixed(1)}%;top:${(b * 100).toFixed(1)}%;--dx:${((c - 0.5) * 120).toFixed(0)}px;--dy:${((a - 0.5) * 90).toFixed(0)}px;animation-duration:${(7 + c * 8).toFixed(1)}s;animation-delay:${(-b * 9).toFixed(1)}s"></i>` }).join('')
      root.innerHTML = `<style>${CSS}</style><div class="lp-veil"></div><div class="lp-vig"></div><div class="lp-sc"><div class="lp-dim">${sceneHTML(ctx, false)}</div><div class="lp-disc"><div class="lp-lit" aria-hidden="true">${sceneHTML(ctx, true)}${dust}</div></div></div><div class="lp-cone"></div><div class="lp-glow"></div><div class="lp-fill" aria-hidden="true"><canvas width="480" height="270"></canvas></div>`
      stage.append(root)
      const $ = (s) => root.querySelector(s)
      const veil = $('.lp-veil'), vig = $('.lp-vig'), sc = $('.lp-sc'), disc = $('.lp-disc'), litEl = $('.lp-lit'), cone = $('.lp-cone'), glow = $('.lp-glow'), fillEl = $('.lp-fill')
      const fillG = fillEl.querySelector('canvas').getContext('2d')
      const dimRows = [...root.querySelectorAll('.lp-dim .lp-row')], litRows = [...litEl.querySelectorAll('.lp-row')]
      const items = [0, 1, 2, 3].map((i) => {
        const r = litRows[i]
        return { i, link: i < 3 ? ctx.links[i] : ctx.legal, row: dimRows[i], rowL: r, a: dimRows[i].querySelector('a'), aL: r.querySelector('.lp-a'), wt: r.querySelector('.lp-wt'), vt: r.querySelector('.lp-vt'), cv: Object.assign(document.createElement('canvas'), { width: 160, height: 90 }), tAcc: 0,
          sh: [...r.querySelectorAll('.lp-sh')], osh: [...r.querySelectorAll('.lp-ob.sh')], cx: 0, cy: 0, w: 1, h: 1, hov: 0, lit: 0, mix: -1 }
      })

      // ---- layout ------------------------------------------------------------------------------------------------------
      function layout() {
        W = innerWidth; H = innerHeight
        portrait = W < 768 && W < H
        root.classList.toggle('pt', portrait)
        D = Math.round((portrait ? 1.6 : 1.25) * Math.min(W, H))
        disc.style.width = disc.style.height = D + 'px'
        litEl.style.width = W + 'px'; litEl.style.height = H + 'px'
        glow.style.width = glow.style.height = D * 1.1 + 'px'
        const gut = W >= 768 ? 32 : 16, hh = W >= 768 ? 84 : 68
        const rowH = (H - hh - 0.02 * H - 0.11 * H) / 3
        items.forEach((it) => {
          const fs = it.i === 3 ? 44 : portrait ? 0 : Math.min(0.235 * H, 0.19 * W)
          for (const r of [it.row, it.rowL]) r.style.setProperty('--fs', (fs || 100) + 'px')
          if (portrait && it.i < 3) { // words fill the width
            const w100 = it.a.getBoundingClientRect().width || 300
            const f = Math.min(100 * (W - 2 * gut) / w100, rowH * 1.05)
            for (const r of [it.row, it.rowL]) r.style.setProperty('--fs', f + 'px')
          }
        })
        measure()
      }
      function measure() {
        const prev = items.map((it) => it.row.classList.contains('hov'))
        items.forEach((it) => it.row.classList.remove('hov'))
        items.forEach((it) => { const b = it.a.getBoundingClientRect(); it.cx = b.left + b.width / 2; it.cy = b.top + b.height / 2; it.w = b.width; it.h = b.height })
        items.forEach((it, i) => { if (prev[i]) it.row.classList.add('hov') })
      }
      const restPoint = () => ({ x: Math.min(items[0].cx, W * 0.45), y: items[0].cy })
      const targetPoint = () => {
        if (leaving && leaveI >= 0) return { x: items[leaveI].cx, y: items[leaveI].cy }
        if (focusI >= 0) return { x: items[focusI].cx, y: items[focusI].cy }
        return have ? { x: pointer.x, y: pointer.y } : restPoint()
      }

      // ---- hover / focus / input -----------------------------------------------------------------------------------------
      function setHover(i) {
        if (i === hoverI) return
        hoverI = i
        items.forEach((it, k) => {
          const on = k === i
          it.row.classList.toggle('hov', on); it.rowL.classList.toggle('hov', on)
          gs.to(it, { hov: on ? 1 : 0, duration: on ? 0.6 : 0.5, ease: on ? 'power3.out' : 'power2.out', overwrite: 'auto' })
        })
      }
      items.forEach((it) => {
        const a = it.a
        a.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') setHover(it.i) })
        a.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && hoverI === it.i) setHover(focusI) })
        a.addEventListener('pointerdown', () => { if (!leaving) setHover(it.i) })
        a.addEventListener('focus', () => {
          let fv = true; try { fv = a.matches(':focus-visible') } catch {}
          if (fv) { focusI = it.i; it.rowL.classList.add('fv'); setHover(it.i) }
        })
        a.addEventListener('blur', () => { it.rowL.classList.remove('fv'); if (focusI === it.i) { focusI = -1; setHover(-1) } })
        a.addEventListener('click', (e) => { e.preventDefault(); go(it) })
      })
      const onMove = (e) => {
        if (!isOpen || leaving) return
        if (!have && e.type === 'pointermove' && Math.hypot(e.clientX - pdx, e.clientY - pdy) < 4) return
        have = true
        if (focusI >= 0) { items[focusI].rowL.classList.remove('fv'); focusI = -1 }
      }
      addEventListener('pointermove', onMove, { passive: true }); addEventListener('pointerdown', onMove, { passive: true })

      // ---- frame ---------------------------------------------------------------------------------------------------------
      function tick(_t, ms) {
        const dt = Math.min((ms || 16.7) / 1000, 1 / 30)
        // the light: a spring with weight, a little lag and overshoot
        const t = targetPoint(), k = leaving ? 120 : 70, c = leaving ? 16 : 9.5
        for (let s = 0; s < 2; s++) {
          L.vx += (k * (t.x - L.x) - c * L.vx) * (dt / 2); L.vy += (k * (t.y - L.y) - c * L.vy) * (dt / 2)
          L.x += L.vx * (dt / 2); L.y += L.vy * (dt / 2)
        }
        if (pointer.down !== pd && !leaving) { pd = pointer.down; gs.to(S, { press: pd ? 1 : 0, duration: pd ? 0.18 : 0.55, ease: pd ? 'power2.out' : 'back.out(1.7)', overwrite: 'auto' }) }
        const f = S.fill
        const s = Math.max(0, S.pool * (1 - 0.42 * S.press) * (1 + 3.2 * f)), R = (D / 2) * s
        // page: sinks back and dims
        page.style.transform = `perspective(1600px) translate3d(0,0,${-170 * S.open}px)`
        veil.style.opacity = 0.88 * S.open; vig.style.opacity = S.open; sc.style.opacity = S.open
        // disc follows the light, the bright copy is counter-moved so it stays registered with the dim one
        const on = s > 0.03 // below this the pool is a dot: skip the huge counter-scale
        disc.style.visibility = on ? 'visible' : 'hidden'
        if (on) {
          disc.style.transform = `translate3d(${L.x - (D / 2) * s}px,${L.y - (D / 2) * s}px,0) scale(${s})`
          litEl.style.transform = `translate3d(${D / 2}px,${D / 2}px,0) scale(${1 / s}) translate3d(${-L.x}px,${-L.y}px,0)`
          glow.style.transform = `translate3d(${L.x - D * 0.55 * s}px,${L.y - D * 0.55 * s}px,0) scale(${s})`
        }
        glow.style.opacity = on ? (0.8 + 0.9 * S.press) * (1 - f) : 0
        // the cone hangs from the lamp, up left, off the view
        const sx = W * 0.22, sy = -H * 0.08, dx = L.x - sx, dy = L.y - sy, len = Math.hypot(dx, dy)
        cone.style.transform = `translate3d(${sx}px,${sy}px,0) rotate(${-Math.atan2(dx, dy)}rad) scale(${Math.max(0.05, (R * 2) / 1100)},${len / 1000})`
        cone.style.opacity = clamp(S.pool, 0, 1) * (1 - f) * S.open
        for (const it of items) frameItem(it, R, f, dt)
        if (leaving) frameFill(f)
      }
      function frameItem(it, R, f, dt) {
        const ddx = Math.max(Math.abs(L.x - it.cx) - it.w / 2, 0), ddy = Math.max(Math.abs(L.y - it.cy) - it.h / 2, 0)
        const lit = R > 1 ? bright(Math.hypot(ddx, ddy) / R) : 0
        it.lit = lit
        const mix = Math.max(sm(0.55, 0.9, lit), it.hov * lit)
        if (Math.abs(mix - it.mix) > 0.004) { it.mix = mix; it.wt.style.opacity = 1 - 0.82 * mix; it.vt.style.opacity = mix }
        // the loop inside the letters: a small canvas frame as the background of clipped text, ~20 fps, only while lit
        it.tAcc += dt
        if (mix > 0.02 && it.tAcc > 0.05) {
          it.tAcc = 0
          const g = it.cv.getContext('2d')
          g.drawImage(ctx.previews[it.i === 3 ? 5 : it.i * 2], 0, 0, 160, 90)
          g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(110,110,110,.4)'; g.fillRect(0, 0, 160, 90); g.globalCompositeOperation = 'source-over'
          it.vt.style.backgroundImage = `url(${it.cv.toDataURL('image/jpeg', 0.6)})`
        }
        // shadows swing away from the light: offset and length come from the light -> word vector
        const dx = it.cx - L.x, dy = it.cy - L.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d
        const len = clamp(d * 0.45 + 50, 50, 420) * (1 + 0.8 * it.hov) * (it.i === 3 ? 0.35 : 1)
        const op = lit * (1 - f)
        it.sh.forEach((e, k) => { const fr = (k + 1) / 4; e.style.transform = `translate3d(${ux * len * fr}px,${uy * len * fr}px,0)`; e.style.opacity = op * (0.5 - k * 0.1) })
        it.osh.forEach((e, k) => { const fr = 0.45 + 0.55 * (k % 2); e.style.transform = `translate3d(${ux * len * 0.8 * fr}px,${uy * len * 0.8 * fr}px,0)`; e.style.opacity = op * (k % 2 ? 0.28 : 0.42) })
      }
      function frameFill(f) {
        const it = items[leaveI]; if (!it) return
        const r = Math.hypot(Math.max(it.cx, W - it.cx), Math.max(it.cy, H - it.cy)) + 30
        fillEl.style.clipPath = `circle(${r * Math.max(0, (f - 0.12) / 0.88)}px at ${it.cx}px ${it.cy}px)`
        fillG.drawImage(ctx.previews[it.i === 3 ? 5 : it.i * 2], 0, 0, 480, 270)
      }
      const start = () => { if (!ticking) { ticking = true; gs.ticker.add(tick) } }
      const stop = () => { gs.ticker.remove(tick); ticking = false }

      // ---- states: open, close, leave ------------------------------------------------------------------------------------
      function toClosed() {
        if (fadeTw) { fadeTw.kill(); fadeTw = null }
        gs.killTweensOf(S); items.forEach((it) => gs.killTweensOf(it))
        S.open = S.pool = S.press = S.fill = 0; leaving = false; leaveI = -1; isOpen = false; focusI = hoverI = -1; pd = false
        items.forEach((it) => { it.hov = 0; it.mix = -1; it.row.classList.remove('hov'); it.rowL.classList.remove('hov', 'fv') })
        root.classList.remove('lv', 'on'); root.style.visibility = 'hidden'; root.style.opacity = ''
        fillEl.style.visibility = 'hidden'
        page.style.transform = ''
        stop()
      }
      function open() {
        if (disposed) return
        if (leaving) toClosed()
        const fresh = root.style.visibility !== 'visible'
        isOpen = true
        if (fresh) {
          layout()
          have = false; pdx = pointer.x; pdy = pointer.y
          const r = restPoint(); L.x = r.x; L.y = r.y; L.vx = L.vy = 0
          root.style.visibility = 'visible'; root.classList.add('on')
          let fv = false; try { fv = !!document.activeElement && document.activeElement.matches && document.activeElement.matches(':focus-visible') } catch {}
          if (fv && root.contains(document.activeElement)) { const a = items.find((it) => it.a === document.activeElement); if (a) { focusI = a.i; a.rowL.classList.add('fv') } }
        }
        start()
        gs.to(S, { open: 1, duration: 0.8, ease: 'power3.out', overwrite: 'auto' })
        gs.to(S, { pool: 1, duration: 0.9, delay: 0.2, ease: 'back.out(1.5)', overwrite: 'auto' })
      }
      function close() {
        if (disposed || leaving || !isOpen) return
        isOpen = false; setHover(-1)
        gs.to(S, { pool: 0, duration: 0.2, ease: 'power2.in', overwrite: 'auto' })
        gs.to(S, { open: 0, duration: 0.6, delay: 0.05, ease: 'power3.inOut', overwrite: 'auto', onComplete: () => { if (!isOpen && !leaving) toClosed() } })
      }
      function go(it) {
        if (leaving || disposed) return
        leaving = true; leaveI = it.i; root.classList.add('lv'); setHover(it.i)
        gs.killTweensOf(S)
        fillEl.style.visibility = 'visible'
        gs.to(S, { press: 0, pool: 1, open: 1, duration: 0.2, overwrite: 'auto' })
        gs.to(S, { fill: 1, duration: 0.78, ease: 'power2.inOut', onComplete: finish })
      }
      function finish() {
        page.style.transform = '' // behind the loop for the moment the shell needs to swap the page
        ctx.arrive(items[leaveI].link)
        fadeTw = gs.to(root, { opacity: 0, duration: 0.3, ease: 'power1.out', onComplete: toClosed })
      }

      addEventListener('resize', onResize)
      function onResize() { if (!disposed) layout() }
      layout()

      return {
        open, close,
        dispose() {
          disposed = true
          removeEventListener('resize', onResize); removeEventListener('pointermove', onMove); removeEventListener('pointerdown', onMove)
          if (fadeTw) fadeTw.kill()
          gs.killTweensOf(S); items.forEach((it) => gs.killTweensOf(it)); stop()
          page.style.transform = ''
          root.remove()
        },
      }
    },
  })
})()
