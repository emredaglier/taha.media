// THROWAWAY prototype: Cloth. The eight Works are sheets of cloth pegged to washing lines, each printed with its loop.
// Verlet cloth on the CPU (pinned top edge, gravity, distance constraints). The pointer is wind (its speed blows the sheets
// it passes) and a hand (press and drag grabs a cloth point; let go and the sheet swings back). Scroll is a gust along the
// lines. The hero sentence is one long banner cloth above the lines. Hover (after a short dwell) pulls a sheet taut, flat
// and toward the camera with its tag beside it; fly-in snaps it off its pegs onto the camera. Opening: the Showreel is one
// big cloth over the view and is whipped away like a tablecloth; the sheets then unroll downward.
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

  const VS = `
    varying vec2 vUv; varying vec3 vN; varying vec3 vP;
    void main(){ vUv = uv; vN = normal; vP = position; gl_Position = projectionMatrix*viewMatrix*vec4(position, 1.); }`
  const FS = `
    precision highp float;
    uniform sampler2D uMap; uniform vec4 uRect; uniform float uDim, uBoost;
    varying vec2 vUv; varying vec3 vN; varying vec3 vP;
    void main(){
      vec2 uv = clamp(vUv, .004, .996);
      vec3 tex = texture2D(uMap, uRect.xy + uv*uRect.zw).rgb;
      vec3 n = normalize(vN);
      bool fr = gl_FrontFacing;
      if (!fr) n = -n;
      float d = dot(n, normalize(vec3(-.35, .55, .75)));
      float lit = mix(.4, 1.08, smoothstep(-.15, .78, d));   // folds and slopes fall into shadow, flat cloth stays bright
      vec3 col = fr ? tex*lit*1.06*uBoost : vec3(.15)*lit;     // the back of the cloth is plain
      col *= mix(.72, 1., smoothstep(0., .06, 1. - vUv.y));    // the fold under the peg
      col *= 1. - uDim;
      gl_FragColor = vec4(col, 1.);
    }`
  const REEL_VS = `
    uniform float uP; varying vec2 vUv;
    void main(){
      vUv = uv; vec3 P = position;
      float u = uv.x, s = sin(clamp(uP, 0., 1.)*3.14159);
      float q = clamp(uP*1.7 - (1. - u)*.7, 0., 1.);      // the right side is yanked first
      q = q*q;
      P.x += q*2.1;
      P.y += sin(u*7. + uP*14.)*.07*s + q*.12;
      P.z += sin(u*9. - uP*20.)*.5*s;
      gl_Position = projectionMatrix*modelViewMatrix*vec4(P, 1.);
    }`
  const REEL_FS = `
    precision highp float; uniform sampler2D uMap; uniform vec2 uCover; varying vec2 vUv;
    void main(){ gl_FragColor = vec4(texture2D(uMap, (vUv - .5)*uCover + .5).rgb, 1.); }`

  HOME.register({
    name: 'Cloth',
    create(ctx) {
      const size = ctx.size, works = ctx.works, P = ctx.pointer, touch = ctx.touch
      const FOV = 40, TN = Math.tan((FOV * Math.PI) / 360), HUD = 3, REEL_D = 2
      const STEP = touch ? 1 / 60 : 1 / 120, MAXS = touch ? 2 : 4, ITER = touch ? 3 : 4
      const G = 14, DAMP = Math.pow(0.42, STEP), D2 = STEP * STEP, KP = 9

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(FOV, size.w / size.h, 0.1, 300)
      scene.add(camera)
      const textures = [], geos = [], mats = [] // kept for the life of the example

      // ---- the Showreel cloth (opening): a plane on the camera, bent by the vertex shader ----------------------------
      const reelMat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: ctx.showreel.texture }, uP: { value: 0 }, uCover: { value: new THREE.Vector2(1, 1) } },
        vertexShader: REEL_VS, fragmentShader: REEL_FS, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
      })
      const reelGeo = new THREE.PlaneGeometry(1, 1, 28, 16)
      const reel = new THREE.Mesh(reelGeo, reelMat)
      reel.renderOrder = 50; reel.frustumCulled = false; reel.position.z = -REEL_D
      camera.add(reel); mats.push(reelMat); geos.push(reelGeo)

      // ---- hover tags: HUD children of the camera, in px ----------------------------------------------------------------
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

      // ---- the hero banner texture (cached per orientation) ---------------------------------------------------------
      let bn = null
      const bannerTex = (portrait) => {
        if (bn && bn.portrait === portrait) return bn
        if (bn) bn.tex.dispose()
        const n = portrait ? 3 : 2, words = ctx.hero.split(/\s+/), target = ctx.hero.length / n, lines = []
        let cur = ''
        for (const w of words) {
          const nx = cur ? cur + ' ' + w : w
          if (cur && nx.length > target * 1.1 && lines.length < n - 1) { lines.push(cur); cur = w } else cur = nx
        }
        lines.push(cur)
        const ts = lines.map((s) => ctx.text(s, { size: 160 }))
        const cw = 1536, amax = Math.max(...ts.map((t) => t.aspect)), lh = Math.min((0.9 * cw) / amax, 230), pitch = lh * 0.72
        const ch = Math.round(pitch * lines.length + lh * 0.6)
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
        const g = cv.getContext('2d')
        g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, cw, ch)
        ts.forEach((t, k) => { const wpx = t.aspect * lh; g.drawImage(t.canvas, (cw - wpx) / 2, lh * 0.3 + pitch * (k + 0.5) - lh / 2, wpx, lh); t.texture.dispose() })
        const tex = new THREE.CanvasTexture(cv); tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter
        bn = { portrait, tex, w: cw, h: ch }
        return bn
      }

      // ---- state -----------------------------------------------------------------------------------------------------
      const F = { gx: 0, gz: 0, burst: 0, px: 0, py: 0, vx: 0, vy: 0, sp: 0, on: false, inv2s2: 1, cut: 1 }
      const O = { whip: 1, gust: 0 }
      const fly = { k: 0 }
      const states = []; for (let k = 0; k < 9; k++) states.push({ u: 1 }) // unroll per cloth: 0 banner, 1..8 sheets
      let cur = [], clothes = [], sheets = [], banner = null, peg = null
      let Wv = 16, Hv = 9, D = 20, portrait = false, builtW = 0, builtH = 0, dirty = false, dirtyAt = 0
      let acc = 0, grab = null, wasDown = false
      let opening = false, flying = false, flyIdx = -1, hot = -1, hoverOn = false, focusCell = -1
      let cand = -1, dwell = 0, tagCell = 0, tagA = 0, dim = 0
      let tl = null, flyTl = null, backTw = null
      const pose = [], home = []
      for (let i = 0; i < 8; i++) { pose.push({ x: 0, y: 0, w: 0, l: 0, t: 0, init: false }); home.push({ x: 0, y: 0 }) }
      const M4 = new THREE.Matrix4(), V3 = new THREE.Vector3(), Q = new THREE.Quaternion(), SC = new THREE.Vector3(), COL = new THREE.Color()
      const rects = []; for (let i = 0; i < 8; i++) rects.push(ctx.loopRect(i))

      function makeCloth(gx, gy, w, h, cx, y0, z0, map, rect, ph) {
        const W1 = gx + 1, n = W1 * (gy + 1)
        const geo = new THREE.PlaneGeometry(w, h, gx, gy)
        geo.attributes.position.setUsage(THREE.DynamicDrawUsage); geo.attributes.normal.setUsage(THREE.DynamicDrawUsage)
        const mat = new THREE.ShaderMaterial({
          side: THREE.DoubleSide, vertexShader: VS, fragmentShader: FS,
          uniforms: { uMap: { value: map }, uRect: { value: new THREE.Vector4(rect[0], rect[1], rect[2], rect[3]) }, uDim: { value: 0 }, uBoost: { value: 1 } },
        })
        const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false
        scene.add(mesh); cur.push(mesh)
        const p = new Float32Array(n * 3), inv = new Float32Array(n)
        for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) {
          const k = j * W1 + i
          p[k * 3] = cx + (i / gx - 0.5) * w; p[k * 3 + 1] = y0 - (j / gy) * h; p[k * 3 + 2] = z0
          inv[k] = j === 0 ? 0 : 1
        }
        const list = []
        const add = (a, b, s) => list.push(a, b, s)
        for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) {
          const k = j * W1 + i
          if (i < gx) add(k, k + 1, 1)
          if (j < gy) add(k, k + W1, 1)
          if (i < gx && j < gy) { add(k, k + W1 + 1, 0.8); add(k + 1, k + W1, 0.8) }
          if (i < gx - 1) add(k, k + 2, 0.35)
          if (j < gy - 1) add(k, k + 2 * W1, 0.35)
        }
        const m = list.length / 3, ca = new Int32Array(m), cb = new Int32Array(m), cl = new Float32Array(m), cs = new Float32Array(m)
        for (let c = 0; c < m; c++) {
          ca[c] = list[c * 3]; cb[c] = list[c * 3 + 1]; cs[c] = list[c * 3 + 2]
          cl[c] = Math.hypot(p[ca[c] * 3] - p[cb[c] * 3], p[ca[c] * 3 + 1] - p[cb[c] * 3 + 1], p[ca[c] * 3 + 2] - p[cb[c] * 3 + 2])
        }
        const c = { gx, gy, W1, n, w, h, cx, y0, z0, p, q: p.slice(), inv, nd: new Float32Array(n * 2), m, ca, cb, cl, cs, geo, mat, mesh, ph, hAmt: 0, hT: 0, T: { x: 0, y: 0, z: 0, w: 1, h: 1 }, bb: [0, 0, 0, 0] }
        clothes.push(c)
        return c
      }

      // ---- layout: everything is sized from the view width (16 world units) ------------------------------------------------
      function build() {
        for (const o of cur) { scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose() }
        if (peg) { peg.dispose() }
        cur = []; clothes = []; grab = null; peg = null
        const w = size.w, h = size.h, asp = w / h
        builtW = w; builtH = h
        portrait = asp < 1
        Wv = portrait ? 16 : Math.max(16, 8.6 * asp); Hv = Wv / asp
        D = Wv / 2 / (TN * asp)
        camera.position.set(0, 0, D)
        const yAt = (px) => (0.5 - px / h) * Hv
        const bt = bannerTex(portrait)
        const BW = portrait ? 14.4 : Math.min(11, Wv * 0.7), BH = (BW * bt.h) / bt.w
        const topY = yAt(portrait ? 132 : 104), bannerBottom = topY - BH
        const cols = portrait ? 2 : 4, rows = portrait ? 4 : 2
        const botY = yAt(h - 30), avail = bannerBottom - 0.5 - botY
        let sh = Math.min(portrait ? 3.94 : 1.97, (avail / rows) * 0.86), sw = (sh * 16) / 9
        const maxSW = (Wv - 1.3) / cols - 0.25
        if (sw > maxSW) { sw = maxSW; sh = (sw * 9) / 16 }
        const rowGap = clamp((avail - rows * sh) / rows, 0.4, 1.1)
        const pitchX = sw + clamp((Wv - 1.3 - cols * sw) / cols, 0.15, 0.6)
        const line1 = bannerBottom - 0.5

        const bc = touch ? 0.8 : 0.5
        banner = makeCloth(Math.max(8, Math.round(BW / bc)), Math.max(3, Math.round(BH / bc)), BW, BH, 0, topY, -1.2, bt.tex, [0, 0, 1, 1], 0.7)
        const lines = [[0, topY, BW + 2]]
        const pegs = [[-BW / 2 + 0.4, topY, -1.2], [BW / 2 - 0.4, topY, -1.2]]
        sheets = []
        for (let i = 0; i < 8; i++) {
          const r = Math.floor(i / cols), col = i % cols
          const cx = (col - (cols - 1) / 2) * pitchX, ly = line1 - r * (sh + rowGap), z0 = (((i * 37) % 5) - 2) * 0.07
          sheets.push(makeCloth(touch ? 10 : 16, touch ? 6 : 9, sw, sh, cx, ly, z0, ctx.atlas, rects[i], i * 1.3))
          pegs.push([cx - sw / 2 + 0.3, ly, z0], [cx + sw / 2 - 0.3, ly, z0])
          if (col === 0) lines.push([0, ly, Wv * 1.3])
          const ndcx = (cx / (D * TN * asp)) * 0.5 + 0.5, ndcy = ((ly - sh / 2) / (D * TN)) * 0.5
          home[i].x = ndcx * w; home[i].y = (0.5 - ndcy) * h
          pose[i].init = false
        }
        peg = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), lines.length + pegs.length)
        let n = 0
        lines.forEach((l) => { M4.compose(V3.set(l[0], l[1], 0), Q.identity(), SC.set(l[2], 0.07, 0.07)); peg.setMatrixAt(n, M4); peg.setColorAt(n++, COL.setHex(0x8f8f8f)) })
        pegs.forEach((q) => { M4.compose(V3.set(q[0], q[1] - 0.04, q[2] + 0.02), Q.identity(), SC.set(0.17, 0.36, 0.16)); peg.setMatrixAt(n, M4); peg.setColorAt(n++, COL.setHex(0xededed)) })
        peg.frustumCulled = false; peg.instanceMatrix.needsUpdate = true; peg.instanceColor.needsUpdate = true
        scene.add(peg); cur.push(peg)
      }

      // ---- physics ---------------------------------------------------------------------------------------------------------
      function integrate(c, t) {
        const { gx, gy, W1, p, q, inv } = c, calm = 1 - c.hAmt
        for (let j = 1; j <= gy; j++) {
          const rw = (j / gy) * calm
          for (let i = 0; i <= gx; i++) {
            const idx = j * W1 + i
            if (inv[idx] === 0) continue
            const k = idx * 3, x = p[k], y = p[k + 1], z = p[k + 2]
            const ph = t * 1.1 + c.ph + x * 0.4
            let ax = (F.gx + Math.sin(ph * 0.8 + y * 0.25) * 0.9 + O.gust * 30) * rw
            let ay = -G
            let az = (F.gz + Math.sin(ph) * 1.9 + Math.sin(t * 2.3 + c.ph * 2 + x * 0.7) * 0.8 - (F.burst + O.gust * 0.4) * 34) * rw
            if (F.on && calm > 0.05) {
              const dx = x - F.px, dy = y - F.py, r2 = dx * dx + dy * dy
              if (r2 < F.cut) {
                const g = Math.exp(-r2 * F.inv2s2) * calm
                ax += F.vx * KP * g; ay += F.vy * KP * g * 0.6; az -= F.sp * KP * 0.7 * g
              }
            }
            const vx = (x - q[k]) * DAMP, vy = (y - q[k + 1]) * DAMP, vz = (z - q[k + 2]) * DAMP
            q[k] = x; q[k + 1] = y; q[k + 2] = z
            p[k] = x + vx + ax * D2; p[k + 1] = y + vy + ay * D2; p[k + 2] = z + vz + az * D2
          }
        }
      }
      function solve(c) {
        const { p, inv, m, ca, cb, cl, cs } = c
        for (let it = 0; it < ITER; it++) for (let e = 0; e < m; e++) {
          const a = ca[e], b = cb[e], wa = inv[a], wb = inv[b], ws = wa + wb
          if (ws === 0) continue
          const A = a * 3, B = b * 3, dx = p[B] - p[A], dy = p[B + 1] - p[A + 1], dz = p[B + 2] - p[A + 2], d = Math.hypot(dx, dy, dz)
          if (d < 1e-6) continue
          const f = ((d - cl[e]) / d) * cs[e], fa = (f * wa) / ws, fb = (f * wb) / ws
          p[A] += dx * fa; p[A + 1] += dy * fa; p[A + 2] += dz * fa
          p[B] -= dx * fb; p[B + 1] -= dy * fb; p[B + 2] -= dz * fb
        }
      }
      function pinGrab(c) { // the grabbed point follows the pointer (kept inside a stretch limit of its column's peg)
        const { p, q } = c, k = grab.idx * 3, z = p[k + 2], dz = D - z
        let X = P.nx * dz * TN * (size.w / size.h), Y = P.ny * dz * TN
        const col = grab.idx % c.W1, row = Math.floor(grab.idx / c.W1), tk = col * 3, ay = c.y0, ax = p[tk]
        const lim = row * (c.h / c.gy) * 1.25 + 0.3, ox = X - ax, oy = Y - ay, od = Math.hypot(ox, oy)
        if (od > lim) { X = ax + (ox / od) * lim; Y = ay + (oy / od) * lim }
        grab.vx = X - p[k]; grab.vy = Y - p[k + 1]
        p[k] = X; p[k + 1] = Y; p[k + 2] = z + (c.z0 + 0.7 - z) * 0.08
        q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2]
      }

      // ---- picking: project the sim to NDC once per frame -----------------------------------------------------------------
      function projectAll() {
        const asp = size.w / size.h, ax = 1 / (TN * asp), ay = 1 / TN
        for (let s = 0; s < clothes.length; s++) {
          const c = clothes[s], u = states[s].u, nd = c.nd, p = c.p, bb = c.bb
          bb[0] = bb[1] = 1e9; bb[2] = bb[3] = -1e9
          for (let k = 0; k < c.n; k++) {
            const dz = D - p[k * 3 + 2], y = c.y0 + (p[k * 3 + 1] - c.y0) * u
            const X = (p[k * 3] / dz) * ax, Y = (y / dz) * ay
            nd[k * 2] = X; nd[k * 2 + 1] = Y
            if (X < bb[0]) bb[0] = X; if (Y < bb[1]) bb[1] = Y; if (X > bb[2]) bb[2] = X; if (Y > bb[3]) bb[3] = Y
          }
        }
      }
      const cr = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax)
      function hitTest(nx, ny) { // the front-most hanging sheet under the point, -1 if none
        let best = -1, bz = -1e9
        for (let s = 0; s < 8; s++) {
          const c = sheets[s], bb = c.bb
          if (states[s + 1].u < 0.85 || c.hAmt > 0.3) continue
          if (nx < bb[0] || nx > bb[2] || ny < bb[1] || ny > bb[3]) continue
          const nd = c.nd
          let hit = false
          for (let j = 0; j < c.gy && !hit; j++) for (let i = 0; i < c.gx; i++) {
            const a = (j * c.W1 + i) * 2, b = a + 2, d = a + c.W1 * 2, e = d + 2
            const s1 = cr(nd[a], nd[a + 1], nd[b], nd[b + 1], nx, ny), s2 = cr(nd[b], nd[b + 1], nd[e], nd[e + 1], nx, ny)
            const s3 = cr(nd[e], nd[e + 1], nd[d], nd[d + 1], nx, ny), s4 = cr(nd[d], nd[d + 1], nd[a], nd[a + 1], nx, ny)
            if ((s1 >= 0 && s2 >= 0 && s3 >= 0 && s4 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0 && s4 <= 0)) { hit = true; break }
          }
          if (hit) { const z = c.p[((c.gy >> 1) * c.W1 + (c.gx >> 1)) * 3 + 2]; if (z > bz) { bz = z; best = s } }
        }
        return best
      }
      function tryGrab() {
        const asp = size.w / size.h
        let best = null, bd = 0.14 * 0.14
        for (let s = 0; s < clothes.length; s++) {
          const c = clothes[s]
          if (c.hAmt > 0.3 || states[s].u < 0.9) continue
          for (let j = 1; j <= c.gy; j++) for (let i = 0; i <= c.gx; i++) {
            const k = j * c.W1 + i, dx = (c.nd[k * 2] - P.nx) * asp, dy = c.nd[k * 2 + 1] - P.ny, d = dx * dx + dy * dy
            if (d < bd) { bd = d; best = { c, idx: k, vx: 0, vy: 0 } }
          }
        }
        if (best) { grab = best; best.c.inv[best.idx] = 0 }
      }
      function release() {
        const c = grab.c, k = grab.idx * 3
        c.inv[grab.idx] = 1
        c.q[k] = c.p[k] - grab.vx * 0.8; c.q[k + 1] = c.p[k + 1] - grab.vy * 0.8 // let it go with the hand's speed
        grab = null
      }

      // ---- flat pose (hover and fly-in), in px, then in world ---------------------------------------------------------------
      function frameOf(i, dt) {
        const w = size.w, h = size.h, asp = w / h, tg = tags[i], ps = pose[i], hm = home[i]
        const fwp = (asp < 1 ? 0.84 : 0.36) * w, fhp = (fwp * 9) / 16, M = 24, TOP = w < 768 ? 96 : 104, BOT = h - 24
        let fcx, fcy, tl_, tt
        if (asp >= 1 && fwp + 22 + tg.wpx + 2 * M <= w) {
          const right = hm.x <= w / 2, gw = fwp + 22 + tg.wpx, gl = clamp(right ? hm.x - fwp / 2 : hm.x + fwp / 2 - gw, M, w - M - gw)
          fcx = right ? gl + fwp / 2 : gl + tg.wpx + 22 + fwp / 2; tl_ = right ? gl + fwp + 22 : gl
          fcy = clamp(h * 0.55, TOP + fhp / 2, Math.max(TOP + fhp / 2, BOT - fhp / 2)); tt = fcy - tg.hpx / 2
        } else {
          const gt = clamp(h * 0.5 - fhp / 2, TOP, Math.max(TOP, BOT - (fhp + 16 + tg.hpx)))
          fcx = w / 2; fcy = gt + fhp / 2
          tl_ = clamp(fcx - fwp / 2, M, Math.max(M, w - M - tg.wpx)); tt = gt + fhp + 16
        }
        tt = clamp(tt, TOP, Math.max(TOP, BOT - tg.hpx))
        const k = ps.init ? 1 - Math.exp(-dt * 14) : 1
        ps.init = true; ps.x += (fcx - ps.x) * k; ps.y += (fcy - ps.y) * k; ps.w += (fwp - ps.w) * k; ps.l += (tl_ - ps.l) * k; ps.t += (tt - ps.t) * k
      }
      function setT(c, i) { // where the flat target sheet sits in world space (fly-in blends it to the full view)
        const w = size.w, h = size.h, asp = w / h, ps = pose[i], fk = i === flyIdx ? fly.k : 0
        const fill = Math.max(w, (h * 16) / 9) * 1.03
        const cx = ps.x + (w / 2 - ps.x) * fk, cy = ps.y + (h / 2 - ps.y) * fk, wp = ps.w + (fill - ps.w) * fk
        const dT = D * 0.5, visH = 2 * TN * dT, visW = visH * asp
        c.T.w = (wp / w) * visW; c.T.h = (c.T.w * 9) / 16
        c.T.x = ((cx / w) * 2 - 1) * (visW / 2); c.T.y = (1 - (cy / h) * 2) * (visH / 2); c.T.z = D - dT
      }

      // ---- draw: sim -> geometry (unroll, flat blend, normals) -----------------------------------------------------------------
      function render(c, u, t) {
        const { gx, gy, W1, p, T } = c, a = c.geo.attributes.position.array, nr = c.geo.attributes.normal.array, e = c.hAmt
        for (let j = 0; j <= gy; j++) {
          const rj = j / gy
          const xs = clamp(e * 1.5 - rj * 0.5, 0, 1), wgt = e > 0.001 ? xs * xs * (3 - 2 * xs) : 0
          for (let i = 0; i <= gx; i++) {
            const k = (j * W1 + i) * 3
            let x = p[k], y = c.y0 + (p[k + 1] - c.y0) * u, z = p[k + 2]
            if (wgt > 0) {
              const tx = T.x + (i / gx - 0.5) * T.w, ty = T.y + (0.5 - rj) * T.h, tz = T.z + Math.sin(rj * 8 - t * 26) * 0.12 * wgt * (1 - wgt) * 4
              x += (tx - x) * wgt; y += (ty - y) * wgt; z += (tz - z) * wgt
            }
            a[k] = x; a[k + 1] = y; a[k + 2] = z
          }
        }
        for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) {
          const l = ((j * W1 + (i > 0 ? i - 1 : i)) * 3), r = ((j * W1 + (i < gx ? i + 1 : i)) * 3)
          const up = (((j > 0 ? j - 1 : j) * W1 + i) * 3), dn = (((j < gy ? j + 1 : j) * W1 + i) * 3), k = (j * W1 + i) * 3
          const rx = a[r] - a[l], ry = a[r + 1] - a[l + 1], rz = a[r + 2] - a[l + 2], dx = a[dn] - a[up], dy = a[dn + 1] - a[up + 1], dz = a[dn + 2] - a[up + 2]
          let nx = dy * rz - dz * ry, ny = dz * rx - dx * rz, nz = dx * ry - dy * rx
          const len = Math.hypot(nx, ny, nz)
          if (len < 1e-9) { nx = 0; ny = 0; nz = 1 } else { nx /= len; ny /= len; nz /= len }
          nr[k] = nx; nr[k + 1] = ny; nr[k + 2] = nz
        }
        c.geo.attributes.position.needsUpdate = true; c.geo.attributes.normal.needsUpdate = true
      }

      // ---- the four moments -------------------------------------------------------------------------------------------------
      function startOpening() {
        opening = true
        O.whip = 0; O.gust = 0
        states.forEach((s) => { s.u = 0 })
        tl = gsap.timeline({ onComplete: () => { opening = false } })
        tl.to(O, { whip: 1, duration: 1.0, ease: 'power2.in' }, 0.5)
        tl.to(states[0], { u: 1, duration: 1.1, ease: 'back.out(1.3)' }, 1.0)
        for (let i = 0; i < 8; i++) tl.to(states[i + 1], { u: 1, duration: 0.95, ease: 'back.out(1.6)' }, 1.05 + i * 0.08)
        tl.to(O, { gust: 1, duration: 0.2, ease: 'power2.out' }, 0.75).to(O, { gust: 0, duration: 1.3, ease: 'power2.out' }, 0.95)
      }
      function flyTo(i) {
        if (flying || opening || i < 0) return
        flying = true; flyIdx = i; hot = i; ctx.cursor.hover(false); hoverOn = false
        if (grab) release()
        frameOf(i, 0.016)
        F.burst = 1
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        flyTl.to(fly, { k: 1, duration: 0.72, ease: 'power3.in' }, 0.14)
        flyTl.to(F, { burst: 0, duration: 0.9, ease: 'power2.out' }, 0.1)
      }

      function update(t, dt) {
        dt = clamp(dt, 0.0001, 0.05)
        const now = performance.now(), sc = ctx.scroll, w = size.w, h = size.h
        if (dirty && now - dirtyAt > 150) { dirty = false; build() }

        // wind: scroll is a gust along the lines (direction by sign), the pointer is a local wind
        const sv = clamp(sc.v / 600, -1.5, 1.5)
        F.gx = sv * 28; F.gz = -Math.abs(sv) * 16
        let vx = 0, vy = 0
        if (P.inside && !(touch && !P.down)) { vx = ((P.dx / w) * Wv) / dt; vy = ((-P.dy / h) * Hv) / dt }
        const sp0 = Math.hypot(vx, vy), cl = sp0 > 45 ? 45 / sp0 : 1, kk = Math.min(1, dt * 18)
        F.vx += (vx * cl - F.vx) * kk; F.vy += (vy * cl - F.vy) * kk; F.sp = Math.hypot(F.vx, F.vy)
        F.on = P.inside && !grab && !opening
        F.px = P.nx * (Wv / 2); F.py = P.ny * (Hv / 2)
        const sg = 0.085 * Wv; F.inv2s2 = 1 / (2 * sg * sg); F.cut = sg * sg * 12

        // grab and release
        projectAll()
        const down = P.down && !opening && !flying
        if (down && !wasDown) tryGrab()
        if (!down && grab) release()
        wasDown = down

        // hover: dwell on a sheet (a sweeping pointer is wind, not a choice); a flat sheet keeps the hover while the pointer is on it
        let hit = -1
        const live = !opening && !flying && !touch && P.inside && !grab
        if (live) {
          const px = ((P.nx + 1) / 2) * w, py = ((1 - P.ny) / 2) * h
          let keep = false
          if (hot >= 0 && sheets[hot].hAmt > 0.5) {
            const ps = pose[hot]
            keep = Math.abs(px - ps.x) < (ps.w / 2) * 1.06 && Math.abs(py - ps.y) < ((ps.w * 9) / 32) * 1.06
          }
          if (keep) { hit = hot; dwell = 1; cand = hot } else {
            const c2 = hitTest(P.nx, P.ny)
            if (c2 !== cand) { dwell = 0; cand = c2 } else if (c2 >= 0 && F.sp < 7) dwell += dt
            hit = c2 >= 0 && dwell > 0.14 && F.sp < 10 ? c2 : -1
          }
        } else { dwell = 0; cand = -1 }
        if ((hit >= 0) !== hoverOn) { hoverOn = hit >= 0; ctx.cursor.hover(hoverOn) }
        hot = flying ? flyIdx : hit >= 0 ? hit : !opening && focusCell >= 0 ? focusCell : -1

        // flat blend amounts and poses
        for (let i = 0; i < 8; i++) {
          const c = sheets[i], tgt = hot === i ? 1 : 0
          c.hAmt += (tgt - c.hAmt) * Math.min(1, dt * (tgt ? 9 : 6))
          if (c.hAmt < 0.003 && !tgt) { c.hAmt = 0; pose[i].init = false }
          if (c.hAmt > 0 || tgt) { frameOf(i, dt); setT(c, i); c.mat.uniforms.uBoost.value = 1 + 0.12 * c.hAmt } else c.mat.uniforms.uBoost.value = 1
        }
        banner.hAmt = 0

        // hero fades while a Work is shown
        dim += ((hot >= 0 ? 0.75 : 0) - dim) * Math.min(1, dt * 7)
        banner.mat.uniforms.uDim.value = dim

        // physics at a fixed step
        acc += dt
        let steps = 0
        while (acc >= STEP && steps < MAXS) {
          for (const c of clothes) { integrate(c, t); if (grab && grab.c === c) pinGrab(c); solve(c) }
          acc -= STEP; steps++
        }
        if (steps === MAXS) acc = 0

        // geometry
        for (let s = 0; s < clothes.length; s++) render(clothes[s], states[s].u, t)

        // the opening cloth
        reelMat.uniforms.uP.value = O.whip; reel.visible = O.whip < 1
        ctx.crt.push = clamp(Math.abs(sc.v) / 3200 + F.burst * 0.5 + fly.k * 0.5 + (opening ? 0.45 * Math.sin(clamp(O.whip, 0, 1) * Math.PI) : 0) + F.sp / 220, 0, 1)

        // tag beside the flat sheet
        const want = hot >= 0 && sheets[hot].hAmt > 0.25 && !flying && !opening
        if (want && hot !== tagCell) { tags[tagCell].group.visible = false; tagCell = hot; tagA = 0 }
        tagA += ((want ? 1 : 0) - tagA) * Math.min(1, dt * 12)
        const tg = tags[tagCell], ps = pose[tagCell]
        tg.group.visible = tagA > 0.01
        if (tg.group.visible) {
          const upp = (2 * Math.tan((camera.fov * Math.PI) / 360) * HUD) / h
          const l = clamp(ps.l, 16, w - 16 - tg.wpx), tt = clamp(ps.t, 16, h - 16 - tg.hpx)
          tg.group.position.set((l + tg.wpx / 2 - w / 2 - (1 - tagA) * 14) * upp, -(tt + tg.hpx / 2 - h / 2) * upp, -HUD)
          tg.group.scale.setScalar(upp)
          tg.plateMat.opacity = 0.86 * tagA; tg.title.mat.opacity = tagA; tg.meta.mat.opacity = tagA
        }
      }

      function sizeReel() {
        const a = size.w / size.h, vh = 2 * TN * REEL_D, ar = 16 / 9
        reel.scale.set(vh * a * 1.02, vh * 1.02, 1)
        reelMat.uniforms.uCover.value.set(Math.min(1, a / ar), Math.min(1, ar / a))
      }

      build(); layoutTags(); sizeReel()
      if (ctx.reduced) { O.whip = 1 } else startOpening()

      return {
        scene, camera, update,
        resize(w, h) {
          camera.aspect = w / h; camera.updateProjectionMatrix(); layoutTags(); sizeReel()
          if (w !== builtW || h !== builtH) { dirty = true; dirtyAt = performance.now() }
        },
        tap() {
          if (opening) { tl.progress(1); return }
          if (flying) return
          let i = hot
          if (i < 0 || touch) i = hitTest(P.nx, P.ny)
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
          gsap.killTweensOf(O); gsap.killTweensOf(F); gsap.killTweensOf(fly); states.forEach((s) => gsap.killTweensOf(s))
          ctx.cursor.hover(false)
          for (const o of cur) { scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose() }
          if (peg) peg.dispose()
          geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); textures.forEach((x) => x.dispose())
          if (bn) bn.tex.dispose()
          scene.remove(camera)
        },
      }
    },
  })
})()
