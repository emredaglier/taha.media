// THROWAWAY prototype: Strings. A giant instrument: a dozen taut strings across the whole view, the eight Works are beads
// clipped to them. Every string is a 1D wave simulation on the CPU (fixed ends, damped wave equation). The pointer plucks
// (crossing a string with speed), press and drag bows a string and release twangs it. Works ride the string (height and slope)
// and ripple/brighten when a wave passes. Scroll runs an arpeggio top to bottom (or up). Hover: that string goes quiet and tight,
// the Work comes forward with its tag. Fly-in: the string is pulled back and snaps the Work at the camera. Opening: the Showreel
// fills the view, the strings are drawn across it one by one like cuts, the strips fall away, the Works pop on the lines.
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

  const CARD_VS = `
    uniform float uAmp, uTime; varying vec2 vUv;
    void main(){
      vUv = uv; vec3 p = position;
      float k = sin(p.x * 14. + uTime * 16.) * uAmp;      // a wave runs through the picture
      p.y += k * .035; p.z += k * .05;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
    }`
  const CARD_FS = `
    precision highp float;
    uniform sampler2D uMap; uniform vec4 uRect; uniform float uGlow; varying vec2 vUv;
    void main(){
      vec2 uv = clamp(vUv, .004, .996);
      vec3 c = texture2D(uMap, uRect.xy + uv * uRect.zw).rgb;
      gl_FragColor = vec4(c * (1.03 + uGlow), 1.);
    }`
  const REEL_FS = `
    precision highp float; uniform sampler2D uMap; uniform vec2 uCover; varying vec2 vUv;
    void main(){ gl_FragColor = vec4(texture2D(uMap, (vUv - .5) * uCover + .5).rgb, 1.); }`

  HOME.register({
    name: 'Strings',
    create(ctx) {
      const size = ctx.size, works = ctx.works, P = ctx.pointer, touch = ctx.touch
      const FOV = 40, TN = Math.tan((FOV * Math.PI) / 360), HUD = 3
      const NMAX = 12, NP = touch ? 40 : 64, STEP = touch ? 1 / 60 : 1 / 120, MAXS = touch ? 2 : 4
      const K = Math.pow((NP - 1) / 1.15, 2) // wave speed: the view is crossed in about 1.15 s, at any width
      const TH = touch ? 1.6 : 1.3 // half thickness of a string in px
      const SIG = touch ? 1.8 : 2.4 // pluck width in points

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(FOV, size.w / size.h, 1, 8000)
      scene.add(camera)
      const textures = [], geos = [], mats = []

      // ---- strings: one ribbon mesh for all of them --------------------------------------------------------------------
      const U = new Float32Array(NMAX * NP), V = new Float32Array(NMAX * NP)
      const sPos = new Float32Array(NMAX * NP * 6), sCol = new Float32Array(NMAX * NP * 6)
      const sIdx = new Uint16Array(NMAX * (NP - 1) * 6)
      for (let s = 0; s < NMAX; s++) for (let j = 0; j < NP - 1; j++) {
        const a = (s * NP + j) * 2, o = (s * (NP - 1) + j) * 6
        sIdx[o] = a; sIdx[o + 1] = a + 1; sIdx[o + 2] = a + 2; sIdx[o + 3] = a + 1; sIdx[o + 4] = a + 3; sIdx[o + 5] = a + 2
      }
      const sGeo = new THREE.BufferGeometry()
      const sPosA = new THREE.BufferAttribute(sPos, 3); sPosA.setUsage(THREE.DynamicDrawUsage)
      const sColA = new THREE.BufferAttribute(sCol, 3); sColA.setUsage(THREE.DynamicDrawUsage)
      sGeo.setAttribute('position', sPosA); sGeo.setAttribute('color', sColA); sGeo.setIndex(new THREE.BufferAttribute(sIdx, 1))
      const sMat = new THREE.MeshBasicMaterial({ vertexColors: true })
      const sMesh = new THREE.Mesh(sGeo, sMat); sMesh.frustumCulled = false; scene.add(sMesh)
      geos.push(sGeo); mats.push(sMat)

      // ---- the eight Works: beads on the strings ------------------------------------------------------------------------------
      const cards = []
      const cardGeo = new THREE.PlaneGeometry(1, 9 / 16, 12, 7); geos.push(cardGeo)
      for (let i = 0; i < 8; i++) {
        const r = ctx.loopRect(i)
        const mat = new THREE.ShaderMaterial({
          vertexShader: CARD_VS, fragmentShader: CARD_FS,
          uniforms: { uMap: { value: ctx.atlas }, uRect: { value: new THREE.Vector4(r[0], r[1], r[2], r[3]) }, uAmp: { value: 0 }, uTime: { value: 0 }, uGlow: { value: 0 } },
        })
        const mesh = new THREE.Mesh(cardGeo, mat); mesh.frustumCulled = false
        const group = new THREE.Group(); group.add(mesh); scene.add(group); mats.push(mat)
        cards.push({ group, mat, y: 0, yv: 0, th: 0, thv: 0, amp: 0, h: 0, pop: { v: 1 } })
      }

      // ---- hover tags: HUD children of the camera, in px ------------------------------------------------------------------------
      const hud = new THREE.Group(); camera.add(hud)
      const unit = new THREE.PlaneGeometry(1, 1); geos.push(unit)
      const mkText = (str, opts) => {
        const t = ctx.text(str, opts); textures.push(t.texture)
        const m = new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false }); mats.push(m)
        const mesh = new THREE.Mesh(unit, m); mesh.renderOrder = 61
        return { mesh, mat: m, canvas: t.canvas }
      }
      const PAD = 16
      const tags = works.map((wk) => {
        const title = mkText(wk.title, { size: 120 }), meta = mkText(`${wk.kind} · ${wk.year}`, { caps: true, size: 28, color: '#8f8f8f' })
        const plateMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false }); mats.push(plateMat)
        const plate = new THREE.Mesh(unit, plateMat); plate.renderOrder = 60
        const group = new THREE.Group(); group.visible = false
        group.add(plate, title.mesh, meta.mesh); hud.add(group)
        return { group, plate, plateMat, title, meta, wpx: 0, hpx: 0 }
      })
      const layoutTags = () => {
        const tfp = clamp(size.w * 0.07, 44, 110), mfp = clamp(size.w * 0.011, 13, 18)
        tags.forEach((t) => {
          let tf = tfp / 120, mf = mfp / 28
          const dims = () => [t.title.canvas.width * tf, t.title.canvas.height * tf, t.meta.canvas.width * mf, t.meta.canvas.height * mf]
          let [tw, th, mw, mh] = dims()
          const k = (size.w - 64) / (Math.max(tw, mw) + PAD * 2)
          if (k < 1) { tf *= k; mf *= k; [tw, th, mw, mh] = dims() }
          const pw = Math.max(tw, mw) + PAD * 2, ph = th * 0.82 + mh * 0.9 + PAD * 2
          t.wpx = pw; t.hpx = ph
          t.plate.scale.set(pw, ph, 1); t.title.mesh.scale.set(tw, th, 1); t.meta.mesh.scale.set(mw, mh, 1)
          const padT = Math.ceil(120 * 0.18) * tf, padM = Math.ceil(28 * 0.18) * mf
          t.title.mesh.position.set(-pw / 2 + PAD + tw / 2 - padT, ph / 2 - PAD - th / 2 + 3, 0.01)
          t.meta.mesh.position.set(-pw / 2 + PAD + mw / 2 - padM, -ph / 2 + PAD + mh / 2 - 1, 0.01)
        })
      }

      // ---- the Showreel strips of the opening ------------------------------------------------------------------------------------
      const reelMat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: ctx.showreel.texture }, uCover: { value: new THREE.Vector2(1, 1) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: REEL_FS,
      })
      mats.push(reelMat)
      const stripGroup = new THREE.Group(); scene.add(stripGroup)
      let strips = []

      // ---- state ---------------------------------------------------------------------------------------------------------------------
      let nStr = 12, portrait = false, W2 = 1, builtW = 0, builtH = 0
      const ys = new Float32Array(NMAX), sidx = new Int8Array(8), cxs = new Float32Array(8)
      let cw = 100
      const draw = [], drop = []
      for (let k = 0; k <= NMAX; k++) { draw.push({ v: 1 }); drop.push({ v: 1 }) }
      const heroA = { v: 1 }, fly = { k: 0, pull: 0 }
      let hero = null
      const dC = new Float32Array(NMAX).fill(0.55), brt = new Float32Array(NMAX).fill(0.8)
      const pose = [], home = []
      for (let i = 0; i < 8; i++) { pose.push({ x: 0, y: 0, w: 0, l: 0, t: 0, init: false }); home.push({ x: 0, y: 0 }) }
      let acc = 0, wasDown = false, spike = 0, ptrSp = 0, ambient = 3
      let holdS = -1, holdJ = 0, holdT = 0, holdKind = 0 // 1 pointer bow, 2 fly-in pull
      let opening = false, flying = false, flyIdx = -1, hot = -1, hoverOn = false, focusCell = -1
      let cand = -1, dwell = 0, tagCell = 0, tagA = 0, dim = 0, lastCell = 0, strumIdx = -1
      let tl = null, flyTl = null, backTw = null
      const QN = 48, qS = new Int8Array(QN), qT = new Float32Array(QN), qA = new Float32Array(QN), qX = new Float32Array(QN)
      let qn = 0

      // ---- layout: strings, beads, hero (all in px, camera sits so that the plane z = 0 maps 1:1 to the screen) ----------------------------
      function build() {
        const w = size.w, h = size.h, asp = w / h
        builtW = w; builtH = h
        portrait = asp < 1
        W2 = w + 16
        const top = portrait ? 140 : w < 768 ? 110 : 120, bot = h - 24
        let hg, s, ch, idxA = 2, idxB = 9
        if (!portrait) {
          nStr = 12
          hg = clamp(0.22 * (h - top), 110, 210)
          ys[0] = top; ys[1] = top + hg
          s = (bot - ys[1]) / 10
          for (let m = 2; m < 12; m++) ys[m] = ys[1] + s * (m - 1)
          cw = Math.min(0.17 * w, ((2.6 * s) * 16) / 9); ch = (cw * 9) / 16
          idxB = clamp(Math.floor((h - 18 - ch / 2 - ys[1]) / s) + 1, 5, 11); idxA = Math.max(2, idxB - 3)
          for (let i = 0; i < 8; i++) { sidx[i] = i < 4 ? idxA : idxB; cxs[i] = w * (0.125 + 0.25 * (i % 4)) }
        } else {
          nStr = 10
          hg = clamp(h * 0.2, 150, 190)
          ys[0] = top; ys[1] = top + hg
          cw = 0.4 * w; ch = (cw * 9) / 16
          s = (h - 24 - ch / 2 - ys[1]) / 8
          if (2 * s < ch + 10) { ch = 2 * s - 10; cw = (ch * 16) / 9 }
          for (let m = 2; m < 10; m++) ys[m] = ys[1] + s * (m - 1)
          for (let i = 0; i < 8; i++) { sidx[i] = 2 + i; cxs[i] = w * (i % 2 === 0 ? 0.27 : 0.73) }
        }
        for (let i = 0; i < 8; i++) { home[i].x = cxs[i]; home[i].y = ys[sidx[i]]; pose[i].init = false }
        sGeo.setDrawRange(0, nStr * (NP - 1) * 6)
        buildHero(hg)
        buildStrips()
      }

      function buildHero(hg) {
        const w = size.w, n = portrait ? 3 : 2
        if (!hero || hero.n !== n) {
          if (hero) hero.items.forEach((it) => { scene.remove(it.mesh); it.t.texture.dispose(); it.mesh.material.dispose() })
          const words = ctx.hero.split(/\s+/), tgt = ctx.hero.length / n, lines = []
          let cur = ''
          for (const wd of words) {
            const nx = cur ? cur + ' ' + wd : wd
            if (cur && nx.length > tgt * 1.1 && lines.length < n - 1) { lines.push(cur); cur = wd } else cur = nx
          }
          lines.push(cur)
          hero = { n, items: lines.map((l) => {
            const t = ctx.text(l, { size: 160 })
            const mat = new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthWrite: false })
            const mesh = new THREE.Mesh(unit, mat); mesh.renderOrder = 2; scene.add(mesh)
            return { t, mesh }
          }) }
        }
        const amax = Math.max(...hero.items.map((it) => it.t.aspect), 0.1), cnt = hero.items.length
        const lh = Math.min(((portrait ? 0.86 : 0.8) * w) / amax, (0.9 * hg) / (0.72 * (cnt - 1) + 0.6)), pitch = lh * 0.72
        const cy = (ys[0] + ys[1]) / 2
        hero.items.forEach((it, k) => {
          it.mesh.scale.set(it.t.aspect * lh, lh, 1)
          it.mesh.position.set(0, size.h / 2 - (cy + (k - (cnt - 1) / 2) * pitch), -4)
        })
      }

      function buildStrips() {
        strips.forEach((st) => { stripGroup.remove(st.mesh); st.mesh.geometry.dispose() })
        strips = []
        if (ctx.reduced) return
        const w = size.w, h = size.h, a = w / h, ar = 16 / 9
        reelMat.uniforms.uCover.value.set(Math.min(1, a / ar), Math.min(1, ar / a))
        const cu = reelMat.uniforms.uCover.value
        for (let k = 0; k <= nStr; k++) {
          const y0 = k === 0 ? -4 : ys[k - 1], y1 = k === nStr ? h + 4 : ys[k], hk = y1 - y0
          const g = new THREE.PlaneGeometry(w, hk, 1, 1), uv = g.attributes.uv, ps = g.attributes.position
          for (let q = 0; q < uv.count; q++) { // plane uv -> the strip's part of the full 16:9 picture
            const u = ps.getX(q) / w + 0.5, v = 1 - (y0 + (hk / 2 - ps.getY(q))) / h
            uv.setXY(q, (u - 0.5) * cu.x + 0.5, (v - 0.5) * cu.y + 0.5)
          }
          // the strip's own uv already carries the cover; the shader must not apply it twice
          const mesh = new THREE.Mesh(g, stripMat); mesh.frustumCulled = false
          mesh.position.set(0, h / 2 - (y0 + y1) / 2, -30 + (nStr - k) * 0.5)
          stripGroup.add(mesh)
          strips.push({ mesh, yc: h / 2 - (y0 + y1) / 2, hk, sg: k % 2 ? 1 : -1 })
        }
      }
      const stripMat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: ctx.showreel.texture } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: 'precision highp float; uniform sampler2D uMap; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(uMap, vUv).rgb, 1.); }',
      })
      mats.push(stripMat)

      // ---- the wave simulation ---------------------------------------------------------------------------------------------------------
      function pluck(s, xf, amp, sig) {
        const c = xf * (NP - 1), o = s * NP
        for (let j = 1; j < NP - 1; j++) {
          const d = (j - c) / sig
          if (d * d < 16) U[o + j] += amp * Math.exp(-d * d * 0.5)
        }
      }
      function stepSim(dt) {
        for (let s = 0; s < nStr; s++) {
          const o = s * NP, f = Math.exp(-dC[s] * dt)
          for (let j = 1; j < NP - 1; j++) V[o + j] += K * (U[o + j - 1] - 2 * U[o + j] + U[o + j + 1]) * dt
          for (let j = 1; j < NP - 1; j++) { V[o + j] *= f; U[o + j] = clamp(U[o + j] + V[o + j] * dt, -260, 260) }
        }
      }
      const jOf = (i) => clamp(Math.round(((cxs[i] - size.w / 2) / W2 + 0.5) * (NP - 1)), 2, NP - 3)
      function enqueue(s, delay, amp, xf) {
        if (qn >= QN) return
        qS[qn] = s; qT[qn] = delay; qA[qn] = amp; qX[qn] = xf; qn++
      }

      // ---- picking and hover -------------------------------------------------------------------------------------------------------------
      function inCard(i, wx, wy) {
        const g = cards[i].group, dx = wx - g.position.x, dy = wy - g.position.y, c = Math.cos(g.rotation.z), sn = Math.sin(g.rotation.z)
        const lx = dx * c + dy * sn, ly = -dx * sn + dy * c, sc = g.scale.x
        return Math.abs(lx) < sc / 2 && Math.abs(ly) < (sc * 9) / 32
      }
      function hitTest(wx, wy) {
        if (hot >= 0 && cards[hot].group.visible && inCard(hot, wx, wy)) return hot
        for (let i = 0; i < 8; i++) if (cards[i].pop.v > 0.8 && cards[i].group.visible && inCard(i, wx, wy)) return i
        return -1
      }
      function frameOf(i, dt) { // the flat "forward" pose of Work i, in screen px (y down)
        const w = size.w, h = size.h, asp = w / h, tg = tags[i], ps = pose[i], hm = home[i]
        const fwp = (asp < 1 ? 0.8 : 0.36) * w, fhp = (fwp * 9) / 16, M = 24, TOP = portrait ? 132 : 104, BOT = h - 24
        let fcx, fcy, tl_, tt
        if (asp >= 1 && fwp + 22 + tg.wpx + 2 * M <= w) {
          const right = hm.x <= w / 2, gw = fwp + 22 + tg.wpx, gl = clamp(right ? hm.x - fwp / 2 : hm.x + fwp / 2 - gw, M, w - M - gw)
          fcx = right ? gl + fwp / 2 : gl + tg.wpx + 22 + fwp / 2; tl_ = right ? gl + fwp + 22 : gl
          fcy = clamp(hm.y, TOP + fhp / 2, Math.max(TOP + fhp / 2, BOT - fhp / 2)); tt = fcy - tg.hpx / 2
        } else {
          const gt = clamp(h * 0.5 - fhp / 2, TOP, Math.max(TOP, BOT - (fhp + 16 + tg.hpx)))
          fcx = w / 2; fcy = gt + fhp / 2
          tl_ = clamp(fcx - fwp / 2, M, Math.max(M, w - M - tg.wpx)); tt = gt + fhp + 16
        }
        tt = clamp(tt, TOP, Math.max(TOP, BOT - tg.hpx))
        const k = ps.init ? 1 - Math.exp(-dt * 14) : 1
        ps.init = true; ps.x += (fcx - ps.x) * k; ps.y += (fcy - ps.y) * k; ps.w += (fwp - ps.w) * k; ps.l += (tl_ - ps.l) * k; ps.t += (tt - ps.t) * k
      }

      // ---- the four moments ---------------------------------------------------------------------------------------------------------------
      function startOpening() {
        opening = true
        tl = gsap.timeline({ onComplete: () => { opening = false; stripGroup.visible = false } })
        for (let k = 0; k < nStr; k++) {
          draw[k].v = 0; drop[k].v = 0
          const t0 = 0.3 + k * 0.15
          tl.to(draw[k], { v: 1, duration: 0.3, ease: 'power1.in' }, t0)
          tl.call(() => { pluck(k, 0.5, k % 2 ? -42 : 42, SIG); spike = Math.max(spike, 0.3) }, null, t0 + 0.3)
          tl.to(drop[k], { v: 1, duration: 0.85, ease: 'power2.in' }, t0 + 0.3)
        }
        drop[nStr].v = 0
        tl.to(drop[nStr], { v: 1, duration: 0.85, ease: 'power2.in' }, 0.3 + (nStr - 1) * 0.15 + 0.3)
        for (let i = 0; i < 8; i++) {
          cards[i].pop.v = 0
          tl.to(cards[i].pop, { v: 1, duration: 0.55, ease: 'back.out(1.8)' }, 0.3 + sidx[i] * 0.15 + 0.3 + (i % 4) * 0.07)
        }
        heroA.v = 0
        tl.to(heroA, { v: 1, duration: 0.7, ease: 'power2.out' }, 0.3 + (nStr - 1) * 0.15 + 0.5)
        stripGroup.visible = true
      }
      function flyTo(i) {
        if (flying || opening || i < 0) return
        flying = true; flyIdx = i; hot = i; ctx.cursor.hover(false); hoverOn = false
        holdS = sidx[i]; holdJ = jOf(i); holdKind = 2; fly.pull = 0
        frameOf(i, 0.016)
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        flyTl.to(fly, { pull: 1, duration: 0.14, ease: 'power2.out' }, 0)
        flyTl.call(() => { holdS = -1; holdKind = 0; spike = 1 }, null, 0.14) // the string lets go: the Work is shot at the camera
        flyTl.to(fly, { k: 1, duration: 0.72, ease: 'power3.in' }, 0.14)
      }

      // ---- per frame ------------------------------------------------------------------------------------------------------------------------
      function update(t, dt) {
        dt = clamp(dt, 0.0001, 0.05)
        const w = size.w, h = size.h, sc = ctx.scroll
        const wx = P.nx * (w / 2), wy = P.ny * (h / 2)
        const live = P.inside && (!touch || P.down) && !opening && !flying
        ptrSp += (Math.hypot(P.dx, P.dy) / dt - ptrSp) * Math.min(1, dt * 10)

        // scroll strums the strings one after another
        const cell = Math.floor(sc.y / 70)
        let n = cell - lastCell; lastCell = cell
        if (n !== 0 && !opening && !flying) {
          const dir = n > 0 ? 1 : -1; n = Math.min(Math.abs(n), 12)
          const A = clamp(Math.abs(sc.v) / 10, 16, 70)
          for (let k = 0; k < n; k++) {
            strumIdx = (strumIdx + dir + nStr) % nStr
            enqueue(strumIdx, k * 0.05, (k % 2 ? -1 : 1) * dir * A, 0.15 + 0.7 * ((strumIdx * 0.37) % 1))
          }
        }
        for (let q = 0; q < qn;) {
          qT[q] -= dt
          if (qT[q] <= 0) {
            pluck(qS[q], qX[q], qA[q], SIG); spike = Math.max(spike, 0.12)
            qn--; qS[q] = qS[qn]; qT[q] = qT[qn]; qA[q] = qA[qn]; qX[q] = qX[qn]
          } else q++
        }
        // a quiet pluck now and then so the instrument is seen to be alive
        ambient -= dt
        if (ambient < 0) { ambient = 3.5 + Math.random() * 3; if (!opening && !flying && hot < 0) pluck((Math.random() * nStr) | 0, 0.15 + Math.random() * 0.7, (Math.random() < 0.5 ? -1 : 1) * 16, SIG) }

        // the pointer plucks by crossing a string
        if (live && hot < 0 && holdKind !== 1 && (P.dx !== 0 || P.dy !== 0)) {
          const px = wx - P.dx, py = wy + P.dy, vy = wy - py
          if (Math.abs(vy) > 1.5) for (let s = 0; s < nStr; s++) {
            const yS = h / 2 - ys[s], y0 = py - yS, y1 = wy - yS
            if (y0 * y1 < 0) {
              const k = y0 / (y0 - y1), xf = ((px + k * (wx - px)) / W2) + 0.5
              if (xf > 0.02 && xf < 0.98) { pluck(s, xf, clamp(vy * 2, -90, 90), SIG); spike = Math.max(spike, Math.min(0.25, Math.abs(vy) / 200)) }
            }
          }
        }

        // press and drag bows a string; release twangs it
        const down = P.down && !touch && !opening && !flying && P.inside
        if (down && !wasDown) {
          let best = -1, bd = 34
          const x = clamp(Math.round((wx / W2 + 0.5) * (NP - 1)), 0, NP - 1)
          for (let s = 0; s < nStr; s++) { const d = Math.abs(wy - (h / 2 - ys[s] + U[s * NP + x])); if (d < bd) { bd = d; best = s } }
          if (best >= 0) { holdS = best; holdJ = clamp(x, 3, NP - 4); holdKind = 1 }
        }
        if (holdKind === 1) {
          if (!down) {
            if (Math.abs(holdT) > 40) spike = Math.max(spike, Math.min(1, Math.abs(holdT) / 110))
            holdS = -1; holdKind = 0
          } else holdT = clamp(wy - (h / 2 - ys[holdS]), -Math.min(170, 0.28 * h), Math.min(170, 0.28 * h))
        } else if (holdKind === 2) holdT = -55 * fly.pull
        wasDown = down
        if (holdS >= 0) {
          const o = holdS * NP, k = Math.min(1, dt * 16), hj = holdJ
          for (let j = 1; j < NP - 1; j++) {
            const tri = j <= hj ? (holdT * j) / hj : (holdT * (NP - 1 - j)) / (NP - 1 - hj)
            U[o + j] += (tri - U[o + j]) * k; V[o + j] *= 0.2
          }
        }

        // hover: stop on a Work; a sweeping pointer is a plectrum, not a choice
        let hit = -1
        if (live && holdKind !== 1 && !touch) {
          let keep = false
          if (hot >= 0 && cards[hot].h > 0.5) keep = inCard(hot, wx, wy)
          if (keep) { hit = hot; dwell = 1; cand = hot } else {
            const c2 = hitTest(wx, wy)
            if (c2 !== cand) { dwell = 0; cand = c2 } else if (c2 >= 0 && ptrSp < 700) dwell += dt
            hit = c2 >= 0 && dwell > 0.12 && ptrSp < 1100 ? c2 : -1
          }
        } else { dwell = 0; cand = -1 }
        if ((hit >= 0) !== hoverOn) { hoverOn = hit >= 0; ctx.cursor.hover(hoverOn) }
        hot = flying ? flyIdx : hit >= 0 ? hit : !opening && focusCell >= 0 ? focusCell : -1

        // that string goes quiet and tight
        for (let s = 0; s < nStr; s++) {
          const quiet = hot >= 0 && sidx[hot] === s && !flying, tg = quiet ? 9 : holdS === s ? 6 : touch ? 0.7 : 0.55
          dC[s] += (tg - dC[s]) * Math.min(1, dt * 10)
        }
        acc += dt
        let steps = 0
        while (acc >= STEP && steps < MAXS) { stepSim(STEP); acc -= STEP; steps++ }
        if (steps === MAXS) acc = 0

        // ribbons
        const rb = 0.93
        for (let s = 0; s < nStr; s++) {
          const o = s * NP, yb = h / 2 - ys[s], rev = s & 1, dI = clamp(draw[s].v, 0, 1) * (NP - 1)
          let en = 0
          for (let j = 0; j < NP; j++) en += Math.abs(V[o + j])
          en /= NP
          const bt = hot >= 0 && sidx[hot] === s ? 1 : clamp(0.78 + en / 300, 0.78, 1)
          brt[s] += (bt - brt[s]) * Math.min(1, dt * 12)
          const c = brt[s] * rb
          for (let j = 0; j < NP; j++) {
            const jj = rev ? NP - 1 - Math.min(NP - 1 - j, dI) : Math.min(j, dI)
            const a = Math.floor(jj), b = Math.min(a + 1, NP - 1), f = jj - a
            const u = U[o + a] * (1 - f) + U[o + b] * f, x = (jj / (NP - 1) - 0.5) * W2, y = yb + u
            const k = (o + j) * 6
            sPos[k] = x; sPos[k + 1] = y + TH; sPos[k + 2] = 0
            sPos[k + 3] = x; sPos[k + 4] = y - TH; sPos[k + 5] = 0
            sCol[k] = sCol[k + 1] = sCol[k + 2] = sCol[k + 3] = sCol[k + 4] = sCol[k + 5] = c
          }
        }
        sPosA.needsUpdate = true; sColA.needsUpdate = true

        // the Works ride their strings
        const dx = W2 / (NP - 1), fill = Math.max(w, (h * 16) / 9) * 1.03
        for (let i = 0; i < 8; i++) {
          const c = cards[i], s = sidx[i], o = s * NP, j = jOf(i), tgt = hot === i ? 1 : 0
          const uj = U[o + j], slope = (U[o + j + 1] - U[o + j - 1]) / (2 * dx)
          c.yv += ((uj - c.y) * 380 - c.yv * 20) * dt; c.y += c.yv * dt
          c.thv += ((Math.atan(slope) * 1.1 - c.th) * 170 - c.thv * 9) * dt; c.th = clamp(c.th + c.thv * dt, -0.7, 0.7)
          let e = 0
          for (let q = j - 2; q <= j + 2; q++) e += Math.abs(V[o + q])
          const at = clamp(e / 5 / 700, 0, 1)
          c.amp += (at - c.amp) * Math.min(1, dt * (at > c.amp ? 25 : 4))
          c.h += (tgt - c.h) * Math.min(1, dt * (tgt ? 9 : 6))
          if (c.h < 0.003 && !tgt) { c.h = 0; pose[i].init = false }
          if (c.h > 0 || tgt) frameOf(i, dt)
          const ps = pose[i], hA = c.h, fk = i === flyIdx ? fly.k : 0
          let x = cxs[i] - w / 2, y = h / 2 - ys[s] + c.y, sca = cw, rot = c.th * (1 - hA)
          if (hA > 0) { x += (ps.x - w / 2 - x) * hA; y += (h / 2 - ps.y - y) * hA; sca += (ps.w - sca) * hA }
          if (fk > 0) { x *= 1 - fk; y *= 1 - fk; sca += (fill - sca) * fk; rot *= 1 - fk }
          const g = c.group, pp = Math.max(c.pop.v, 0.0001)
          g.visible = c.pop.v > 0.002
          g.position.set(x, y, 3 + hA * 2 + fk * 20); g.rotation.z = rot; g.scale.set(sca * pp, sca * pp, 1)
          c.mat.uniforms.uAmp.value = c.amp; c.mat.uniforms.uTime.value = t; c.mat.uniforms.uGlow.value = c.amp * 0.4 + hA * 0.08
        }

        // the opening: strips fall away
        if (opening) for (let k = 0; k < strips.length; k++) {
          const st = strips[k], d = clamp(drop[Math.min(k, nStr - 1)].v, 0, 1), m = st.mesh
          const dd = k === nStr ? clamp(drop[nStr].v, 0, 1) : d // the last strip (below the last string) has its own drop
          m.visible = dd < 1
          m.position.y = st.yc - dd * dd * (h * 1.15 + st.hk); m.position.x = st.sg * dd * 60; m.rotation.z = st.sg * dd * 0.35
        }

        // hero fades while a Work is shown
        dim += ((hot >= 0 ? 0.75 : 0) - dim) * Math.min(1, dt * 7)
        const ha = heroA.v * (1 - dim)
        if (hero) hero.items.forEach((it) => { it.mesh.material.opacity = ha; it.mesh.visible = ha > 0.01 })

        spike *= Math.exp(-dt * 5)
        ctx.crt.push = clamp(spike + Math.abs(sc.v) / 4000 + fly.k * 0.5, 0, 1)

        // tag beside the flat Work
        const want = hot >= 0 && cards[hot].h > 0.25 && !flying && !opening
        if (want && hot !== tagCell) { tags[tagCell].group.visible = false; tagCell = hot; tagA = 0 }
        tagA += ((want ? 1 : 0) - tagA) * Math.min(1, dt * 12)
        const tg = tags[tagCell], ps = pose[tagCell]
        tg.group.visible = tagA > 0.01
        if (tg.group.visible) {
          const upp = (2 * TN * HUD) / h
          const l = clamp(ps.l, 16, w - 16 - tg.wpx), tt = clamp(ps.t, 16, h - 16 - tg.hpx)
          tg.group.position.set((l + tg.wpx / 2 - w / 2 - (1 - tagA) * 14) * upp, -(tt + tg.hpx / 2 - h / 2) * upp, -HUD)
          tg.group.scale.setScalar(upp)
          tg.plateMat.opacity = 0.86 * tagA; tg.title.mat.opacity = tagA; tg.meta.mat.opacity = tagA
        }
      }

      build(); layoutTags()
      if (ctx.reduced) { opening = false; stripGroup.visible = false } else startOpening()

      return {
        scene, camera, update,
        resize(w, h) {
          camera.aspect = w / h
          camera.position.set(0, 0, h / 2 / TN)
          camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
          layoutTags()
          if (w !== builtW || h !== builtH) {
            const was = opening
            build()
            if (was && tl) tl.progress(1) // a resize during the opening just finishes it
          }
        },
        tap() {
          if (opening) { tl.progress(1); return }
          if (flying) return
          let i = hot
          if (i < 0 || touch) i = hitTest(P.nx * (size.w / 2), P.ny * (size.h / 2))
          if (i >= 0) flyTo(i)
        },
        focus(i) { focusCell = i },
        activate(i) {
          if (opening) tl.progress(1)
          if (flying) return
          flyTo(i)
        },
        back() {
          if (flyTl) flyTl.kill()
          if (backTw) backTw.kill()
          holdS = -1; holdKind = 0
          if (flyIdx >= 0) pluck(sidx[flyIdx], 0.5, -40, SIG)
          backTw = gsap.to(fly, { k: 0, pull: 0, duration: 0.8, ease: 'power3.inOut', onComplete: () => { flying = false; flyIdx = -1; focusCell = -1 } })
        },
        dispose() {
          if (tl) tl.kill(); if (flyTl) flyTl.kill(); if (backTw) backTw.kill()
          gsap.killTweensOf(fly); gsap.killTweensOf(heroA)
          draw.forEach((d) => gsap.killTweensOf(d)); drop.forEach((d) => gsap.killTweensOf(d)); cards.forEach((c) => gsap.killTweensOf(c.pop))
          ctx.cursor.hover(false)
          strips.forEach((st) => st.mesh.geometry.dispose())
          if (hero) hero.items.forEach((it) => { it.t.texture.dispose(); it.mesh.material.dispose() })
          geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); textures.forEach((x) => x.dispose())
          scene.remove(camera)
        },
      }
    },
  })
})()
