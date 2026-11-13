// THROWAWAY prototype 'Droste'. Contract: docs/design/home/CONTRACT.md.
// Feedback rendering: two render targets (ping-pong). Each frame the page (frame, eight Works, hero and one big "inner screen"
// that shows the PREVIOUS frame) is rendered into target A, then A and B swap. The returned scene is one full-screen quad that
// shows the freshest target through an endless-zoom transform: zoom = pow(1/scale, fract(z)) about the fixed point of the
// recursion (rotated by theta * fract(z)), so the wrap at fract = 1 -> 0 maps the picture onto itself.
// The top-level hovered Work is drawn again in screen space (not fed back), so it comes forward at the top level only.
// View units: y in [-1, 1] up, x in [-aspect, aspect]. Render-target textures and CanvasTextures both have v = 1 at the top.
;(function () {
  'use strict'
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))
  const lerp = (a, b, t) => a + (b - a) * t
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
  const DECAY = 0.97 // each level a little dimmer, so the tunnel fades into depth (undone in the zoom, so the wrap is exact)

  const QUAD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }'
  const SHOW_FS = `
    uniform sampler2D tA; uniform float uA, uBr, uPhi; uniform vec2 uPs, uZ;
    varying vec2 vUv;
    void main(){
      vec2 s = vec2((vUv.x * 2. - 1.) * uA, vUv.y * 2. - 1.);
      vec2 d = (s - uPs) / uZ;
      float c = cos(uPhi), sn = sin(uPhi);
      vec2 q = uPs + vec2(c * d.x - sn * d.y, sn * d.x + c * d.y);
      vec3 col = texture2D(tA, vec2(q.x / uA, q.y) * .5 + .5).rgb * uBr;
      gl_FragColor = vec4(min(col, vec3(1.)), 1.);
    }`
  const PIC_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }'
  const PIC_FS = `
    uniform sampler2D tMap; uniform vec4 uRect; uniform float uB, uAlpha; varying vec2 vUv;
    void main(){
      vec2 u = clamp(vUv, .004, .996);
      gl_FragColor = vec4(min(texture2D(tMap, uRect.xy + u * uRect.zw).rgb * uB, vec3(1.)), uAlpha);
    }`

  HOME.register({
    name: 'Droste',
    create(ctx) {
      const P = ctx.pointer, scroll = ctx.scroll, crt = ctx.crt, renderer = ctx.renderer, touch = ctx.touch
      const tls = [], geos = [], mats = [], texs = []
      const mat = (m) => (mats.push(m), m), geo = (g) => (geos.push(g), g)
      let aspect = 1.6, pw = 1280, ph = 800, portrait = false, disposed = false, opened = false, busy = false
      let safeX = 1.5, yTop = 0.8, yBot = -0.8, cyo = 0, clock = 0, sx0 = 0.43, sy0 = 0.43, c0x = 0, c0y = 0, ampX = 0.18, ampY = 0.09
      let hovIdx = -1, kb = -1, forced = -1, labelAmp = 0, press = 0, pressV = 0, whip = 0, spd = 0
      let rtA = null, rtB = null, cur = null, prev = null
      const S = { inner: 0, reel: 1, frame: 0, fly: 0 }
      const C = { x: 0, y: 0, vx: 0, vy: 0, th: 0, vth: 0 } // inner screen centre and rotation, sprung (weight)
      const ps = { x: 0, y: 0 }, qv = { x: 0, y: 0 }, sv = { x: 0, y: 0 }
      let Zx = 1, Zy = 1, phi = 0, sxE = 0.4, syE = 0.4, thE = 0

      // ---- the returned scene: one quad showing the freshest target, then the top-level overlays ---------------------------
      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(-1.6, 1.6, 1, -1, -1, 1)
      const U = { tA: { value: null }, uA: { value: 1.6 }, uBr: { value: 1 }, uPhi: { value: 0 }, uPs: { value: new THREE.Vector2() }, uZ: { value: new THREE.Vector2(1, 1) } }
      const quad = new THREE.Mesh(geo(new THREE.PlaneGeometry(2, 2)), mat(new THREE.ShaderMaterial({ uniforms: U, vertexShader: QUAD_VS, fragmentShader: SHOW_FS, depthTest: false, depthWrite: false })))
      quad.frustumCulled = false; quad.renderOrder = -1
      scene.add(quad)
      const unit = geo(new THREE.PlaneGeometry(1, 1))

      // ---- the page (rendered into the targets) ---------------------------------------------------------------------------
      const page = new THREE.Scene()
      const pcam = new THREE.OrthographicCamera(-1.6, 1.6, 1, -1, -1, 1)
      const flat = (color, order) => { const m = mat(new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false })); const o = new THREE.Mesh(unit, m); o.renderOrder = order; o.frustumCulled = false; return o }
      const reelMat = mat(new THREE.MeshBasicMaterial({ map: ctx.showreel.texture, transparent: true, depthTest: false, depthWrite: false }))
      const reel = new THREE.Mesh(unit, reelMat); reel.renderOrder = 0; reel.frustumCulled = false
      page.add(reel)
      const picMat = (i, order, alpha) => {
        const m = mat(new THREE.ShaderMaterial({
          uniforms: { tMap: { value: ctx.atlas }, uRect: { value: new THREE.Vector4().fromArray(ctx.loopRect(i)) }, uB: { value: 1 }, uAlpha: { value: alpha } },
          vertexShader: PIC_VS, fragmentShader: PIC_FS, transparent: true, depthTest: false, depthWrite: false,
        }))
        const o = new THREE.Mesh(unit, m); o.renderOrder = order; o.frustumCulled = false
        return { o, m }
      }
      const tiles = []
      for (let i = 0; i < 8; i++) {
        const frame = flat(0xededed, 1), pic = picMat(i, 2, 1)
        page.add(frame); page.add(pic.o)
        tiles.push({ frame, pic, x: 0, y: 0, w: 0.5, h: 0.28, e: 0, cur: null })
      }
      const heroL = new THREE.Mesh(unit, mat(new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false })))
      const heroR = new THREE.Mesh(unit, mat(new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false })))
      ;[heroL, heroR].forEach((h) => { h.renderOrder = 3; h.frustumCulled = false; page.add(h) })
      let heroTexL = null, heroTexR = null
      const innerFrame = flat(0xededed, 4)
      const innerMat = mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, depthWrite: false }))
      innerMat.color.setScalar(DECAY)
      const inner = new THREE.Mesh(unit, innerMat); inner.renderOrder = 5; inner.frustumCulled = false
      page.add(innerFrame); page.add(inner)

      // ---- top-level overlays (screen space): the hovered Work again, bigger, with a frame; labels --------------------------
      const over = []
      for (let i = 0; i < 8; i++) {
        const frame = flat(0xededed, 10), pic = picMat(i, 11, 0)
        frame.visible = pic.o.visible = false
        scene.add(frame); scene.add(pic.o)
        over.push({ frame, pic })
      }
      const labels = []
      for (let i = 0; i < 8; i++) {
        const mk = (str, o) => {
          const t = ctx.text(str, o); texs.push(t.texture)
          const mm = mat(new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }))
          const mesh = new THREE.Mesh(unit, mm); mesh.renderOrder = 20; mesh.visible = false; mesh.frustumCulled = false
          scene.add(mesh)
          return { mesh, mm, aspect: t.aspect }
        }
        labels.push({ t: mk(ctx.works[i].title, { size: 150 }), m: mk(ctx.works[i].kind + '  ·  ' + ctx.works[i].year, { caps: true, size: 40 }) })
      }

      // ---- opening: the Showreel fills the view, the inner copies cascade inward, the frame of Works fades in -----------------
      const open = gsap.timeline(); tls.push(open)
      open.to(S, { inner: 1, duration: 1.3, ease: 'power3.out' }, 0.45)
        .to(S, { reel: 0, duration: 1.4, ease: 'power2.inOut' }, 0.9)
        .to(S, { frame: 1, duration: 1.1, ease: 'power2.out' }, 1.4)
      const finish = () => { open.kill(); S.inner = 1; S.reel = 0; S.frame = 1; opened = true }
      if (ctx.reduced) finish()
      const skip = () => { if (opened) return false; finish(); return true }

      // ---- targets --------------------------------------------------------------------------------------------------------------
      function makeTargets() {
        if (rtA) rtA.dispose()
        if (rtB) rtB.dispose()
        const w = Math.max(64, Math.round(Math.min(pw * ctx.size.dpr, touch ? 640 : 1280)))
        const h = Math.max(64, Math.round(w / aspect))
        const opt = { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples: touch ? 0 : 4 }
        rtA = new THREE.WebGLRenderTarget(w, h, opt); rtB = new THREE.WebGLRenderTarget(w, h, opt)
        cur = rtA; prev = rtB
      }

      // ---- hero chunks ------------------------------------------------------------------------------------------------------------
      const lineImgs = {}
      const lineImg = (str, key) => { if (!lineImgs[key]) { const t = ctx.text(str, { size: 200 }); t.texture.dispose(); lineImgs[key] = t } return lineImgs[key] }
      function chunk(lns, key, maxW, maxH) {
        const imgs = lns.map((l, k) => lineImg(l, key + k))
        const maxA = Math.max.apply(null, imgs.map((m) => m.aspect)), kk = 0.62 * (lns.length - 1) + 1
        const Lh = Math.min(maxW / maxA, (maxH * 0.94) / kk), rw = Lh * maxA, rh = Lh * kk, pad = Lh * 0.25
        const ppu = Math.min((ph * Math.max(1, ctx.size.dpr)) / 2, 2000 / (rw + 2 * pad))
        const cv = document.createElement('canvas')
        cv.width = Math.max(8, Math.round((rw + 2 * pad) * ppu)); cv.height = Math.max(8, Math.round((rh + 2 * pad) * ppu))
        const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'
        const draw = (blur) => {
          g.shadowColor = blur ? 'rgba(0,0,0,.9)' : 'rgba(0,0,0,0)'; g.shadowBlur = blur
          imgs.forEach((m, k) => { const w = Lh * m.aspect * ppu, h = Lh * ppu; g.drawImage(m.canvas, (cv.width - w) / 2, (pad + k * 0.62 * Lh) * ppu, w, h) })
        }
        draw(Lh * ppu * 0.08); draw(0)
        const tex = new THREE.CanvasTexture(cv); tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter
        return { tex, w: rw + 2 * pad, h: rh + 2 * pad }
      }
      const half = (s) => { // one sentence into two lines at the space nearest the middle
        const w = s.split(/\s+/); if (w.length < 2) return [s]
        let best = 1, bd = 1e9
        for (let k = 1; k < w.length; k++) { const d = Math.abs(w.slice(0, k).join(' ').length - w.slice(k).join(' ').length); if (d < bd) { bd = d; best = k } }
        return [w.slice(0, best).join(' '), w.slice(best).join(' ')]
      }

      // ---- layout -------------------------------------------------------------------------------------------------------------------
      function layout() {
        const a = aspect, por = a < 0.95
        portrait = por
        const topPx = por ? 132 : (pw < 768 ? 68 : 84) + 12
        const kx = (1 + (0.2 * a * a) / (a * a + 1)) / 1.2, ky = (1 + 0.2 / (a * a + 1)) / 1.2
        safeX = a * kx * 0.96
        const safeY = ky * 0.94
        yTop = Math.min(1 - (2 * topPx) / ph, safeY); yBot = Math.max(-1 + (2 * (por ? 20 : 16)) / ph, -safeY)
        cyo = (yTop + yBot) / 2
        const sentences = ctx.hero.split(/(?<=\.)\s+/).filter(Boolean)
        let L1, L2, hero1 = null, hero2 = null
        if (!por) {
          const edge = safeX - 0.02
          let tw = 0.35 * a
          tw = Math.min(tw, (2 * edge - 3 * 0.05) / 4)
          const th = tw * 0.5625, gap = (2 * edge - 4 * tw) / 3
          const yT = yTop - th / 2 - 0.02, yB = yBot + th / 2 + 0.02
          for (let i = 0; i < 8; i++) {
            const c = i % 4, k = tiles[i]
            k.w = tw; k.h = th; k.x = -edge + tw / 2 + c * (tw + gap); k.y = i < 4 ? yT : yB
          }
          sx0 = sy0 = 0.43; c0x = 0; c0y = cyo; ampX = 0.1 * a; ampY = 0.09
          const innerHalf = sx0 * a, free = edge - innerHalf - 0.05, bandH = yT - th / 2 - (yB + th / 2) - 0.06
          const s1 = sentences.length >= 2 ? sentences[0] : ctx.hero
          const s2 = sentences.length >= 2 ? sentences.slice(1).join(' ') : ''
          L1 = chunk(half(s1), 'a', free, bandH); L2 = s2 ? chunk(half(s2), 'b', free, bandH) : null
          const mid = innerHalf + 0.05 + free / 2
          hero1 = { c: L1, x: -mid, y: cyo }; hero2 = L2 && { c: L2, x: mid, y: cyo }
        } else {
          const tw = Math.min(0.34, safeX - 0.04), th = tw * 0.5625, g = 0.03
          const ys = [yTop - th / 2, yTop - th * 1.5 - g, yBot + th * 1.5 + g, yBot + th / 2]
          for (let i = 0; i < 8; i++) {
            const c = i % 2, r = i >> 1, k = tiles[i]
            k.w = tw; k.h = th; k.x = (c ? 1 : -1) * (tw / 2 + 0.012); k.y = ys[r]
          }
          const top = ys[1] - th / 2 - 0.03, bot = ys[2] + th / 2 + 0.03
          const heroH = Math.min(0.26, (top - bot) * 0.36), maxW = Math.min(0.86 * 2 * a, 2 * safeX * 0.95)
          const lns = []
          { let cu = ''; for (const w of ctx.hero.split(/\s+/)) { if (cu && (cu + ' ' + w).length > 19) { lns.push(cu); cu = w } else cu = (cu ? cu + ' ' : '') + w } if (cu) lns.push(cu) }
          L1 = chunk(lns, 'p', maxW, heroH)
          hero1 = { c: L1, x: 0, y: top - heroH / 2 }
          const innerTop = top - heroH - 0.02, wi = Math.min(0.72, 2 * safeX * 0.95), hi = Math.min(wi * 0.5625, innerTop - bot)
          sx0 = wi / (2 * a); sy0 = hi / 2
          c0x = 0; c0y = (innerTop + bot) / 2; ampX = 0.05; ampY = 0.03
        }
        ;[heroL, heroR].forEach((h) => { if (h.material.map) h.material.map = null })
        if (heroTexL) heroTexL.dispose()
        if (heroTexR) heroTexR.dispose()
        heroTexL = hero1.c.tex; heroTexR = hero2 ? hero2.c.tex : null
        heroL.material.map = heroTexL; heroL.material.needsUpdate = true
        heroL.scale.set(hero1.c.w, hero1.c.h, 1); heroL.position.set(hero1.x, hero1.y, 0)
        heroR.visible = !!hero2
        if (hero2) { heroR.material.map = heroTexR; heroR.material.needsUpdate = true; heroR.scale.set(hero2.c.w, hero2.c.h, 1); heroR.position.set(hero2.x, hero2.y, 0) }
        if (!busy) { C.x = c0x; C.y = c0y }
      }

      // ---- maths: screen point <-> page point under the current zoom ---------------------------------------------------------------
      const toQ = (sx, sy) => { // same as the quad's fragment shader
        const dx = (sx - ps.x) / Zx, dy = (sy - ps.y) / Zy, c = Math.cos(phi), s = Math.sin(phi)
        qv.x = ps.x + c * dx - s * dy; qv.y = ps.y + s * dx + c * dy
      }
      const toS = (qx, qy) => {
        const rx = qx - ps.x, ry = qy - ps.y, c = Math.cos(phi), s = Math.sin(phi)
        sv.x = ps.x + Zx * (c * rx + s * ry); sv.y = ps.y + Zy * (-s * rx + c * ry)
      }
      const inInner = (qx, qy) => { // is the page point under the inner screen
        const dx = qx - C.x, dy = qy - C.y, c = Math.cos(thE), s = Math.sin(thE)
        return Math.abs(c * dx + s * dy) < sxE * aspect && Math.abs(-s * dx + c * dy) < syE
      }
      const hitTile = (k, qx, qy, pad) => Math.abs(qx - k.x) < (k.w / 2) * pad && Math.abs(qy - k.y) < (k.h / 2) * pad
      function pickTile() {
        toQ(P.nx * aspect, P.ny)
        if (inInner(qv.x, qv.y)) return -1
        let best = -1, bd = 1e9
        for (let i = 0; i < 8; i++) { const k = tiles[i]; if (hitTile(k, qv.x, qv.y, 1.02)) { const d = (qv.x - k.x) ** 2 + (qv.y - k.y) ** 2; if (d < bd) { bd = d; best = i } } }
        return best
      }

      // ---- label next to the hovered Work, clamped inside the view --------------------------------------------------------------------
      function placeLabel(i, amp, cx, cy, wv, hv) {
        const Lb = labels[i], m = 32 / ph, A = safeX, gap = 0.05
        const asp = Lb.t.aspect, maxTh = portrait ? 0.14 : 0.2
        let side = 1, room = 0, th, below = portrait
        if (!below) {
          const roomR = A - m - (cx + wv / 2 + gap), roomL = cx - wv / 2 - gap + A - m
          side = roomR >= roomL ? 1 : -1; room = Math.max(roomR, roomL)
          th = Math.min(maxTh, room / asp)
          if (th < 0.1) below = true
        }
        if (below) th = Math.min(maxTh, (2 * A - 2 * m) / asp)
        const tw = th * asp
        let mh = th * 0.3
        const cap = below ? 2 * A - 2 * m : room
        if (mh * Lb.m.aspect > cap) mh = cap / Lb.m.aspect
        const mw = mh * Lb.m.aspect, wmax = Math.max(tw, mw), tot = th * 1.1 + mh
        let x0, ty
        if (!below) { x0 = side > 0 ? cx + wv / 2 + gap : cx - wv / 2 - gap - wmax; ty = cy } else {
          x0 = clamp(cx - wmax / 2, -A + m, A - m - wmax)
          ty = cy - hv / 2 - gap - tot / 2
          if (ty - tot / 2 < yBot) ty = cy + hv / 2 + gap + tot / 2
        }
        ty = clamp(ty, yBot + tot / 2, yTop - tot / 2)
        const right = side < 0 && !below, top = ty + tot / 2
        const tx = right ? x0 + wmax - tw / 2 : x0 + tw / 2, mx = right ? x0 + wmax - mw / 2 : x0 + mw / 2
        Lb.t.mesh.position.set(tx, top - th / 2, 0); Lb.t.mesh.scale.set(tw, th, 1)
        Lb.m.mesh.position.set(mx, top - th * 1.1 - mh / 2, 0); Lb.m.mesh.scale.set(mw, mh, 1)
        Lb.t.mm.opacity = Lb.m.mm.opacity = amp
      }

      function dive(i) {
        if (busy) return
        skip()
        busy = true; forced = i
        const tl = gsap.timeline({ onComplete: () => ctx.enter(i) }); tls.push(tl)
        tl.to(S, { fly: 1, duration: 0.8, ease: 'power3.in' }) // the Work swells until it fills the view
      }

      let first = true
      return {
        scene, camera,
        update(t, dt) {
          if (disposed || !rtA) return
          dt = Math.min(dt, 0.05); clock += dt
          const A = aspect
          if (!opened && open.progress() >= 1) opened = true
          const inside = P.inside || P.down
          const nx = inside ? P.nx : 0, ny = inside ? P.ny : 0
          const down = P.down && inside

          // the hand: position and tilt of the inner screen, with weight; speed whips the tunnel into a corkscrew
          whip = damp(whip, portrait ? 0 : clamp(P.dx * 0.012, -0.4, 0.4), 6, dt)
          spd = damp(spd, Math.min(Math.hypot(P.dx, P.dy), 60), 8, dt)
          const tx = c0x + nx * ampX, ty = c0y + ny * ampY, tth = portrait ? 0 : 0.05 + nx * 0.16 + whip
          C.vx += ((tx - C.x) * 40 - C.vx * 9) * dt; C.x += C.vx * dt
          C.vy += ((ty - C.y) * 40 - C.vy * 9) * dt; C.y += C.vy * dt
          C.vth += ((tth - C.th) * 30 - C.vth * 8) * dt; C.th += C.vth * dt
          // press: the inner screen swells toward the full view; on release it falls back with an overshoot
          const pk = down ? 22 : 70, pc = down ? 7 : 5.5
          pressV += (((down ? 1 : 0) - press) * pk - pressV * pc) * dt; press = clamp(press + pressV * dt, -0.25, 1.15)
          const sx = clamp(lerp(sx0, 0.93, press), 0.05, 0.96), sy = clamp(lerp(sy0, 0.93, press), 0.05, 0.96)
          sxE = sx * S.inner; syE = sy * S.inner; thE = C.th * S.inner
          const sxz = Math.max(sxE, 0.12), syz = Math.max(syE, 0.12)

          // fixed point of the recursion p = c + R(th) diag(sx, sy) q
          const cth = Math.cos(thE), sth = Math.sin(thE)
          const k00 = 1 - cth * sxz, k01 = sth * syz, k10 = -sth * sxz, k11 = 1 - cth * syz
          let det = k00 * k11 - k01 * k10; if (Math.abs(det) < 0.03) det = 0.03
          ps.x = clamp((k11 * C.x - k01 * C.y) / det, -2.5, 2.5); ps.y = clamp((-k10 * C.x + k00 * C.y) / det, -2.5, 2.5)

          // scroll: endless zoom about the fixed point
          const z = scroll.y * 0.0017, f = (((z % 1) + 1) % 1) * S.inner
          Zx = Math.pow(1 / sxz, f); Zy = Math.pow(1 / syz, f); phi = thE * f
          U.uA.value = A; U.uPhi.value = phi; U.uPs.value.set(ps.x, ps.y); U.uZ.value.set(Zx, Zy); U.uBr.value = Math.pow(1 / DECAY, f)

          // hover / focus / touch (top level only)
          const live = opened
          let hit = -1
          if (busy) hit = forced
          else if (kb >= 0) hit = kb
          else if (live && inside && !touch) {
            const cu = hovIdx >= 0 ? tiles[hovIdx] : null
            toQ(P.nx * A, P.ny)
            const onOver = cu && cu.cur && Math.abs(P.nx * A - cu.cur.x) < (cu.cur.w / 2) * 1.04 && Math.abs(P.ny - cu.cur.y) < (cu.cur.h / 2) * 1.04
            if (cu && (onOver || hitTile(cu, qv.x, qv.y, 1.04))) hit = hovIdx
            else hit = pickTile()
          }
          if (hit !== hovIdx) {
            const was = hovIdx >= 0
            hovIdx = hit
            if ((hovIdx >= 0) !== was) ctx.cursor.hover(hovIdx >= 0)
          }
          let hovAmt = 0
          for (let i = 0; i < 8; i++) {
            const k = tiles[i]
            k.e = damp(k.e, i === hovIdx ? 1 : 0, 8, dt)
            if (busy && i === forced) k.e = Math.max(k.e, S.fly)
            hovAmt = Math.max(hovAmt, k.e)
          }

          // ---- the page: Works brighten at every depth (the feedback carries it inward), hero dims to ~25%
          const fr = S.frame
          for (let i = 0; i < 8; i++) {
            const k = tiles[i], b = fr * (1 - 0.3 * hovAmt * (1 - k.e)) * (1 + 0.3 * k.e), sc = 0.9 + 0.1 * fr
            k.pic.o.position.set(k.x, k.y, 0); k.pic.o.scale.set(k.w * sc, k.h * sc, 1)
            k.frame.position.set(k.x, k.y, 0); k.frame.scale.set(k.w * sc + 0.012, k.h * sc + 0.012, 1)
            k.pic.m.uniforms.uB.value = b
            k.frame.material.color.setScalar(clamp(fr * (0.75 + 0.25 * k.e), 0, 1))
            k.frame.visible = k.pic.o.visible = fr > 0.002
          }
          const heroA = fr * (1 - 0.75 * hovAmt) * (1 - S.fly)
          heroL.material.opacity = heroA; heroR.material.opacity = heroA
          inner.position.set(C.x, C.y, 0); inner.rotation.z = thE; inner.scale.set(2 * A * sxE, 2 * syE, 1)
          innerFrame.position.copy(inner.position); innerFrame.rotation.z = thE; innerFrame.scale.set(2 * A * sxE + 0.014, 2 * syE + 0.014, 1)
          inner.visible = innerFrame.visible = S.inner > 0.004
          reel.visible = S.reel > 0.003
          if (reel.visible) {
            const cv = Math.max(2 * A, (2 * 16) / 9) * 1.06
            reel.scale.set(Math.max(cv, 2 * A * 1.02), Math.max(cv * 0.5625, 2.04), 1); reelMat.opacity = sstep(0, 0.25, S.reel)
          }

          // ---- feed back: render the page into cur (inner screen = prev), then swap
          const loops = first || ctx.reduced ? 8 : 1
          first = false
          const old = renderer.getRenderTarget()
          for (let n = 0; n < loops; n++) {
            innerMat.map = prev.texture
            renderer.setRenderTarget(cur); renderer.render(page, pcam)
            U.tA.value = cur.texture
            const tmp = cur; cur = prev; prev = tmp
          }
          renderer.setRenderTarget(old)

          // ---- top-level overlays: the hovered Work, bigger, upright; fly-in
          const wvT = portrait ? Math.min(1.6 * A, 2 * safeX * 0.98) : 0.34 * 2 * A, hvT = wvT * 0.5625
          const cover = Math.max(2 * A, (2 * 16) / 9) * 1.06
          for (let i = 0; i < 8; i++) {
            const k = tiles[i], o = over[i], ee = k.e * k.e * (3 - 2 * k.e), fl = busy && i === forced ? S.fly : 0
            if (ee < 0.003) { o.frame.visible = o.pic.o.visible = false; k.cur = null; continue }
            toS(k.x, k.y)
            let cx = sv.x, cy = sv.y, w = k.w * Zx, h = k.h * Zy
            // it grows where it is (the pointer stays on it), nudged inside the view
            const lim = Math.max(0, safeX - wvT / 2 - 0.1)
            let tcx = clamp(cx, -lim, lim), tcy = clamp(cy, yBot + hvT / 2 + 0.04, yTop - hvT / 2 - 0.04)
            const wT = lerp(wvT, cover, fl), hT = wT * 0.5625
            tcx = lerp(tcx, 0, fl); tcy = lerp(tcy, 0, fl)
            cx = lerp(cx, tcx, ee); cy = lerp(cy, tcy, ee); w = lerp(w, wT, ee); h = lerp(h, hT, ee)
            const rz = lerp(-phi, 0, ee)
            o.pic.o.visible = o.frame.visible = true
            o.pic.o.position.set(cx, cy, 0); o.pic.o.rotation.z = rz; o.pic.o.scale.set(w, h, 1)
            o.frame.position.set(cx, cy, 0); o.frame.rotation.z = rz; o.frame.scale.set(w + 0.016, h + 0.016, 1)
            o.pic.m.uniforms.uAlpha.value = sstep(0, 0.2, ee); o.pic.m.uniforms.uB.value = 1 + 0.15 * ee
            o.frame.material.opacity = sstep(0, 0.2, ee) * (1 - fl)
            k.cur = { x: cx, y: cy, w, h }
          }
          labelAmp = damp(labelAmp, hovIdx >= 0 && tiles[hovIdx].e > 0.6 ? 1 : 0, 8, dt)
          for (let i = 0; i < 8; i++) {
            const on = i === hovIdx && labelAmp > 0.01 && tiles[i].cur
            labels[i].t.mesh.visible = labels[i].m.mesh.visible = !!on
            if (on) { const c = tiles[i].cur; placeLabel(i, labelAmp * (1 - clamp(S.fly * 3, 0, 1)), c.x, c.y, c.w, c.h) }
          }

          crt.push = Math.min(1, clamp(press, 0, 1.2) * 0.5 + S.fly * 0.7 + Math.min(0.35, Math.abs(scroll.v) / 3000) + Math.min(0.25, spd / 150))
        },
        resize(w, h) {
          pw = w; ph = h; aspect = w / h
          for (const c of [camera, pcam]) { c.left = -aspect; c.right = aspect; c.top = 1; c.bottom = -1; c.updateProjectionMatrix() }
          makeTargets()
          layout()
        },
        tap() {
          if (skip() || busy) return
          let i = touch ? -1 : hovIdx
          if (i < 0) i = pickTile()
          if (i >= 0) dive(i)
        },
        focus(i) { kb = i },
        activate(i) { skip(); dive(i) },
        back() {
          const tl = gsap.timeline({ onComplete: () => { busy = false; forced = -1 } }); tls.push(tl)
          tl.to(S, { fly: 0, duration: 0.7, ease: 'power2.out' })
        },
        dispose() {
          disposed = true
          tls.forEach((x) => x.kill()); gsap.killTweensOf(S)
          if (rtA) rtA.dispose()
          if (rtB) rtB.dispose()
          geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((x) => x.dispose())
          if (heroTexL) heroTexL.dispose()
          if (heroTexR) heroTexR.dispose()
        },
      }
    },
  })
})()
