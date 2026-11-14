// THROWAWAY prototype 2: Drive Shelf. A freelancer's archive: one small shelf beside the desk (two boards, a metre wide), seen straight
// on from close, lamp-lit from the left. Twenty external drives stand like books: eight for the eight Works (the Works live inside them),
// twelve fillers (hard drives, SSDs, tape and SD boxes) for texture, plus a mug of pens, a plant and a coiled cable.
// Hand: the pointer running along the spines tips each drive it passes (spring back with a wobble, LED blinks); press-and-drag pulls a
// drive out with weight, its neighbours lean into the gap, and letting go slides it back in with a soft knock that jostles the row.
// Scroll moves the camera along the top board and down to the second (ping-pong), and sends a domino lean through the row.
// Hover/focus on a Work: its drive slides out, turns its face to the camera and the face opens into the loop at 36% of the view width
// (80% on portrait). Fly-in: the screen swells until it is the view. Opening: the Showreel is the face of one drive held in front of
// the camera, turned and slotted into the shelf, then the lamp comes up and the LEDs blink on in a run.
// FAKE: every filler label text, the "SHOWREEL 2026" label, the masking-tape lettering style. Work label text comes from ctx.works.
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const lerp = (a, b, t) => a + (b - a) * t
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

  // ---- shaders ------------------------------------------------------------------------------------------------------------------
  // a drive: lamp from the left, vertical line noise (rubber / brushed / cardboard), soft top-edge highlight, spine label, LED
  const BODY_VS = `
    varying vec3 vN; varying vec3 vNl; varying vec3 vP; varying vec3 vW;
    void main(){
      vNl = normal; vP = position;
      vN = normalize(mat3(modelMatrix)*normal);
      vec4 w = modelMatrix*vec4(position, 1.); vW = w.xyz;
      gl_Position = projectionMatrix*viewMatrix*w;
    }`
  const BODY_FS = `
    precision highp float;
    uniform vec3 uHalf; uniform vec4 uRect; uniform sampler2D uLab;
    uniform float uBase, uFin, uLamp, uDim, uLed, uOpen, uHas, uTime;
    varying vec3 vN; varying vec3 vNl; varying vec3 vP; varying vec3 vW;
    float h11(float x){ return fract(sin(x*127.1)*43758.5453); }
    void main(){
      vec3 n = normalize(vN);
      vec3 L = normalize(vec3(-.8, .5, .55));
      float dif = max(dot(n, L), 0.);
      float fall = mix(1., .45, smoothstep(-.6, .7, vW.x));
      float lit = (.22 + .78*dif)*fall;
      float side = step(.5, abs(vNl.x));
      float spine = step(.5, vNl.z);
      float lc = side > .5 ? vP.z : vP.x;
      float ln = h11(floor(lc*420.));
      float amp = uFin < .5 ? .05 : (uFin < 1.5 ? .12 : .03);
      float grain = 1. + (ln - .5)*amp*2.;
      float ao = mix(.5, 1., smoothstep(-uHalf.y, -uHalf.y + .06, vP.y));
      float groove = mix(.72, 1., smoothstep(0., .014, uHalf.x - abs(vP.x)));
      float hl = smoothstep(uHalf.y - .016, uHalf.y - .002, vP.y)*(.18 + .3*step(.5, uFin)*step(uFin, 1.5))*fall;
      vec3 col = vec3(uBase*lit*grain*ao*(spine > .5 ? groove : 1.) + hl);
      if (uFin > 1.5) col *= .85 + .15*step(.5, fract(lc*60.));
      // hand-labelled strip on the spine: label tape with the title and year in caps
      vec2 q = vec2(vP.x/uHalf.x, vP.y/uHalf.y);
      vec2 luv = clamp(vec2((q.x + .82)/1.64, (q.y + .8)/1.38), .01, .99);
      vec3 lab = texture2D(uLab, vec2(uRect.x + luv.x*uRect.z, uRect.y + luv.y*uRect.w)).rgb; // sampled outside the branch (no derivative trouble)
      if (uHas > .5 && spine > .5 && abs(q.x) < .82 && q.y > -.8 && q.y < .58) col = lab*(.3 + .7*lit)*ao*(.94 + .06*ln);
      col *= mix(.22, 1., uLamp)*uDim;
      col += uOpen*side*(.3 + .08*sin(vP.y*180. + uTime*2.5));   // the casing lights when the face opens
      float dl = length(vP.xy - vec2(0., uHalf.y - .024));
      float led = (1. - smoothstep(.0028, .0046, dl))*spine;
      col = mix(col, vec3(.93), led*uLed) + vec3(exp(-dl*dl/.00005)*.35*uLed*spine);
      gl_FragColor = vec4(col, 1.);
    }`
  // the static scene (shelf, wall, props): baked grey per vertex, plant leaves sway
  const STAT_VS = `
    attribute float aCol; attribute float aSway;
    uniform float uTime;
    varying float vC; varying vec3 vN; varying vec3 vW;
    void main(){
      vec3 p = position;
      p.x += aSway*sin(uTime*1.1 + position.y*9. + position.x*30.)*.006;
      p.z += aSway*cos(uTime*.9 + position.y*7.)*.004;
      vC = aCol; vN = normal; vW = p;
      gl_Position = projectionMatrix*modelViewMatrix*vec4(p, 1.);
    }`
  const STAT_FS = `
    precision highp float;
    uniform float uLamp, uDim;
    varying float vC; varying vec3 vN; varying vec3 vW;
    void main(){
      vec3 n = normalize(vN);
      float dif = max(dot(n, normalize(vec3(-.8, .5, .55))), 0.);
      float fall = mix(1., .45, smoothstep(-.6, .7, vW.x));
      float lit = (.25 + .75*dif)*fall;
      gl_FragColor = vec4(vec3(vC*lit*mix(.22, 1., uLamp)*uDim*1.5), 1.);
    }`
  const DUST_VS = `
    attribute float aSeed; attribute float aSize;
    uniform float uTime, uScale;
    varying float vA;
    void main(){
      vec3 p = position;
      p.x += cos(uTime*.15 + aSeed*5.)*.05; p.y += sin(uTime*.2 + aSeed*9.)*.05; p.z += sin(uTime*.12 + aSeed*3.)*.04;
      vec3 ld = normalize(vec3(.9, -.35, -.15));
      vec3 q = p - vec3(-.75, .7, .15);
      float along = dot(q, ld);
      float dl = length(q - ld*along);
      vA = (1. - smoothstep(0., .3 + along*.15, dl))*smoothstep(0., .3, along)*(.65 + .35*sin(uTime*.7 + aSeed*20.));
      vec4 mv = modelViewMatrix*vec4(p, 1.);
      gl_Position = projectionMatrix*mv;
      gl_PointSize = max(aSize*uScale/(-mv.z), 1.);
    }`
  const DUST_FS = `
    precision highp float;
    uniform float uLamp; varying float vA;
    void main(){
      float a = smoothstep(.5, 0., length(gl_PointCoord - .5))*vA*uLamp;
      gl_FragColor = vec4(vec3(.8), a*.6);
    }`
  const SHAFT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }`
  const SHAFT_FS = `
    precision highp float;
    uniform float uLamp, uMode; varying vec2 vUv;
    void main(){
      vec2 q = vUv - .5;
      float a;
      if (uMode < .5) a = (1. - smoothstep(0., .3, abs(q.y + q.x*.42)))*(1. - smoothstep(-.5, .5, q.x))*.075;   // the light shaft
      else a = smoothstep(.5, 0., length(q))*.9;                                                              // the lamp glow
      gl_FragColor = vec4(vec3(.7), a*uLamp);
    }`

  // ---- geometry helpers ----------------------------------------------------------------------------------------------------------
  // a smooth rounded box: a 4-segment box whose vertices are pushed out from an inner box by the radius (normals follow)
  function roundedBox(w, h, d, r) {
    const g = new THREE.BoxGeometry(w, h, d, 4, 4, 4), p = g.attributes.position, n = g.attributes.normal
    const hx = w / 2, hy = h / 2, hz = d / 2
    const rm = (c, hh) => { const a = Math.abs(c) / hh; return (c < 0 ? -1 : 1) * hh * (a < 0.01 ? 0 : a < 0.75 ? 1 - r / hh : 1) }
    for (let i = 0; i < p.count; i++) {
      const x = rm(p.getX(i), hx), y = rm(p.getY(i), hy), z = rm(p.getZ(i), hz)
      const ix = clamp(x, -(hx - r), hx - r), iy = clamp(y, -(hy - r), hy - r), iz = clamp(z, -(hz - r), hz - r)
      let nx = x - ix, ny = y - iy, nz = z - iz; const l = Math.hypot(nx, ny, nz) || 1
      nx /= l; ny /= l; nz /= l
      p.setXYZ(i, ix + nx * r, iy + ny * r, iz + nz * r); n.setXYZ(i, nx, ny, nz)
    }
    g.computeBoundingSphere(); g.computeBoundingBox()
    return g
  }
  // merge indexed geometries into one, with a baked grey (aCol) and a sway weight (aSway) per vertex
  function merge(parts) {
    let nv = 0, ni = 0
    parts.forEach((pt) => { nv += pt.g.attributes.position.count; ni += pt.g.index.count })
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv), sw = new Float32Array(nv), idx = new Uint32Array(ni)
    let vo = 0, io = 0; const v = new THREE.Vector3(), nm = new THREE.Matrix3()
    for (const pt of parts) {
      const g = pt.g, p = g.attributes.position, n = g.attributes.normal
      if (pt.m) nm.getNormalMatrix(pt.m)
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i); if (pt.m) v.applyMatrix4(pt.m)
        const px = v.x, py = v.y, pz = v.z
        pos[(vo + i) * 3] = px; pos[(vo + i) * 3 + 1] = py; pos[(vo + i) * 3 + 2] = pz
        v.fromBufferAttribute(n, i); if (pt.m) v.applyMatrix3(nm).normalize()
        nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z
        col[vo + i] = typeof pt.c === 'function' ? pt.c(px, py, pz, v.x, v.y, v.z) : pt.c
        sw[vo + i] = typeof pt.s === 'function' ? pt.s(px, py, pz) : pt.s || 0
      }
      for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo
      vo += p.count; io += g.index.count; g.dispose()
    }
    const out = new THREE.BufferGeometry()
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    out.setAttribute('aCol', new THREE.BufferAttribute(col, 1)); out.setAttribute('aSway', new THREE.BufferAttribute(sw, 1))
    out.setIndex(new THREE.BufferAttribute(idx, 1))
    return out
  }
  const M = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1))

  // ---- the shelf contents (fake: every filler label) -----------------------------------------------------------------------------
  const PW = { mug: 0.11, plant: 0.13, coil: 0.16 } // prop widths
  const TOP = [
    { p: 'mug' },
    { w: 0, T: 0.062, H: 0.215, D: 0.165, g: 0.3, fin: 1 },
    { T: 0.028, H: 0.14, D: 0.1, g: 0.58, fin: 1, label: 'SFX / MUSIC' },
    { w: 1, T: 0.052, H: 0.19, D: 0.16, g: 0.24, fin: 0 },
    { T: 0.05, H: 0.17, D: 0.15, g: 0.34, fin: 0, label: 'SHOWREEL 2026', reel: true },
    { w: 2, T: 0.058, H: 0.205, D: 0.155, g: 0.4, fin: 1 },
    { T: 0.026, H: 0.13, D: 0.095, g: 0.5, fin: 1, label: 'LUTS + PRESETS' },
    { w: 3, T: 0.05, H: 0.18, D: 0.15, g: 0.22, fin: 0 },
    { T: 0.07, H: 0.105, D: 0.075, g: 0.5, fin: 2, label: 'MINIDV 04' },
    { p: 'plant' },
  ]
  const BOT = [
    { w: 4, T: 0.06, H: 0.21, D: 0.16, g: 0.28, fin: 0 },
    { T: 0.05, H: 0.17, D: 0.15, g: 0.38, fin: 0, label: 'RAW A-CAM' },
    { w: 5, T: 0.056, H: 0.2, D: 0.16, g: 0.46, fin: 1 },
    { T: 0.03, H: 0.12, D: 0.1, g: 0.6, fin: 1, label: 'SCRATCH' },
    { w: 6, T: 0.052, H: 0.19, D: 0.155, g: 0.26, fin: 0 },
    { T: 0.07, H: 0.105, D: 0.075, g: 0.5, fin: 2, label: 'TAPE 07' },
    { T: 0.046, H: 0.16, D: 0.14, g: 0.3, fin: 0, label: 'PROJ BACKUP' },
    { w: 7, T: 0.06, H: 0.205, D: 0.16, g: 0.36, fin: 1 },
    { T: 0.026, H: 0.12, D: 0.095, g: 0.55, fin: 1, label: 'CLIENT FINALS' },
    { T: 0.05, H: 0.17, D: 0.15, g: 0.42, fin: 0, label: 'ARCHIV 2019' },
    { T: 0.045, H: 0.075, D: 0.065, g: 0.45, fin: 2, label: 'SD 64' },
    { T: 0.045, H: 0.075, D: 0.065, g: 0.45, fin: 2, label: 'SD 128' },
    { p: 'coil' },
  ]
  const BOARD_Y = [0.46, 0.0] // top surface of the two boards

  HOME.register({
    name: 'Drive Shelf',
    create(ctx) {
      const size = ctx.size, works = ctx.works, P = ctx.pointer, touch = ctx.touch
      const RAD = Math.PI / 180, HUD = 3, dT = 0.26
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(34, size.w / size.h, 0.02, 8)
      scene.add(camera)
      const disp = []; const keep = (o) => { disp.push(o); return o }
      const U = { lamp: { value: 0.15 }, dim: { value: 1 }, time: { value: 0 } }
      const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })()

      // ---- layout: items left to right on each board, props separate the chains of neighbours -----------------------------------------
      const drives = [] // {w, T,H,D, x, y, zc, g, fin, label, nL, nR, row, pos}
      const props = []
      ;[TOP, BOT].forEach((items, row) => {
        const ws = items.map((it) => (it.p ? PW[it.p] : it.T))
        const gw = items.slice(1).map((it, k) => (items[k].p || it.p ? 3 : 1))
        const unit = (0.94 - ws.reduce((a, b) => a + b, 0) - 0.004 * gw.length) / gw.reduce((a, b) => a + b, 0)
        let cur = -0.47, prev = null, pos = 0
        items.forEach((it, k) => {
          const x = cur + ws[k] / 2
          if (it.p) { props.push({ kind: it.p, x, y: BOARD_Y[row] }); prev = null } else {
            const d = Object.assign({ w: -1, label: null, row, x, y: BOARD_Y[row], zc: -0.04 - it.D / 2, nL: null, nR: null, pos: pos++ }, it)
            if (prev) { d.nL = prev; prev.nR = d }
            prev = d; drives.push(d)
          }
          cur += ws[k] + 0.004 + (k < gw.length ? unit * gw[k] : 0)
        })
        items.rowLen = pos
      })
      drives.forEach((d, i) => { d.k = i; d.rowLen = d.row ? BOT.rowLen : TOP.rowLen })
      const byWork = []; drives.forEach((d) => { if (d.w >= 0) byWork[d.w] = d })
      const reelD = drives.find((d) => d.reel)

      // ---- spine label atlas: one canvas, one cell per drive ------------------------------------------------------------------------------
      const CELLW = 96, CELLH = 300
      const labCv = document.createElement('canvas'); labCv.width = CELLW * drives.length; labCv.height = CELLH
      const lg = labCv.getContext('2d')
      drives.forEach((d, j) => {
        const txt = (d.w >= 0 ? `${works[d.w].title} · ${works[d.w].year}` : d.label).toLocaleUpperCase('tr')
        const dark = j % 3 === 1 // label-maker black tape, the rest masking tape
        lg.save(); lg.translate(j * CELLW, 0)
        lg.fillStyle = dark ? '#1a1a1a' : '#d2d2d2'; lg.fillRect(0, 0, CELLW, CELLH)
        if (!dark) { lg.fillStyle = 'rgba(0,0,0,0.06)'; for (let q = 0; q < 6; q++) lg.fillRect(rnd() * CELLW, 0, 1, CELLH) }
        let fs = 40; lg.font = `600 ${fs}px Geist, sans-serif`
        const mw = lg.measureText(txt).width; if (mw > CELLH - 24) { fs = Math.max(12, (fs * (CELLH - 24)) / mw); lg.font = `600 ${fs}px Geist, sans-serif` }
        lg.fillStyle = dark ? '#ededed' : '#1a1a1a'; lg.translate(CELLW / 2, CELLH / 2); lg.rotate(Math.PI / 2); lg.textAlign = 'center'; lg.textBaseline = 'middle'
        lg.fillText(txt, 0, 0); lg.restore()
        d.rect = [(j * CELLW) / labCv.width, 0, CELLW / labCv.width, 1]
      })
      const labTex = keep(new THREE.CanvasTexture(labCv)); labTex.anisotropy = 4

      // ---- static scene: boards, wall, props, contact shadows (one draw call) ---------------------------------------------------------------
      const parts = []
      const box = (x, y, z, w, h, d, c) => parts.push({ g: new THREE.BoxGeometry(w, h, d), m: M(x, y, z), c })
      parts.push({ g: new THREE.PlaneGeometry(1.5, 1.5), m: M(0, 0.3, -0.25), c: (x, y) => 0.06 + 0.06 * sstep(-0.3, 0.8, y) })
      BOARD_Y.forEach((by) => box(0, by - 0.012, -0.12, 1.0, 0.024, 0.24, (x, y, z, nx, ny, nz) => (nz > 0.5 ? 0.3 : ny > 0.5 ? 0.14 + 0.1 * sstep(-0.24, -0.02, z) : 0.1)))
      ;[-0.512, 0.512].forEach((sx) => box(sx, 0.34, -0.12, 0.024, 0.78, 0.24, (x, y, z, nx, ny, nz) => (nz > 0.5 ? 0.24 : 0.14)))
      box(0, 0.73, -0.12, 1.048, 0.024, 0.24, (x, y, z, nx, ny, nz) => (nz > 0.5 ? 0.24 : 0.12))
      // soft contact shadows: a 2x2 quad whose centre vertex is dark
      drives.forEach((d) => {
        const g = new THREE.PlaneGeometry(1, 1, 2, 2); g.rotateX(-Math.PI / 2)
        parts.push({ g, m: new THREE.Matrix4().compose(new THREE.Vector3(d.x, d.y + 0.0006, d.zc), new THREE.Quaternion(), new THREE.Vector3(d.T + 0.05, 1, d.D + 0.04)), c: (x, y, z) => (Math.abs(x - d.x) < 1e-4 && Math.abs(z - d.zc) < 1e-4 ? 0.01 : 0.14 + 0.1 * sstep(-0.24, -0.02, z)) })
      })
      props.forEach((pr) => {
        const { x, y } = pr
        if (pr.kind === 'mug') { // mug of pens
          parts.push({ g: new THREE.CylinderGeometry(0.04, 0.036, 0.09, 20), m: M(x, y + 0.045, -0.12), c: (px, py, pz, nx, ny) => (ny > 0.5 ? 0.06 : 0.42) })
          for (let q = 0; q < 6; q++) {
            const a = (q / 6) * 6.28 + 0.4, tilt = 0.1 + (q % 3) * 0.07
            parts.push({ g: new THREE.CylinderGeometry(0.004, 0.004, 0.13, 6), m: M(x + Math.cos(a) * 0.016, y + 0.1, -0.12 + Math.sin(a) * 0.016, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt), c: q % 2 ? 0.7 : 0.3 })
          }
        } else if (pr.kind === 'plant') { // small plant
          parts.push({ g: new THREE.CylinderGeometry(0.038, 0.028, 0.06, 18), m: M(x, y + 0.03, -0.12), c: (px, py, pz, nx, ny) => (ny > 0.5 ? 0.05 : 0.36) })
          for (let q = 0; q < 9; q++) {
            const a = (q / 9) * 6.28 + q * 0.7, len = 0.07 + (q % 3) * 0.025, tilt = 0.35 + (q % 4) * 0.12
            const g = new THREE.SphereGeometry(0.5, 10, 8); g.scale(0.022, len, 0.004)
            g.translate(0, len * 0.5, 0)
            parts.push({ g, m: M(x + Math.cos(a) * 0.008, y + 0.06, -0.12 + Math.sin(a) * 0.008, Math.sin(a) * tilt, a, -Math.cos(a) * tilt), c: 0.28 + (q % 3) * 0.1, s: (px, py) => clamp((py - (y + 0.06)) / 0.12, 0, 1) })
          }
        } else { // coiled cable, lying flat at the front
          for (let q = 0; q < 5; q++) parts.push({ g: new THREE.TorusGeometry(0.05 - q * 0.002, 0.0065, 8, 28), m: M(x, y + 0.0065 + q * 0.0125, -0.1, Math.PI / 2, 0, q * 0.5), c: 0.1 })
          parts.push({ g: new THREE.BoxGeometry(0.022, 0.012, 0.03), m: M(x + 0.06, y + 0.007, -0.07, 0, 0.4, 0), c: 0.46 })
        }
      })
      const statMat = keep(new THREE.ShaderMaterial({ uniforms: { uLamp: U.lamp, uDim: U.dim, uTime: U.time }, vertexShader: STAT_VS, fragmentShader: STAT_FS }))
      const statGeo = keep(merge(parts))
      const statMesh = new THREE.Mesh(statGeo, statMat); statMesh.frustumCulled = false; scene.add(statMesh)

      // ---- the drives ---------------------------------------------------------------------------------------------------------------------------
      const bodies = []
      drives.forEach((d) => {
        d.PH = d.D / 2 + d.T / 2 + 0.03
        const geo = keep(roundedBox(d.T, d.H, d.D, d.fin === 2 ? 0.0015 : Math.min(0.0045, d.T * 0.18)))
        d.mat = keep(new THREE.ShaderMaterial({
          vertexShader: BODY_VS, fragmentShader: BODY_FS,
          uniforms: {
            uHalf: { value: new THREE.Vector3(d.T / 2, d.H / 2, d.D / 2) }, uRect: { value: new THREE.Vector4(d.rect[0], d.rect[1], d.rect[2], d.rect[3]) }, uLab: { value: labTex },
            uBase: { value: d.g }, uFin: { value: d.fin }, uLamp: U.lamp, uDim: U.dim, uLed: { value: 0 }, uOpen: { value: 0 }, uHas: { value: 1 }, uTime: U.time,
          },
        }))
        d.root = new THREE.Group(); d.tipG = new THREE.Group(); d.tipG.position.set(0, 0, d.D / 2) // tips about its front-bottom edge
        d.body = new THREE.Mesh(geo, d.mat); d.body.position.set(0, d.H / 2, -d.D / 2); d.body.frustumCulled = false; d.body.userData.d = d
        d.root.add(d.tipG); d.tipG.add(d.body); scene.add(d.root); bodies.push(d.body)
        Object.assign(d, { pull: 0, pv: 0, tip: 0, tv: 0, lat: 0, lv: 0, open: 0, blink: 0, on: 1, turn: 0, manual: false })
        d.root.position.set(d.x, d.y, d.zc)
      })
      // the Showreel face on the reel drive (only during the opening)
      const reelFace = new THREE.Mesh(keep(new THREE.PlaneGeometry(reelD.D * 0.92, reelD.D * 0.92 * 9 / 16)), keep(new THREE.MeshBasicMaterial({ map: ctx.showreel.texture })))
      reelFace.rotation.y = Math.PI / 2; reelFace.frustumCulled = false
      reelD.body.add(reelFace); reelFace.position.set(reelD.T / 2 + 0.0008, 0, 0)

      // ---- loop screens: one per Work, born on the drive face ---------------------------------------------------------------------------------
      const bezelMat = keep(new THREE.MeshBasicMaterial({ color: 0x0a0a0a }))
      const bezelGeo = keep(new THREE.PlaneGeometry(1.03, 0.597)) // a thin dark rim round the 16:9 screen
      const screens = works.map((_, i) => {
        const geo = keep(ctx.loopGeometry(i, 1, 9 / 16))
        const mat = keep(new THREE.MeshBasicMaterial({ map: ctx.atlas }))
        const mesh = new THREE.Mesh(geo, mat); mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 10
        const bz = new THREE.Mesh(bezelGeo, bezelMat); bz.position.z = -0.002; bz.frustumCulled = false; mesh.add(bz)
        scene.add(mesh)
        return mesh
      })

      // ---- hero on masking tape ---------------------------------------------------------------------------------------------------------------------
      let heroMesh = null, heroTex = null, heroPortrait = null
      const heroMat = keep(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))
      function buildHero() {
        const portrait = size.w / size.h < 1
        if (portrait === heroPortrait) return
        heroPortrait = portrait
        if (heroTex) heroTex.dispose()
        if (heroMesh) { scene.remove(heroMesh); heroMesh.geometry.dispose() }
        const words = ctx.hero.split(/\s+/), n = portrait ? 3 : 1, target = ctx.hero.length / n, lines = []
        let cur = ''
        for (const w of words) { const nx = cur ? cur + ' ' + w : w; if (cur && nx.length > target * 1.1 && lines.length < n - 1) { lines.push(cur); cur = w } else cur = nx }
        lines.push(cur)
        const cw = portrait ? 1100 : 2048, lh = portrait ? 190 : 150, ch = lh * lines.length + (portrait ? 40 : 0)
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
        const g = cv.getContext('2d')
        g.fillStyle = '#cdcdcd'; g.fillRect(0, 0, cw, ch)
        for (let q = 0; q < 160; q++) { g.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.03})`; g.fillRect(rnd() * cw, 0, 1 + rnd() * 2, ch) }
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, cw, 3); g.fillRect(0, ch - 3, cw, 3)
        g.globalCompositeOperation = 'destination-out' // torn ends
        for (let yy = 0; yy < ch; yy += 6) { const j = 4 + rnd() * 14; g.fillRect(0, yy, j, 6); g.fillRect(cw - 4 - rnd() * 14, yy, 20, 6) }
        g.globalCompositeOperation = 'source-over'
        // hand-lettered: each letter a little off the line, turned and sized
        lines.forEach((ln, li) => {
          let fs = lh * 0.78; g.font = `${fs}px 'Instrument Serif', Georgia, serif`
          const mw = g.measureText(ln).width, maxw = cw - 110; if (mw > maxw) { fs = (fs * maxw) / mw; g.font = `${fs}px 'Instrument Serif', Georgia, serif` }
          let x = (cw - Math.min(mw, maxw)) / 2
          g.fillStyle = '#141414'; g.textBaseline = 'alphabetic'
          for (const chr of ln) {
            const wd = g.measureText(chr).width
            g.save(); g.translate(x + wd / 2, lh * li + lh * 0.72 + (portrait ? 20 : 0) + (rnd() - 0.5) * 7); g.rotate((rnd() - 0.5) * 0.07); g.scale(1, 0.96 + rnd() * 0.08)
            g.fillText(chr, -wd / 2, 0); g.restore(); x += wd
          }
        })
        heroTex = new THREE.CanvasTexture(cv); heroTex.anisotropy = 4
        heroMat.map = heroTex; heroMat.needsUpdate = true
        const w = portrait ? 0.34 : 1.0, h = (w * ch) / cw
        heroMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), heroMat); heroMesh.frustumCulled = false; heroMesh.renderOrder = 3
        if (portrait) heroMesh.position.set(-0.2, 0.765, -0.248); else heroMesh.position.set(0, 0.43, 0.0015) // landscape: stuck along the top board's front edge
        scene.add(heroMesh)
      }
      buildHero()

      // ---- lamp shaft, lamp glow, dust motes ------------------------------------------------------------------------------------------------------------
      const shaftGeo = keep(new THREE.PlaneGeometry(1.8, 1.0))
      const mkShaft = (mode, x, y, z, sx, sy) => {
        const m = keep(new THREE.ShaderMaterial({ uniforms: { uLamp: U.lamp, uMode: { value: mode } }, vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
        const mesh = new THREE.Mesh(shaftGeo, m); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, 1); mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh)
      }
      mkShaft(0, -0.05, 0.4, 0.2, 1, 1); mkShaft(1, -0.8, 0.72, 0.15, 0.22, 0.4)
      const NDUST = touch ? 40 : 90, dpos = new Float32Array(NDUST * 3), dseed = new Float32Array(NDUST), dsize = new Float32Array(NDUST)
      for (let i = 0; i < NDUST; i++) { dpos[i * 3] = -0.6 + rnd() * 1.0; dpos[i * 3 + 1] = -0.05 + rnd() * 0.75; dpos[i * 3 + 2] = -0.1 + rnd() * 0.45; dseed[i] = rnd(); dsize[i] = 0.0025 + rnd() * 0.004 }
      const dgeo = keep(new THREE.BufferGeometry())
      dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3)); dgeo.setAttribute('aSeed', new THREE.BufferAttribute(dseed, 1)); dgeo.setAttribute('aSize', new THREE.BufferAttribute(dsize, 1))
      const dustU = { uTime: U.time, uScale: { value: 600 }, uLamp: U.lamp }
      const dust = new THREE.Points(dgeo, keep(new THREE.ShaderMaterial({ uniforms: dustU, vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })))
      dust.frustumCulled = false; dust.renderOrder = 6; scene.add(dust)

      // ---- hover tags: HUD children of the camera, in px -----------------------------------------------------------------------------------------------
      const hud = new THREE.Group(); camera.add(hud)
      const unit = keep(new THREE.PlaneGeometry(1, 1))
      const mkText = (str, opts) => {
        const t = ctx.text(str, opts); keep(t.texture)
        const m = keep(new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false }))
        const mesh = new THREE.Mesh(unit, m); mesh.renderOrder = 4001; mesh.frustumCulled = false
        return { mesh, mat: m, canvas: t.canvas }
      }
      const PAD = 16
      const tags = works.map((w) => {
        const title = mkText(w.title, { size: 120 }), meta = mkText(`${w.kind} · ${w.year}`, { caps: true, size: 28, color: '#8f8f8f' })
        const plateMat = keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false }))
        const plate = new THREE.Mesh(unit, plateMat); plate.renderOrder = 4000; plate.frustumCulled = false
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

      // ---- state ----------------------------------------------------------------------------------------------------------------------------------
      const O = { p: 0, slide: 0, tape: 1 }
      const fly = { k: 0 }
      let TN = Math.tan(17 * RAD), asp = size.w / size.h, portrait = false
      let KEYS = []
      let opening = false, flying = false, flyIdx = -1, hot = -1, hoverOn = false, focusCell = -1, cand = null, dwell = 0
      let tagCell = 0, tagA = 0, grab = null, grabX = 0, grabY = 0, wasDown = false, lastHit = null, kick = 0
      let lookY = 0, lookP = 0, focusW = 0, focusPP = 0, camU = 0
      let tl = null, flyTl = null, backTw = null
      const hist = new Float32Array(64); let hh = 0
      const scr = works.map(() => ({ e: 0, cx: 0, cy: 0, w: 0, tl: 0, tt: 0 }))
      const rc = new THREE.Raycaster(), ndc = new THREE.Vector2()
      const V = new THREE.Vector3(), V2 = new THREE.Vector3(), Qa = new THREE.Quaternion(), Qb = new THREE.Quaternion(), Qc = new THREE.Quaternion(), Ea = new THREE.Euler(), Y90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2)

      // ---- camera path: top board wide, along it, down to the second board, along it back (ping-pong) ---------------------------------------
      function fit() {
        asp = size.w / size.h; portrait = asp < 1
        camera.fov = portrait ? 50 : 34; camera.aspect = asp; camera.updateProjectionMatrix()
        TN = Math.tan((camera.fov * RAD) / 2)
        KEYS = portrait
          ? [[-0.2, 0.6, 0.85], [-0.28, 0.5, 0.8], [0.28, 0.5, 0.8], [0.28, 0.12, 0.8], [-0.28, 0.12, 0.8]]
          : [[0, 0.5, Math.max(1.1, 1.04 / (2 * TN * asp))], [-0.28, 0.5, 0.72], [0.28, 0.5, 0.72], [0.28, 0.1, 0.72], [-0.28, 0.1, 0.72]]
        dustU.uScale.value = (size.h * size.dpr) / (2 * TN)
      }
      const pathAt = (pp, out) => {
        const s = Math.min(3, Math.floor(pp)), f = pp - s, e = f * f * (3 - 2 * f), a = KEYS[s], b = KEYS[s + 1]
        out[0] = lerp(a[0], b[0], e); out[1] = lerp(a[1], b[1], e); out[2] = lerp(a[2], b[2], e)
      }
      const camP = [0, 0, 1], camF = [0, 0, 1]

      // ---- screen pose in px (hover): the screen hangs dT in front of the camera ------------------------------------------------------------------------
      function faceAnchor(d, out) { // world centre of the drive's big face, from its current turn
        const th = d.turn
        return out.set(d.root.position.x + (d.T / 2) * Math.cos(th), d.root.position.y + d.H / 2, d.root.position.z - (d.T / 2) * Math.sin(th))
      }
      function frameOf(i) {
        const w = size.w, h = size.h, tg = tags[i], p = scr[i], M2 = 24, TOP2 = w < 768 ? 130 : 104, BOT2 = h - 24
        faceAnchor(byWork[i], V); V.project(camera)
        const hx = (V.x * 0.5 + 0.5) * w
        let fw, cx, cy, tl_, tt
        if (asp >= 1) {
          fw = 0.36 * w; const fh = (fw * 9) / 16
          cx = clamp(hx, M2 + fw / 2, w - M2 - fw / 2); cy = clamp(h * 0.5, TOP2 + fh / 2, Math.max(TOP2 + fh / 2, BOT2 - fh / 2))
          if (cx + fw / 2 + 22 + tg.wpx + M2 <= w) tl_ = cx + fw / 2 + 22
          else if (cx - fw / 2 - 22 - tg.wpx >= M2) tl_ = cx - fw / 2 - 22 - tg.wpx
          else { tl_ = clamp(cx - tg.wpx / 2, M2, Math.max(M2, w - M2 - tg.wpx)); cy = Math.min(cy, BOT2 - fh / 2 - tg.hpx - 16) }
          tt = tl_ > cx + fw / 2 || tl_ < cx - fw / 2 ? cy - tg.hpx / 2 : cy + fh / 2 + 16
        } else {
          fw = 0.8 * w; const fh = (fw * 9) / 16, gt = clamp(h * 0.42 - fh / 2, TOP2, Math.max(TOP2, BOT2 - (fh + 16 + tg.hpx)))
          cx = w / 2; cy = gt + fh / 2; tl_ = clamp(cx - fw / 2, 16, Math.max(16, w - 16 - tg.wpx)); tt = gt + fh + 16
        }
        tt = clamp(tt, TOP2, Math.max(TOP2, BOT2 - tg.hpx))
        p.cx = cx; p.cy = cy; p.w = fw; p.tl = tl_; p.tt = tt
      }

      // ---- effects ----------------------------------------------------------------------------------------------------------------------------------------
      function knockFx(d, k) { // a drive slams home: it hops, the row is jostled
        d.tv += k * 1.1; d.blink = 0.4
        if (d.nL) d.nL.lv -= k * 3; if (d.nR) d.nR.lv += k * 3
        kick = Math.max(kick, clamp(k * 0.3, 0, 0.35))
      }
      const pnOf = (e) => (e ? clamp(e.pull / (e.D * 0.9), 0, 1) * (e.T / e.H) * 1.6 : 0) // how much of a gap the pulled drive e leaves
      const gapOf = (e) => (e ? pnOf(e.nR) - pnOf(e.nL) : 0) // lean toward the pulled neighbour
      const poke = (d, s) => { d.tv += 1.6 * s; d.blink = 0.35 } // the hand runs along the spines

      // ---- the four moments -------------------------------------------------------------------------------------------------------------------------------
      function startOpening() {
        opening = true; O.p = 0; O.slide = 0; O.tape = 0; U.lamp.value = 0.15
        drives.forEach((d) => { d.on = 0 }); reelD.manual = true; reelFace.visible = true
        tl = gsap.timeline({ onComplete: () => { opening = false; finishReel() } })
        tl.to(O, { p: 1, duration: 1.2, ease: 'power2.inOut' }, 0.5)
        tl.to(O, { slide: 1, duration: 0.45, ease: 'power3.in' }, 1.7)
        tl.call(() => { reelD.manual = false; reelFace.visible = false; applyRest(reelD); knockFx(reelD, 0.5) }, null, 2.15)
        tl.to(U.lamp, { value: 1, duration: 1.0, ease: 'power2.out' }, 2.05)
        tl.to(O, { tape: 1, duration: 0.6, ease: 'power1.out' }, 2.2)
        const order = drives.slice().sort((a, b) => a.row - b.row || a.pos - b.pos)
        order.forEach((d, n) => tl.call(() => { d.on = 1; d.blink = 0.4 }, null, 2.2 + n * 0.045))
      }
      function finishReel() { reelD.manual = false; reelFace.visible = false; O.p = 1; O.slide = 1 }
      function applyRest(d) { d.root.scale.set(1, 1, 1); d.root.quaternion.identity(); d.root.position.set(d.x, d.y, d.zc) }
      function flyTo(i) {
        if (flying || opening || i < 0) return
        flying = true; flyIdx = i; hot = i; ctx.cursor.hover(false); hoverOn = false
        frameOf(i)
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        flyTl.to(fly, { k: 1, duration: 0.72, ease: 'power3.in' }, 0.1)
      }

      // ---- one frame ------------------------------------------------------------------------------------------------------------------------------------------
      function update(tm, dt) {
        dt = clamp(dt, 0.0001, 0.05); U.time.value = tm
        const w = size.w, h = size.h, sc = ctx.scroll, down = P.down && !opening && !flying

        // camera: along the path with the scroll; the pointer looks around with weight (about 10 deg)
        focusW += ((focusCell >= 0 && !opening ? 1 : 0) - focusW) * Math.min(1, dt * 4)
        if (focusCell >= 0) { const f = byWork[focusCell]; focusPP = f.row ? 3 + clamp((0.28 - f.x) / 0.56, 0, 1) : 1 + clamp((f.x + 0.28) / 0.56, 0, 1) }
        camU = sc.y / 520
        const m8 = ((camU % 8) + 8) % 8, pp0 = m8 < 4 ? m8 : 8 - m8
        pathAt(lerp(pp0, focusPP, focusW), camP)
        const live = P.inside && !touch
        lookY += ((live ? -P.nx * 0.17 : 0) - lookY) * Math.min(1, dt * 5); lookP += ((live ? P.ny * 0.1 : 0) - lookP) * Math.min(1, dt * 5)
        camera.position.set(camP[0] + lookY * 0.12 * camP[2], camP[1] - lookP * 0.1 * camP[2], camP[2])
        camera.rotation.set(lookP, lookY, 0)
        camera.updateMatrixWorld()

        // scroll history for the domino lean
        hh = (hh + 1) & 63; hist[hh] = clamp(sc.v / 700, -1.5, 1.5)
        const dir = hist[hh] >= 0 ? 1 : -1

        // hover and drag
        scene.updateMatrixWorld(true)
        let hit = null
        if (!opening && !flying && P.inside && !(touch && !P.down)) {
          rc.setFromCamera(ndc.set(P.nx, P.ny), camera)
          const r = rc.intersectObjects(bodies, false)
          if (r.length) hit = r[0].object.userData.d
        }
        if (hit && hit !== lastHit && !down && !touch && Math.abs(P.dx) > 1.5) poke(hit, clamp(Math.abs(P.dx) / 12, 0.4, 1.4)) // run a finger along the spines
        lastHit = hit
        if (down && !wasDown && !touch && hit) { grab = hit; grabX = P.x; grabY = P.y }
        if (!down && grab) grab = null
        wasDown = down
        const dragAmt = grab ? clamp(Math.hypot(P.x - grabX, P.y - grabY) / (0.2 * Math.min(w, h)), 0, 1) : 0
        // a Work's drive opens after a short dwell; an open one keeps the hover while the pointer is on its screen or drive
        let hover = -1
        if (!opening && !flying && !touch && P.inside && !grab) {
          const x = ((P.nx + 1) / 2) * w, y = ((1 - P.ny) / 2) * h
          let keepHot = false
          if (hot >= 0 && byWork[hot].open > 0.5) { const p = scr[hot]; keepHot = Math.abs(x - p.cx) < (p.w / 2) * 1.05 && Math.abs(y - p.cy) < ((p.w * 9) / 32) * 1.05 }
          const c2 = hit && hit.w >= 0 ? hit : null
          if (keepHot || (hit && hit.w === hot && hot >= 0)) { hover = hot; dwell = 1; cand = byWork[hot] } else {
            if (c2 !== cand) { dwell = 0; cand = c2 } else if (c2) dwell += dt
            hover = c2 && dwell > 0.16 && Math.abs(P.dx) < 8 ? c2.w : -1
          }
        } else { dwell = 0; cand = null }
        if ((hover >= 0) !== hoverOn) { hoverOn = hover >= 0; ctx.cursor.hover(hoverOn) }
        hot = flying ? flyIdx : hover >= 0 ? hover : !opening && focusCell >= 0 ? focusCell : -1
        U.dim.value += (((hot >= 0 ? 0.55 : 1) * (1 - fly.k * 0.9)) - U.dim.value) * Math.min(1, dt * 8)

        // physics of every drive: tip, lean (with the chain of neighbours), pull (with the knock)
        const sub = dt > 0.025 ? 2 : 1, sdt = dt / sub
        for (let s = 0; s < sub; s++) {
          for (const d of drives) {
            if (d.manual) continue
            const tgtOpen = d.w >= 0 && d.w === hot ? 1 : 0
            if (s === 0) d.open += (tgtOpen - d.open) * Math.min(1, dt * 7)
            const dragT = grab === d ? dragAmt * (d.D * 0.9 + 0.02) : 0
            const pt = Math.max(dragT, d.open * d.PH)
            d.pv += (50 * (pt - d.pull) - 9 * d.pv) * sdt; d.pull += d.pv * sdt
            if (d.pull < 0) { const k = -d.pv; d.pull = 0; d.pv = 0; if (k > 0.06) knockFx(d, k) }
            d.tv += (-90 * d.tip - 4.5 * d.tv) * sdt; d.tip = clamp(d.tip + d.tv * sdt, -0.4, 0.4)
            // lean target from the gaps next to it, the neighbours' neighbours lean a little too
            const lt = clamp(gapOf(d) + 0.4 * gapOf(d.nL) + 0.4 * gapOf(d.nR), -0.32, 0.32)
            const ph = dir > 0 ? d.pos : d.rowLen - 1 - d.pos
            const dom = hist[(hh - ph * 2 + 64) & 63] * 12 // the wave runs along the row in the scroll direction
            d.lv += (-60 * (d.lat - lt) - 5 * d.lv + dom) * sdt; d.lat = clamp(d.lat + d.lv * sdt, -0.32, 0.32)
          }
        }

        // pose of every drive
        for (const d of drives) {
          if (d.manual) continue
          d.blink = Math.max(0, d.blink - dt * 3)
          d.turn = -(Math.PI / 2) * sstep(0.45, 1, d.open)
          d.tipG.rotation.set(d.tip * (1 - d.open), 0, -d.lat)
          d.root.position.set(d.x, d.y + d.open * 0.012, d.zc + d.pull)
          d.root.rotation.set(0, d.turn, 0)
          const idle = d.on * (0.3 + 0.1 * Math.sin(tm * 1.3 + d.k * 1.7))
          d.mat.uniforms.uLed.value = Math.max(d.open > 0.5 ? d.on : idle, d.blink)
          d.mat.uniforms.uOpen.value = d.open
        }
        // the Showreel drive held in front of the camera, turned and slotted into the shelf
        if (reelD.manual) {
          const d = reelD, e = O.p, sl = O.slide * O.slide, vh = 2 * TN * 0.45, vw = vh * asp
          const fw = d.D * 0.92, fh = (fw * 9) / 16, s = lerp(Math.max(vw / fw, vh / fh) * 1.03, 1, e)
          V.set(0, 0, -(0.45 + (d.T / 2) * s)); camera.localToWorld(V) // held: the face plane is 0.45 in front of the lens
          const cx = lerp(V.x, d.x, e), cy = lerp(V.y, d.y + d.H / 2 + 0.03, e) + Math.sin(Math.PI * e) * 0.06, cz = lerp(V.z, d.zc + 0.3, e)
          Qa.copy(camera.quaternion).multiply(Y90); Qc.copy(Qa).slerp(Qb.identity(), e)
          d.root.quaternion.copy(Qc); d.root.scale.setScalar(s)
          V.set(0, (d.H / 2) * s, 0).applyQuaternion(Qc)
          d.root.position.set(lerp(cx, d.x, sl) - V.x, lerp(cy, d.y + d.H / 2, sl) - V.y, lerp(cz, d.zc, sl) - V.z)
          d.mat.uniforms.uLed.value = 0
        }

        // loop screens grow out of the drive faces to 36% of the view (80% on portrait); fly-in makes them the view
        const fill = Math.max(w, (h * 16) / 9) * 1.03, upp = (2 * TN * dT) / h
        for (let i = 0; i < 8; i++) {
          const d = byWork[i], s = scr[i], mesh = screens[i]
          s.e = sstep(0.45, 1, d.open)
          mesh.visible = s.e > 0.003
          if (!mesh.visible) continue
          frameOf(i)
          const e = s.e, fk = i === flyIdx ? fly.k : 0
          const cx = lerp(s.cx, w / 2, fk), cy = lerp(s.cy, h / 2, fk), wp = lerp(s.w, fill, fk)
          faceAnchor(d, V)
          V2.set((cx - w / 2) * upp, -(cy - h / 2) * upp, -dT); camera.localToWorld(V2)
          mesh.position.set(lerp(V.x, V2.x, e), lerp(V.y, V2.y, e), lerp(V.z, V2.z, e))
          Ea.set(0, d.turn + Math.PI / 2, 0); Qa.setFromEuler(Ea)
          mesh.quaternion.copy(Qa).slerp(camera.quaternion, e)
          const sw = lerp(d.D * 0.9, wp * upp, e); mesh.scale.set(sw, sw, 1)
        }

        // glass push: scroll speed, impacts, fly
        kick = Math.max(0, kick - dt * 1.8)
        ctx.crt.push = clamp(Math.abs(sc.v) / 3200 + kick + fly.k * 0.5 + (opening ? 0.3 * Math.sin(clamp(O.p, 0, 1) * Math.PI) : 0), 0, 1)

        // hero tape
        heroMat.opacity = O.tape; heroMat.color.setScalar(0.55 + 0.45 * U.lamp.value); if (heroMesh) heroMesh.visible = O.tape > 0.003

        // tag beside the open screen
        const want = hot >= 0 && scr[hot].e > 0.25 && !flying && !opening
        if (want && hot !== tagCell) { tags[tagCell].group.visible = false; tagCell = hot; tagA = 0 }
        tagA += ((want ? 1 : 0) - tagA) * Math.min(1, dt * 12)
        const tg = tags[tagCell], p = scr[tagCell]
        tg.group.visible = tagA > 0.01
        if (tg.group.visible) {
          const u1 = (2 * TN * HUD) / h
          const l = clamp(p.tl, 16, w - 16 - tg.wpx), tt = clamp(p.tt, 16, h - 16 - tg.hpx)
          tg.group.position.set((l + tg.wpx / 2 - w / 2 - (1 - tagA) * 14) * u1, -(tt + tg.hpx / 2 - h / 2) * u1, -HUD)
          tg.group.scale.setScalar(u1)
          tg.plateMat.opacity = 0.86 * tagA; tg.title.mat.opacity = tagA; tg.meta.mat.opacity = tagA
        }
      }

      fit(); layoutTags()
      if (ctx.reduced) { U.lamp.value = 1; O.tape = 1 } else startOpening()

      return {
        scene, camera, update,
        resize() { fit(); buildHero(); layoutTags() },
        tap() {
          if (opening) { tl.progress(1); return }
          if (flying) return
          if (hot >= 0) return flyTo(hot)
          rc.setFromCamera(ndc.set(P.nx, P.ny), camera)
          const r = rc.intersectObjects(bodies, false)
          if (r.length) { const d = r[0].object.userData.d; if (d.w >= 0) flyTo(d.w); else poke(d, 1) }
        },
        focus(i) { focusCell = i },
        activate(i) { if (opening) tl.progress(1); if (!flying) flyTo(i) },
        back() {
          if (flyTl) flyTl.kill()
          if (backTw) backTw.kill()
          backTw = gsap.to(fly, { k: 0, duration: 0.8, ease: 'power3.inOut', onComplete: () => { flying = false; flyIdx = -1; focusCell = -1 } })
        },
        dispose() {
          if (tl) tl.kill(); if (flyTl) flyTl.kill(); if (backTw) backTw.kill()
          gsap.killTweensOf(O); gsap.killTweensOf(fly); gsap.killTweensOf(U.lamp)
          ctx.cursor.hover(false)
          disp.forEach((d) => d.dispose()); if (heroTex) heroTex.dispose(); if (heroMesh) heroMesh.geometry.dispose()
          scene.remove(camera)
        },
      }
    },
  })
})()
