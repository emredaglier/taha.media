// THROWAWAY prototype 'Sea'. Contract: docs/design/home/CONTRACT.md.
// 448 small screens ride a rolling sea (waves live in the vertex shader), eight big Works float near the camera.
;(function () {
  'use strict'
  const COLS = 28, ROWS = 16, N = COLS * ROWS, DEPTH = 48, CAMZ = 6, TZ = -64, FOV = 55
  const TAN = Math.tan((FOV * Math.PI) / 360)
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))
  const rng = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

  // ---- shared GLSL: the sea height field h(x, seaZ) with analytic gradient --------------------------
  // sea-space z = travel - worldZ, so scrolling sails the camera forward and waves roll toward it.
  const SEA = `
    uniform float uWT, uAmp;
    uniform vec4 uStamp[6];
    uniform vec3 uPtr;
    uniform vec3 uCalm;
    vec3 wv(vec2 p, vec2 d, float lam, float a){
      float k = 6.2831853 / lam;
      float ph = dot(p, d) * k - sqrt(k * 9.8) * uWT;
      float e = exp(sin(ph) - 1.);
      return vec3(a * (e - .466), a * e * cos(ph) * k * d.x, a * e * cos(ph) * k * d.y);
    }
    vec3 ring(vec2 p, vec4 s){
      vec2 q = p - s.xy; float r = max(length(q), .001);
      float x = r - s.z * 5.;
      float g = exp(-x * x / 1.8);
      float amp = s.w * exp(-s.z * .6);
      float c = cos(x * 2.4);
      float dr = amp * g * (-1.111 * x * c - 2.4 * sin(x * 2.4));
      return vec3(amp * g * c, dr * q.x / r, dr * q.y / r);
    }
    vec3 sea(vec2 p){
      vec3 r = wv(p, normalize(vec2(.25, -1.)), 42., .95);
      r += wv(p, normalize(vec2(-.6, -.8)), 25., .55);
      r += wv(p, normalize(vec2(.85, -.5)), 14., .28);
      r += wv(p, normalize(vec2(-.35, .9)), 9., .14);
      r += wv(p, normalize(vec2(.9, .3)), 5.5, .08);
      r *= uAmp;
      for (int i = 0; i < 6; i++) r += ring(p, uStamp[i]);
      vec2 q = p - uPtr.xy;
      float g = uPtr.z * 1.5 * exp(-dot(q, q) / 6.);
      r += vec3(g, -g * q.x / 3., -g * q.y / 3.);
      vec2 c = p - uCalm.xy;
      float e = .88 * uCalm.z * exp(-dot(c, c) / 110.);
      return vec3(r.x * (1. - e), r.yz * (1. - e) + r.x * e * 2. * c / 110.);
    }
    vec3 rotUp(vec3 v, vec3 n){
      vec3 a = vec3(n.z, 0., -n.x);
      float s = length(a);
      if (s < 1e-4) return v;
      vec3 k = a / s; float c = n.y;
      return v * c + cross(k, v) * s + k * dot(k, v) * (1. - c);
    }`

  const TILE_VS = SEA + `
    attribute vec2 aBase; attribute vec4 aSeed; attribute vec4 aRect; attribute vec2 aCell;
    uniform float uTravel, uTilt, uBreak, uD, uCamZ, uReelDist;
    uniform vec2 uReel;
    uniform mat4 uCam;
    uniform vec4 uWk[8];
    varying vec2 vUv; varying vec4 vRect; varying vec2 vPiece; varying float vE; varying float vFog; varying vec3 vN; varying vec3 vW;
    void main(){
      float e = clamp(uBreak * 1.7 - aSeed.x * .7, 0., 1.);
      e = e * e * (3. - 2. * e);
      float d = mod(aBase.y - uTravel, uD);
      float wz = uCamZ - 3. - d;
      float wx = aBase.x;
      vec3 h = sea(vec2(wx, uTravel - wz));
      vec3 n = normalize(vec3(-h.y * uTilt, 1., h.z * uTilt));
      float sc = smoothstep(0., 4., d) * (1. - smoothstep(uD - 9., uD - 1., d));
      for (int i = 0; i < 8; i++) { vec2 q = (vec2(wx, wz) - uWk[i].xy) / uWk[i].zw; sc *= smoothstep(.8, 1.3, length(q)); }
      float th = .5 + (aSeed.y - .5) * .3;
      vec2 lq = position.xy;
      vec3 seaO = rotUp(vec3(lq.x * 2.6, lq.y * 1.46 * cos(th), -lq.y * 1.46 * sin(th)), n) * sc;
      vec3 seaP = vec3(wx, h.x + .3, wz);
      vec3 fn = rotUp(vec3(0., sin(th), cos(th)), n);
      float cw = uReel.x / 28., ch = uReel.y / 16.;
      vec3 reelP = (uCam * vec4((aCell.x + .5 - 14.) * cw, (8. - aCell.y - .5) * ch, -uReelDist, 1.)).xyz;
      vec3 reelO = mat3(uCam) * vec3(lq.x * cw * 1.02, lq.y * ch * 1.02, 0.);
      float s = sin(3.14159 * e);
      vec3 ctrl = (reelP + seaP) * .5 + vec3((aSeed.z - .5) * 16., 4. + aSeed.w * 9., 5.);
      vec3 pos = mix(mix(reelP, ctrl, e), mix(ctrl, seaP, e), e);
      vec3 o = mix(reelO, seaO, smoothstep(0., .75, e)) * (1. + .4 * s);
      float ang = (aSeed.z - .5) * 5. * s; float ca = cos(ang), sa = sin(ang);
      o.xy = vec2(ca * o.x - sa * o.y, sa * o.x + ca * o.y);
      vec3 w = pos + o;
      vW = w;
      vN = mix(mat3(uCam) * vec3(0., 0., 1.), fn, smoothstep(0., .75, e));
      vUv = position.xy + .5; vRect = aRect;
      vPiece = vec2((aCell.x + vUv.x) / 28., 1. - (aCell.y + 1. - vUv.y) / 16.);
      vE = e; vFog = smoothstep(10., uD, d);
      gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
    }`
  const TILE_FS = `
    uniform sampler2D tAtlas, tReel;
    varying vec2 vUv; varying vec4 vRect; varying vec2 vPiece; varying float vE; varying float vFog; varying vec3 vN; varying vec3 vW;
    void main(){
      vec3 loop = texture2D(tAtlas, vRect.xy + vUv * vRect.zw).rgb;
      vec3 reel = texture2D(tReel, vPiece).rgb;
      float k = smoothstep(.45, .85, vE);
      vec3 c = mix(reel, loop, k);
      c = pow(c, vec3(.7)) * 1.5;
      vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
      vec3 H = normalize(normalize(vec3(0., .3, -1.)) + V);
      c *= mix(1., .9 + .25 * clamp(dot(N, V), 0., 1.), k);
      c += vec3(pow(max(dot(N, H), 0.), 16.)) * .5 * k;
      float b = min(min(vUv.x, 1. - vUv.x) * 1.78, min(vUv.y, 1. - vUv.y));
      c = mix(c, vec3(.93), (1. - smoothstep(.008, .028, b)) * .6 * k);
      c *= 1. - .5 * vFog;
      gl_FragColor = vec4(min(c, vec3(1.)), 1.);
    }`
  const WORK_VS = SEA + `
    uniform float uTravel, uTilt, uHov, uShow, uLift;
    uniform vec3 uBase; uniform vec2 uSize; uniform mat4 uCam;
    varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vHv;
    void main(){
      vec3 h = sea(vec2(uBase.x, uTravel - uBase.z));
      float hv = uHov * uHov * (3. - 2. * uHov);
      vec3 n = normalize(vec3(-h.y * uTilt * .8, 1., h.z * uTilt * .8));
      float th = .26;
      vec3 o0 = rotUp(vec3(position.x * uSize.x, position.y * uSize.y * cos(th), -position.y * uSize.y * sin(th)), n);
      vec3 oF = uCam[0].xyz * position.x * uSize.x + uCam[1].xyz * position.y * uSize.y;
      vec3 o = mix(o0, oF, hv) * uShow * (1. + .08 * hv);
      vec3 fn = normalize(mix(rotUp(vec3(0., sin(th), cos(th)), n), uCam[2].xyz, hv));
      vec3 c = vec3(uBase.x, uBase.y + h.x * .7 + uLift * hv - (1. - uShow) * 3., uBase.z);
      vec3 w = c + o;
      vW = w; vN = fn; vUv = position.xy + .5; vHv = hv;
      gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
    }`
  const WORK_FS = `
    uniform sampler2D tAtlas; uniform vec4 uRect; uniform float uDim;
    varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vHv;
    void main(){
      vec3 c = texture2D(tAtlas, uRect.xy + vUv * uRect.zw).rgb;
      c = pow(c, vec3(.85)) * 1.15;
      vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
      vec3 H = normalize(normalize(vec3(0., .3, -1.)) + V);
      c *= .9 + .2 * clamp(dot(N, V), 0., 1.);
      c += vec3(pow(max(dot(N, H), 0.), 16.)) * .35 * (1. - vHv);
      float b = min(min(vUv.x, 1. - vUv.x) * 1.78, min(vUv.y, 1. - vUv.y));
      c = mix(c, vec3(.93), (1. - smoothstep(.006, .02, b)) * (.55 + .4 * vHv));
      c *= 1. - uDim;
      gl_FragColor = vec4(min(c, vec3(1.)), 1.);
    }`
  const WATER_VS = SEA + `
    uniform float uTravel;
    varying vec3 vN; varying vec3 vW; varying float vH;
    void main(){
      vec3 base = position;
      vec3 h = sea(vec2(base.x, uTravel - base.z));
      h *= 1. - smoothstep(60., 170., length(cameraPosition - base));
      vW = vec3(base.x, h.x, base.z);
      vN = normalize(vec3(-h.y, 1., h.z));
      vH = h.x;
      gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.);
    }`
  const WATER_FS = `
    uniform float uWater;
    varying vec3 vN; varying vec3 vW; varying float vH;
    void main(){
      vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
      float dist = length(cameraPosition - vW);
      vec3 R = reflect(-V, N);
      vec3 S = normalize(vec3(.05, .08, -1.));
      float sun = pow(max(dot(R, S), 0.), 60.);
      float glow = pow(max(dot(R, S), 0.), 6.);
      float fres = pow(1. - max(dot(N, V), 0.), 4.);
      float crest = smoothstep(.2, 1.1, vH);
      vec3 c = vec3(.014) + vec3(.07) * fres + vec3(.11) * glow + vec3(.8) * sun * (.4 + .6 * fres) + vec3(.1) * crest;
      c = mix(c, vec3(.17), smoothstep(40., 170., dist) * .75);
      gl_FragColor = vec4(c * uWater, 1.);
    }`
  const REFL_VS = `
    varying vec2 vUv; varying float vY;
    void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }`
  const REFL_FS = `
    uniform sampler2D tMap; uniform float uOp, uTime;
    varying vec2 vUv; varying float vY;
    void main(){
      vec2 uv = vUv; uv.x += sin(uv.y * 50. + uTime * 1.6) * .006 + sin(uv.y * 17. - uTime) * .004;
      vec4 t = texture2D(tMap, uv);
      gl_FragColor = vec4(t.rgb, t.a * uOp * .3 * exp(vY * .09));
    }`

  HOME.register({
    name: 'Sea',
    create(ctx) {
      const P = ctx.pointer, scroll = ctx.scroll, crt = ctx.crt
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(FOV, 1.6, 0.1, 400)
      scene.add(camera)
      let pxH = 800, aspect = 1.6, camY = 3.2, pitch = 0.115
      const geos = [], mats = [], texs = []
      const mat = (m) => (mats.push(m), m)
      const geo = (g) => (geos.push(g), g)

      // ---- state driven by gsap ---------------------------------------------------------------
      const S = { brk: 0, water: 0, text: 0, roll: 0, surge: 0, fly: 0, pulse: 0 }
      const show = Array.from({ length: 8 }, () => ({ v: 0 }))
      const hv = new Float32Array(8)
      let storm = 0, clock = 0, drift = 0, travel = 0, psx = 0, psy = 0
      let ptrAmt = 0, ptSX = 0, ptSZ = 0, ptInit = false, lastSX = 0, lastSZ = 0, si = 0
      let hovIdx = -1, focusIdx = -1, forced = -1, sel = -1, busy = false, lastSel = -1, disposed = false
      const tls = []

      // ---- shared uniforms --------------------------------------------------------------------
      const stamps = []
      for (let i = 0; i < 6; i++) stamps.push(new THREE.Vector4(0, 0, 99, 0))
      const uWk = []
      for (let i = 0; i < 8; i++) uWk.push(new THREE.Vector4(0, 0, 1, 1))
      const U = {
        uWT: { value: 0 }, uAmp: { value: 0 }, uStamp: { value: stamps }, uPtr: { value: new THREE.Vector3() },
        uCalm: { value: new THREE.Vector3() }, uTravel: { value: 0 }, uTilt: { value: 1.3 }, uCam: { value: camera.matrixWorld },
      }

      // ---- water ---------------------------------------------------------------------------------
      const wg = geo(new THREE.PlaneGeometry(1, 1, 160, 220))
      {
        const pos = wg.attributes.position
        for (let i = 0; i < pos.count; i++) {
          const u = pos.getX(i) * 2, v = pos.getY(i) + 0.5
          pos.setXYZ(i, Math.sign(u) * Math.pow(Math.abs(u), 1.5) * 140, 0, CAMZ + 12 - Math.pow(v, 1.7) * 215)
        }
      }
      const waterU = Object.assign({}, U, { uWater: { value: 0 } })
      const water = new THREE.Mesh(wg, mat(new THREE.ShaderMaterial({ uniforms: waterU, vertexShader: WATER_VS, fragmentShader: WATER_FS, side: THREE.DoubleSide, transparent: true })))
      water.frustumCulled = false; water.renderOrder = 0
      scene.add(water)

      // ---- the field of small screens ------------------------------------------------------------
      const rnd = rng(7)
      const aBase = new Float32Array(N * 2), aSeed = new Float32Array(N * 4), aRect = new Float32Array(N * 4), aCell = new Float32Array(N * 2)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const k = r * COLS + c
          aBase[k * 2] = (c - (COLS - 1) / 2) * 3 + (rnd() - 0.5)
          aBase[k * 2 + 1] = r * 3 + rnd() * 1.2
          for (let j = 0; j < 4; j++) aSeed[k * 4 + j] = rnd()
          const rc = ctx.loopRect(Math.floor(rnd() * 8))
          for (let j = 0; j < 4; j++) aRect[k * 4 + j] = rc[j]
          aCell[k * 2] = c; aCell[k * 2 + 1] = r
        }
      }
      const tg = geo(new THREE.InstancedBufferGeometry())
      const unit = new THREE.PlaneGeometry(1, 1)
      tg.index = unit.index; tg.attributes.position = unit.attributes.position; tg.attributes.uv = unit.attributes.uv
      tg.setAttribute('aBase', new THREE.InstancedBufferAttribute(aBase, 2))
      tg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 4))
      tg.setAttribute('aRect', new THREE.InstancedBufferAttribute(aRect, 4))
      tg.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell, 2))
      tg.instanceCount = N
      const tileU = Object.assign({}, U, {
        uBreak: { value: 0 }, uD: { value: DEPTH }, uCamZ: { value: CAMZ }, uReelDist: { value: 4 }, uReel: { value: new THREE.Vector2(8, 4.5) },
        uWk: { value: uWk }, tAtlas: { value: ctx.atlas }, tReel: { value: ctx.showreel.texture },
      })
      const tiles = new THREE.Mesh(tg, mat(new THREE.ShaderMaterial({ uniforms: tileU, vertexShader: TILE_VS, fragmentShader: TILE_FS, side: THREE.DoubleSide, transparent: true })))
      tiles.frustumCulled = false; tiles.renderOrder = 2
      scene.add(tiles)

      // ---- the eight Works --------------------------------------------------------------------
      const wk = [], wmesh = [], wu = [], labels = []
      const wg1 = geo(new THREE.PlaneGeometry(1, 1))
      for (let i = 0; i < 8; i++) {
        wk.push({ x: 0, z: 0, w: 5, h: 2.8, baseY: 1.6, lift: 1.5 })
        const u = Object.assign({}, U, {
          uHov: { value: 0 }, uShow: { value: 0 }, uLift: { value: 1.5 }, uBase: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector2(5, 2.8) },
          tAtlas: { value: ctx.atlas }, uRect: { value: new THREE.Vector4().fromArray(ctx.loopRect(i)) }, uDim: { value: 0 },
        })
        wu.push(u)
        const m = new THREE.Mesh(wg1, mat(new THREE.ShaderMaterial({ uniforms: u, vertexShader: WORK_VS, fragmentShader: WORK_FS, side: THREE.DoubleSide, transparent: true })))
        m.frustumCulled = false; m.renderOrder = 3
        scene.add(m); wmesh.push(m)
        // label: title + kind/year, children of the camera so they never mirror or tilt
        const mk = (str, o) => {
          const t = ctx.text(str, o); texs.push(t.texture)
          const mm = mat(new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }))
          const mesh = new THREE.Mesh(wg1, mm); mesh.renderOrder = 20; mesh.visible = false; mesh.frustumCulled = false
          camera.add(mesh)
          return { mesh, aspect: t.aspect, mm }
        }
        labels.push({ t: mk(ctx.works[i].title, { size: 150 }), m: mk(ctx.works[i].kind + '  ·  ' + ctx.works[i].year, { caps: true, size: 40 }) })
      }

      // ---- hero sentence standing on the horizon, mirrored faintly in the water ----------------------
      const root = new THREE.Group(); root.position.set(0, 0, TZ); scene.add(root)
      const rootR = new THREE.Group(); rootR.position.set(0, 0, TZ); scene.add(rootR)
      const reflU = { uOp: { value: 0 }, uTime: { value: 0 } }
      function block(lines) {
        const g = new THREE.Group(), rg = new THREE.Group()
        const items = []
        let maxA = 0
        lines.forEach((ln) => {
          const t = ctx.text(ln, { size: 200 }); texs.push(t.texture)
          const m = new THREE.Mesh(wg1, mat(new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthWrite: false, opacity: 0 })))
          m.renderOrder = 4
          const rm = new THREE.Mesh(wg1, mat(new THREE.ShaderMaterial({ uniforms: Object.assign({ tMap: { value: t.texture } }, reflU), vertexShader: REFL_VS, fragmentShader: REFL_FS, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide })))
          rm.renderOrder = 1
          g.add(m); rg.add(rm); items.push({ m, rm, a: t.aspect }); maxA = Math.max(maxA, t.aspect)
        })
        root.add(g); rootR.add(rg)
        return { g, rg, items, maxA, n: lines.length }
      }
      const wideLines = ctx.hero.replace(/\.\s+/g, '.\n').split('\n').filter(Boolean)
      const tallLines = []
      { let cur = ''; for (const w of ctx.hero.split(/\s+/)) { if (cur && (cur + ' ' + w).length > 15) { tallLines.push(cur); cur = w } else cur = (cur ? cur + ' ' : '') + w } if (cur) tallLines.push(cur) }
      const wide = block(wideLines), tall = block(tallLines)

      // ---- opening: the Showreel breaks into screens that fall flat and start to roll ----------------
      const open = gsap.timeline()
      tls.push(open)
      open
        .to(S, { brk: 1, duration: 1.7, ease: 'power2.inOut' }, 0.35)
        .to(S, { water: 1, duration: 1.2, ease: 'power2.out' }, 1.0)
        .to(S, { roll: 1, duration: 1.8, ease: 'power2.out' }, 0.9)
        .to(S, { text: 1, duration: 0.9, ease: 'power2.out' }, 1.7)
        .to(S, { pulse: 1, duration: 0.45, ease: 'power2.out' }, 0.9)
        .to(S, { pulse: 0, duration: 0.9, ease: 'power2.inOut' }, 1.35)
        .to(show, { v: 1, duration: 0.9, ease: 'back.out(1.4)', stagger: 0.09 }, 1.5)
      let opened = false
      const finish = () => { open.kill(); S.brk = S.water = S.text = S.roll = 1; S.pulse = 0; for (let i = 0; i < 8; i++) show[i].v = 1; opened = true }
      if (ctx.reduced) finish()

      // ---- helpers (allocated once) -----------------------------------------------------------
      const ray = new THREE.Raycaster(), v2 = new THREE.Vector2()
      const rp = new THREE.Vector3(0, camY, CAMZ), rl = new THREE.Vector3(), ep = new THREE.Vector3(), el = new THREE.Vector3(), look = new THREE.Vector3()
      const va = new THREE.Vector3(), vb = new THREE.Vector3()

      function layout() {
        const portrait = aspect < 0.9
        camY = portrait ? 6 : 4.6; pitch = 0.155
        const sp = Math.sin(pitch), cp = Math.cos(pitch)
        // each Work is placed by a screen rect (centre x, centre y, half width, all NDC) laid out so none overlap;
        // near ones are big and low, far ones small and near the horizon. The sentence stands above all of them.
        const slots = portrait
          ? [[-0.5, -0.82, 0.46], [0.5, -0.68, 0.45], [-0.5, -0.54, 0.42], [0.5, -0.41, 0.4], [-0.5, -0.28, 0.38], [0.5, -0.16, 0.36], [-0.5, -0.04, 0.34], [0.5, 0.07, 0.32]]
          : [[-0.62, -0.52, 0.26], [0.12, -0.64, 0.24], [0.68, -0.4, 0.2], [-0.2, -0.16, 0.17], [0.4, -0.02, 0.14], [-0.72, -0.05, 0.13], [0.8, -0.03, 0.1], [0.12, 0.08, 0.09]]
        for (let i = 0; i < 8; i++) {
          const [cx, cy, hx] = slots[i], k = wk[i]
          let yc = 1.2, t = 20, w = 4
          for (let it = 0; it < 4; it++) {
            const dyu = cy * TAN
            const dx = cx * TAN * aspect, dy = Math.min(-0.001, dyu * cp - sp), dz = -dyu * sp - cp
            t = (camY - yc) / -dy
            k.x = dx * t; k.z = CAMZ + dz * t
            w = hx * 2 * t * TAN * aspect
            yc = ((w * 9) / 16) * 0.5 * Math.cos(0.26) + 0.2
          }
          k.w = w; k.h = (w * 9) / 16
          k.baseY = yc; k.lift = k.h * 0.22 + 0.9
          wu[i].uBase.value.set(k.x, k.baseY, k.z); wu[i].uSize.value.set(k.w, k.h); wu[i].uLift.value = k.lift
        }
        const useTall = portrait
        wide.g.visible = wide.rg.visible = !useTall; tall.g.visible = tall.rg.visible = useTall
        const b = useTall ? tall : wide
        const vw = 2 * (CAMZ - TZ) * TAN * aspect, vh = 2 * (CAMZ - TZ) * TAN
        // portrait: the block must fit between 130 px from the top (under the header) and the horizon
        const availN = portrait ? 1 - 260 / pxH - Math.tan(pitch) / TAN - 0.04 : 2
        const h = Math.min((vw * 0.88) / b.maxA, (vh * 0.36) / b.n, ((availN * vh) / 2) / (0.74 * b.n + 0.3))
        b.items.forEach((it, idx) => {
          const y = h * 0.21 + (b.n - 1 - idx) * h * 0.74
          it.m.scale.set(h * it.a, h, 1); it.m.position.set(0, y, 0)
          it.rm.scale.set(h * it.a, -h, 1); it.rm.position.set(0, -(camY + 0.5 + y), 0)
        })
        // the reel fills the view (cover) at 4 units in front of the camera
        const rh = 2 * 4 * TAN, rw = rh * aspect
        const f = rw / rh < 16 / 9 ? [rh * (16 / 9), rh] : [rw, rw * (9 / 16)]
        tileU.uReel.value.set(f[0] * 1.02, f[1] * 1.02)
      }

      // returns the Work under the pointer (nearest wins), or -1
      function pick() {
        let best = -1, bd = 1e9
        for (let i = 0; i < 8; i++) {
          if (show[i].v < 0.5) continue
          const k = wk[i], s = hv[i] > 0.3 ? 1.28 : 1.08
          va.set(k.x, k.baseY + k.lift * hv[i], k.z)
          vb.copy(va).applyMatrix4(camera.matrixWorldInverse)
          const dd = Math.max(0.5, -vb.z)
          va.project(camera)
          const hw = (k.w * 0.5 * s) / (dd * TAN * aspect), hh = (k.h * 0.5 * 0.9 * s) / (dd * TAN)
          if (Math.abs(P.nx - va.x) < hw && Math.abs(P.ny - va.y) < hh && dd < bd) { best = i; bd = dd }
        }
        return best
      }

      // title + kind/year beside the lifted screen, always inside the view
      function placeLabel(i, a) {
        const L = labels[i], k = wk[i]
        va.set(k.x, k.baseY + k.lift * hv[i], k.z).applyMatrix4(camera.matrixWorldInverse)
        const dv = Math.max(0.5, -va.z), hw = dv * TAN * aspect, hh = dv * TAN
        const g = hh * 0.06, m = hh * 0.06, W = k.w * 1.08, H = k.h * 1.08
        let th = H * 0.42, tw = th * L.t.aspect
        const cx = va.x, cy = va.y
        const side = cx > hw * 0.12 ? -1 : 1
        const avail = side > 0 ? hw - (cx + W / 2) - g - m : hw + (cx - W / 2) - g - m
        const below = avail < tw * 0.55
        let s = below ? Math.min(1, (hw * 2 - 2 * m) / tw) : Math.min(1, avail / tw)
        th *= s; tw *= s
        const mh = th * 0.3, mw = mh * L.m.aspect
        const total = th * 1.15 + mh
        let x0, ty, my, tx, mx
        if (!below) {
          x0 = side > 0 ? cx + W / 2 + g : cx - W / 2 - g
          tx = x0 + (side * tw) / 2; mx = x0 + (side * mw) / 2
          const top = cy + total / 2
          ty = top - th / 2; my = top - th * 1.15 - mh / 2
          tx -= side * (1 - a) * th; mx -= side * (1 - a) * th
        } else {
          const lim = (w) => Math.max(0, hw - w / 2 - m)
          tx = clamp(cx, -lim(tw), lim(tw)); mx = clamp(cx, -lim(mw), lim(mw))
          let top = cy - H / 2 - g
          if (top - total < -hh + m) top = cy + H / 2 + g + total
          ty = top - th / 2; my = top - th * 1.15 - mh / 2
        }
        L.t.mesh.position.set(tx, ty, -dv); L.t.mesh.scale.set(tw, th, 1)
        L.m.mesh.position.set(mx, my, -dv); L.m.mesh.scale.set(mw, mh, 1)
        L.t.mm.opacity = L.m.mm.opacity = a
      }

      function dive(i) {
        if (busy) return
        busy = true; forced = i
        const k = wk[i]
        el.set(k.x, k.baseY + k.lift, k.z)
        const fd = Math.max(k.w / (2 * TAN * aspect), k.h / (2 * TAN))
        ep.copy(rp).sub(el).normalize().multiplyScalar(fd).add(el)
        const tl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        tls.push(tl)
        tl.to(S, { surge: 1, duration: 0.4, ease: 'power2.out' }, 0)
          .to(S, { fly: 1, duration: 0.85, ease: 'power2.in' }, 0)
          .to(S, { surge: 0, duration: 0.45, ease: 'power1.in' }, 0.4)
      }
      const skip = () => { if (opened) return false; finish(); return true }

      return {
        scene, camera,
        update(t, dt) {
          if (disposed) return
          dt = Math.min(dt, 0.05)
          const tgt = Math.min(1, Math.abs(scroll.v) / 1500)
          storm = damp(storm, tgt, tgt > storm ? 5 : 1.1, dt)
          const st = Math.min(1.4, storm + S.surge)
          clock += dt * (1 + st * 1.2); drift += dt * 0.8 * (1 + st)
          travel = scroll.y * 0.012 + drift
          U.uWT.value = clock; U.uAmp.value = S.roll * (1 + st * 1.5); U.uTravel.value = travel
          crt.push = Math.min(1, storm * 0.75 + S.surge * 0.8 + S.pulse * 0.5)

          // camera: low over the water, a little head-turn from the pointer, lifted by the wave that carries it in
          const inside = P.inside || P.down
          psx = damp(psx, inside ? P.nx : 0, 2.5, dt); psy = damp(psy, inside ? P.ny : 0, 2.5, dt)
          rp.set(psx * 1.5, camY + Math.sin(clock * 0.55) * 0.16 * S.roll + Math.sin(t * 11) * 0.05 * st + S.surge * 0.8, CAMZ)
          rl.set(psx * 8, camY - Math.tan(pitch) * 60 + psy * 5, CAMZ - 60)
          const f = S.fly
          if (f > 0) { camera.position.lerpVectors(rp, ep, f); camera.position.y += Math.sin(Math.PI * f) * 1.4; look.lerpVectors(rl, el, f) }
          else { camera.position.copy(rp); look.copy(rl) }
          camera.lookAt(look); camera.updateMatrixWorld(true)

          // selection (hover or keyboard focus)
          if (!opened && open.progress() >= 1) opened = true
          const ready = show[4].v > 0.3
          hovIdx = inside && !ctx.touch && ready && !busy ? pick() : -1
          sel = busy ? forced : hovIdx >= 0 ? hovIdx : focusIdx
          if ((sel >= 0) !== (lastSel >= 0)) ctx.cursor.hover(sel >= 0)
          lastSel = sel
          let hvMax = 0, hi = -1
          for (let i = 0; i < 8; i++) {
            hv[i] = damp(hv[i], sel === i ? 1 : 0, sel === i ? 6 : 4, dt)
            if (hv[i] > hvMax) { hvMax = hv[i]; hi = i }
          }
          if (hi >= 0) U.uCalm.value.set(wk[hi].x, travel - wk[hi].z, hvMax * hvMax * (3 - 2 * hvMax)); else U.uCalm.value.z = 0

          // pointer swell and wake
          ray.setFromCamera(v2.set(P.nx, P.ny), camera)
          const d = ray.ray.direction, o = ray.ray.origin
          let ok = d.y < -0.03, gx = 0, gz = 0
          if (ok) { const k = (o.y - 0.2) / -d.y; if (k > 100) ok = false; else { gx = o.x + d.x * k; gz = o.z + d.z * k } }
          const want = ok && inside && sel < 0 && !busy && (!ctx.touch || P.down) && S.roll > 0.5
          ptrAmt = damp(ptrAmt, want ? 1 : 0, want ? 6 : 3, dt)
          if (ok) {
            if (!ptInit) { ptSX = gx; ptSZ = travel - gz; lastSX = ptSX; lastSZ = ptSZ; ptInit = true }
            ptSX = damp(ptSX, gx, 14, dt); ptSZ = damp(ptSZ, travel - gz, 14, dt)
          }
          U.uPtr.value.set(ptSX, ptSZ, ptrAmt)
          if (want) {
            const dist = Math.hypot(ptSX - lastSX, ptSZ - lastSZ)
            if (dist > 1.3) { stamps[si++ % 6].set(ptSX, ptSZ, 0, 0.5 + 0.4 * Math.min(1, dist / 3)); lastSX = ptSX; lastSZ = ptSZ }
          }
          for (let i = 0; i < 6; i++) { const s = stamps[i]; s.z += dt; if (s.z > 8) s.w = 0 }

          // materials
          tileU.uBreak.value = S.brk; waterU.uWater.value = S.water
          for (let i = 0; i < 8; i++) {
            const k = wk[i], u = wu[i], h = hv[i]
            uWk[i].set(k.x, k.z, (k.w * 0.5 + 1.4) * show[i].v + 0.001 + 3 * h, Math.max(2.5, k.h * 0.9 + 1.2) + 2 * h)
            u.uHov.value = h; u.uShow.value = clamp(show[i].v, 0, 1.2)
            u.uDim.value = hi >= 0 && hi !== i ? hvMax * 0.35 : 0
            wmesh[i].visible = show[i].v > 0.001
            const a = h > 0.02 ? clamp((h - 0.15) / 0.7, 0, 1) : 0
            labels[i].t.mesh.visible = labels[i].m.mesh.visible = a > 0.01
            if (a > 0.01) placeLabel(i, a)
          }
          // hero + mirror
          const vis = S.text > 0.01
          const b = aspect < 0.9 ? tall : wide
          root.visible = rootR.visible = vis
          if (vis) {
            const bob = -(1 - S.text) * 4 + Math.sin(clock * 0.5) * 0.25
            root.position.y = camY + 0.5 + bob; rootR.position.y = -bob
            for (let j = 0; j < wide.items.length; j++) wide.items[j].m.material.opacity = b === wide ? S.text : 0
            for (let j = 0; j < tall.items.length; j++) tall.items[j].m.material.opacity = b === tall ? S.text : 0
            reflU.uOp.value = S.text; reflU.uTime.value = clock
          }
        },
        resize(w, h) {
          aspect = w / h; pxH = h
          camera.aspect = aspect; camera.fov = FOV; camera.updateProjectionMatrix()
          layout()
        },
        tap() { if (skip()) return; if (busy) return; const i = pick(); if (i >= 0) dive(i) },
        focus(i) { focusIdx = i },
        activate(i) { if (!skip()) { /* already open */ } dive(i) },
        back() {
          const tl = gsap.timeline({ onComplete: () => { busy = false; forced = -1 } })
          tls.push(tl)
          tl.to(S, { fly: 0, duration: 0.9, ease: 'power2.inOut' }, 0).to(S, { surge: 0.6, duration: 0.3, ease: 'power2.out' }, 0).to(S, { surge: 0, duration: 0.6 }, 0.3)
        },
        dispose() {
          disposed = true
          tls.forEach((t) => t.kill()); gsap.killTweensOf(S); gsap.killTweensOf(show)
          geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose())
          unit.dispose()
        },
      }
    },
  })
})()
