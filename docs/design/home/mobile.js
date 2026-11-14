// THROWAWAY prototype: Mobile. A hanging kinetic mobile (Calder style) of the eight Works: seven rods in a tree (three levels),
// each balanced at its pivot (arms follow the weight of what hangs on them), Works on short threads. Every rod is a spring-damper
// in tilt and a nearly free damped spin about the vertical; every thread is a damped pendulum driven by the acceleration of the
// point it hangs from, so a moving parent kicks its children. The pointer is breath (blowing on a Work pushes it, and the force
// climbs the tree and tips the rods above it) and a hand (press and drag pulls a Work and unbalances everything above it; let
// go and it bobs back). Scroll is a draught that spins the rods. Hover: the Work stops and turns to the camera, with its tag.
// Fly-in: the thread lets go and the Work swings into the camera. Opening: the Showreel is one big screen on one thread, it
// swings back, and the rods and Works unfold from behind it, tipping into balance.
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const wrap = (a) => a - 6.283185307 * Math.round(a / 6.283185307)
  const G = 1200 // px/s^2

  const WORK_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }'
  const WORK_FS = `
    precision highp float;
    uniform sampler2D uMap; uniform vec4 uRect; uniform float uGlow; varying vec2 vUv;
    void main(){
      vec2 uv = clamp(vUv, .004, .996);
      gl_FragColor = vec4(texture2D(uMap, uRect.xy + uv * uRect.zw).rgb * (1.03 + uGlow), 1.);
    }`

  HOME.register({
    name: 'Mobile',
    create(ctx) {
      const size = ctx.size, works = ctx.works, P = ctx.pointer, touch = ctx.touch
      const FOV = 40, TN = Math.tan((FOV * Math.PI) / 360), HUD = 3, WD = 260
      const STEP = touch ? 1 / 60 : 1 / 120, MAXS = touch ? 2 : 4

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(FOV, size.w / size.h, 1, 8000)
      scene.add(camera)
      const textures = [], geos = [], mats = []

      // ---- the tree: 7 rods then 8 Works; parents always come before children --------------------------------------------------------
      const WM = [1.0, 0.85, 1.2, 0.9, 1.1, 0.8, 1.0, 1.15] // weight of each Work: the pivots sit off-centre by it
      const PAR = [-1, 0, 0, 1, 1, 2, 2], SIDE = [0, -1, 1, -1, 1, -1, 1]
      const nodes = []
      for (let q = 0; q < 15; q++) {
        const isRod = q < 7
        nodes.push({
          q, rod: isRod, pi: isRod ? PAR[q] : 3 + ((q - 7) >> 1), side: isRod ? SIDE[q] : (q - 7) % 2 ? 1 : -1, w: 0, i: q - 7,
          T: 50, L: 100, aL: 50, aR: 50, k: 1, kT: 5, kY: 0.5,
          u: { v: 1 }, pop: { v: 1 },
          sx: 0, vx: 0, sz: 0, vz: 0, th: 0, vth: 0, ps: 0, vps: 0,
          Ax: 0, Ay: 0, Az: 0, Px: 0, Py: 0, Pz: 0, Tx: 0, Ty: 0, Tz: 0, rx: 0, ry: 0, rz: 0,
          oAx: 0, oAz: 0, vAx: 0, vAz: 0, ax: 0, az: 0, has: false,
          fx: 0, fy: 0, fz: 0, tz: 0, ty: 0, dth: 0, dps: 0, ex: 0, ey: 0, evx: 0, evy: 0, h: 0,
        })
      }
      for (let q = 0; q < 8; q++) nodes[7 + q].w = WM[q]
      for (let q = 14; q >= 1; q--) { const n = nodes[q]; nodes[n.pi].w += n.w } // subtree weight
      for (let q = 0; q < 7; q++) { nodes[q].k = 0.75 + ((q * 37) % 7) / 14; nodes[q].kT = [3.2, 4.4, 5.2, 6.4, 5.6, 7.2, 6.0][q]; nodes[q].kY = 0.35 + 0.08 * (q % 3) }
      const rods = nodes.slice(0, 7), wk = nodes.slice(7)

      // ---- scene objects ------------------------------------------------------------------------------------------------------------------
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x131313 }))
      wall.position.z = -WD; scene.add(wall); geos.push(wall.geometry); mats.push(wall.material)

      const blobData = new Uint8Array(32 * 32 * 4)
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const d = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5), a = clamp(1 - d, 0, 1), o = (y * 32 + x) * 4
        blobData[o + 3] = Math.round(255 * a * a * (3 - 2 * a))
      }
      const blob = new THREE.DataTexture(blobData, 32, 32); blob.minFilter = blob.magFilter = THREE.LinearFilter; blob.generateMipmaps = false; blob.needsUpdate = true
      textures.push(blob)
      const unit = new THREE.PlaneGeometry(1, 1); geos.push(unit)
      const shGeo = unit
      const shadows = wk.map(() => {
        const m = new THREE.MeshBasicMaterial({ map: blob, color: 0x000000, transparent: true, depthWrite: false }); mats.push(m)
        const mesh = new THREE.Mesh(shGeo, m); mesh.renderOrder = 1; scene.add(mesh)
        return { mesh, mat: m }
      })

      const workGeo = new THREE.PlaneGeometry(1, 9 / 16, 1, 1); geos.push(workGeo)
      const pickMeshes = []
      const cards = wk.map((n, i) => {
        const r = ctx.loopRect(i)
        const mat = new THREE.ShaderMaterial({
          vertexShader: WORK_VS, fragmentShader: WORK_FS,
          uniforms: { uMap: { value: ctx.atlas }, uRect: { value: new THREE.Vector4(r[0], r[1], r[2], r[3]) }, uGlow: { value: 0 } },
        })
        mats.push(mat)
        const front = new THREE.Mesh(workGeo, mat), back = new THREE.Mesh(workGeo, mat) // two planes back to back: both faces un-mirrored
        front.position.z = 0.004; back.position.z = -0.004; back.rotation.y = Math.PI
        front.frustumCulled = back.frustumCulled = false
        front.userData.i = back.userData.i = i
        const group = new THREE.Group(); group.rotation.order = 'YXZ'; group.add(front, back); scene.add(group)
        pickMeshes.push(front, back)
        return { group, mat, n, cx: 0, cy: 0, h: 0 }
      })

      // threads and rods: one dynamic mesh of quads (1 root thread + 14 threads + 7 rods)
      const NSEG = 22, wPos = new Float32Array(NSEG * 12), wCol = new Float32Array(NSEG * 12), wIdx = new Uint16Array(NSEG * 6)
      for (let s = 0; s < NSEG; s++) {
        wIdx.set([s * 4, s * 4 + 1, s * 4 + 2, s * 4 + 1, s * 4 + 3, s * 4 + 2], s * 6)
        for (let k = 0; k < 12; k++) wCol[s * 12 + k] = 0x8f / 255
      }
      const wGeo = new THREE.BufferGeometry()
      const wPosA = new THREE.BufferAttribute(wPos, 3); wPosA.setUsage(THREE.DynamicDrawUsage)
      wGeo.setAttribute('position', wPosA); wGeo.setAttribute('color', new THREE.BufferAttribute(wCol, 3)); wGeo.setIndex(new THREE.BufferAttribute(wIdx, 1))
      const wMat = new THREE.MeshBasicMaterial({ vertexColors: true })
      const wires = new THREE.Mesh(wGeo, wMat); wires.frustumCulled = false; scene.add(wires)
      geos.push(wGeo); mats.push(wMat)
      const seg = (s, x1, y1, z1, x2, y2, z2, wd) => {
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = (-dy / len) * wd * 0.5, ny = (dx / len) * wd * 0.5, o = s * 12
        wPos[o] = x1 + nx; wPos[o + 1] = y1 + ny; wPos[o + 2] = z1; wPos[o + 3] = x1 - nx; wPos[o + 4] = y1 - ny; wPos[o + 5] = z1
        wPos[o + 6] = x2 + nx; wPos[o + 7] = y2 + ny; wPos[o + 8] = z2; wPos[o + 9] = x2 - nx; wPos[o + 10] = y2 - ny; wPos[o + 11] = z2
      }

      // the Showreel, one big screen on a single thread: its pivot is at the top edge
      const reelMat = new THREE.MeshBasicMaterial({ map: ctx.showreel.texture, depthTest: false, depthWrite: false })
      const reelGeo = new THREE.PlaneGeometry(1, 9 / 16)
      const reelMesh = new THREE.Mesh(reelGeo, reelMat); reelMesh.renderOrder = 100; reelMesh.frustumCulled = false
      const reelG = new THREE.Group(); reelG.add(reelMesh); scene.add(reelG)
      geos.push(reelGeo); mats.push(reelMat)
      const reel = { a: 0 }

      // hover tags: HUD children of the camera, in px
      const hud = new THREE.Group(); camera.add(hud)
      const mkText = (str, opts) => {
        const t = ctx.text(str, opts); textures.push(t.texture)
        const m = new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false }); mats.push(m)
        const mesh = new THREE.Mesh(unit, m); mesh.renderOrder = 61
        return { mesh, mat: m, canvas: t.canvas }
      }
      const PAD = 16
      const tags = works.map((wkk) => {
        const title = mkText(wkk.title, { size: 120 }), meta = mkText(`${wkk.kind} · ${wkk.year}`, { caps: true, size: 28, color: '#8f8f8f' })
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

      // ---- state --------------------------------------------------------------------------------------------------------------------------
      let portrait = false, builtW = 0, builtH = 0, cw = 100, ch = 56, topY = 96, kW = 1, D = 1000
      let hero = null
      const heroA = { v: 1 }, fly = { k: 0 }
      const pose = [], home = []
      for (let i = 0; i < 8; i++) { pose.push({ x: 0, y: 0, w: 0, l: 0, t: 0, init: false }); home.push({ x: 0, y: 0 }) }
      let acc = 0, wasDown = false, spike = 0, ptrSp = 0, grab = -1
      let opening = false, flying = false, flyIdx = -1, hot = -1, hoverOn = false, focusCell = -1
      let cand = -1, dwell = 0, tagCell = 0, tagA = 0, dim = 0
      let tl = null, flyTl = null, backTw = null
      const ray = new THREE.Raycaster(), v2 = new THREE.Vector2()

      // ---- layout: the table of drops and lengths, fitted to the view -------------------------------------------------------------------------
      function build() {
        const w = size.w, h = size.h
        builtW = w; builtH = h
        portrait = w < h
        D = h / 2 / TN; kW = (D + WD) / D
        cw = portrait ? 0.23 * w : Math.min(0.125 * w, 0.2 * h); ch = (cw * 9) / 16
        topY = portrait ? 134 : w < 768 ? 84 : 96
        let rT, wT, rL
        if (!portrait) {
          rT = [0.06, 0.1, 0.06, 0.08, 0.26, 0.07, 0.22].map((f) => f * h)
          wT = [0.05, 0.12, 0.07, 0.09, 0.06, 0.11, 0.1, 0.1].map((f) => f * h)
          rL = [0.46, 0.3, 0.3, 0.19, 0.19, 0.19, 0.19].map((f) => f * w)
        } else {
          rT = [30, 0.07 * h, 0.07 * h, 0.06 * h, 0.06 * h, 0.06 * h, 0.06 * h]
          wT = [0, 1, 2, 0, 1, 2, 0, 1].map((l) => 36 + l * (ch + 16))
          rL = [0.4, 0.24, 0.24, 0.12, 0.12, 0.12, 0.12].map((f) => f * w)
        }
        for (let q = 0; q < 7; q++) {
          const n = nodes[q], mL = nodes[q * 2 + 1].w, mR = nodes[q * 2 + 2].w // children of rod q are 2q+1, 2q+2 for the tree order used below
          n.L = rL[q]; n.T = rT[q]
          n.aL = (n.L * mR) / (mL + mR); n.aR = (n.L * mL) / (mL + mR)
        }
        for (let i = 0; i < 8; i++) nodes[7 + i].T = wT[i]
        // rest pass (y down) with kx = ky = 1, to fit the whole mobile into the view
        const px = new Float32Array(15), py = new Float32Array(15)
        let maxX = 0, maxS = 1
        for (let q = 0; q < 15; q++) {
          const n = nodes[q]
          const ax = q === 0 ? 0 : px[n.pi] + (n.side < 0 ? -nodes[n.pi].aL : nodes[n.pi].aR), ay = q === 0 ? topY : py[n.pi]
          px[q] = ax; py[q] = ay + n.T
          if (!n.rod) { maxX = Math.max(maxX, Math.abs(ax)); maxS = Math.max(maxS, py[q] - topY) }
        }
        const kx = Math.min(1, (0.5 * w - cw / 2 - 0.04 * w) / Math.max(maxX, 1))
        const limit = portrait ? 0.7 * h : 0.74 * h
        const ky = clamp((limit - topY - ch) / maxS, 0.5, 1.3)
        for (let q = 0; q < 15; q++) { const n = nodes[q]; n.T *= ky; if (n.rod) { n.L *= kx; n.aL *= kx; n.aR *= kx }; n.has = false }
        buildHero()
        const Hc = (Math.max(w, (h * 16) / 9) * 1.1 * 9) / 16
        reelG.position.set(0, Hc / 2, 40); reelMesh.position.y = -Hc / 2; reelMesh.scale.set((Hc * 16) / 9, (Hc * 16) / 9, 1)
        const wm = Math.max(w, h) * kW * 1.4
        wall.scale.set(wm, wm, 1)
        kin(0)
      }

      function buildHero() {
        const w = size.w, h = size.h, n = portrait ? 3 : 2
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
        const y0 = (portrait ? 0.72 : 0.775) * h, y1 = 0.965 * h, hg = y1 - y0, cnt = hero.items.length
        const amax = Math.max(...hero.items.map((it) => it.t.aspect), 0.1)
        const lh = Math.min(((portrait ? 0.86 : 0.8) * w) / amax, (0.9 * hg) / (0.72 * (cnt - 1) + 0.6)), pitch = lh * 0.72, cy = (y0 + y1) / 2
        hero.items.forEach((it, k) => {
          it.mesh.scale.set(it.t.aspect * lh * kW, lh * kW, 1) // it sits on the far wall, so it is drawn larger to look this size
          it.mesh.position.set(0, (h / 2 - (cy + (k - (cnt - 1) / 2) * pitch)) * kW, -WD + 2)
        })
      }

      // ---- the physics ------------------------------------------------------------------------------------------------------------------------
      // forces are accelerations in px/s^2 at a Work; the thread passes them up: every rod above gets a torque (and a swing), a bit weaker each level
      function applyForce(n, fx, fy, fz) {
        n.fx += fx; n.fy += fy; n.fz += fz
        let cur = n, f = 1
        while (cur.pi >= 0) {
          const p = nodes[cur.pi]
          f *= 0.72
          const gx = fx * f, gy = fy * f, gz = fz * f
          p.tz += cur.rx * gy - cur.ry * gx
          p.ty += cur.rz * gx - cur.rx * gz
          p.fx += gx * 0.4; p.fy += gy * 0.4; p.fz += gz * 0.4
          cur = p
        }
      }

      // one pass over the tree: attach points, pendulums, rods. dt = 0 only recomputes the positions.
      function kin(dt) {
        const h2 = size.h / 2
        for (let q = 0; q < 15; q++) {
          const n = nodes[q], p = n.pi >= 0 ? nodes[n.pi] : null
          if (p) {
            const arm = (n.side < 0 ? -p.aL : p.aR) * p.u.v, c = Math.cos(p.th)
            n.Ax = p.Px + arm * c * Math.cos(p.ps); n.Ay = p.Py + arm * Math.sin(p.th); n.Az = p.Pz - arm * c * Math.sin(p.ps)
            n.rx = n.Ax - p.Px; n.ry = n.Ay - p.Py; n.rz = n.Az - p.Pz
          } else { n.Ax = 0; n.Ay = h2 - topY; n.Az = 0 }
          const T = n.T * n.u.v
          if (dt > 0) {
            if (n.has) {
              const vx = (n.Ax - n.oAx) / dt, vz = (n.Az - n.oAz) / dt
              n.ax += (clamp((vx - n.vAx) / dt, -3500, 3500) - n.ax) * Math.min(1, dt * 30)
              n.az += (clamp((vz - n.vAz) / dt, -3500, 3500) - n.az) * Math.min(1, dt * 30)
              n.vAx = vx; n.vAz = vz
            } else { n.has = true; n.vAx = n.vAz = n.ax = n.az = 0 }
            n.oAx = n.Ax; n.oAz = n.Az
            const hv = n.rod ? 0 : n.h
            const Lp = Math.max(40, n.rod ? T : T + (ch * n.pop.v) / 2), cp = n.rod ? 1.4 : 0.8 + hv * 4
            n.vx += (-(G / Lp) * Math.sin(n.sx) - cp * n.vx + (-n.ax * Math.cos(n.sx) + n.fx * Math.cos(n.sx) + n.fy * Math.sin(n.sx)) / Lp) * dt
            n.vz += (-(G / Lp) * Math.sin(n.sz) - cp * n.vz + (-n.az * Math.cos(n.sz) + n.fz) / Lp) * dt
            n.sx = clamp(n.sx + n.vx * dt, -0.9, 0.9); n.sz = clamp(n.sz + n.vz * dt, -0.9, 0.9)
            if (n.rod) {
              const inv = 1 / (Math.pow(Math.max(n.L, 20) / 2, 2) + 800)
              n.vth += (-n.kT * n.th - 2 * 0.2 * Math.sqrt(n.kT) * n.vth + n.tz * inv + n.dth - n.ax * 0.0012) * dt
              n.th = clamp(n.th + n.vth * dt, -0.8, 0.8)
              n.vps += (-n.kY * Math.sin(n.ps) - 0.55 * n.vps + n.ty * inv + n.dps) * dt
              n.ps = wrap(n.ps + n.vps * dt)
            } else {
              const par = nodes[n.pi]
              n.vps += (-2.5 * (1 + n.h * 14) * wrap(n.ps) * (1 + wrap(n.ps) * wrap(n.ps)) - (0.6 + n.h * 9) * n.vps + 1.1 * wrap(par.ps - n.ps) * (1 - n.h) + n.ty * 0.004 + n.dps) * dt
              n.ps = wrap(n.ps + n.vps * dt)
              const sp = 60 // stretch spring: the Work bobs back after a pull
              n.evx += (-sp * n.ex - 5 * n.evx) * dt; n.evy += (-sp * n.ey - 5 * n.evy) * dt
              n.ex += n.evx * dt; n.ey += n.evy * dt
            }
          }
          const dx = Math.sin(n.sx), dz = Math.sin(n.sz), dy = -Math.cos(n.sx) * Math.cos(n.sz)
          n.Tx = n.Ax + T * dx; n.Ty = n.Ay + T * dy; n.Tz = n.Az + T * dz
          if (n.rod) { n.Px = n.Tx; n.Py = n.Ty; n.Pz = n.Tz } else {
            const l = T + (ch * n.pop.v) / 2
            n.Px = n.Ax + l * dx; n.Py = n.Ay + l * dy; n.Pz = n.Az + l * dz
          }
        }
      }

      // ---- picking and hover -------------------------------------------------------------------------------------------------------------------
      function pick(nx, ny) {
        v2.set(nx, ny); ray.setFromCamera(v2, camera)
        const hits = ray.intersectObjects(pickMeshes, false)
        for (let k = 0; k < hits.length; k++) { const i = hits[k].object.userData.i; if (wk[i].pop.v > 0.8) return i }
        return -1
      }
      function frameOf(i, dt) { // the flat "forward" pose of Work i, in screen px (y down)
        const w = size.w, h = size.h, asp = w / h, tg = tags[i], ps = pose[i], hm = home[i]
        const fwp = (asp < 1 ? 0.8 : 0.34) * w, fhp = (fwp * 9) / 16, M = 24, TOP = portrait ? 132 : 104, BOT = h - 24
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

      // ---- the four moments -----------------------------------------------------------------------------------------------------------------------
      function startOpening() {
        opening = true
        nodes.forEach((n, q) => { n.u.v = 0; n.pop.v = 0; if (n.rod) { n.th = (q % 2 ? 0.7 : -0.7) * (0.6 + 0.15 * q / 3); n.ps = (q % 2 ? -1 : 1) * (0.8 + 0.2 * (q % 3)) } })
        reel.a = 0; heroA.v = 0
        tl = gsap.timeline({ onComplete: () => { opening = false; reelG.visible = false } })
        tl.to(reel, { a: -0.1, duration: 0.35, ease: 'sine.out' }, 0.15)
        tl.to(reel, { a: 1.7, duration: 1.25, ease: 'power2.in' }, 0.5)
        tl.call(() => { spike = Math.max(spike, 0.5) }, null, 0.9)
        tl.to(nodes[0].u, { v: 1, duration: 0.9, ease: 'back.out(1.3)' }, 0.85)
        tl.to(nodes[1].u, { v: 1, duration: 0.9, ease: 'back.out(1.3)' }, 1.1).to(nodes[2].u, { v: 1, duration: 0.9, ease: 'back.out(1.3)' }, 1.15)
        for (let q = 3; q < 7; q++) tl.to(nodes[q].u, { v: 1, duration: 0.9, ease: 'back.out(1.3)' }, 1.35 + (q - 3) * 0.07)
        for (let i = 0; i < 8; i++) {
          tl.to(wk[i].u, { v: 1, duration: 0.9, ease: 'back.out(1.5)' }, 1.5 + i * 0.06)
          tl.to(wk[i].pop, { v: 1, duration: 0.6, ease: 'back.out(1.6)' }, 1.5 + i * 0.06)
        }
        tl.to(heroA, { v: 1, duration: 0.7, ease: 'power2.out' }, 2.2)
      }
      function flyTo(i) {
        if (flying || opening || i < 0) return
        flying = true; flyIdx = i; hot = i; ctx.cursor.hover(false); hoverOn = false; grab = -1
        frameOf(i, 0.016)
        const n = wk[i]; nodes[n.pi].vth += n.side * 1.6 // the thread lets go: that end of the rod flies up
        spike = 0.6
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        flyTl.to(fly, { k: 1, duration: 0.82, ease: 'power3.in' }, 0)
      }

      // ---- per frame ------------------------------------------------------------------------------------------------------------------------------
      function update(t, dt) {
        dt = clamp(dt, 0.0001, 0.05)
        const w = size.w, h = size.h, sc = ctx.scroll
        const wx = P.nx * (w / 2), wy = P.ny * (h / 2)
        const live = P.inside && (!touch || P.down) && !opening && !flying
        const vx = P.dx / dt, vy = -P.dy / dt, spd = Math.hypot(vx, vy)
        ptrSp += (spd - ptrSp) * Math.min(1, dt * 10)

        // breath: moving the pointer past a Work blows on it
        const sg = 0.11 * w
        if (live && grab < 0 && spd > 120) {
          const s2 = Math.min(spd, 2600) / spd
          for (let i = 0; i < 8; i++) {
            const c = cards[i], dx = wx - c.cx, dy = wy - c.cy, g = Math.exp(-(dx * dx + dy * dy) / (2 * sg * sg))
            if (g < 0.02 || wk[i].pop.v < 0.8 || (flying && i === flyIdx)) continue
            const f = g * 0.32 * s2
            applyForce(wk[i], vx * f, vy * f, -spd * s2 * g * 0.4)
            wk[i].ty += (i % 2 ? -1 : 1) * spd * s2 * g * 0.9 // blown, a Work spins about its thread
          }
        }

        // hand: press on a Work and drag pulls it, its rod, and everything above
        const down = P.down && !touch && !opening && !flying && P.inside
        if (down && !wasDown) {
          let g = pick(P.nx, P.ny), bd = 0.09 * w
          if (g < 0) for (let i = 0; i < 8; i++) { const d = Math.hypot(wx - cards[i].cx, wy - cards[i].cy); if (d < bd) { bd = d; g = i } }
          grab = g
        }
        if (!down) grab = -1
        wasDown = down
        if (grab >= 0) {
          const c = cards[grab], n = wk[grab]
          let dx = wx - (c.cx - n.ex), dy = wy - (c.cy - n.ey)
          const d = Math.hypot(dx, dy), cl = d > 190 ? 190 / d : 1
          dx *= cl; dy *= cl
          applyForce(n, dx * 2.4, dy * 2.4, Math.hypot(dx, dy) * 0.9)
          n.ex += (dx * 0.5 - n.ex) * Math.min(1, dt * 12); n.ey += (dy * 0.5 - n.ey) * Math.min(1, dt * 12)
          n.evx = n.evy = 0
          spike = Math.max(spike, Math.min(0.25, d / 600))
        }

        // draught: scroll spins the rods (direction by sign)
        const sv = clamp(sc.v / 450, -1.5, 1.5)
        if (!opening && Math.abs(sv) > 0.02) for (let q = 0; q < 7; q++) { rods[q].dps += sv * 0.45 * rods[q].k; rods[q].dth += sv * 0.25 * (q % 2 ? 1 : -1) }
        if (!opening && Math.abs(sv) > 0.02) for (let i = 0; i < 8; i++) { wk[i].fx += sv * 120; wk[i].dps += sv * 0.4 }

        // hover: stop on a Work; a sweeping pointer is breath, not a choice
        let hit = -1
        if (live && grab < 0 && !touch) {
          let keep = false
          if (hot >= 0 && cards[hot].h > 0.5) keep = pick(P.nx, P.ny) === hot
          if (keep) { hit = hot; dwell = 1; cand = hot } else {
            const c2 = pick(P.nx, P.ny)
            if (c2 !== cand) { dwell = 0; cand = c2 } else if (c2 >= 0 && ptrSp < 650) dwell += dt
            hit = c2 >= 0 && dwell > 0.12 && ptrSp < 1000 ? c2 : -1
          }
        } else { dwell = 0; cand = -1 }
        if ((hit >= 0) !== hoverOn) { hoverOn = hit >= 0; ctx.cursor.hover(hoverOn) }
        hot = flying ? flyIdx : hit >= 0 ? hit : !opening && focusCell >= 0 ? focusCell : -1
        for (let i = 0; i < 8; i++) {
          const c = cards[i], tgt = hot === i ? 1 : 0
          c.h += (tgt - c.h) * Math.min(1, dt * (tgt ? 9 : 6))
          if (c.h < 0.003 && !tgt) { c.h = 0; pose[i].init = false }
          wk[i].h = c.h
        }

        // physics at a fixed step
        acc += dt
        let steps = 0
        while (acc >= STEP && steps < MAXS) { kin(STEP); acc -= STEP; steps++ }
        if (steps === MAXS) acc = 0
        for (let q = 0; q < 15; q++) { const n = nodes[q]; n.fx = n.fy = n.fz = n.tz = n.ty = n.dth = n.dps = 0 }

        // Works, shadows
        const fill = Math.max(w, (h * 16) / 9) * 1.03, lx = -0.035 * w, ly = -0.05 * h
        for (let i = 0; i < 8; i++) {
          const c = cards[i], n = wk[i]
          c.cx = n.Px + n.ex; c.cy = n.Py + n.ey
          home[i].x = c.cx + w / 2; home[i].y = h / 2 - c.cy
          if (c.h > 0 || hot === i) frameOf(i, dt)
          const ps = pose[i], hA = c.h, fk = i === flyIdx ? fly.k : 0
          let x = c.cx, y = c.cy, sca = cw * Math.max(n.pop.v, 0.0001), rz = n.sx, ry = n.ps, rx = -n.sz * 0.6
          if (hA > 0) { x += (ps.x - w / 2 - x) * hA; y += (h / 2 - ps.y - y) * hA; sca += (ps.w - sca) * hA; rz *= 1 - hA; ry *= 1 - hA; rx *= 1 - hA }
          const swing = Math.sin(fk * Math.PI)
          if (fk > 0) { x = x * (1 - fk) + n.side * swing * 0.12 * w; y *= 1 - fk; sca += (fill - sca) * fk; rz = rz * (1 - fk) - n.side * swing * 0.3; ry *= 1 - fk; rx *= 1 - fk }
          const g = c.group
          g.visible = n.pop.v > 0.002
          g.position.set(x, y, n.Pz + hA * 6 + fk * 60); g.rotation.set(rx, ry, rz); g.scale.set(sca, sca, 1)
          c.mat.uniforms.uGlow.value = hA * 0.08
          const sh = shadows[i], cs = Math.max(Math.abs(Math.cos(ry)), 0.25)
          sh.mesh.visible = g.visible
          sh.mesh.position.set((x + lx + x * 0.1) * kW, (y + ly + y * 0.1) * kW, -WD + 1)
          sh.mesh.scale.set((sca * cs + 34) * 1.5 * kW, ((sca * 9) / 16 + 34) * 1.5 * kW, 1); sh.mesh.rotation.z = rz
          sh.mat.opacity = 0.6 * Math.min(1, n.pop.v) * (1 - 0.5 * hA) * (1 - fk)
        }

        // threads and rods
        let s = 0
        seg(s++, 0, h / 2 + 40, 0, rods[0].Px, rods[0].Py, rods[0].Pz, 2) // the single thread from the ceiling
        for (let q = 1; q < 15; q++) {
          const n = nodes[q], gone = !n.rod && flying && n.i === flyIdx
          seg(s++, n.Ax, n.Ay, n.Az, n.Tx, n.Ty, n.Tz, gone ? 0 : 2)
        }
        for (let q = 0; q < 7; q++) {
          const n = nodes[q], c = Math.cos(n.th), e0 = c * Math.cos(n.ps), e1 = Math.sin(n.th), e2 = -c * Math.sin(n.ps), a = -n.aL * n.u.v, b = n.aR * n.u.v
          seg(s++, n.Px + a * e0, n.Py + a * e1, n.Pz + a * e2, n.Px + b * e0, n.Py + b * e1, n.Pz + b * e2, 4)
        }
        wPosA.needsUpdate = true

        // the opening reel
        reelG.visible = opening && reel.a < 1.6
        reelG.rotation.x = reel.a

        // hero fades while a Work is shown
        dim += ((hot >= 0 ? 0.75 : 0) - dim) * Math.min(1, dt * 7)
        const ha = heroA.v * (1 - dim)
        if (hero) hero.items.forEach((it) => { it.mesh.material.opacity = ha; it.mesh.visible = ha > 0.01 })

        spike *= Math.exp(-dt * 5)
        ctx.crt.push = clamp(spike + Math.abs(sc.v) / 4500 + fly.k * 0.5, 0, 1)

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
      if (ctx.reduced) { reelG.visible = false } else startOpening()

      return {
        scene, camera, update,
        resize(w, h) {
          camera.aspect = w / h
          camera.position.set(0, 0, h / 2 / TN)
          camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
          layoutTags()
          if (w !== builtW || h !== builtH) build()
        },
        tap() {
          if (opening) { tl.progress(1); return }
          if (flying) return
          let i = hot
          if (i < 0 || touch) i = pick(P.nx, P.ny)
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
          backTw = gsap.to(fly, { k: 0, duration: 0.8, ease: 'power3.inOut', onComplete: () => { flying = false; flyIdx = -1; focusCell = -1 } })
        },
        dispose() {
          if (tl) tl.kill(); if (flyTl) flyTl.kill(); if (backTw) backTw.kill()
          gsap.killTweensOf(fly); gsap.killTweensOf(heroA); gsap.killTweensOf(reel)
          nodes.forEach((n) => { gsap.killTweensOf(n.u); gsap.killTweensOf(n.pop) })
          ctx.cursor.hover(false)
          if (hero) hero.items.forEach((it) => { it.t.texture.dispose(); it.mesh.material.dispose() })
          geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); textures.forEach((x) => x.dispose())
          scene.remove(camera)
        },
      }
    },
  })
})()
