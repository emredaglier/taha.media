// THROWAWAY prototype: Flipbook. A mutoscope: eight stacks of thick cards stand on a turntable reel. The cards of a stack are
// frames of its loop (every card is the live loop, panned a little per card). Scroll riffles the cards: each one falls forward
// on a spring (overshoot, bounce on the table) and the speed follows the scroll with inertia, so a fast scroll is a blur of
// flipping cards, a slow one lets single cards flop. When a stack runs out the reel turns to the next one on a spring.
// Mouse drag is a thumb on the card edge: pull down to bend the front card, let go and it snaps over. The pointer orbits
// the camera round the reel. Hover or focus flips the reel to that Work (shortest way) and the front card stands straight with its
// tag beside it. Fly-in: the camera swoops down onto the front card until its loop fills the view. Opening: the Showreel
// card fills the view, falls forward, the stack behind riffles and the reel settles on Work 1.
// One draw call for all 96 cards (instanced attributes: atlas rect, angle, bend, base position); the bend is in the vertex shader.
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const wrap8 = (x) => x - 8 * Math.round(x / 8)
  const mod8 = (n) => ((n % 8) + 8) % 8
  const NC = 12, CW = 4, CH = 2.25, CT = 0.05, SP = 0.07, FAN = 0.04, LEAN = 0.06, RISE = 0.05, PI2 = Math.PI / 2

  const VS = `
    attribute vec4 aRect; attribute vec4 aA; attribute vec4 aB; attribute vec2 aC;
    uniform float uH;
    varying vec2 vUv; varying vec3 vFace; varying vec3 vN; varying vec4 vRect; varying float vK, vBright;
    void main(){
      float s = position.y, th = aA.x, kap = aA.y/uH, a = th + kap*s;
      vec2 cs;                                                   // the card's centre line in (y, z): an arc of constant curvature
      if (abs(kap) < 1e-3) cs = s*vec2(cos(th), sin(th));
      else cs = vec2(sin(a) - sin(th), cos(th) - cos(a))/kap;
      float zt = position.z;
      vec2 yz = vec2(cs.x - sin(a)*zt, cs.y + cos(a)*zt);        // thickness along the arc's normal
      vec3 L = vec3(position.x, yz.x + aC.y, yz.y + aC.x);
      float c = cos(aB.w), sn = sin(aB.w);
      vec3 W = vec3(L.x*c + L.z*sn, L.y, -L.x*sn + L.z*c) + aB.xyz;
      vN = vec3(cos(a)*sn, -sin(a), cos(a)*c);
      vUv = uv; vFace = normal; vRect = aRect; vK = aA.z; vBright = aA.w;
      gl_Position = projectionMatrix*viewMatrix*vec4(W, 1.);
    }`
  const FS = `
    precision highp float;
    uniform sampler2D uMap;
    varying vec2 vUv; varying vec3 vFace; varying vec3 vN; varying vec4 vRect; varying float vK, vBright;
    void main(){
      vec3 Ld = normalize(vec3(-.3, .6, .75));
      vec3 n = normalize(vN);
      vec3 col;
      if (vFace.z > .5) {
        vec2 uv = clamp(vUv, .003, .997);                           // the whole 16:9 cell, edge to edge
        vec3 tex = texture2D(uMap, vRect.xy + uv*vRect.zw).rgb;
        col = tex*mix(.62, 1.1, smoothstep(-.1, .8, dot(n, Ld)))*1.06;
      } else if (vFace.z < -.5) {
        float rim = min(min(vUv.x, 1. - vUv.x)*4., min(vUv.y, 1. - vUv.y));
        col = mix(vec3(.102), vec3(.8), 1. - smoothstep(.0, .014, rim));
      } else {
        col = (vec3(.86) - .13*mod(vK, 2.))*mix(.6, 1., smoothstep(-.1, .8, abs(dot(n, Ld))));
      }
      gl_FragColor = vec4(col*vBright, 1.);
    }`

  HOME.register({
    name: 'Flipbook',
    create(ctx) {
      const size = ctx.size, works = ctx.works, P = ctx.pointer, touch = ctx.touch
      const FOV = 40, TN = Math.tan((FOV * Math.PI) / 360), HUD = 3, N = 8 * NC
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(FOV, size.w / size.h, 0.1, 200)
      scene.add(camera)
      const geos = [], mats = [], textures = []

      // ---- the 96 cards: one instanced draw -------------------------------------------------------------------------------
      const box = new THREE.BoxGeometry(CW, CH, CT); box.translate(0, CH / 2, 0) // hinge on the bottom edge
      const geo = new THREE.InstancedBufferGeometry(); geo.copy(box); geo.instanceCount = N; box.dispose(); geos.push(geo)
      const aRect = new Float32Array(N * 4), aA = new Float32Array(N * 4), aB = new Float32Array(N * 4), aC = new Float32Array(N * 2)
      const attr = (arr, n, name) => { const a = new THREE.InstancedBufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a }
      const tRect = attr(aRect, 4, 'aRect'), tA = attr(aA, 4, 'aA'), tB = attr(aB, 4, 'aB'), tC = attr(aC, 2, 'aC')
      tRect.setUsage(THREE.StaticDrawUsage)
      for (let s = 0; s < 8; s++) { const r = ctx.loopRect(s); for (let k = 0; k < NC; k++) { const i = (s * NC + k) * 4; aRect[i] = r[0]; aRect[i + 1] = r[1]; aRect[i + 2] = r[2]; aRect[i + 3] = r[3] } }
      tRect.needsUpdate = true
      const cardMat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: ctx.atlas }, uH: { value: CH } }, vertexShader: VS, fragmentShader: FS })
      mats.push(cardMat)
      const cards = new THREE.Mesh(geo, cardMat); cards.frustumCulled = false; scene.add(cards)

      // ---- the Showreel card (opening) --------------------------------------------------------------------------------------
      const edgeMat = new THREE.MeshBasicMaterial({ color: 0xededed }), reelFace = new THREE.MeshBasicMaterial({ map: ctx.showreel.texture })
      mats.push(edgeMat, reelFace)
      const reelGeo = new THREE.BoxGeometry(CW, CH, CT); reelGeo.translate(0, CH / 2, 0); geos.push(reelGeo)
      const reelCard = new THREE.Mesh(reelGeo, [edgeMat, edgeMat, edgeMat, edgeMat, reelFace, edgeMat]); reelCard.visible = false
      scene.add(reelCard)

      // ---- HUD: hero sentence and hover tag, in px, children of the camera ------------------------------------------------------
      const hud = new THREE.Group(); camera.add(hud)
      const unit = new THREE.PlaneGeometry(1, 1); geos.push(unit)
      const mkText = (str, opts) => {
        const t = ctx.text(str, opts); textures.push(t.texture)
        const m = new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false }); mats.push(m)
        const mesh = new THREE.Mesh(unit, m); mesh.renderOrder = 61
        return { mesh, mat: m, canvas: t.canvas }
      }
      const PAD = 16
      const tags = works.map((w) => {
        const title = mkText(w.title, { size: 120 }), meta = mkText(`${w.kind} · ${w.year}`, { caps: true, size: 28, color: '#8f8f8f' })
        const plateMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false }); mats.push(plateMat)
        const plate = new THREE.Mesh(unit, plateMat); plate.renderOrder = 60
        const group = new THREE.Group(); group.visible = false
        group.add(plate, title.mesh, meta.mesh); hud.add(group)
        return { group, plate, plateMat, title, meta, wpx: 0, hpx: 0 }
      })
      const layoutTags = () => {
        maxTagW = 400
        const tfp = clamp(size.w * 0.07, 44, 110), mfp = clamp(size.w * 0.011, 13, 18)
        tags.forEach((t) => {
          let tf = tfp / 120, mf = mfp / 28
          const dims = () => [t.title.canvas.width * tf, t.title.canvas.height * tf, t.meta.canvas.width * mf, t.meta.canvas.height * mf]
          let [tw, th, mw, mh] = dims()
          const k = (size.w - 64) / (Math.max(tw, mw) + PAD * 2)
          if (k < 1) { tf *= k; mf *= k; [tw, th, mw, mh] = dims() }
          const pw = Math.max(tw, mw) + PAD * 2, ph = th * 0.82 + mh * 0.9 + PAD * 2
          t.wpx = pw; t.hpx = ph; maxTagW = Math.max(maxTagW === 400 ? 0 : maxTagW, pw)
          t.plate.scale.set(pw, ph, 1); t.title.mesh.scale.set(tw, th, 1); t.meta.mesh.scale.set(mw, mh, 1)
          const padT = Math.ceil(120 * 0.18) * tf, padM = Math.ceil(28 * 0.18) * mf
          t.title.mesh.position.set(-pw / 2 + PAD + tw / 2 - padT, ph / 2 - PAD - th / 2 + 3, 0.01)
          t.meta.mesh.position.set(-pw / 2 + PAD + mw / 2 - padM, -ph / 2 + PAD + mh / 2 - 1, 0.01)
        })
      }
      const heroG = new THREE.Group(); hud.add(heroG)
      let heroItems = [], heroPortrait = null
      const buildHero = (portrait) => {
        heroItems.forEach((it) => { heroG.remove(it.mesh); it.mat.dispose(); it.tex.dispose() })
        heroItems = []; heroPortrait = portrait
        const n = portrait ? 3 : 2, words = ctx.hero.split(/\s+/), target = ctx.hero.length / n, lines = []
        let cur = ''
        for (const w of words) {
          const nx = cur ? cur + ' ' + w : w
          if (cur && nx.length > target * 1.1 && lines.length < n - 1) { lines.push(cur); cur = w } else cur = nx
        }
        lines.push(cur)
        lines.forEach((s) => {
          const t = ctx.text(s, { size: 160 })
          const mat = new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false }); mat.opacity = 0
          const mesh = new THREE.Mesh(unit, mat); mesh.renderOrder = 62
          heroG.add(mesh); heroItems.push({ mesh, mat, tex: t.texture, aspect: t.aspect })
        })
      }
      const layoutHero = () => {
        const w = size.w, h = size.h, portrait = w / h < 1
        if (portrait !== heroPortrait) buildHero(portrait)
        const amax = Math.max(...heroItems.map((it) => it.aspect))
        const f = Math.min(portrait ? w * 0.095 : w * 0.038, (w * 0.88) / (amax * 1.66), 78), mh = f * 1.66, pitch = f * 1.12, top = portrait ? 136 : 112
        heroItems.forEach((it, k) => { it.mesh.scale.set(it.aspect * mh, mh, 1); it.mesh.position.set(0, h / 2 - (top + pitch * (k + 0.5)), 0) })
        const upp = (2 * TN * HUD) / h
        heroG.position.set(0, 0, -HUD); heroG.scale.setScalar(upp)
      }

      // ---- state --------------------------------------------------------------------------------------------------------------
      const th = new Float32Array(N), om = new Float32Array(N)
      const kfMem = new Int8Array(8)
      let S = ctx.reduced ? 0 : -NC, Sv = 0, goal = Math.round(S), ra = Math.floor(Math.floor(S + 0.5) / NC), raV = 0
      const Sd = { v: S }
      const O = { cam: 1, fall: 1, hero: 1 }
      const fly = { k: 0 }
      let ctrl = false, opening = false, flying = false, snap = true
      let hA = 0, hotW = -1, sticky = -1, focusCell = -1, cand = -1, dwell = 0, lockX = 0, lockY = 0, hoverOn = false, pendingFly = -1, pendingAt = 0
      let lastAct = performance.now() / 1000 + 2.5, nextAuto = 0, tagCell = 0, tagA = 0, prevS = S
      let drag = null, dd = 0, ddV = 0, bd = 0, bdV = 0, dcard = -1
      let portrait = false, Wvis = 9, Dc = 7, offY = 0, viewOff = 0, maxTagW = 400
      let tl = null, flyTl = null, backTw = null, wasDown = false
      const look = { x: 0, y: 0 }
      const quad = new Float32Array(8 * 8), qz = new Float32Array(8), qOn = new Uint8Array(8)
      const V = new THREE.Vector3(), Lp = new THREE.Vector3(0, CH * 0.45, 0), fillPos = new THREE.Vector3(), QI = new THREE.Quaternion()

      function resize(w, h) {
        camera.clearViewOffset(); camera.aspect = w / h
        portrait = w / h < 1
        Wvis = CW / (portrait ? 0.84 : 0.52)
        Dc = Wvis / 2 / (TN * (w / h))
        offY = (portrait ? 0.04 : 0.1) * h // push the picture down: the hero stands above the reel
        viewOff = -1
        camera.updateProjectionMatrix(); layoutTags(); layoutHero()
      }
      const setViewOffset = (d) => {
        if (Math.abs(d - viewOff) < 0.4) return
        viewOff = d
        camera.setViewOffset(size.w, size.h, 0, -d, size.w, size.h)
        hud.position.set(0, (d * 2 * TN * HUD) / size.h, 0)
      }

      const SPX = () => CW * (portrait ? 0.62 : 0.95)
      const place = (d, shift) => { // cover-flow: the front stack in the middle, the others to the sides, set back and turned toward it
        const ad = Math.min(Math.abs(d), 3)
        return { bx: d * SPX() + shift, bz: -ad * 2.2, a: clamp(-d * 0.5, -1.3, 1.3) }
      }
      const goalFor = (j) => {
        const st0 = Math.floor(Math.round(S) / NC), dm = wrap8(j - mod8(st0))
        return (st0 + dm) * NC
      }
      function bring(j) { goal = goalFor(j); sticky = j; lockX = P.x; lockY = P.y; lastAct = performance.now() / 1000 }
      const inQuad = (s, nx, ny) => {
        const q = s * 8
        let pos = 0, neg = 0
        for (let e = 0; e < 4; e++) {
          const a = q + e * 2, b = q + ((e + 1) % 4) * 2, c = (quad[b] - quad[a]) * (ny - quad[a + 1]) - (quad[b + 1] - quad[a + 1]) * (nx - quad[a])
          if (c > 0) pos++; else if (c < 0) neg++
        }
        return pos === 0 || neg === 0
      }
      const pickAt = (nx, ny) => {
        let best = -1, bz = -1e9
        for (let s = 0; s < 8; s++) if (qOn[s] && qz[s] > bz && inQuad(s, nx, ny)) { bz = qz[s]; best = s }
        return best
      }

      function startOpening() {
        opening = true; ctrl = true; Sd.v = -NC
        O.cam = 0; O.fall = 0; O.hero = 0; reelCard.visible = true
        tl = gsap.timeline({ onComplete: () => { opening = false; ctrl = false; goal = Math.round(S); reelCard.visible = false } })
        tl.to(O, { cam: 1, duration: 1.5, ease: 'power3.inOut' }, 0.5)
        tl.to(O, { fall: 0.7, duration: 0.38, ease: 'power2.in' }, 0.45)
        tl.to(O, { fall: 1, duration: 0.55, ease: 'bounce.out' }, 0.83)
        tl.to(Sd, { v: 0, duration: 1.5, ease: 'power3.inOut' }, 1.0)
        tl.to(O, { hero: 1, duration: 0.6, ease: 'power2.out' }, 1.8)
        tl.call(() => { reelCard.visible = false }, null, 2.4)
      }
      function flyTo(j) {
        if (flying || opening) return
        flying = true; sticky = j; hotW = j; ctx.cursor.hover(false); hoverOn = false
        drag = null
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(j) })
        flyTl.to(fly, { k: 1, duration: 0.72, ease: 'power3.in' }, 0.15)
      }

      function update(t, dt) {
        dt = clamp(dt, 0.0001, 0.05)
        const sc = ctx.scroll, w = size.w, h = size.h, asp = w / h
        const scrolling = Math.abs(sc.v) > 30 && !opening && !flying
        if (scrolling) lastAct = t

        // ---- S: the deck position in cards. Scroll drives it with inertia; at rest it settles on a whole card -------------------
        if (ctrl) { S = Sd.v; Sv = 0 }
        else if (flying || drag) Sv *= Math.exp(-dt * 10)
        else if (scrolling) {
          Sv += (clamp(sc.v * 0.012, -45, 45) - Sv) * (1 - Math.exp(-dt * 5))
          S += Sv * dt; goal = Math.round(S + Sv * 0.15)
        } else {
          Sv *= Math.exp(-dt * 7); S += Sv * dt
          S += clamp((goal - S) * 8, -60, 60) * dt
          if (!opening && hotW < 0 && sticky < 0 && t - lastAct > 3.4 && t > nextAuto && !ctx.reduced) { goal = Math.round(goal) + 1; nextAuto = t + 2.2 }
        }
        const kfT = Math.floor(S + 0.5), st = Math.floor(kfT / NC), kf = kfT - st * NC, W = mod8(st)
        const sSpeed = Math.abs(S - prevS) / dt; prevS = S
        raV += (70 * (st - ra) - 8.4 * raV) * dt; ra += raV * dt
        const settled = Math.abs(ra - st) < 0.3

        // ---- hover state (set by last frame's picking) ----------------------------------------------------------------------
        hotW = flying ? hotW : sticky >= 0 ? sticky : !opening && focusCell >= 0 ? focusCell : -1
        if (hotW >= 0 && hotW !== W && !flying && !opening && sticky < 0 && !ctrl) bring(hotW) // keyboard focus on a Work that is not in front
        const hT = hotW >= 0 && hotW === W && settled ? 1 : 0
        hA += (hT - hA) * Math.min(1, dt * (hT ? 8 : 6))
        const hAs = hA * hA * (3 - 2 * hA)
        const cwpx = (CW / Wvis) * w, sxPx = portrait ? 0 : clamp(w - 40 - maxTagW - cwpx / 2 - w / 2, -(w / 2 - cwpx / 2 - 16), 0)
        const shiftNow = ((sxPx / w) * Wvis) * hAs

        // ---- thumb drag on the front card (mouse only: on touch a drag is the scroll) ---------------------------------------
        const down = P.down && !opening && !flying
        if (down && !wasDown && !touch && qOn[W] && inQuad(W, P.nx, P.ny)) { drag = { y0: P.y }; dcard = W * NC + kf }
        if (drag) {
          if (down) { dd = clamp((P.y - drag.y0) / (h * 0.28), -1, 1.25); lastAct = t }
          else {
            if (dd > 0.4) goal = Math.round(S) + 1; else if (dd < -0.4) goal = Math.round(S) - 1
            drag = null
          }
        }
        if (!drag) dd = 0
        ddV += (dd - ddV) * Math.min(1, dt * 18)
        const bTgt = drag ? ddV * 1.6 : 0
        bdV += (200 * (bTgt - bd) - 2 * Math.sqrt(200) * 0.3 * bdV) * dt; bd += bdV * dt
        wasDown = down

        // ---- camera: orbit round the reel with the pointer; opening and fly-in blend to a pose straight in front of the card ----
        const steer = !opening && !flying && !touch && P.inside
        const kk = 1 - Math.exp(-dt * 3.5)
        look.x += ((steer ? P.nx : 0) - look.x) * kk; look.y += ((steer ? P.ny : 0) - look.y) * kk
        const az = -look.x * 0.3 + Math.sin(t * 0.21) * 0.015, el = 0.2 + look.y * 0.06
        camera.position.set(Lp.x + Dc * Math.sin(az) * Math.cos(el), Lp.y + Dc * Math.sin(el), Lp.z + Dc * Math.cos(az) * Math.cos(el))
        camera.up.set(0, 1, 0); camera.lookAt(Lp)
        const bf = opening ? 1 - O.cam : fly.k
        if (bf > 0.0005) {
          const dist = Math.max(CH / (2 * TN), CW / (2 * TN * asp)) * 0.985
          fillPos.set(shiftNow, CH / 2, (opening ? SP : 0) + dist)
          camera.position.lerp(fillPos, bf); camera.quaternion.slerp(QI, bf)
        }
        setViewOffset(offY * (1 - clamp(bf, 0, 1)))
        camera.updateMatrixWorld(true)

        // ---- where the cards stand, picking quads --------------------------------------------------------------------------------
        for (let s = 0; s < 8; s++) {
          const d = wrap8(s - ra), pl = place(d, shiftNow), a = pl.a, bx = pl.bx, bz = pl.bz
          qOn[s] = Math.abs(d) < 2.2 ? 1 : 0; qz[s] = bz
          const c = Math.cos(a), sn = Math.sin(a)
          for (let e = 0; e < 4; e++) {
            const lx = e === 0 || e === 3 ? -CW / 2 : CW / 2, ly = e < 2 ? CH : 0
            V.set(bx + lx * c, ly, bz - lx * sn).project(camera)
            quad[s * 8 + e * 2] = V.x; quad[s * 8 + e * 2 + 1] = V.y
          }
        }
        // hover: a stack under the pointer; the front one at once, a neighbour after a short dwell (a sweep is not a choice)
        const live = !opening && !flying && !touch && P.inside && !drag
        let c2 = -1
        if (live) {
          c2 = pickAt(P.nx, P.ny)
          const moved = Math.hypot(P.x - lockX, P.y - lockY)
          if (c2 >= 0) {
            if (c2 === W && sticky === W) { lockX = P.x; lockY = P.y }
            else if (c2 !== sticky && (sticky < 0 || moved > 80)) {
              if (c2 === cand) dwell += dt; else { cand = c2; dwell = 0 }
              if (dwell > (c2 === W ? 0.03 : 0.12) && (c2 === W || settled)) { if (c2 === W) { sticky = W; lockX = P.x; lockY = P.y } else bring(c2); dwell = 0 }
            }
          } else { cand = -1; dwell = 0 }
        }
        if (!flying && !drag && sticky >= 0 && !touch && focusCell < 0) { // the hover is kept while the pointer stays near where it chose, or is on the front card
          const onFront = live && c2 === W && sticky === W
          if (!P.inside || (!onFront && Math.hypot(P.x - lockX, P.y - lockY) > 80)) sticky = -1
        }
        if ((c2 >= 0 && live) !== hoverOn) { hoverOn = c2 >= 0 && live; ctx.cursor.hover(hoverOn) }
        if (pendingFly >= 0) {
          if (pendingFly === W && settled && Math.abs(S - goal) < 0.2) { const j = pendingFly; pendingFly = -1; flyTo(j) }
          else if (t > pendingAt) pendingFly = -1
        }

        // ---- spring per card: target angle, integrate, write the instance data ---------------------------------------------------
        kfMem[W] = kf
        const Cc = 2 * Math.sqrt(420) * 0.33, n = dt > 0.025 ? 2 : 1, hh = dt / n
        for (let s = 0; s < 8; s++) {
          const d = wrap8(s - ra), away = Math.abs(d), pl = place(d, shiftNow), a = pl.a
          const front = s === W
          if (!front && away >= 0.5) kfMem[s] = 0
          const kfs = front ? kf : kfMem[s], fl = front ? S - st * NC : kfs
          const bx = pl.bx, bz = pl.bz, br = 1 - 0.45 * clamp(away, 0, 1)
          const hs = front ? hAs : 0
          for (let k = 0; k < NC; k++) {
            const i = s * NC + k
            let tg
            if (k < kfs) tg = PI2
            else { const rel = k - kfs; tg = -(LEAN * (1 - hs) + FAN * rel * (1 - 0.5 * hs)) }
            if (i === dcard && k >= kfs) tg += ddV * 0.3
            if (snap) { th[i] = tg; om[i] = 0 }
            for (let q = 0; q < n; q++) {
              om[i] += (420 * (tg - th[i]) - Cc * om[i]) * hh; th[i] += om[i] * hh
              if (th[i] > PI2) { th[i] = PI2; if (om[i] > 0) om[i] *= -0.32 }
              else if (th[i] < -0.7) { th[i] = -0.7; om[i] *= -0.3 }
            }
            const f = clamp(th[i] / PI2, 0, 1), o4 = i * 4
            aA[o4] = th[i]; aA[o4 + 1] = i === dcard ? bd : 0; aA[o4 + 2] = k + s * 3; aA[o4 + 3] = br * (1 - clamp((f - 0.3) / 0.6, 0, 1))
            aB[o4] = bx; aB[o4 + 1] = 0; aB[o4 + 2] = bz; aB[o4 + 3] = a
            const rel = Math.max(k - fl, 0)
            aC[i * 2] = -SP * rel; aC[i * 2 + 1] = RISE * Math.min(rel, 5) * (1 - f) * (1 - 0.4 * hs) - f * f * 2.6 // upcoming cards climb like a fan; fallen ones drop away
          }
        }
        snap = false
        tA.needsUpdate = true; tB.needsUpdate = true; tC.needsUpdate = true

        // ---- the Showreel card ---------------------------------------------------------------------------------------------------
        if (reelCard.visible) { reelCard.position.set(0, 0, SP); reelCard.rotation.x = O.fall * PI2 }

        // ---- the glass and the hero --------------------------------------------------------------------------------------------------
        ctx.crt.push = clamp(sSpeed / 48 + fly.k * 0.5 + (opening ? 0.4 * Math.sin(clamp(O.cam, 0, 1) * Math.PI) : 0) + Math.abs(raV) / 14, 0, 1)
        const ho = O.hero * (1 - 0.75 * hAs) * (1 - fly.k)
        for (let q = 0; q < heroItems.length; q++) heroItems[q].mat.opacity = ho

        // ---- tag beside the front card (stacked under it on a phone) ---------------------------------------------------------------
        const want = hotW >= 0 && hotW === W && hA > 0.5 && !flying && !opening
        if (want && hotW !== tagCell) { tags[tagCell].group.visible = false; tagCell = hotW; tagA = 0 }
        tagA += ((want ? 1 : 0) - tagA) * Math.min(1, dt * 12)
        const tg = tags[tagCell]
        tg.group.visible = tagA > 0.01
        if (tg.group.visible) {
          let l, tt
          if (!portrait) {
            let mx = -1e9, cy = 0
            for (let e = 0; e < 4; e++) { V.set(shiftNow + CW / 2, e < 2 ? 0 : CH, 0).project(camera); mx = Math.max(mx, ((V.x + 1) / 2) * w); cy += ((1 - V.y) / 2) * h / 4 }
            l = mx + 24; tt = cy - tg.hpx / 2
          } else {
            V.set(-CW / 2, 0, 0).project(camera)
            l = ((V.x + 1) / 2) * w; tt = ((1 - V.y) / 2) * h + 24
          }
          l = clamp(l, 16, Math.max(16, w - 16 - tg.wpx)); tt = clamp(tt, 16, Math.max(16, h - 16 - tg.hpx))
          const upp = (2 * TN * HUD) / h
          tg.group.position.set((l + tg.wpx / 2 - w / 2 - (1 - tagA) * 14) * upp, -(tt + tg.hpx / 2 - h / 2) * upp, -HUD)
          tg.group.scale.setScalar(upp)
          tg.plateMat.opacity = 0.86 * tagA; tg.title.mat.opacity = tagA; tg.meta.mat.opacity = tagA
        }
      }

      resize(size.w, size.h)
      if (ctx.reduced) { O.hero = 1 } else startOpening()

      return {
        scene, camera, update, resize,
        tap() {
          if (opening) { tl.progress(1); return }
          if (flying) return
          const c = pickAt(ctx.pointer.nx, ctx.pointer.ny)
          const j = touch || hotW < 0 ? c : hotW
          if (j < 0) return
          const W = mod8(Math.floor(Math.floor(S + 0.5) / NC))
          if (j === W && Math.abs(ra - Math.floor(Math.floor(S + 0.5) / NC)) < 0.4) flyTo(j); else bring(j)
        },
        focus(i) { focusCell = i },
        activate(i) {
          if (opening) tl.progress(1)
          if (flying) return
          const W = mod8(Math.floor(Math.floor(S + 0.5) / NC))
          if (i === W) flyTo(i); else { bring(i); pendingFly = i; pendingAt = performance.now() / 1000 + 4 }
        },
        back() {
          if (flyTl) flyTl.kill()
          if (backTw) backTw.kill()
          backTw = gsap.to(fly, { k: 0, duration: 0.8, ease: 'power3.inOut', onComplete: () => { flying = false; sticky = -1; focusCell = -1 } })
        },
        dispose() {
          if (tl) tl.kill(); if (flyTl) flyTl.kill(); if (backTw) backTw.kill()
          gsap.killTweensOf(O); gsap.killTweensOf(Sd); gsap.killTweensOf(fly)
          ctx.cursor.hover(false)
          heroItems.forEach((it) => { it.mat.dispose(); it.tex.dispose() })
          geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); textures.forEach((x) => x.dispose())
          camera.clearViewOffset(); scene.remove(camera, cards, reelCard)
        },
      }
    },
  })
})()
