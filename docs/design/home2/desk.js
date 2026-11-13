// THROWAWAY prototype 2: Desk. His desk from straight above, at night, a lamp from the upper left and the screens. Eight Works:
// three monitor reflections along the top edge (glow patches on the glossy desk), five on loose things (phone, small tablet,
// drawing tablet, two prints). Every loose object is a 2D top-down rigid body (circles, impulses, friction, desk walls):
// the pointer nudges what it passes, press-and-drag grabs and spins, things knock each other, the mug's liquid sloshes.
// Scroll slides the camera down the desk and types a wave across the keys. Hover lifts a Work toward the camera, flat and
// upright, with its tag beside it; fly-in rises to the camera. Opening: the Showreel is the phone's screen, the camera rises,
// the lamp clicks on, the desk settles. No lights, no shadow maps: vertex colours, soft shadow quads, glow quads.
// fake: every label, note, drive name and the hero sentence on the notebook come from ctx or are plain shapes.
;(() => {
  const PI = Math.PI, clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, sm = (t) => t * t * (3 - 2 * t)
  const AY = new THREE.Vector3(0, 1, 0), AX = new THREE.Vector3(1, 0, 0)
  const LX = 0.78, LZ = 0.62 // shadows fall away from the lamp: down and to the right
  const DROPH = 0.8, STEP = 1 / 120

  // ---- shaders -------------------------------------------------------------------------------------------------------
  const DESK_VS = 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }'
  const DESK_FS = `
    precision highp float; varying vec3 vW; uniform vec2 uLamp, uHalf; uniform float uOn, uEnd;
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
    float nz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(h21(i), h21(i+vec2(1.,0.)), f.x), mix(h21(i+vec2(0.,1.)), h21(i+vec2(1.,1.)), f.x), f.y); }
    void main(){
      vec2 p = vW.xz;
      float g = nz(vec2(p.x*7., p.y*.45))*.6 + nz(vec2(p.x*23., p.y*1.1))*.4;      // grain along the desk
      float plank = smoothstep(.45, .55, nz(vec2(p.x*.9 + g*.15, p.y*.12)));
      float base = .055 + g*.03 + plank*.012;
      vec2 d = p - uLamp; float r2 = dot(d, d);
      float pool = exp(-r2/60.5), core = exp(-r2/5.);
      float lit = .3 + uOn*(1.7*pool + .5*core);
      vec3 c = vec3(base*lit);
      float e = min(min(vW.x + uHalf.x, uHalf.x - vW.x), min(vW.z + 2.4, uEnd - vW.z));
      c += vec3(.07)*(1. - smoothstep(0., .22, e))*(.4 + uOn*.6);                          // the rounded edge of the desk
      gl_FragColor = vec4(c, 1.);
    }`
  const DVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }'
  const DFS = `
    precision highp float; varying vec2 vUv;
    uniform sampler2D uMap, uMap2; uniform vec4 uRect; uniform float uReel, uSoft, uBright, uPower;
    vec3 samp(vec2 uv){ vec2 u = clamp(uv, .004, .996); return mix(texture2D(uMap, uRect.xy + u*uRect.zw).rgb, texture2D(uMap2, u).rgb, uReel); }
    void main(){
      vec3 c = samp(vUv);
      if (uSoft > .01){ float o = .035*uSoft; c = c*.36 + .16*(samp(vUv + vec2(o, 0.)) + samp(vUv - vec2(o, 0.)) + samp(vUv + vec2(0., o)) + samp(vUv - vec2(0., o))); }
      vec2 q = abs(vUv - .5)*2.; float f = mix(.012, .38, uSoft);
      float m = (1. - smoothstep(1. - f, 1., q.x))*(1. - smoothstep(1. - f, 1., q.y));
      float fade = mix(1., .3 + .7*smoothstep(0., 1., vUv.y), uSoft);               // bright near the monitor, soft away from it
      float a = m*fade*mix(1., .78*uPower, uSoft);
      gl_FragColor = vec4(c*uBright*mix(1., .86*uPower, uSoft), a);
    }`

  // ---- small helpers: vertex-coloured merged geometry (baked shading) -----------------------------------------------------------
  const _V = new THREE.Vector3(), _Q = new THREE.Quaternion(), _ONE = new THREE.Vector3(1, 1, 1), _M = new THREE.Matrix4(), _C = new THREE.Color()
  function Merge() { this.p = []; this.c = [] }
  Merge.prototype.add = function (geo, x, y0, z, ry, top, side, h) {
    const g = geo.index ? geo.toNonIndexed() : geo
    _M.compose(_V.set(x, y0, z), _Q.setFromAxisAngle(AY, ry || 0), _ONE); g.applyMatrix4(_M)
    const pa = g.attributes.position.array, na = g.attributes.normal.array, n = pa.length / 3
    _C.set(top); const tr = _C.r, tg = _C.g, tb = _C.b; _C.set(side); const sr = _C.r, sg = _C.g, sb = _C.b
    const hh = Math.max(h, 0.02)
    for (let i = 0; i < n; i++) {
      this.p.push(pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2])
      const ny = na[i * 3 + 1]
      if (ny > 0.5) this.c.push(tr, tg, tb)
      else { // sides: lit from the upper left, darker toward the desk (contact occlusion)
        const f = clamp(0.62 - 0.3 * (na[i * 3] + na[i * 3 + 2]) * 0.7071, 0.28, 0.95) * (0.6 + 0.4 * clamp((pa[i * 3 + 1] - y0) / hh, 0, 1))
        this.c.push(sr * f, sg * f, sb * f)
      }
    }
    if (g !== geo) g.dispose()
    geo.dispose()
  }
  Merge.prototype.box = function (x, y0, z, w, h, d, ry, top, side) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); this.add(g, x, y0, z, ry, top, side, h) }
  Merge.prototype.cyl = function (x, y0, z, r, h, top, side, seg) { const g = new THREE.CylinderGeometry(r, r, h, seg || 20); g.translate(0, h / 2, 0); this.add(g, x, y0, z, 0, top, side, h) }
  Merge.prototype.disc = function (x, y0, z, r, col, sx, sz) { const g = new THREE.CircleGeometry(r, 20); g.rotateX(-PI / 2); if (sx) g.scale(sx, 1, sz || sx); this.add(g, x, y0, z, 0, col, col, 0.01) }
  Merge.prototype.ring = function (x, y0, z, ri, ro, col) { const g = new THREE.RingGeometry(ri, ro, 28); g.rotateX(-PI / 2); this.add(g, x, y0, z, 0, col, col, 0.01) }
  function rrShape(w, d, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -d / 2; r = Math.min(r, w / 2, d / 2)
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r)
    s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r)
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s
  }
  Merge.prototype.rr = function (x, y0, z, w, d, r, h, ry, top, side) {
    const g = new THREE.ExtrudeGeometry(rrShape(w, d, r), { depth: h, bevelEnabled: false, curveSegments: 5 }); g.rotateX(-PI / 2); this.add(g, x, y0, z, ry, top, side, h)
  }
  Merge.prototype.arc = function (x, y0, z, ro, ri, a0, a1, h, top, side) { // a half band lying flat (headphone band)
    const s = new THREE.Shape(); s.absarc(0, 0, ro, a0, a1, false); s.absarc(0, 0, ri, a1, a0, true)
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 16 }); g.rotateX(-PI / 2); this.add(g, x, y0, z, 0, top, side, h)
  }
  Merge.prototype.build = function () {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3))
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }))
  }
  function fit(hw, hd) { // circles that cover a box lying along x
    const r = Math.max(hd, 0.18)
    if (hw <= r) return [{ lx: 0, lz: 0, r: Math.max(hw, hd) }]
    const span = hw - r, n = Math.max(2, Math.ceil(span / (r * 0.85)) + 1), out = []
    for (let k = 0; k < n; k++) out.push({ lx: -span + (2 * span * k) / (n - 1), lz: 0, r })
    return out
  }

  HOME.register({
    name: 'Desk',
    create(ctx) {
      const size = ctx.size, works = ctx.works, P = ctx.pointer, touch = ctx.touch
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(30, size.w / size.h, 0.3, 200)
      scene.add(camera)
      const keep = [] // persistent disposables (textures, geometries, materials)
      const track = (o) => { keep.push(o); return o }
      const unit = track(new THREE.PlaneGeometry(1, 1))
      let cur = [] // the layout's scene objects (rebuilt when the layout flips between landscape and portrait)

      // soft shadow and glow textures (canvas shadowBlur: works in Safari too)
      const shadowTex = (circle) => {
        const c = document.createElement('canvas'); c.width = c.height = 128
        const g = c.getContext('2d'); g.fillStyle = '#000'; g.shadowColor = '#000'; g.shadowBlur = 18
        if (circle) { g.beginPath(); g.arc(64, 64, 44, 0, 7); g.fill() } else {
          const x = 20, y = 20, w = 88, r = 14
          g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + w, r); g.arcTo(x + w, y + w, x, y + w, r); g.arcTo(x, y + w, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill()
        }
        return track(new THREE.CanvasTexture(c))
      }
      const SHT = [shadowTex(false), shadowTex(true)]
      const radial = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 64
        const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
        return track(new THREE.CanvasTexture(c))
      })()

      // ---- the desk surface, the dim plane ----------------------------------------------------------------------------------
      const deskMat = track(new THREE.ShaderMaterial({ vertexShader: DESK_VS, fragmentShader: DESK_FS, uniforms: { uLamp: { value: new THREE.Vector2(-3, 3) }, uHalf: { value: new THREE.Vector2(9.4, 9.4) }, uOn: { value: 1 }, uEnd: { value: 17.4 } } }))
      const desk = new THREE.Mesh(unit, deskMat); desk.rotation.x = -PI / 2; desk.frustumCulled = false; scene.add(desk)
      const dimMat = track(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }))
      const dimPlane = new THREE.Mesh(unit, dimMat); dimPlane.rotation.x = -PI / 2; dimPlane.scale.set(160, 160, 1); dimPlane.renderOrder = 10; dimPlane.frustumCulled = false; dimPlane.position.y = 2.6; dimPlane.visible = false; scene.add(dimPlane)

      // ---- hover tags: HUD children of the camera, in px ---------------------------------------------------------------------
      const HUD = 3, hud = new THREE.Group(); camera.add(hud)
      const mkText = (str, opts) => {
        const t = ctx.text(str, opts); track(t.texture)
        const m = track(new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false }))
        const mesh = new THREE.Mesh(unit, m); mesh.renderOrder = 61
        return { mesh, mat: m, canvas: t.canvas }
      }
      const PAD = 16
      const tags = works.map((w) => {
        const title = mkText(w.title, { size: 120 }), meta = mkText(`${w.kind} · ${w.year}`, { caps: true, size: 28, color: '#8f8f8f' })
        const plateMat = track(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false }))
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

      // ---- state -----------------------------------------------------------------------------------------------------------------
      const bodies = [], phys = [], wk = new Array(8).fill(null), pose = []
      for (let i = 0; i < 8; i++) pose.push({ x: 0, y: 0, w: 0, l: 0, t: 0, init: false })
      const O = { cam: 1, lamp: 1, reel: 0, decor: 1 }, fly = { k: 0 }
      let decor = null, keys = null, keyDefs = [], mug = null, hi = null, hero = null
      let portrait = false, builtP = null, TN = 0.27, asp = 1, VW = 14, dist = 20, TILT = 0.2, zcMin = 3, zcMax = 14, zEnd = 17.4, Hc = 2
      let opening = false, flying = false, flyIdx = -1, hot = -1, hoverOn = false, focusCell = -1, cand = -1, dwell = 0
      let tagCell = 0, tagA = 0, dim = 0, dol = 0, acc = 0, wasDown = false, tl = null, flyTl = null, backTw = null
      let grab = null
      const look = { x: 0, y: 0 }, pd = { x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, sp: 0, ok: false, init: false }, cam = { x: 0, z: 0, px: 0, pz: 0 }
      const bnd = { x0: -7.65, x1: 7.65, z0: 0.55, z1: 17.2 }
      const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3()
      const Qa = new THREE.Quaternion(), QF = new THREE.Quaternion(), QR = new THREE.Quaternion().setFromAxisAngle(AX, PI / 2)
      const MK = new THREE.Matrix4(), SK = new THREE.Vector3(), CK = new THREE.Color(), ray = new THREE.Raycaster(), ndc = { x: 0, y: 0 }

      // ---- bodies ----------------------------------------------------------------------------------------------------------------
      function body(o) {
        const b = Object.assign({ x: 0, z: 0, a: 0, vx: 0, vz: 0, w: 0, lift: 0, liftT: 0, drop: 0, vis: 1, e: 0, i: -1, fixed: false, noSpin: false, h: 0.12, m: 1, power: 1, pvx: 0, pvz: 0, dispW: 0, dispH: 0, shape: 0 }, o)
        b.im = b.fixed ? 0 : 1 / b.m
        b.iI = b.fixed || b.noSpin ? 0 : 1 / ((b.m * (b.hw * b.hw + b.hd * b.hd)) / 3)
        b.cs = b.circles || fit(b.hw, b.hd)
        b.R = Math.max(...b.cs.map((c) => Math.hypot(c.lx, c.lz) + c.r))
        b.wx = new Float32Array(b.cs.length); b.wz = new Float32Array(b.cs.length)
        b.group = new THREE.Group(); if (o.mesh) { b.group.add(o.mesh); if (o.off) o.mesh.position.set(0, 0, o.off) }
        scene.add(b.group); cur.push(b.group)
        if (!b.fixed) {
          const mat = new THREE.MeshBasicMaterial({ map: SHT[b.shape], color: 0x000000, transparent: true, depthWrite: false, opacity: 0.55 })
          b.shadow = new THREE.Mesh(unit, mat); b.shadow.rotation.order = 'YXZ'; b.shadow.rotation.x = -PI / 2; b.shadow.renderOrder = 2; b.shadow.frustumCulled = false
          scene.add(b.shadow); cur.push(b.shadow)
          phys.push(b)
        }
        bodies.push(b)
        return b
      }
      function display(b, i, dw, dh, soft) { // the Work's moving loop, flat on top of the object (or the soft reflection patch)
        const mat = new THREE.ShaderMaterial({
          vertexShader: DVS, fragmentShader: DFS, transparent: soft > 0, depthWrite: soft === 0,
          uniforms: { uMap: { value: ctx.atlas }, uMap2: { value: ctx.showreel.texture }, uRect: { value: new THREE.Vector4(...ctx.loopRect(i)) }, uReel: { value: 0 }, uSoft: { value: soft }, uBright: { value: 1 }, uPower: { value: 1 } },
        })
        const mesh = new THREE.Mesh(unit, mat); mesh.rotation.x = -PI / 2; mesh.scale.set(dw, dh, 1); mesh.position.y = soft > 0 ? 0.004 : b.h + 0.012; mesh.renderOrder = soft > 0 ? 1 : 0
        b.group.add(mesh); b.disp = mesh; b.i = i; b.dispW = dw; b.dispH = dh; wk[i] = b
        if (soft === 0 && i !== 6 && i !== 7) { // the screen lights the desk a little around it (fake)
          const gm = new THREE.MeshBasicMaterial({ map: radial, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.2 })
          b.glow = new THREE.Mesh(unit, gm); b.glow.rotation.order = 'YXZ'; b.glow.rotation.x = -PI / 2; b.glow.renderOrder = 3; b.glow.frustumCulled = false
          b.glow.scale.set(dw * 2.5, dw * 2.5 * (dh / dw) * 1.4 + 0.6, 1); scene.add(b.glow); cur.push(b.glow)
        }
      }

      // ---- object builders (everything is boxes, cylinders, rounded extrudes) --------------------------------------------------------
      function mkDevice(w, d, h, r, top, side, extra) { const m = new Merge(); m.rr(0, 0, 0, w, d, r, h, 0, top, side); if (extra) extra(m); return m.build() }
      function mkNotebook(nw, nh) {
        const m = new Merge(), pw = nw / 2 - 0.12
        m.rr(0, 0, 0, nw, nh, 0.12, 0.12, 0, 0x2d2d2d, 0x141414)                       // cover
        m.rr(0, 0.12, 0, nw - 0.2, nh - 0.2, 0.05, 0.03, 0, 0x6a6a6a, 0x4a4a4a)        // page stack edge
        m.rr(-nw / 4, 0.15, 0, pw, nh - 0.32, 0.04, 0.03, 0, 0xa6a6a6, 0x7a7a7a)       // left page
        m.rr(nw / 4, 0.15, 0, pw, nh - 0.32, 0.04, 0.03, 0, 0xaaaaaa, 0x7a7a7a)        // right page
        m.box(0, 0.15, 0, 0.07, 0.04, nh - 0.3, 0, 0x6a6a6a, 0x4a4a4a)                 // spine fold
        for (let k = 0; k < 9; k++) { const z = -nh / 2 + 0.5 + (k * (nh - 1)) / 8; m.box(-nw / 4, 0.181, z, pw * 0.86, 0.004, 0.012, 0, 0x8c8c8c, 0x8c8c8c); m.box(nw / 4, 0.181, z, pw * 0.86, 0.004, 0.012, 0, 0x8c8c8c, 0x8c8c8c) }
        return m.build()
      }
      function mkMug() {
        const m = new Merge()
        m.cyl(0, 0, 0, 0.55, 0.62, 0xb4b4b4, 0x8a8a8a, 24)
        m.disc(0, 0.625, 0, 0.46, 0x0a0a0a)                                           // the dark liquid
        m.ring(0.74, 0.34, 0, 0.1, 0.2, 0xa0a0a0)                                      // handle seen from above
        return m.build()
      }
      function mkHeadphones() {
        const m = new Merge()
        m.arc(0, 0.28, 0, 1.12, 0.96, 0, PI, 0.14, 0x4a4a4a, 0x2a2a2a)
        for (const s of [-1, 1]) { m.cyl(s * 1.04, 0, 0, 0.5, 0.42, 0x3c3c3c, 0x202020, 20); m.disc(s * 1.04, 0.43, 0, 0.3, 0x121212) }
        return m.build()
      }
      function mkDrive(label) {
        const m = new Merge()
        m.rr(0, 0, 0, 2.4, 1.5, 0.16, 0.34, 0, 0x2c2c2c, 0x121212)
        m.box(-0.2, 0.34, 0, 1.4, 0.012, 1.05, 0, 0x9a9a9a, 0x9a9a9a)                  // label (fake)
        if (label) for (let k = 0; k < 4; k++) m.box(-0.35, 0.352, -0.34 + k * 0.22, 0.9 - (k % 2) * 0.35, 0.004, 0.07, 0, 0x2a2a2a, 0x2a2a2a)
        else { m.disc(-0.2, 0.352, 0, 0.3, 0x2a2a2a); m.box(-0.2, 0.352, 0.33, 1.1, 0.004, 0.06, 0, 0x2a2a2a, 0x2a2a2a) }
        m.box(1.15, 0.1, 0, 0.12, 0.14, 0.6, 0, 0x6a6a6a, 0x4a4a4a)                    // port
        return m.build()
      }
      function mkSticky() {
        const m = new Merge()
        ;[[-0.1, 0.06, 0.1, 0x7e7e7e], [0.05, -0.03, -0.08, 0x909090], [0.0, 0.02, 0.04, 0xa0a0a0]].forEach(([x, z, a, c], k) => m.box(x, k * 0.022, z, 1.0, 0.02, 1.0, a, c, 0x555555))
        m.box(0.0, 0.07, 0.3, 0.6, 0.004, 0.05, 0.04, 0x606060, 0x606060); m.box(-0.05, 0.07, 0.15, 0.45, 0.004, 0.05, 0.04, 0x606060, 0x606060)
        return m.build()
      }
      function mkPencil() {
        const m = new Merge()
        m.box(-0.05, 0, 0, 1.7, 0.13, 0.13, 0, 0x7c7c7c, 0x505050); m.box(0.95, 0, 0, 0.28, 0.13, 0.13, 0, 0xb0b0b0, 0x808080)
        m.box(1.13, 0.02, 0, 0.1, 0.09, 0.09, 0, 0x2a2a2a, 0x2a2a2a); m.box(-0.95, 0, 0, 0.12, 0.14, 0.14, 0, 0x8f8f8f, 0x606060)
        return m.build()
      }
      function mkPen() {
        const m = new Merge()
        m.box(0, 0, 0, 2.0, 0.11, 0.11, 0, 0x343434, 0x151515); m.box(1.05, 0.02, 0, 0.18, 0.07, 0.07, 0, 0x8f8f8f, 0x606060); m.box(-0.4, 0.11, 0, 0.5, 0.012, 0.05, 0, 0x6a6a6a, 0x6a6a6a)
        return m.build()
      }
      function mkMouse() {
        const m = new Merge()
        m.rr(0, 0, 0, 1.0, 0.6, 0.26, 0.26, 0, 0x343434, 0x151515); m.box(0.18, 0.262, 0, 0.12, 0.02, 0.05, 0, 0x8f8f8f, 0x8f8f8f); m.box(0.05, 0.262, 0, 0.5, 0.004, 0.01, 0, 0x181818, 0x181818)
        return m.build()
      }

      // ---- the build: one layout for landscape, one for portrait (portrait = fewer objects) ------------------------------------------
      function build() {
        for (const o of cur) { scene.remove(o); o.traverse((n) => { if (n.geometry && n.geometry !== unit) n.geometry.dispose(); if (n.material && n.material.dispose && !keep.includes(n.material)) n.material.dispose() }) }
        cur = []; bodies.length = 0; phys.length = 0; wk.fill(null); grab = null; hero = null; keys = null; mug = null; hi = null
        builtP = portrait
        const Lp = (a, b) => (portrait ? b : a)
        const mw = Lp(4.2, 2.95), pw = Lp(4.2, 2.75), ph = (pw * 9) / 16, mx = Lp(4.6, 3.0)
        zEnd = Lp(17.4, 19.6); deskMat.uniforms.uEnd.value = zEnd; deskMat.uniforms.uHalf.value.set(Lp(9.4, 4.8), 0)
        desk.scale.set(Lp(18.8, 9.6), zEnd + 2.4, 1); desk.position.set(0, 0, (zEnd - 2.4) / 2)
        bnd.x0 = Lp(-7.65, -4.38); bnd.x1 = -bnd.x0; bnd.z0 = 0.55; bnd.z1 = zEnd - 0.2

        // static decor: monitor slabs and feet, mouse pad, cables, stains, plant
        const D = new Merge()
        for (const x of [-mx, 0, mx]) {
          D.box(x, 0, -0.1, mw, 1.0, 0.5, 0, 0x303030, 0x181818)                          // the monitor seen from above: a thin slab
          D.box(x, 0.98, 0.1, mw - 0.1, 0.03, 0.1, 0, 0x8a8a8a, 0x8a8a8a)               // backlight leaking over the lower edge
          for (const s of [-1, 1]) D.rr(x + s * mw * 0.36, 0, 0.45, 0.5, 0.75, 0.12, 0.09, 0, 0x282828, 0x121212) // stand feet
        }
        const padX = Lp(6.2, 3.1), padZ = Lp(6.2, 12.3)
        D.rr(padX, 0, padZ, 2.3, 1.9, 0.2, 0.025, 0, 0x1c1c1c, 0x101010); D.rr(padX, 0.02, padZ, 2.15, 1.75, 0.18, 0.012, 0, 0x242424, 0x151515)
        const tube = (pts, rad, col) => { const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, rad, z))), 56, rad, 6); D.add(g, 0, 0, 0, 0, col, col, rad * 2) }
        tube(Lp([[1.8, 0.9], [2.6, 1.8], [4.4, 2.6], [5.6, 3.0], [6.2, 4.3]], [[-1, 0.9], [-0.2, 1.6], [2.0, 2.2], [3.4, 3.1]]), 0.05, 0x333333) // cable (fake)
        if (!portrait) {
          tube([[-6.6, 12.8], [-5.4, 13.6], [-4.6, 15.4], [-5.4, 16.2], [-6.5, 15.5], [-6.0, 14.4]], 0.05, 0x2e2e2e)
          D.ring(6.0, 0.004, 3.7, 0.46, 0.53, 0x0e0e0e)                                  // old mug ring (stain)
          D.ring(-5.2, 0.004, 11.8, 0.4, 0.46, 0x0e0e0e)
          D.cyl(6.4, 0, 15.9, 0.78, 0.75, 0x3a3a3a, 0x1c1c1c, 20); D.disc(6.4, 0.755, 15.9, 0.6, 0x141414)          // plant corner
          for (let k = 0; k < 11; k++) { const a = (k / 11) * PI * 2 + 0.3, r = 0.7 + (k % 3) * 0.28; D.rr(6.4 + Math.cos(a) * r, 0.9 + (k % 4) * 0.12, 15.9 + Math.sin(a) * r, 1.3, 0.42, 0.21, 0.035, -a, 0x4a4a4a + (k % 3) * 0x0a0a0a, 0x262626) }
        } else D.ring(3.9, 0.004, 11.3, 0.45, 0.52, 0x0e0e0e)
        decor = D.build(); scene.add(decor); cur.push(decor)

        // the three monitor reflections: Works 0, 1, 2 (fixed: they only lift on hover)
        ;[0, 1, 2].forEach((i) => {
          const b = body({ name: 'patch' + i, x: [-mx, 0, mx][i], z: 0.4 + ph / 2 + 0.25, hw: pw / 2, hd: ph / 2, h: 0.004, fixed: true, shape: 0 })
          display(b, i, pw, ph, 1)
        })

        // notebook with the hero sentence (the heavy one)
        const nw = Lp(6.4, 7.8), nh = Lp(3.9, 4.5)
        const nb = body({ name: 'notebook', mesh: mkNotebook(nw, nh), x: Lp(-3.35, 0), z: Lp(5.0, 5.3), a: -0.04, hw: nw / 2, hd: nh / 2, h: 0.18, m: 3.2 })
        { // hero, handwritten: one canvas, a line at a time, each slightly off the line (hand-written feel)
          const words = ctx.hero.split(/\s+/), nLines = portrait ? 3 : 2, tgt = ctx.hero.length / nLines, lines = []
          let c = ''
          for (const w of words) { const nx = c ? c + ' ' + w : w; if (c && nx.length > tgt * 1.1 && lines.length < nLines - 1) { lines.push(c); c = w } else c = nx }
          lines.push(c)
          const ts = lines.map((s) => ctx.text(s, { size: 160, color: '#1a1a1a' })), cw = 1536, amax = Math.max(...ts.map((t) => t.aspect)), lh = Math.min((0.92 * cw) / amax, 260), pitch = lh * 0.8
          const ch = Math.round(pitch * lines.length + lh * 0.4), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
          const g = cv.getContext('2d')
          ts.forEach((t, k) => { const wpx = t.aspect * lh, cy = lh * 0.2 + pitch * (k + 0.5); g.save(); g.translate(cw / 2 + (k % 2 ? 14 : -10), cy); g.rotate(k % 2 ? 0.014 : -0.012); g.drawImage(t.canvas, -wpx / 2, -lh / 2, wpx, lh); g.restore(); t.texture.dispose() })
          const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4
          let W = nw * 0.84, H = (W * ch) / cw; if (H > nh * 0.8) { H = nh * 0.8; W = (H * cw) / ch }
          const hm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
          hero = new THREE.Mesh(unit, hm); hero.rotation.order = 'YXZ'; hero.rotation.x = -PI / 2; hero.rotation.y = -0.045; hero.scale.set(W, H, 1); hero.position.set(0, 0.19, 0.02); hero.renderOrder = 4
          nb.group.add(hero)
        }

        // phone (the Showreel opens on it), keyboard, mouse, mug
        const phn = body({ name: 'phone', x: Lp(1.25, -2.5), z: Lp(3.95, 9.0), a: Lp(-0.3, -0.25), hw: 1.06, hd: 0.59, h: 0.1, m: 0.8, mesh: mkDevice(2.12, 1.18, 0.1, 0.18, 0x1e1e1e, 0x0d0d0d, (m) => m.disc(-0.93, 0.104, 0, 0.035, 0x3a3a3a)) })
        display(phn, 3, 1.86, 1.046, 0)
        const kb = body({ name: 'keyboard', x: Lp(2.7, -1.1), z: Lp(6.4, 12.2), a: 0.03, hw: 2.7, hd: 0.95, h: 0.14, m: 2, mesh: mkDevice(5.4, 1.9, 0.14, 0.14, 0x252525, 0x111111) })
        { // many little keys, instanced; the scroll wave presses them
          const rows = [14, 14, 13, 12, 8]; keyDefs = []
          rows.forEach((n, r) => {
            const z = -0.66 + r * 0.33
            if (r < 4) for (let c = 0; c < n; c++) keyDefs.push({ x: -2.3 + (c + (14 - n) / 2) * 0.354, z, w: 0.31, r, c })
            else { for (let c = 0; c < 3; c++) keyDefs.push({ x: -2.3 + c * 0.354, z, w: 0.31, r, c }); keyDefs.push({ x: 0.15, z, w: 2.1, r, c: 6 }); for (let c = 0; c < 3; c++) keyDefs.push({ x: 1.7 + c * 0.354, z, w: 0.31, r, c: 11 + c }) }
          })
          keys = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), keyDefs.length)
          keys.instanceMatrix.setUsage(THREE.DynamicDrawUsage); keys.frustumCulled = false
          keyDefs.forEach((k, n) => { SK.set(k.w, 0.1, 0.27); V1.set(k.x, 0.19, k.z); MK.compose(V1, Qa.identity(), SK); keys.setMatrixAt(n, MK); keys.setColorAt(n, CK.setHex(0x3a3a3a)) })
          kb.group.add(keys)
        }
        const mouse = body({ name: 'mouse', x: padX, z: padZ - 0.1, a: PI / 2 + 0.12, hw: 0.5, hd: 0.3, h: 0.26, m: 0.5, mesh: mkMouse() })
        mug = body({ name: 'mug', x: Lp(6.3, 3.9), z: Lp(3.4, 11.3), hw: 0.55, hd: 0.55, h: 0.64, m: 0.9, noSpin: true, circles: [{ lx: 0, lz: 0, r: 0.55 }], shape: 1, mesh: mkMug() })
        { const hm = new THREE.MeshBasicMaterial({ map: radial, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })
          hi = new THREE.Mesh(unit, hm); hi.rotation.x = -PI / 2; hi.scale.set(0.34, 0.2, 1); hi.position.y = 0.632; hi.renderOrder = 5; mug.group.add(hi) }
        mug.sv = { x: 0, z: 0, vx: 0, vz: 0 }

        // small tablet, drawing tablet with its pen, two prints
        const tab = body({ name: 'tablet', x: Lp(3.4, 2.0), z: Lp(9.7, 9.2), a: 0.3, hw: 1.65, hd: 1.15, h: 0.1, m: 1.2, mesh: mkDevice(3.3, 2.3, 0.1, 0.2, 0x272727, 0x111111, (m) => m.disc(-1.5, 0.104, 0, 0.04, 0x3c3c3c)) })
        display(tab, 4, 2.9, 1.631, 0)
        const dt = body({ name: 'drawing tablet', x: Lp(-3.4, -1.3), z: Lp(10.2, 14.9), a: -0.04, hw: 2.3, hd: 1.5, h: 0.12, m: 1.8, mesh: mkDevice(4.6, 3.0, 0.12, 0.16, 0x222222, 0x101010, (m) => { for (let k = 0; k < 4; k++) m.rr(-2.0, 0.12, -0.9 + k * 0.6, 0.3, 0.3, 0.1, 0.02, 0, 0x4a4a4a, 0x2a2a2a) }) })
        display(dt, 5, 3.2, 1.8, 0)
        body({ name: 'pen', x: Lp(-0.1, 3.2), z: Lp(11.5, 14.8), a: Lp(1.35, 1.4), hw: 1.0, hd: 0.06, h: 0.11, m: 0.3, mesh: mkPen() })
        const sheet = body({ name: 'contact sheet', x: Lp(-3.2, -2.1), z: Lp(14.5, 18.0), a: -0.12, hw: 2.0, hd: 1.35, h: 0.05, m: 0.5, off: 0.28, mesh: (() => { const m = new Merge(); m.rr(0, 0, 0, 4.0, 2.7, 0.08, 0.05, 0, 0xa6a6a6, 0x707070); for (let k = 0; k < 6; k++) m.box(-1.5 + k * 0.6, 0.05, 1.07, 0.5, 0.004, 0.32, 0, 0x4a4a4a, 0x4a4a4a); return m.build() })() })
        display(sheet, 6, 3.0, 1.688, 0)
        const print = body({ name: 'print', x: Lp(1.3, 2.3), z: Lp(14.1, 17.7), a: 0.16, hw: 1.75, hd: 1.25, h: 0.05, m: 0.4, mesh: mkDevice(3.5, 2.5, 0.05, 0.08, 0xa0a0a0, 0x6a6a6a) })
        display(print, 7, 3.0, 1.688, 0)

        if (!portrait) { // landscape only: headphones, two drives, sticky notes, a pencil
          body({ name: 'headphones', x: 5.9, z: 14.3, a: 0.5, hw: 1.5, hd: 0.6, h: 0.5, m: 1, circles: [{ lx: -1.04, lz: 0, r: 0.5 }, { lx: 1.04, lz: 0, r: 0.5 }, { lx: 0, lz: -0.8, r: 0.3 }], mesh: mkHeadphones() })
          body({ name: 'drive 1', x: 4.8, z: 11.9, a: -0.3, hw: 1.2, hd: 0.75, h: 0.34, m: 1.1, mesh: mkDrive(true) })
          body({ name: 'drive 2', x: 0.4, z: 12.0, a: 0.2, hw: 1.2, hd: 0.75, h: 0.34, m: 1.1, mesh: mkDrive(false) })
          body({ name: 'sticky', x: 3.5, z: 4.0, a: 0.1, hw: 0.55, hd: 0.55, h: 0.07, m: 0.15, mesh: mkSticky() })
          body({ name: 'pencil', x: 0.2, z: 4.9, a: 1.2, hw: 1.1, hd: 0.07, h: 0.13, m: 0.2, mesh: mkPencil() })
        }
        void mouse; void tab; void dt
        relax()
      }

      // ---- physics ------------------------------------------------------------------------------------------------------------------
      const E = 0.3
      function worldCircles(b) {
        const c = Math.cos(b.a), s = Math.sin(b.a)
        for (let k = 0; k < b.cs.length; k++) { const q = b.cs[k]; b.wx[k] = b.x + c * q.lx + s * q.lz; b.wz[k] = b.z - s * q.lx + c * q.lz }
      }
      function pairs(positional) {
        for (let i = 0; i < phys.length; i++) {
          const A = phys[i]; if (!A.vis) continue
          for (let j = i + 1; j < phys.length; j++) {
            const B = phys[j]; if (!B.vis) continue
            if (Math.hypot(A.x - B.x, A.z - B.z) > A.R + B.R) continue
            for (let p = 0; p < A.cs.length; p++) for (let q = 0; q < B.cs.length; q++) {
              const dx = B.wx[q] - A.wx[p], dz = B.wz[q] - A.wz[p], ra = A.cs[p].r, rb = B.cs[q].r
              let d = Math.hypot(dx, dz); const pen = ra + rb - d
              if (pen <= 0) continue
              let nx = 1, nz = 0; if (d > 1e-6) { nx = dx / d; nz = dz / d } else d = 0
              const sum = A.im + B.im
              if (!positional) {
                const cx = A.wx[p] + nx * ra, cz = A.wz[p] + nz * ra, rax = cx - A.x, raz = cz - A.z, rbx = cx - B.x, rbz = cz - B.z
                const vax = A.vx + A.w * raz, vaz = A.vz - A.w * rax, vbx = B.vx + B.w * rbz, vbz = B.vz - B.w * rbx
                const vn = (vbx - vax) * nx + (vbz - vaz) * nz
                if (vn < 0) {
                  const cA = raz * nx - rax * nz, cB = rbz * nx - rbx * nz, den = sum + cA * cA * A.iI + cB * cB * B.iI, jj = (-(1 + E) * vn) / den
                  A.vx -= jj * nx * A.im; A.vz -= jj * nz * A.im; A.w -= jj * cA * A.iI
                  B.vx += jj * nx * B.im; B.vz += jj * nz * B.im; B.w += jj * cB * B.iI
                }
              }
              const k = (pen * 0.8) / sum
              A.x -= nx * k * A.im; A.z -= nz * k * A.im; B.x += nx * k * B.im; B.z += nz * k * B.im
              A.wx[p] -= nx * k * A.im; A.wz[p] -= nz * k * A.im; B.wx[q] += nx * k * B.im; B.wz[q] += nz * k * B.im
            }
          }
        }
      }
      function walls(b, bounce) {
        for (let k = 0; k < b.cs.length; k++) {
          const r = b.cs[k].r
          for (let w = 0; w < 4; w++) {
            const nx = w === 0 ? 1 : w === 1 ? -1 : 0, nz = w === 2 ? 1 : w === 3 ? -1 : 0
            const pen = w === 0 ? bnd.x0 - (b.wx[k] - r) : w === 1 ? b.wx[k] + r - bnd.x1 : w === 2 ? bnd.z0 - (b.wz[k] - r) : b.wz[k] + r - bnd.z1
            if (pen <= 0) continue
            b.x += nx * pen; b.z += nz * pen; b.wx[k] += nx * pen; b.wz[k] += nz * pen
            if (!bounce) continue
            const rx = b.wx[k] - nx * r - b.x, rz = b.wz[k] - nz * r - b.z
            const vn = (b.vx + b.w * rz) * nx + (b.vz - b.w * rx) * nz
            if (vn < 0) { const c = rz * nx - rx * nz, jj = (-(1 + 0.35) * vn) / (b.im + c * c * b.iI); b.vx += jj * nx * b.im; b.vz += jj * nz * b.im; b.w += jj * c * b.iI }
          }
        }
      }
      function relax() { // resolve the start layout without any motion
        for (let it = 0; it < 24; it++) { for (const b of phys) worldCircles(b); pairs(true); for (const b of phys) { worldCircles(b); walls(b, false) } }
        for (const b of phys) { b.vx = b.vz = b.w = 0 }
      }
      const KG = 150, DG = 21
      function step() {
        const dl = Math.exp(-3.4 * STEP), da = Math.exp(-4.5 * STEP)
        for (const b of phys) {
          if (!b.vis) continue
          if (grab && grab.b === b) {
            const c = Math.cos(b.a), s = Math.sin(b.a), rx = c * grab.lx + s * grab.lz, rz = -s * grab.lx + c * grab.lz
            const gx = b.x + rx, gz = b.z + rz, vgx = b.vx + b.w * rz, vgz = b.vz - b.w * rx
            let ax = KG * (pd.x - gx) - DG * vgx, az = KG * (pd.z - gz) - DG * vgz
            const am = Math.hypot(ax, az); if (am > 420) { ax *= 420 / am; az *= 420 / am }
            b.vx += ax * STEP; b.vz += az * STEP; b.w += (rz * ax - rx * az) * b.m * b.iI * STEP
          }
          b.vx *= dl; b.vz *= dl; b.w *= da
          const sp = Math.hypot(b.vx, b.vz)
          if (sp > 0) { const ns = Math.max(0, sp - 0.5 * STEP); b.vx *= ns / sp; b.vz *= ns / sp; if (sp > 34) { b.vx *= 34 / sp; b.vz *= 34 / sp } }
          b.w = clamp(b.w, -14, 14)
          b.x += b.vx * STEP; b.z += b.vz * STEP; b.a += b.w * STEP
          worldCircles(b)
        }
        pairs(false)
        for (const b of phys) if (b.vis) walls(b, true)
        if (pd.ok && !touch && !grab && pd.sp > 4.5) { // the pointer is a heavy kinematic circle that pushes what it sweeps through
          for (const b of phys) {
            if (!b.vis || b.e > 0.05 || b.i === hot) continue
            if (Math.hypot(b.x - pd.x, b.z - pd.z) > b.R + 0.5) continue
            for (let k = 0; k < b.cs.length; k++) {
              const dx = b.wx[k] - pd.x, dz = b.wz[k] - pd.z, d = Math.hypot(dx, dz), rr = b.cs[k].r + 0.42
              if (d > rr || d < 1e-5) continue
              const nx = dx / d, nz = dz / d, cx = pd.x + nx * 0.42, cz = pd.z + nz * 0.42, rx = cx - b.x, rz = cz - b.z
              const vn = (b.vx + b.w * rz - pd.vx) * nx + (b.vz - b.w * rx - pd.vz) * nz
              if (vn < 0) { const c = rz * nx - rx * nz, jj = (-(1 + 0.3) * vn) / (b.im + c * c * b.iI); b.vx += jj * nx * b.im; b.vz += jj * nz * b.im; b.w += jj * c * b.iI }
            }
          }
        }
      }

      // ---- picking on the desk plane ---------------------------------------------------------------------------------------------------
      function deskAt(nx, ny, h, out) {
        ndc.x = nx; ndc.y = ny; ray.setFromCamera(ndc, camera)
        const o = ray.ray.origin, d = ray.ray.direction
        if (d.y > -1e-4) return false
        const t = (h - o.y) / d.y; out.x = o.x + d.x * t; out.z = o.z + d.z * t; return true
      }
      const hp = { x: 0, z: 0 }
      function inside(b, x, z, m) { // is the desk point inside this object's footprint (box, or circle for the mug)
        const c = Math.cos(b.a), s = Math.sin(b.a), dx = x - b.x, dz = z - b.z
        const lx = dx * c - dz * s, lz = dx * s + dz * c
        return Math.abs(lx) <= b.hw + m && Math.abs(lz) <= b.hd + m
      }
      function hitWork(nx, ny) {
        let best = -1, bh = -1
        for (let i = 0; i < 8; i++) {
          const b = wk[i]; if (!b || !b.vis || b.e > 0.5) continue
          if (!deskAt(nx, ny, b.h, hp)) continue
          if (inside(b, hp.x, hp.z, touch ? 0.25 : 0.06) && b.h + (b.fixed ? 0 : 1) > bh) { bh = b.h + (b.fixed ? 0 : 1); best = i }
        }
        return best
      }
      function hitBody(nx, ny) {
        let best = null, bh = -1
        for (const b of phys) {
          if (!b.vis || b.e > 0.2) continue
          if (!deskAt(nx, ny, b.h, hp)) continue
          const hit = b === mug ? Math.hypot(hp.x - b.x, hp.z - b.z) < 0.6 : inside(b, hp.x, hp.z, 0.04)
          if (hit && b.h >= bh) { bh = b.h; best = b }
        }
        return best
      }

      // ---- the showcase pose in px, then in world --------------------------------------------------------------------------------------
      function frameOf(i, dt) {
        const w = size.w, h = size.h, b = wk[i], tg = tags[i], ps = pose[i]
        V1.set(b.x, 0.1, b.z).project(camera)
        const hx = (V1.x * 0.5 + 0.5) * w
        const fwp = (w / h < 1 ? 0.8 : 0.34) * w, fhp = (fwp * 9) / 16, M = 24, TOP = w < 768 ? 136 : 104, BOT = h - 24
        let fcx, fcy, tl_, tt
        if (w / h >= 1 && fwp + 22 + tg.wpx + 2 * M <= w) {
          const right = hx <= w / 2, gw = fwp + 22 + tg.wpx, gl = clamp(right ? hx - fwp / 2 : hx + fwp / 2 - gw, M, w - M - gw)
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
      const visW = (d) => 2 * TN * d * asp
      function placeBody(b, ee, fk) { // the group's world pose: desk pose -> showcase (hover) -> filling the view (fly-in)
        const g = b.group, lift = b.lift + b.drop * DROPH
        V1.set(b.x, lift, b.z); Qa.setFromAxisAngle(AY, b.a); let s = 1
        if (ee > 0.0005 || (fk > 0 && b.i === flyIdx)) {
          const ps = pose[b.i], dS = dist * 0.6
          V2.set((ps.x / size.w) * 2 - 1, 1 - (ps.y / size.h) * 2, 0.5).unproject(camera).sub(camera.position).normalize()
          V3.set(0, 0, -1).applyQuaternion(camera.quaternion)
          V2.multiplyScalar(dS / Math.max(V2.dot(V3), 0.2)).add(camera.position)
          const sS = ((ps.w / size.w) * visW(dS)) / b.dispW
          V1.lerp(V2, ee); Qa.slerp(QF, ee); s = lerp(1, sS, ee)
          if (fk > 0 && b.i === flyIdx) {
            const dF = dist * 0.35
            V4.copy(V3).multiplyScalar(dF).add(camera.position)
            const sF = (Math.max(visW(dF), 2 * TN * dF * (16 / 9)) * 1.02) / b.dispW
            V1.lerp(V4, fk); s = lerp(s, sF, fk)
          }
        }
        g.position.copy(V1); g.quaternion.copy(Qa); g.scale.setScalar(s)
        return s
      }

      // ---- the four moments ------------------------------------------------------------------------------------------------------------
      function startOpening() {
        opening = true; O.cam = 0; O.lamp = 0; O.reel = 1; O.decor = 0
        const ph = wk[3]
        bodies.forEach((b) => { if (b !== ph) { b.vis = 0; b.drop = 1; b.power = 0 } })
        tl = gsap.timeline({ onComplete: () => { opening = false } })
        tl.to(O, { cam: 1, duration: 1.75, ease: 'power3.inOut' }, 0.75) // the Showreel is the phone's screen; the camera rises
        tl.set(O, { decor: 1, lamp: 0.5 }, 1.55).set(O, { lamp: 0.18 }, 1.63).to(O, { lamp: 1, duration: 0.4, ease: 'power2.out' }, 1.7) // the lamp clicks on
        bodies.forEach((b) => {
          if (b === ph) return
          const at = 1.55 + Math.min(0.6, Math.hypot(b.x - ph.x, b.z - ph.z) * 0.04)
          tl.set(b, { vis: 1 }, at).to(b, { drop: 0, duration: 0.7, ease: 'bounce.out' }, at)
          if (b.fixed) tl.to(b, { power: 1, duration: 0.5, ease: 'power1.out' }, at + 0.2)
        })
        tl.to(O, { reel: 0, duration: 0.5, ease: 'power1.inOut' }, 2.3)
      }
      function skipOpening() { if (tl) tl.progress(1); opening = false }
      function flyTo(i) {
        if (flying || opening || i < 0 || !wk[i]) return
        flying = true; flyIdx = i; hot = i; ctx.cursor.hover(false); hoverOn = false
        if (grab) { grab = null }
        frameOf(i, 0.016)
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        flyTl.to(fly, { k: 1, duration: 0.74, ease: 'power3.in' }, 0.12)
      }

      // ---- camera ------------------------------------------------------------------------------------------------------------------------
      function layoutCam() {
        asp = size.w / size.h; portrait = asp < 0.85
        camera.fov = portrait ? 46 : 30; camera.aspect = asp; TN = Math.tan((camera.fov * PI) / 360)
        VW = portrait ? 9 : 15.5; TILT = portrait ? 0.12 : 0.2
        dist = VW / (2 * TN * asp)
        camera.far = dist * 3 + 60; camera.updateProjectionMatrix()
        const visH = 2 * TN * dist, top = portrait ? -1.4 : -0.95
        zcMin = top + visH / 2; zcMax = Math.max(zcMin, (portrait ? 19.6 : 17.4) - visH / 2 + 0.6)
        const ph = wk[3], dw = ph ? ph.dispW : 1.86, dh = ph ? ph.dispH : 1.046
        Hc = Math.min((dw * 0.985) / (2 * TN * asp), (dh * 0.985) / (2 * TN)) + 0.12
      }
      function placeCamera(dt) {
        const sc = ctx.scroll, s = clamp(sc.y / (portrait ? 900 : 2600), 0, 1)
        dol += (clamp(Math.abs(sc.v) / 900, 0, 1) - dol) * Math.min(1, dt * 6)
        const e = clamp(O.cam, 0, 1), d = dist * (1 - 0.045 * dol), restH = d * Math.cos(TILT)
        let cx = look.x * 0.4, cz = lerp(zcMin, zcMax, s) + look.y * 0.25, H = restH, tl_ = TILT, yaw = 0
        const ph = wk[3]
        if (e < 1 && ph) {
          const ee = e
          cx = lerp(ph.x, cx, ee); cz = lerp(ph.z, cz, ee); H = Hc * Math.pow(restH / Hc, ee); tl_ = TILT * ee; yaw = ph.a * (1 - ee)
        }
        cam.x = cx; cam.z = cz
        camera.position.set(cx, H, cz + H * Math.tan(tl_))
        camera.up.set(-Math.sin(yaw), 0, -Math.cos(yaw)); camera.lookAt(cx, 0, cz)
        camera.updateMatrixWorld(true)
        QF.copy(camera.quaternion).multiply(QR)
      }

      // ---- frame -----------------------------------------------------------------------------------------------------------------------------
      function update(t, dt) {
        dt = clamp(dt, 0.0001, 0.05)
        const sc = ctx.scroll, w = size.w, h = size.h
        if (builtP !== portrait) { build(); layoutCam(); if (ctx.reduced) O.cam = 1 }
        const lk = Math.min(1, dt * 3)
        look.x += ((P.inside && !touch ? P.nx : 0) - look.x) * lk; look.y += ((P.inside && !touch ? P.ny : 0) - look.y) * lk
        cam.px = cam.x; cam.pz = cam.z
        placeCamera(dt)

        // pointer on the desk; its own velocity is what it moves relative to the camera (scrolling must not shove things)
        pd.ok = deskAt(P.nx, P.ny, 0.2, hp)
        if (pd.ok) {
          pd.px = pd.x; pd.pz = pd.z; pd.x = hp.x; pd.z = hp.z
          if (!pd.init) { pd.init = true; pd.px = pd.x; pd.pz = pd.z; cam.px = cam.x; cam.pz = cam.z }
          const k = Math.min(1, dt * 14)
          pd.vx += (((pd.x - pd.px) - (cam.x - cam.px)) / dt - pd.vx) * k; pd.vz += (((pd.z - pd.pz) - (cam.z - cam.pz)) / dt - pd.vz) * k
          pd.sp = Math.hypot(pd.vx, pd.vz)
        } else pd.sp = 0

        // grab / release (a finger scrolls instead)
        const down = P.down && !opening && !flying && !touch
        if (down && !wasDown) { const b = hitBody(P.nx, P.ny); if (b) { const c = Math.cos(b.a), s = Math.sin(b.a), dx = pd.x - b.x, dz = pd.z - b.z; grab = { b, lx: dx * c - dz * s, lz: dx * s + dz * c } } }
        if (!down && grab) grab = null
        wasDown = down

        // hover: a dwell on a Work (a fast sweep is a push, not a choice); the lifted Work keeps the hover while the pointer is on it
        let hit = -1
        const live = !opening && !flying && !touch && P.inside && !grab
        if (live) {
          const px = ((P.nx + 1) / 2) * w, py = ((1 - P.ny) / 2) * h
          let keepHot = false
          if (hot >= 0 && wk[hot] && wk[hot].e > 0.5) { const ps = pose[hot]; keepHot = Math.abs(px - ps.x) < (ps.w / 2) * 1.06 && Math.abs(py - ps.y) < ((ps.w * 9) / 32) * 1.06 }
          if (keepHot) { hit = hot; dwell = 1; cand = hot } else {
            const c2 = hitWork(P.nx, P.ny)
            if (c2 !== cand) { dwell = 0; cand = c2 } else if (c2 >= 0 && pd.sp < 6) dwell += dt
            hit = c2 >= 0 && dwell > 0.14 && pd.sp < 4 ? c2 : -1
          }
        } else { dwell = 0; cand = -1 }
        if ((hit >= 0) !== hoverOn) { hoverOn = hit >= 0; ctx.cursor.hover(hoverOn) }
        hot = flying ? flyIdx : hit >= 0 ? hit : !opening && focusCell >= 0 ? focusCell : -1

        // physics at a fixed step (frozen while the opening plays)
        if (!opening) {
          acc += dt; let n = 0
          while (acc >= STEP && n < 4) { step(); acc -= STEP; n++ }
          if (n === 4) acc = 0
        }

        // mug liquid: a damped spring pushed by the mug's acceleration
        if (mug) {
          const sv = mug.sv, ax = (mug.vx - mug.pvx) / dt, az = (mug.vz - mug.pvz) / dt
          mug.pvx = mug.vx; mug.pvz = mug.vz
          sv.vx += (-90 * sv.x - 5 * sv.vx - ax * 0.5) * dt; sv.vz += (-90 * sv.z - 5 * sv.vz - az * 0.5) * dt
          sv.x += sv.vx * dt; sv.z += sv.vz * dt
          const r = Math.hypot(sv.x, sv.z); if (r > 0.26) { sv.x *= 0.26 / r; sv.z *= 0.26 / r }
          hi.position.x = sv.x + 0.1; hi.position.z = sv.z - 0.08
          hi.material.opacity = 0.55 + Math.min(0.4, Math.hypot(sv.vx, sv.vz) * 0.6)
        }

        // keys: scroll speed types a wave across them
        if (keys) {
          const amp = clamp(Math.abs(sc.v) / 350, 0, 1), ph = sc.y * 0.014
          for (let n = 0; n < keyDefs.length; n++) {
            const k = keyDefs[n], u = 0.5 + 0.5 * Math.sin(k.c * 0.7 + k.r * 0.45 - ph), pr = amp * u * u * u
            SK.set(k.w, 0.1, 0.27); V1.set(k.x, 0.19 - pr * 0.05, k.z); MK.compose(V1, Qa.identity(), SK); keys.setMatrixAt(n, MK)
            keys.setColorAt(n, CK.setHex(0x3a3a3a).lerp(_C.setHex(0xc4c4c4), pr))
          }
          keys.instanceMatrix.needsUpdate = true; if (keys.instanceColor) keys.instanceColor.needsUpdate = true
        }

        // lift, hover blends and group poses
        const ordered = decor ? bodies : []
        let maxE = 0
        for (const b of ordered) {
          b.liftT = grab && grab.b === b ? 0.28 : 0
          b.lift += (b.liftT - b.lift) * Math.min(1, dt * 14)
          if (b.i >= 0) {
            const tgt = hot === b.i ? 1 : 0
            b.e += (tgt - b.e) * Math.min(1, dt * (tgt ? 9 : 6)); if (b.e < 0.003 && !tgt) { b.e = 0; pose[b.i].init = false }
            if (b.e > 0 || tgt) frameOf(b.i, dt)
            maxE = Math.max(maxE, sm(b.e))
          }
        }
        for (const b of ordered) {
          const ee = b.i >= 0 ? sm(b.e) : 0, fk = b.i === flyIdx ? fly.k : 0
          b.group.visible = !!b.vis
          const s = placeBody(b, ee, fk), y = b.group.position.y
          if (b.disp) {
            const u = b.disp.material.uniforms
            if (b.fixed) { u.uSoft.value = 1 - ee; u.uPower.value = b.power; u.uBright.value = 1 + 0.16 * ee; b.disp.renderOrder = ee > 0.01 ? 20 : 1 } else { u.uBright.value = 1 + 0.12 * ee; if (b.i === 3) u.uReel.value = O.reel }
          }
          if (b.shadow) {
            const sh = b.shadow, spread = 1 + 0.06 * y, off = y * 0.5 + 0.1
            sh.visible = !!b.vis; sh.position.set(b.group.position.x + LX * off, 0.007, b.group.position.z + LZ * off)
            sh.rotation.y = b.a * (1 - ee)
            const m = 1.5
            sh.scale.set(Math.max(b.hw * 2 * m, 0.4) * s * spread, Math.max(b.hd * 2 * m, 0.4) * s * spread, 1)
            sh.material.opacity = (0.6 / (1 + 0.3 * y)) * (1 - 0.5 * ee)
          }
          if (b.glow) { b.glow.visible = !!b.vis; b.glow.position.set(b.group.position.x, 0.012, b.group.position.z); b.glow.rotation.y = b.a; b.glow.material.opacity = 0.2 * (1 - ee) }
        }

        // dim plane: everything else drops back while a Work is lifted
        dim += ((hot >= 0 ? 0.72 : 0) - dim) * Math.min(1, dt * 7)
        dimMat.opacity = dim; dimPlane.visible = dim > 0.004; dimPlane.position.x = cam.x; dimPlane.position.z = cam.z

        // lamp (rides with the view), the desk and the static decor
        deskMat.uniforms.uLamp.value.set(portrait ? -2.2 : -3.8, cam.z * (portrait ? 0.9 : 0.86) - 0.2); deskMat.uniforms.uOn.value = O.lamp
        if (decor) decor.visible = O.decor > 0.5

        ctx.crt.push = clamp(Math.abs(sc.v) / 3200 + fly.k * 0.5 + (opening ? 0.4 * Math.sin(clamp(O.cam, 0, 1) * PI) : 0) + (grab ? Math.min(0.15, Math.hypot(grab.b.vx, grab.b.vz) / 120) : 0), 0, 1)

        // the tag beside the lifted Work
        const want = hot >= 0 && wk[hot] && wk[hot].e > 0.25 && !flying && !opening
        if (want && hot !== tagCell) { tags[tagCell].group.visible = false; tagCell = hot; tagA = 0 }
        tagA += ((want ? 1 : 0) - tagA) * Math.min(1, dt * 12)
        const tg = tags[tagCell], ps = pose[tagCell]
        tg.group.visible = tagA > 0.01
        if (tg.group.visible) {
          const upp = (2 * TN * HUD) / h, l = clamp(ps.l, 16, w - 16 - tg.wpx), tt = clamp(ps.t, 16, h - 16 - tg.hpx)
          tg.group.position.set((l + tg.wpx / 2 - w / 2 - (1 - tagA) * 14) * upp, -(tt + tg.hpx / 2 - h / 2) * upp, -HUD)
          tg.group.scale.setScalar(upp)
          tg.plateMat.opacity = 0.86 * tagA; tg.title.mat.opacity = tagA; tg.meta.mat.opacity = tagA
        }
      }

      layoutCam(); build(); layoutCam(); layoutTags()
      if (ctx.reduced) { O.cam = 1; O.lamp = 1; O.reel = 0; O.decor = 1 } else startOpening()

      return {
        scene, camera, update,
        resize(w, h) { layoutCam(); layoutTags() },
        tap() {
          if (opening) { skipOpening(); return }
          if (flying) return
          let i = hot
          if (i < 0 || touch) i = hitWork(P.nx, P.ny)
          if (i >= 0) flyTo(i)
        },
        focus(i) { focusCell = i },
        activate(i) {
          if (opening) skipOpening()
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
          gsap.killTweensOf(O); gsap.killTweensOf(fly); bodies.forEach((b) => gsap.killTweensOf(b))
          ctx.cursor.hover(false)
          for (const o of cur) { scene.remove(o); o.traverse((n) => { if (n.geometry && n.geometry !== unit) n.geometry.dispose(); if (n.material && n.material.dispose && !keep.includes(n.material)) n.material.dispose() }) }
          if (hero && hero.material.map) hero.material.map.dispose()
          keep.forEach((o) => o.dispose()); scene.remove(camera)
        },
      }
    },
  })
})()
