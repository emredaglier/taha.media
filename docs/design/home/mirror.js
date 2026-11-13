// THROWAWAY prototype 'Mirror'. Contract: docs/design/home/CONTRACT.md.
// An infinity mirror room, no real reflections: the whole room (eight Works + hero) is instanced in a 7 x 3 x 10 lattice of
// cells; odd cells are mirrored (scale -1 on that axis), so reflected text really is mirrored. Brightness falls with cell
// distance and reaches black at about 6 cells. One InstancedBufferGeometry (per-instance cell index), one draw per Work.
// Pointer: head turn (camera, +-35 deg) and a small shear of the lattice; press: walls swing open like doors (spring, overshoot).
// Scroll: the lattice slides toward you and wraps after two cells (even parity, so the wrap is invisible).
// View units at the Work plane (z = 0): y in [-1, 1] up, x in [-aspect, aspect]; the camera sits at z = L.
;(function () {
  'use strict'
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))
  const lerp = (a, b, t) => a + (b - a) * t
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

  const FOV = 50, L = 1 / Math.tan((FOV * Math.PI) / 360) // camera distance so the Work plane is 2 units tall
  const NI = 3, NJ = 1, K0 = -8, K1 = 1 // cell ranges: 7 x 3 x 10
  const WZ = 2.5 * L, WY = 1.9, HF = 0.9 // cell depth, cell height, hovered Work distance as a fraction of L
  const ANG = [108, 72, 18, -18, -72, -108, -162, 162] // the loose ring, degrees
  const BZ = [0.05, -0.1, 0.12, -0.04, 0.08, -0.08, 0.1, -0.06]

  const LATTICE = `
    uniform vec3 uCell; uniform vec4 uShear;
    vec3 lattice(vec3 b, float sl){
      vec3 p = vec3(b.x * uCell.x, b.y * uCell.y, b.z * uCell.z + sl);
      float dep = clamp(-p.z / uCell.z, 0., 9.);
      p.x *= 1. + uShear.w * dep;          // doors: the side walls swing open with depth
      float zz = p.z;
      p.x += uShear.x * zz; p.y += uShear.y * zz; p.z += uShear.z * p.x; // tilted mirrors: the corridors bend
      return p;
    }`
  const FALL = `float fall(float n, float rev){ return exp(-.3 * n) * (1. - smoothstep(4.4, 6.6, n)) * (1. - smoothstep(rev - 1.3, rev, n)); }`

  const VS = `
    attribute vec3 aCell;
    uniform float uSlide; uniform vec3 uPos; uniform mat3 uRot; uniform vec2 uSize;
    ${LATTICE}
    varying vec2 vUv; varying float vN; varying float vNear;
    void main(){
      vec3 sg = 1. - 2. * mod(abs(aCell), 2.);                 // odd cell on an axis: mirror image
      vec3 loc = uRot * vec3(position.xy * uSize, 0.) + uPos;
      vec3 wp = sg * loc + lattice(aCell, uSlide);
      vec4 mv = viewMatrix * vec4(wp, 1.);
      vN = length(vec3(aCell.xy, aCell.z + uSlide / uCell.z));  // distance from the real room, in cells
      vNear = smoothstep(.1, .8, -mv.z);
      vUv = uv;
      gl_Position = projectionMatrix * mv;
    }`
  const FS_WORK = `
    uniform sampler2D tMap; uniform vec4 uRect; uniform float uReveal, uHov, uDim, uWaveR, uWaveA, uFade;
    varying vec2 vUv; varying float vN; varying float vNear;
    ${FALL}
    void main(){
      vec2 u = clamp(vUv, .004, .996);
      vec3 c = texture2D(tMap, uRect.xy + u * uRect.zw).rgb;
      float x = vN - uWaveR;
      float b = fall(vN, uReveal) * (1. + .3 * uHov) * uDim * (1. + 2.2 * uWaveA * exp(-x * x / .9));
      gl_FragColor = vec4(min(c * b * vNear * uFade, vec3(1.)), 1.);
    }`
  const FS_HERO = `
    uniform sampler2D tMap; uniform float uReveal, uAlpha;
    varying vec2 vUv; varying float vN; varying float vNear;
    ${FALL}
    void main(){
      vec4 t = texture2D(tMap, vUv);
      float b = fall(vN, uReveal);
      gl_FragColor = vec4(t.rgb * b, t.a * uAlpha * vNear * smoothstep(0., .12, b));
    }`
  const VS_LINE = `
    uniform float uSlideL, uReveal, uFade;
    ${LATTICE}
    ${FALL}
    varying float vB;
    void main(){
      vec3 p = lattice(position, uSlideL);
      vec4 mv = viewMatrix * vec4(p, 1.);
      float n = length(vec3(position.xy, position.z + uSlideL / uCell.z));
      vB = fall(n, uReveal) * smoothstep(.1, .8, -mv.z) * uFade;
      gl_Position = projectionMatrix * mv;
    }`
  const FS_LINE = 'varying float vB; void main(){ gl_FragColor = vec4(vec3(.93), vB * .9); }'

  HOME.register({
    name: 'Mirror',
    create(ctx) {
      const P = ctx.pointer, scroll = ctx.scroll, crt = ctx.crt, touch = ctx.touch
      const tls = [], geos = [], mats = [], texs = []
      const mat = (m) => (mats.push(m), m), geo = (g) => (geos.push(g), g)
      let aspect = 1.6, pw = 1280, ph = 800, portrait = false, disposed = false, opened = false, busy = false
      let safeX = 1.5, yTop = 0.8, yBot = -0.8, cyo = 0, clock = 0
      let hovIdx = -1, kb = -1, forced = -1, labelAmp = 0, door = 0, doorV = 0, heroTex = null
      const S = { cam: 0, reel: 1, rev: -0.3, hero: 0, fly: 0 }
      const look = { x: 0, y: 0 }, frz = { x: 0, y: 0 }, sh = { x: 0, y: 0, z: 0 }

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(FOV, 1.6, 0.05, 120)
      camera.rotation.order = 'YXZ'
      scene.add(camera) // labels and the Showreel are children of the camera

      // ---- the lattice: instance list, sorted far to near so the transparent hero copies blend in a sane order ----
      const cells = []
      for (let i = -NI; i <= NI; i++) for (let j = -NJ; j <= NJ; j++) for (let k = K0; k <= K1; k++) cells.push([i, j, k, Math.hypot(i, j, k)])
      cells.sort((a, b) => a[2] - b[2] || b[3] - a[3])
      const cellArr = new Float32Array(cells.length * 3)
      cells.forEach((c, n) => { cellArr[n * 3] = c[0]; cellArr[n * 3 + 1] = c[1]; cellArr[n * 3 + 2] = c[2] })
      const base = geo(new THREE.PlaneGeometry(1, 1))
      const ig = geo(new THREE.InstancedBufferGeometry())
      ig.setIndex(base.index)
      ig.setAttribute('position', base.attributes.position)
      ig.setAttribute('uv', base.attributes.uv)
      ig.setAttribute('aCell', new THREE.InstancedBufferAttribute(cellArr, 3))
      ig.instanceCount = cells.length

      const U = {
        uCell: { value: new THREE.Vector3(3.6, WY, WZ) }, uShear: { value: new THREE.Vector4() },
        uSlide: { value: 0 }, uSlideL: { value: 0 }, uReveal: { value: -0.3 }, uFade: { value: 1 },
      }
      const wkU = (i) => Object.assign({}, U, {
        tMap: { value: ctx.atlas }, uRect: { value: new THREE.Vector4().fromArray(ctx.loopRect(i)) },
        uPos: { value: new THREE.Vector3() }, uRot: { value: new THREE.Matrix3() }, uSize: { value: new THREE.Vector2(0.7, 0.4) },
        uHov: { value: 0 }, uDim: { value: 1 }, uWaveR: { value: 0 }, uWaveA: { value: 0 },
      })

      // ---- lines: the seams of the mirrors -------------------------------------------------------------------------
      const lv = []
      const ibs = [], jbs = [], kbs = []
      for (let t = 0; t <= 2 * NI + 1; t++) ibs.push(-NI - 0.5 + t)
      for (let t = 0; t <= 2 * NJ + 1; t++) jbs.push(-NJ - 0.5 + t)
      for (let t = 0; t <= K1 - K0 + 2; t++) kbs.push(K0 - 1.5 + t)
      for (let i = -NI; i <= NI; i++) for (const jb of jbs) for (const kb2 of kbs) lv.push(i - 0.5, jb, kb2, i + 0.5, jb, kb2)
      for (let j = -NJ; j <= NJ; j++) for (const ib of ibs) for (const kb2 of kbs) lv.push(ib, j - 0.5, kb2, ib, j + 0.5, kb2)
      for (let k = K0 - 1; k <= K1; k++) for (const ib of ibs) for (const jb of jbs) lv.push(ib, jb, k - 0.5, ib, jb, k + 0.5)
      const lineGeo = geo(new THREE.BufferGeometry())
      lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lv), 3))
      const lines = new THREE.LineSegments(lineGeo, mat(new THREE.ShaderMaterial({
        uniforms: { uCell: U.uCell, uShear: U.uShear, uSlideL: U.uSlideL, uReveal: U.uReveal, uFade: U.uFade },
        vertexShader: VS_LINE, fragmentShader: FS_LINE, transparent: true, depthWrite: false,
      })))
      lines.frustumCulled = false; lines.renderOrder = 1
      scene.add(lines)

      // ---- Works -----------------------------------------------------------------------------------------------------
      const Wk = []
      for (let i = 0; i < 8; i++) {
        const u = wkU(i)
        const m = mat(new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS_WORK, side: THREE.DoubleSide }))
        const mesh = new THREE.Mesh(ig, m); mesh.frustumCulled = false; mesh.renderOrder = 0
        scene.add(mesh)
        Wk.push({ u, mesh, bx: 0, by: 0, bz: BZ[i], w: 0.7, ph: i * 1.7, e: 0, wr: 0, wa: 0, tl: null, svx: 0, svy: 0, wv: 0.7, rect: null, cur: null })
      }
      // hero: instanced the same way, transparent
      const heroU = Object.assign({}, U, {
        tMap: { value: null }, uPos: { value: new THREE.Vector3(0, 0, 0.1) }, uRot: { value: new THREE.Matrix3() },
        uSize: { value: new THREE.Vector2(1, 1) }, uAlpha: { value: 0 },
      })
      const heroMesh = new THREE.Mesh(ig, mat(new THREE.ShaderMaterial({
        uniforms: heroU, vertexShader: VS, fragmentShader: FS_HERO, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      })))
      heroMesh.frustumCulled = false; heroMesh.renderOrder = 2
      scene.add(heroMesh)

      // ---- screen-space things (camera children, view units at distance L) ----------------------------------------------
      const quadGeo = geo(new THREE.PlaneGeometry(1, 1))
      const reelMat = mat(new THREE.MeshBasicMaterial({ map: ctx.showreel.texture, transparent: true, depthTest: false, depthWrite: false }))
      const reel = new THREE.Mesh(quadGeo, reelMat); reel.renderOrder = 30; reel.frustumCulled = false; reel.position.z = -L
      camera.add(reel)
      const labels = []
      for (let i = 0; i < 8; i++) {
        const mk = (str, o) => {
          const t = ctx.text(str, o); texs.push(t.texture)
          const mm = mat(new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }))
          const mesh = new THREE.Mesh(quadGeo, mm); mesh.renderOrder = 20; mesh.visible = false; mesh.frustumCulled = false
          camera.add(mesh)
          return { mesh, mm, aspect: t.aspect }
        }
        labels.push({ t: mk(ctx.works[i].title, { size: 150 }), m: mk(ctx.works[i].kind + '  ·  ' + ctx.works[i].year, { caps: true, size: 40 }) })
      }

      // ---- hero text ----------------------------------------------------------------------------------------------------
      const wideLines = ctx.hero.replace(/\.\s+/g, '.\n').split('\n').filter(Boolean)
      const tallLines = []
      { let cur = ''; for (const w of ctx.hero.split(/\s+/)) { if (cur && (cur + ' ' + w).length > 15) { tallLines.push(cur); cur = w } else cur = (cur ? cur + ' ' : '') + w } if (cur) tallLines.push(cur) }
      const lineImgs = {}
      const lineImg = (str, key) => { if (!lineImgs[key]) { const t = ctx.text(str, { size: 200 }); t.texture.dispose(); lineImgs[key] = t } return lineImgs[key] }

      // ---- opening -------------------------------------------------------------------------------------------------------
      const open = gsap.timeline(); tls.push(open)
      open.to(S, { cam: 1, duration: 1.3, ease: 'power2.inOut' }, 0.25)
        .to(S, { reel: 0, duration: 1.0, ease: 'power2.inOut' }, 0.3)
        .to(S, { rev: 9.5, duration: 2.3, ease: 'power1.inOut' }, 0.75)
        .to(S, { hero: 1, duration: 0.8, ease: 'power1.out' }, 1.5)
      const finish = () => { open.kill(); S.cam = 1; S.reel = 0; S.rev = 9.5; S.hero = 1; opened = true }
      if (ctx.reduced) finish()
      const skip = () => { if (opened) return false; finish(); return true }

      // ---- layout --------------------------------------------------------------------------------------------------------
      function layout() {
        const a = aspect, por = a < 0.95
        portrait = por
        const topPx = por ? 132 : (pw < 768 ? 68 : 84) + 12
        const kx = (1 + (0.2 * a * a) / (a * a + 1)) / 1.2, ky = (1 + 0.2 / (a * a + 1)) / 1.2 // how far the glass crops the edges
        safeX = a * kx * 0.96
        const safeY = ky * 0.94
        yTop = Math.min(1 - (2 * topPx) / ph, safeY); yBot = Math.max(-1 + (2 * (por ? 20 : 16)) / ph, -safeY)
        cyo = (yTop + yBot) / 2
        const halfH = (yTop - yBot) / 2
        let maxW, bandH
        if (!por) {
          const W = Math.min(0.4 * a, halfH * 0.9), H = W * 0.5625 // each Work about 20% of the view width
          const rx = safeX - W / 2 - 0.03, ry = Math.max(0.2, halfH - H / 2 - 0.05)
          for (let i = 0; i < 8; i++) {
            const r = (ANG[i] * Math.PI) / 180
            Wk[i].w = W; Wk[i].bx = Math.cos(r) * rx; Wk[i].by = cyo + Math.sin(r) * ry
          }
          maxW = Math.max(0.5, 2 * (rx * 0.951 - W / 2 - 0.05)); bandH = Math.max(0.3, 2 * (ry * 0.951 - H / 2) - 0.05)
        } else {
          const tw = Math.min(0.34, safeX - 0.04), th = tw * 0.5625, g = 0.03
          const yt = yTop - 0.05, yb = yBot + 0.03 // margin: perspective and the slow drift push a Work a little past its home
          const ys = [yt - th / 2, yt - th * 1.5 - g, yb + th * 1.5 + g, yb + th / 2]
          for (let i = 0; i < 8; i++) {
            const c = i % 2, r = i >> 1
            Wk[i].w = tw; Wk[i].bx = (c ? 1 : -1) * (tw / 2 + 0.012) + (r % 2 ? 0.02 : -0.02); Wk[i].by = ys[r]
          }
          maxW = Math.min(0.86 * 2 * a, 2 * safeX * 0.95); bandH = ys[1] - ys[2] - th - 0.06
        }
        // hero: large serif lines with a soft dark halo so they read when a reflection passes behind
        const lns = por ? tallLines : wideLines, n = lns.length
        const imgs = lns.map((l, k) => lineImg(l, 'h' + k + (por ? 't' : 'w')))
        const maxA = Math.max.apply(null, imgs.map((m) => m.aspect)), kk = 0.62 * (n - 1) + 1
        const Lh = Math.min(maxW / maxA, (bandH * 0.92) / kk), rw = Lh * maxA, rh = Lh * kk, pad = Lh * 0.25
        const ppu = Math.min((ph * Math.max(1, ctx.size.dpr)) / 2, 2000 / (rw + 2 * pad))
        const cv = document.createElement('canvas')
        cv.width = Math.max(8, Math.round((rw + 2 * pad) * ppu)); cv.height = Math.max(8, Math.round((rh + 2 * pad) * ppu))
        const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'
        const draw = (blur) => {
          g.shadowColor = blur ? 'rgba(0,0,0,.95)' : 'rgba(0,0,0,0)'; g.shadowBlur = blur
          imgs.forEach((m, k) => { const w = Lh * m.aspect * ppu, h = Lh * ppu; g.drawImage(m.canvas, (cv.width - w) / 2, (pad + k * 0.62 * Lh) * ppu, w, h) })
        }
        draw(Lh * ppu * 0.1); draw(Lh * ppu * 0.1); draw(0)
        if (heroTex) heroTex.dispose()
        heroTex = new THREE.CanvasTexture(cv); heroTex.generateMipmaps = false; heroTex.minFilter = heroTex.magFilter = THREE.LinearFilter
        heroU.tMap.value = heroTex
        heroU.uSize.value.set(rw + 2 * pad, rh + 2 * pad); heroU.uPos.value.set(0, cyo, 0.1)
        U.uCell.value.x = 2 * clamp(por ? 0.62 : 0.96 * a, 0.62, 3)
      }

      // ---- hovered Work: title + kind/year beside it (camera space, view units), clamped inside the view -------------------
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
        Lb.t.mesh.position.set(tx, top - th / 2, -L); Lb.t.mesh.scale.set(tw, th, 1)
        Lb.m.mesh.position.set(mx, top - th * 1.1 - mh / 2, -L); Lb.m.mesh.scale.set(mw, mh, 1)
        Lb.t.mm.opacity = Lb.m.mm.opacity = amp
      }

      // ---- picking: only the real room, in screen space (rects were projected this frame) ------------------------------------
      const inRect = (r, nx, ny, pad) => !!r && Math.abs(nx - r.cx) < r.hx * pad && Math.abs(ny - r.cy) < r.hy * pad
      function pickAt(nx, ny, pad) {
        let best = -1, bd = 1e9
        for (let i = 0; i < 8; i++) {
          for (let m = 0; m < 2; m++) {
            const r = m ? Wk[i].cur : Wk[i].rect
            if (inRect(r, nx, ny, pad)) { const d = (nx - r.cx) * (nx - r.cx) + (ny - r.cy) * (ny - r.cy); if (d < bd) { bd = d; best = i } }
          }
        }
        return best
      }
      function startWave(i) {
        const k = Wk[i]
        if (k.tl) k.tl.kill()
        k.wr = -0.5; k.wa = 1
        k.tl = gsap.timeline(); tls.push(k.tl)
        k.tl.to(k, { wr: 9, duration: 1.5, ease: 'power1.out' }, 0).to(k, { wa: 0, duration: 0.5, ease: 'power1.in' }, 1.0)
      }
      function dive(i) {
        if (busy) return
        skip()
        busy = true; forced = i
        const tl = gsap.timeline({ onComplete: () => ctx.enter(i) }); tls.push(tl)
        tl.to(S, { fly: 1, duration: 0.85, ease: 'power3.in' }) // you step through the Work, as through a mirror
      }

      const tv = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), eu = new THREE.Euler(), m4 = new THREE.Matrix4()
      const mirZ = (q) => q.set(-q.x, -q.y, q.z, q.w)

      return {
        scene, camera,
        update(t, dt) {
          if (disposed) return
          dt = Math.min(dt, 0.05); clock += dt
          const A = aspect
          if (!opened && open.progress() >= 1) opened = true
          const inside = P.inside || P.down
          const nx = inside ? P.nx : 0, ny = inside ? P.ny : 0
          const down = P.down && inside

          // head turn with weight, mirrors tilt, doors
          // while a Work is hovered the head holds still, so the Work stays under the pointer
          const ltx = hovIdx >= 0 ? frz.x : nx, lty = hovIdx >= 0 ? frz.y : ny
          look.x = damp(look.x, ltx, 3.4, dt); look.y = damp(look.y, lty, 3.4, dt)
          camera.rotation.set(look.y * 0.3, -look.x * 0.61, 0)
          camera.position.set(0, 0, L * (0.58 + 0.42 * S.cam))
          camera.updateMatrixWorld(true)
          sh.x = damp(sh.x, nx * 0.09, 2.8, dt); sh.y = damp(sh.y, ny * 0.07, 2.8, dt); sh.z = damp(sh.z, nx * 0.05, 2.8, dt)
          const dk = down ? 26 : 85, dc = down ? 9 : 6.5 // slow to open, snaps back with overshoot
          doorV += (((down ? 1 : 0) - door) * dk - doorV * dc) * dt; door = clamp(door + doorV * dt, -0.6, 1.3)
          U.uShear.value.set(sh.x, sh.y, sh.z, (door + S.fly * 0.6) * 0.12)

          // scroll walks you forward; the lattice wraps after two cells (same parity, no pop)
          const P2 = 2 * WZ, sW = (((scroll.y * 0.0036) % P2) + P2) % P2
          U.uSlide.value = sW; U.uSlideL.value = sW % WZ
          U.uReveal.value = S.rev; U.uFade.value = 1 - 0.6 * S.fly
          const kS = Math.round(-sW / WZ), sz = kS & 1 ? -1 : 1, zoff = kS * WZ + sW // the cell nearest to you
          const ox = sh.x * zoff, oy = sh.y * zoff, oz = zoff + sh.z * ox

          // each Work: drift, turn, where it is on screen
          const live = opened || S.rev > 2.5
          const dA = portrait ? 0.015 : 0.035
          for (let i = 0; i < 8; i++) {
            const k = Wk[i], ph2 = k.ph
            k.hx = k.bx + Math.sin(clock * 0.31 + ph2) * dA; k.hy = k.by + Math.cos(clock * 0.27 + ph2 * 1.3) * dA * 0.8; k.hz = k.bz + Math.sin(clock * 0.23 + ph2) * 0.1
            k.ry = Math.sin(clock * 0.37 + ph2 * 0.7) * 0.22; k.rx = Math.sin(clock * 0.29 + ph2) * 0.06
            tv.set(k.hx + ox, k.hy + oy, sz * k.hz + oz).applyMatrix4(camera.matrixWorldInverse)
            const d = Math.max(0.2, -tv.z)
            k.svx = (tv.x * L) / d; k.svy = (tv.y * L) / d; k.wv = (k.w * L) / d
            k.rect = { cx: k.svx / A, cy: k.svy, hx: k.wv / 2 / A, hy: k.wv * 0.28125 }
          }

          // hover / focus / touch
          let hit = -1
          if (busy) hit = forced
          else if (kb >= 0) hit = kb
          else if (live && inside && !touch) {
            const cur = hovIdx >= 0 ? Wk[hovIdx] : null
            if (cur && (inRect(cur.rect, P.nx, P.ny, 1.04) || inRect(cur.cur, P.nx, P.ny, 1.04))) hit = hovIdx
            else hit = pickAt(P.nx, P.ny, 1)
          }
          if (hit !== hovIdx) {
            const was = hovIdx >= 0
            hovIdx = hit
            if (hovIdx >= 0) { frz.x = look.x + (nx - look.x) * 0.25; frz.y = look.y + (ny - look.y) * 0.25; startWave(hovIdx) }
            if ((hovIdx >= 0) !== was) ctx.cursor.hover(hovIdx >= 0)
          }
          let hovAmt = 0
          for (let i = 0; i < 8; i++) {
            const k = Wk[i]
            k.e = damp(k.e, i === hovIdx ? 1 : 0, 7, dt)
            if (busy && i === forced) k.e = Math.max(k.e, S.fly)
            hovAmt = Math.max(hovAmt, k.e)
          }

          // display transform of each Work (cell-local, for the instance shader)
          const cover = Math.max(2 * A, (2 * 16) / 9) * 1.06
          const wvT = portrait ? Math.min(1.6 * A, 2 * safeX * 0.98) : 0.36 * 2 * A
          const hvT = wvT * 0.5625
          q2.copy(camera.quaternion)
          for (let i = 0; i < 8; i++) {
            const k = Wk[i], u = k.u
            const ee = k.e * k.e * (3 - 2 * k.e), fl = busy && i === forced ? S.fly : 0
            let px = k.hx, py = k.hy, pz = k.hz, w = k.w
            eu.set(k.rx, k.ry, 0, 'YXZ'); q1.setFromEuler(eu)
            if (sz < 0) mirZ(q1) // the displayed orientation in a z-mirrored cell
            let cx = k.svx, cy = k.svy, wvc = k.wv
            if (ee > 0.0005) {
              // it grows where it is (the pointer stays on it), nudged inside the view
              const lim = Math.max(0, safeX - wvT / 2 - 0.1)
              let sx = clamp(k.svx, -lim, lim), sy = clamp(k.svy, yBot + hvT / 2 + 0.04, yTop - hvT / 2 - 0.04)
              sx = lerp(sx, 0, fl); sy = lerp(sy, 0, fl)
              const wv = lerp(wvT, cover, fl)
              tv.set(sx * HF, sy * HF, -L * HF).applyMatrix4(camera.matrixWorld)
              px = lerp(px, tv.x - ox, ee); py = lerp(py, tv.y - oy, ee); pz = lerp(pz, sz * (tv.z - oz), ee)
              w = lerp(w, wv * HF, ee)
              q1.slerp(q2, ee) // faces the camera
              cx = lerp(cx, sx, ee); cy = lerp(cy, sy, ee); wvc = lerp(wvc, wv, ee)
            }
            if (sz < 0) mirZ(q1)
            m4.makeRotationFromQuaternion(q1); u.uRot.value.setFromMatrix4(m4)
            u.uPos.value.set(px, py, pz); u.uSize.value.set(w, w * 0.5625)
            u.uHov.value = ee; u.uDim.value = (1 - 0.4 * hovAmt * (1 - k.e)) * (1 - 0.6 * S.fly * (i === forced ? 0 : 1))
            u.uWaveR.value = k.wr; u.uWaveA.value = k.wa
            k.cur = k.e > 0.02 ? { cx: cx / A, cy, hx: wvc / 2 / A, hy: wvc * 0.28125 } : null
            k.lc = { cx, cy, wv: wvc }
          }
          heroU.uAlpha.value = S.hero * (1 - 0.75 * hovAmt) * (1 - S.fly)

          // opening Showreel: fills the view, then shrinks away as the room appears
          reel.visible = S.reel > 0.003
          if (reel.visible) {
            const cv = Math.max(2 * A, (2 * 16) / 9) * 1.06, s = cv * (0.12 + 0.88 * S.reel)
            reel.scale.set(s, s * 0.5625, 1); reel.position.set(0, cyo * (1 - S.reel), -L)
            reelMat.opacity = sstep(0, 0.3, S.reel)
          }

          // label
          labelAmp = damp(labelAmp, hovIdx >= 0 && Wk[hovIdx].e > 0.6 ? 1 : 0, 8, dt)
          for (let i = 0; i < 8; i++) {
            const on = i === hovIdx && labelAmp > 0.01
            labels[i].t.mesh.visible = labels[i].m.mesh.visible = on
            if (on) { const lc = Wk[i].lc; placeLabel(i, labelAmp * (1 - clamp(S.fly * 3, 0, 1)), lc.cx, lc.cy, lc.wv, lc.wv * 0.5625) }
          }

          crt.push = Math.min(1, clamp(door, 0, 1.2) * 0.5 + S.fly * 0.7 + Math.min(0.3, Math.abs(scroll.v) / 3000))
        },
        resize(w, h) {
          pw = w; ph = h; aspect = w / h
          camera.aspect = aspect; camera.updateProjectionMatrix()
          layout()
        },
        tap() {
          if (skip() || busy) return
          let i = touch ? -1 : hovIdx
          if (i < 0) i = pickAt(P.nx, P.ny, 1.08)
          if (i >= 0) dive(i)
        },
        focus(i) { kb = i },
        activate(i) { skip(); dive(i) },
        back() {
          const tl = gsap.timeline({ onComplete: () => { busy = false; forced = -1 } }); tls.push(tl)
          tl.to(S, { fly: 0, duration: 0.8, ease: 'power2.out' })
        },
        dispose() {
          disposed = true
          tls.forEach((x) => x.kill()); gsap.killTweensOf(S)
          geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((x) => x.dispose())
          if (heroTex) heroTex.dispose()
        },
      }
    },
  })
})()
