// THROWAWAY prototype: Edit Room. Taha's room at night, seen from the doorway and then from behind his chair.
// The room is lit only by its screens and the desk lamp, done in ONE small shader (up to 8 fake point/spot lights from uniforms,
// analytic corner AO, blind stripes) shared by all furniture, so hover can dim and brighten the room live. Glossy desk = a
// flipped, fading copy of each monitor's loop on the desk (additive quad). Scroll = a slow arc through 6 stops (8 on a phone).
// Opening: black room, centre monitor wakes with the Showreel filling the view, camera pulls back, the rest comes on one by one.
// Fly-in = the same camera blend as the opening, run the other way. No picking library: rays are tested against the 8 screen planes by hand.
// FAKE: the poster/headphones/books/mug details, the speaker and laptop shapes, the window and the night outside.
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

  // ---- the lit shader: furniture, walls, poster, chair, lamp ---------------------------------------------------------------
  const LIT_VS = `
    attribute vec3 aCol;
    varying vec3 vP; varying vec3 vN; varying vec3 vC; varying vec2 vUv;
    void main(){
      vec4 w = modelMatrix * vec4(position, 1.);
      vP = w.xyz; vN = mat3(modelMatrix) * normal; vC = aCol; vUv = uv;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`
  const LIT_FS = `
    precision highp float;
    uniform vec4 uLP[8]; uniform vec4 uLD[8];
    uniform float uRoom, uStripe, uT, uFloor;
    #ifdef LIT_MAP
    uniform sampler2D uMap;
    #endif
    varying vec3 vP; varying vec3 vN; varying vec3 vC; varying vec2 vUv;
    void main(){
      vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
      float lit = .15 * uRoom;
      for (int i = 0; i < 8; i++) {
        vec3 d = uLP[i].xyz - vP; float r2 = dot(d, d) + .003; vec3 l = d * inversesqrt(r2);
        float lam = clamp(dot(N, l) * .55 + .45, 0., 1.);
        float f = pow(max(dot(-l, uLD[i].xyz), 0.), uLD[i].w);
        float om = i < 6 ? .18 : .04;
        lit += uLP[i].w * lam * (om + (1. - om) * f) / (1. + r2 * 5.);
      }
      // blinds: faint stripes from the window on the left, drifting slowly
      vec3 sd = normalize(vec3(.8, -.28, .15));
      float sf = max(dot(N, -sd), 0.);
      float ph = vP.y * 8.5 + vP.z * 3. - vP.x * 2.2 + uT * .03;
      float st = smoothstep(.2, .34, abs(fract(ph) - .5));
      lit += uStripe * .11 * sf * st * exp((vP.x + 1.5) * -.3) * uRoom;
      #ifdef LIT_MAP
      vec3 col = texture2D(uMap, vUv).rgb * (lit + uFloor * uRoom);
      #else
      vec3 a3 = abs(N);
      float aox = mix(1., mix(.6, 1., smoothstep(0., .5, 1.5 - abs(vP.x))), 1. - a3.x);
      float aoy = mix(1., mix(.5, 1., smoothstep(0., .55, vP.y)) * mix(.65, 1., smoothstep(0., .5, 2.6 - vP.y)), 1. - a3.y);
      float aoz = mix(1., mix(.55, 1., smoothstep(0., .5, vP.z + 2.)), 1. - a3.z);
      float ud = (1. - smoothstep(.5, .72, vP.y)) * step(abs(vP.x), 1.05) * step(vP.z, -1.25) * (1. - step(vP.z, -2.01));
      vec3 col = vC * lit * aox * aoy * aoz * (1. - .5 * ud);
      #endif
      gl_FragColor = vec4(col, 1.);
    }`
  const SCR_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }'
  const SCR_FS = `
    precision highp float;
    uniform sampler2D uMap; uniform sampler2D uReel; uniform vec4 uRect; uniform float uB, uReelMix;
    varying vec2 vUv;
    void main(){
      vec2 uv = clamp(vUv, .003, .997);
      vec3 c = mix(texture2D(uMap, uRect.xy + uv * uRect.zw).rgb, texture2D(uReel, uv).rgb, uReelMix);
      vec2 q = uv - .5;
      gl_FragColor = vec4(c * uB * (1. - .5 * dot(q, q)), 1.);
    }`
  const GLOW_VS = `
    attribute vec4 aRect; attribute vec2 aA; attribute float aKind;
    varying vec2 vUv; varying vec4 vRect; varying vec2 vA; varying float vKind;
    void main(){ vUv = uv; vRect = aRect; vA = aA; vKind = aKind; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`
  const GLOW_FS = `
    precision highp float;
    uniform sampler2D uMap;
    varying vec2 vUv; varying vec4 vRect; varying vec2 vA; varying float vKind;
    void main(){
      // kind 0: the monitor's loop mirrored on the desk (bottom row touches the base, fades with distance); kind 1: soft patch
      float s = vUv.y, x = vUv.x * 2. - 1.;
      float fade = exp(-s * (5.2 - 2.6 * vA.y)) * (1. - smoothstep(.72, 1., abs(x))) * (1. - smoothstep(.85, 1., s));
      float v0 = clamp(s * .9, 0., 1.);
      vec3 c = (texture2D(uMap, vRect.xy + vec2(vUv.x, v0) * vRect.zw).rgb
              + texture2D(uMap, vRect.xy + vec2(vUv.x, clamp(v0 + .08, 0., 1.)) * vRect.zw).rgb
              + texture2D(uMap, vRect.xy + vec2(vUv.x, clamp(v0 - .08, 0., 1.)) * vRect.zw).rgb) * .1667;
      vec3 refl = (c + .06) * fade * vA.x * .75;
      vec2 p = vUv * 2. - 1.; float r = clamp(length(p), 0., 1.);
      float h = 1. - smoothstep(0., 1., r); h *= h;
      vec3 halo = vec3(h * .3 * vA.x * (1. + .5 * vA.y));
      gl_FragColor = vec4(mix(refl, halo, step(.5, vKind)), 1.);
    }`
  const SHADOW_VS = 'attribute float aStr; varying vec2 vUv; varying float vS; void main(){ vUv = uv; vS = aStr; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }'
  const SHADOW_FS = 'precision highp float; varying vec2 vUv; varying float vS; void main(){ float r = clamp(length(vUv*2.-1.),0.,1.); float a = 1.-smoothstep(0.,1.,r); gl_FragColor = vec4(0.,0.,0.,a*a*vS); }'

  // ---- the camera path: stops are [position, look-at] ---------------------------------------------------------------------
  const STOPS_L = [
    [[0.1, 1.62, 2.2], [0, 1.15, -1.8]],      // doorway: the whole room
    [[0.05, 1.42, 0.15], [0, 1.05, -1.75]],   // in over the chair
    [[-0.62, 1.2, -0.75], [-0.45, 1.04, -1.75]], // along the monitors: left
    [[0.62, 1.2, -0.75], [0.45, 1.04, -1.75]],   // right
    [[0.05, 1.5, -0.6], [0.05, 0.76, -1.4]],  // down to the tablet and phone
    [[-0.2, 1.5, -0.1], [1.5, 1.4, -0.55]],   // up to the prints
  ]
  const STOPS_P = [
    [[0, 1.7, 2.3], [0, 1.15, -1.8]],
    [[0, 1.35, 0.1], [0, 1.05, -1.75]],
    [[0, 1.2, -0.9], [0, 1.05, -1.78]],
    [[-0.6, 1.2, -0.95], [-0.5, 1.04, -1.75]],
    [[0.6, 1.2, -0.95], [0.5, 1.04, -1.75]],
    [[-0.58, 1.25, -1.05], [-0.6, 0.76, -1.4]],
    [[0.64, 1.2, -1.0], [0.66, 0.76, -1.33]],
    [[0.4, 1.5, -1.0], [1.5, 1.45, -1.0]],   // one print at a time on a phone
    [[0.4, 1.5, -0.1], [1.5, 1.45, -0.1]],
  ]
  const SCROLL_LEN = 3200, HUD = 3

  HOME.register({
    name: 'Edit Room',
    create(ctx) {
      const size = ctx.size, works = ctx.works, P = ctx.pointer, touch = ctx.touch, sc = ctx.scroll
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(58, size.w / size.h, 0.02, 24)
      scene.add(camera)
      const geos = [], mats = [], texs = []
      const own = (g) => { geos.push(g); return g }
      const ownM = (m) => { mats.push(m); return m }
      ctx.crt.glow = 0.8

      // ---- tiny build kit: matrices and a merger that bakes grey vertex colours with a bottom-darkening gradient ----------
      const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1)
      const M = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s)
      const mul = (a, b) => a.clone().multiply(b)
      const Bx = (w, h, d) => new THREE.BoxGeometry(w, h, d)
      const Cy = (rt, rb, h, s = 18) => new THREE.CylinderGeometry(rt, rb, h, s)
      function makeMerge() {
        const pos = [], nor = [], col = [], uvs = [], idx = []
        const v = new THREE.Vector3(), nv = new THREE.Vector3(), nm = new THREE.Matrix3()
        return {
          add(geo, m, hex, ao = true) { // fake: the bottom-darkening is the baked contact shade
            const p = geo.attributes.position, nn = geo.attributes.normal, u = geo.attributes.uv, cnt = p.count, base = pos.length / 3
            nm.getNormalMatrix(m)
            let y0 = 1e9, y1 = -1e9
            for (let k = 0; k < cnt; k++) {
              v.fromBufferAttribute(p, k).applyMatrix4(m); pos.push(v.x, v.y, v.z)
              nv.fromBufferAttribute(nn, k).applyMatrix3(nm).normalize(); nor.push(nv.x, nv.y, nv.z)
              uvs.push(u.getX(k), u.getY(k)); if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y
            }
            const r = ((hex >> 16) & 255) / 255
            for (let k = 0; k < cnt; k++) { const f = ao && y1 > y0 + 0.02 ? 0.62 + (0.38 * (pos[(base + k) * 3 + 1] - y0)) / (y1 - y0) : 1; col.push(r * f, r * f, r * f) }
            if (geo.index) for (let k = 0; k < geo.index.count; k++) idx.push(geo.index.getX(k) + base)
            else for (let k = 0; k < cnt; k++) idx.push(base + k)
            geo.dispose()
          },
          rod(a, b, t, hex) { // a thin box from point a to point b
            const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B)
            const m = new THREE.Matrix4().lookAt(A, B, new THREE.Vector3(0, 1, 0)); m.setPosition(A.clone().add(B).multiplyScalar(0.5))
            this.add(Bx(t, t, len), m, hex)
          },
          build() {
            const g = new THREE.BufferGeometry()
            g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
            g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx)
            return g
          },
        }
      }

      // ---- lights (data only; the shader does the rest) ---------------------------------------------------------------------
      const LP = [], LD = []
      for (let i = 0; i < 8; i++) { LP.push(new THREE.Vector4(0, 0, 0, 0)); LD.push(new THREE.Vector4(0, 0, 1, 1)) }
      const LU = { uLP: { value: LP }, uLD: { value: LD }, uRoom: { value: 0 }, uStripe: { value: 1 }, uT: { value: 0 } }
      const litMat = ownM(new THREE.ShaderMaterial({ uniforms: { ...LU, uFloor: { value: 0 } }, vertexShader: LIT_VS, fragmentShader: LIT_FS }))
      const litMatTwo = ownM(new THREE.ShaderMaterial({ uniforms: { ...LU, uFloor: { value: 0 } }, vertexShader: LIT_VS, fragmentShader: LIT_FS, side: THREE.DoubleSide }))

      // ---- the eight screens: 0..2 monitors, 3 laptop, 4 tablet, 5 phone, 6..7 framed prints ------------------------------------------
      const Y22 = (22 * Math.PI) / 180
      const monM = [M(-0.62, 0.75, -1.74, Y22), M(0, 0.75, -1.8, 0), M(0.62, 0.75, -1.74, -Y22)]
      const lapM = M(1.27, 0.615, -1.55, -1.065), lapHinge = mul(lapM, M(0, 0.015, -0.105, 0, -0.21))
      const tabM = M(-0.6, 0.754, -1.4, 0.17), phoM = M(0.66, 0.754, -1.33, -0.24)
      const prM = [M(1.5, 1.5, -1.0, -Math.PI / 2), M(1.5, 1.5, -0.1, -Math.PI / 2)]
      const FLAT = M(0, 0, 0, 0, -Math.PI / 2) // plane facing up, its top toward the wall
      const defs = [
        { w: 0.56, m: mul(monM[0], M(0, 0.32, 0.0008)), base: 0.88, I: 1.5, power: 1.6 },
        { w: 0.56, m: mul(monM[1], M(0, 0.32, 0.0008)), base: 0.88, I: 1.5, power: 1.6 },
        { w: 0.56, m: mul(monM[2], M(0, 0.32, 0.0008)), base: 0.88, I: 1.5, power: 1.6 },
        { w: 0.3, m: mul(lapHinge, M(0, 0.1, 0.0066)), base: 0.82, I: 1.2, power: 1.4 },
        { w: 0.248, m: mul(mul(tabM, M(0, 0.0045, 0)), FLAT), base: 0.82, I: 0.6, power: 1 },
        { w: 0.142, m: mul(mul(phoM, M(0, 0.0045, 0)), FLAT), base: 0.8, I: 0.5, power: 1 },
        { w: 0.64, m: mul(prM[0], M(0, 0, 0.0315)), base: 0.66, I: 0, power: 1 },
        { w: 0.64, m: mul(prM[1], M(0, 0, 0.0315)), base: 0.66, I: 0, power: 1 },
      ]
      const screens = defs.map((d, i) => {
        const h = (d.w * 9) / 16, rect = ctx.loopRect(i)
        const mat = ownM(new THREE.ShaderMaterial({
          uniforms: { uMap: { value: ctx.atlas }, uReel: { value: ctx.showreel.texture }, uRect: { value: new THREE.Vector4(rect[0], rect[1], rect[2], rect[3]) }, uB: { value: 0 }, uReelMix: { value: 0 } },
          vertexShader: SCR_VS, fragmentShader: SCR_FS,
        }))
        const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(d.w, h)), mat)
        mesh.matrixAutoUpdate = false; mesh.matrix.copy(d.m); scene.add(mesh)
        return { mesh, mat, w: d.w, h, c: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), n: new THREE.Vector3(), base: d.base, I: d.I, power: d.power }
      })
      scene.updateMatrixWorld(true)
      screens.forEach((s) => { s.mesh.matrixWorld.extractBasis(s.r, s.u, s.n); s.c.setFromMatrixPosition(s.mesh.matrixWorld) })

      // lights for the screens that can throw light on something
      const lightOf = [0, 1, 2, 3, 4, 5]
      for (const i of lightOf) {
        const s = screens[i]
        LP[i].set(s.c.x + s.n.x * 0.04, s.c.y + s.n.y * 0.04, s.c.z + s.n.z * 0.04, 0)
        if (i < 4) LD[i].set(s.n.x, s.n.y, s.n.z, s.power)
        else LD[i].set(0, 0.6, 0.8, 1.2) // flat devices light what is in front of them on the desk
      }

      // ---- the static room, one merged mesh --------------------------------------------------------------------------------------
      const S = makeMerge()
      const plane = (w, h, m, hex) => S.add(new THREE.PlaneGeometry(w, h), m, hex, false)
      plane(3, 4, M(0, 0, 0, 0, -Math.PI / 2), 0x484848)                  // floor
      plane(3, 4, M(0, 2.6, 0, 0, Math.PI / 2), 0x2a2a2a)                 // ceiling
      plane(3, 2.6, M(0, 1.3, -2), 0x555555)                              // back wall
      plane(4, 2.6, M(-1.5, 1.3, 0, Math.PI / 2), 0x555555)               // left wall (window)
      plane(4, 2.6, M(1.5, 1.3, 0, -Math.PI / 2), 0x555555)               // right wall (prints)
      S.add(Bx(1.7, 0.012, 2.2), M(0, 0.006, -0.2), 0x303030, false)       // rug
      // desk
      S.add(Bx(2.1, 0.04, 0.75), M(0, 0.73, -1.625), 0x6a6a6a, false)
      S.add(Bx(0.04, 0.71, 0.7), M(-1.03, 0.355, -1.625), 0x2a2a2a); S.add(Bx(0.04, 0.71, 0.7), M(1.03, 0.355, -1.625), 0x2a2a2a)
      S.add(Bx(2.0, 0.4, 0.02), M(0, 0.5, -1.95), 0x2a2a2a); S.add(Bx(0.4, 0.62, 0.6), M(0.78, 0.4, -1.64), 0x333333)
      // monitors: base, neck, back bump, body
      for (const mm of monM) {
        S.add(Bx(0.24, 0.012, 0.18), mul(mm, M(0, 0.006, 0.02)), 0x1a1a1a)
        S.add(Bx(0.05, 0.2, 0.025), mul(mm, M(0, 0.11, -0.055)), 0x1a1a1a)
        S.add(Bx(0.2, 0.2, 0.04), mul(mm, M(0, 0.31, -0.05)), 0x222222)
        S.add(Bx(0.6, 0.365, 0.03), mul(mm, M(0, 0.315, -0.015)), 0x1a1a1a)
      }
      // keyboard, mouse, pad, mug, speakers
      S.add(Bx(0.44, 0.018, 0.14), M(-0.02, 0.759, -1.42), 0x2a2a2a)
      for (let r = 0; r < 3; r++) S.add(Bx(0.4, 0.004, 0.026), M(-0.02, 0.769, -1.465 + r * 0.04), 0x555555, false)
      S.add(Bx(0.22, 0.003, 0.18), M(0.32, 0.7515, -1.4), 0x1a1a1a, false); S.add(Bx(0.045, 0.022, 0.07), M(0.32, 0.762, -1.4), 0x2a2a2a)
      S.add(Cy(0.04, 0.036, 0.09, 16), M(0.5, 0.795, -1.55), 0x8f8f8f)
      for (const sx of [-1, 1]) {
        const sm = M(sx * 0.93, 0.75, -1.45, -sx * 0.2)
        S.add(Bx(0.14, 0.23, 0.15), mul(sm, M(0, 0.115, 0)), 0x222222)
        S.add(Cy(0.042, 0.042, 0.01, 16), mul(sm, mul(M(0, 0.07, 0.077), M(0, 0, 0, 0, Math.PI / 2))), 0x111111, false)
        S.add(Cy(0.016, 0.016, 0.01, 12), mul(sm, mul(M(0, 0.18, 0.077), M(0, 0, 0, 0, Math.PI / 2))), 0x111111, false)
      }
      // tablet and phone bodies, laptop base and lid, side table
      S.add(Bx(0.275, 0.008, 0.195), tabM, 0x1a1a1a); S.add(Bx(0.155, 0.008, 0.08), phoM, 0x1a1a1a)
      S.add(Bx(0.42, 0.03, 0.42), M(1.27, 0.6, -1.55), 0x2a2a2a, false)
      for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) S.add(Bx(0.03, 0.585, 0.03), M(1.27 + lx, 0.2925, -1.55 + lz), 0x1a1a1a)
      S.add(Bx(0.32, 0.015, 0.22), mul(lapM, M(0, 0.0075, 0)), 0x2a2a2a); S.add(Bx(0.32, 0.2, 0.012), mul(lapHinge, M(0, 0.1, 0)), 0x1a1a1a)
      // prints: frame and mat
      for (const pm of prM) { S.add(Bx(0.78, 0.5, 0.03), mul(pm, M(0, 0, 0.015)), 0x1a1a1a, false); S.add(Bx(0.7, 0.42, 0.031), mul(pm, M(0, 0, 0.0155)), 0x8f8f8f, false) }
      // poster tape, window frame and blind slats
      for (const [tx, ty] of [[-0.93, 2.36], [0.93, 2.36], [-0.93, 1.64], [0.93, 1.64]]) S.add(Bx(0.12, 0.03, 0.004), M(tx, ty, -1.992, 0, 0, 0.5), 0x8f8f8f, false)
      S.add(Bx(0.05, 0.05, 1.16), M(-1.48, 2.12, -0.55), 0x1a1a1a, false); S.add(Bx(0.05, 0.05, 1.16), M(-1.48, 0.88, -0.55), 0x1a1a1a, false)
      S.add(Bx(0.05, 1.3, 0.05), M(-1.48, 1.5, -1.07), 0x1a1a1a, false); S.add(Bx(0.05, 1.3, 0.05), M(-1.48, 1.5, -0.03), 0x1a1a1a, false)
      for (let k = 0; k < 17; k++) S.add(Bx(0.09, 0.012, 1.0), M(-1.42, 2.08 - k * 0.04, -0.55, 0, 0, 0.45), 0x2a2a2a, false)
      // shelf with books and a pot
      S.add(Bx(0.22, 0.03, 1.0), M(-1.39, 1.5, 0.6), 0x2a2a2a, false)
      S.add(Bx(0.02, 0.12, 0.18), M(-1.46, 1.43, 0.3), 0x1a1a1a, false); S.add(Bx(0.02, 0.12, 0.18), M(-1.46, 1.43, 0.9), 0x1a1a1a, false)
      const bh = [0.22, 0.18, 0.26, 0.2, 0.24, 0.17, 0.21], bc = [0x8f8f8f, 0x555555, 0x2a2a2a, 0x6a6a6a, 0x1a1a1a, 0x8f8f8f, 0x444444]
      for (let k = 0; k < 7; k++) S.add(Bx(0.15, bh[k], 0.035), M(-1.4, 1.515 + bh[k] / 2, 0.3 + k * 0.042, 0, 0, k === 5 ? 0.18 : 0), bc[k])
      S.add(Cy(0.06, 0.045, 0.1, 14), M(-1.4, 1.565, 0.85), 0x555555); for (let k = 0; k < 5; k++) S.add(Bx(0.012, 0.16, 0.012), M(-1.4, 1.7, 0.85, k, 0, (k - 2) * 0.22), 0x6a6a6a, false)
      if (!touch) { // headphones on a hook, a small fake detail
        S.add(Cy(0.008, 0.008, 0.05, 8), M(-1.28, 1.45, -1.975, 0, Math.PI / 2), 0x8f8f8f, false)
        S.add(new THREE.TorusGeometry(0.085, 0.011, 8, 20, Math.PI), M(-1.28, 1.365, -1.96), 0x1a1a1a, false)
        for (const sx of [-1, 1]) S.add(Cy(0.045, 0.045, 0.035, 14), M(-1.28 + sx * 0.085, 1.34, -1.96, 0, 0, Math.PI / 2), 0x222222, false)
      }
      // desk lamp base and arms (the head is separate)
      S.add(Cy(0.08, 0.09, 0.02, 18), M(-1.0, 0.76, -1.72), 0x1a1a1a)
      S.rod([-1, 0.77, -1.72], [-1, 1.3, -1.72], 0.016, 0x2a2a2a); S.rod([-1, 1.3, -1.72], [-0.9, 1.34, -1.55], 0.014, 0x2a2a2a)
      const roomGeo = own(S.build())
      const room = new THREE.Mesh(roomGeo, litMat); scene.add(room)

      // window night (self lit grey) behind the slats
      const winMat = ownM(new THREE.MeshBasicMaterial({ color: 0x484848 }))
      const win = new THREE.Mesh(own(new THREE.PlaneGeometry(1.0, 1.2)), winMat); win.position.set(-1.495, 1.5, -0.55); win.rotation.y = Math.PI / 2; scene.add(win)

      // ---- the poster: the hero sentence, lit by the lamp --------------------------------------------------------------------------------
      const posterTex = (() => {
        const n = 3, words = ctx.hero.split(/\s+/), tgt = ctx.hero.length / n, lines = []
        let cur = ''
        for (const w of words) { const nx = cur ? cur + ' ' + w : w; if (cur && nx.length > tgt * 1.1 && lines.length < n - 1) { lines.push(cur); cur = w } else cur = nx }
        lines.push(cur)
        const ts = lines.map((s) => ctx.text(s, { size: 160, color: '#1a1a1a' }))
        const cw = 2048, ch = 840, amax = Math.max(...ts.map((t) => t.aspect)), lh = Math.min((0.88 * cw) / amax, (ch * 0.92) / (lines.length * 0.78 + 0.25)), pitch = lh * 0.78
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
        const g = cv.getContext('2d'); g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, cw, ch)
        const y0 = (ch - pitch * lines.length) / 2 - lh * 0.07
        ts.forEach((t, k) => { const wpx = t.aspect * lh; g.drawImage(t.canvas, (cw - wpx) / 2, y0 + pitch * k, wpx, lh); t.texture.dispose() })
        const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter
        texs.push(tex); return tex
      })()
      const posterMat = ownM(new THREE.ShaderMaterial({ uniforms: { ...LU, uFloor: { value: 0.22 }, uMap: { value: posterTex } }, vertexShader: LIT_VS, fragmentShader: LIT_FS, defines: { LIT_MAP: '' } }))
      const posterGeo = own(new THREE.PlaneGeometry(1.9, 0.78)); posterGeo.setAttribute('aCol', new THREE.Float32BufferAttribute(new Float32Array(12).fill(1), 3))
      const poster = new THREE.Mesh(posterGeo, posterMat); poster.position.set(0, 2.0, -1.994); scene.add(poster)

      // ---- dynamic furniture: the chair (turns), the lamp head (follows the pointer) ----------------------------------------------------------
      const CH = makeMerge()
      for (let k = 0; k < 5; k++) {
        const a = (k * Math.PI * 2) / 5
        CH.add(Bx(0.3, 0.03, 0.04), M(Math.sin(a) * 0.15, 0.09, Math.cos(a) * 0.15, a + Math.PI / 2), 0x2a2a2a)
        CH.add(Cy(0.022, 0.022, 0.04, 10), M(Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29), 0x111111)
      }
      CH.add(Cy(0.03, 0.03, 0.36, 10), M(0, 0.27, 0), 0x333333)
      CH.add(Cy(0.23, 0.22, 0.07, 22), M(0, 0.47, 0), 0x3a3a3a)
      CH.add(Bx(0.42, 0.5, 0.06), M(0, 0.82, 0.22, 0, 0.1), 0x3a3a3a); CH.add(Bx(0.3, 0.12, 0.07), M(0, 1.12, 0.25, 0, 0.1), 0x3a3a3a)
      for (const sx of [-1, 1]) { CH.add(Bx(0.035, 0.035, 0.28), M(sx * 0.26, 0.68, 0.04), 0x2a2a2a); CH.add(Bx(0.025, 0.16, 0.025), M(sx * 0.26, 0.6, 0.16), 0x2a2a2a) }
      const chair = new THREE.Mesh(own(CH.build()), litMat); chair.position.set(0, 0, -0.85); scene.add(chair)

      const LDIR = new THREE.Vector3(0.76, -0.64, 0.16).normalize(), LDIR2 = new THREE.Vector3(0.75, 0.55, -0.37).normalize()
      const lampPos = new THREE.Vector3(-0.9, 1.34, -1.55)
      const head = new THREE.Group(); head.position.copy(lampPos); scene.add(head)
      const HM = makeMerge()
      HM.add(new THREE.CylinderGeometry(0.025, 0.075, 0.14, 16, 1, true), new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), LDIR)), 0x2a2a2a, false)
      const headMesh = new THREE.Mesh(own(HM.build()), litMatTwo); head.add(headMesh)
      const bulbGeo = own(new THREE.CircleGeometry(0.05, 14)); bulbGeo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), LDIR)); bulbGeo.translate(LDIR.x * 0.068, LDIR.y * 0.068, LDIR.z * 0.068)
      const bulbMat = ownM(new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })); head.add(new THREE.Mesh(bulbGeo, bulbMat))

      // ---- soft contact shadows (one transparent mesh) and glow quads (one additive mesh) ---------------------------------------------------------------
      const SH = { pos: [], uv: [], str: [], idx: [] }
      function shadow(m, w, d, str) { // a soft blob lying flat; m places its centre
        const c = [[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2]], uv = [[0, 0], [1, 0], [1, 1], [0, 1]], b = SH.pos.length / 3, v = new THREE.Vector3()
        c.forEach((p, k) => { v.set(p[0], p[1], p[2]).applyMatrix4(m); SH.pos.push(v.x, v.y, v.z); SH.uv.push(uv[k][0], uv[k][1]); SH.str.push(str) })
        SH.idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
      }
      shadow(M(0, 0.003, -0.85), 0.95, 0.95, 0.85); shadow(M(0, 0.003, -1.6), 2.5, 1.2, 0.9); shadow(M(1.27, 0.003, -1.55), 0.7, 0.7, 0.8)
      for (const mm of monM) shadow(mul(mm, M(0, 0.0015, 0)), 0.5, 0.34, 0.8)
      shadow(M(-0.02, 0.7515, -1.42), 0.58, 0.24, 0.55); shadow(M(0.32, 0.7515, -1.4), 0.26, 0.22, 0.4); shadow(M(0.5, 0.7515, -1.55), 0.14, 0.14, 0.5)
      for (const sx of [-1, 1]) shadow(M(sx * 0.93, 0.7515, -1.45), 0.26, 0.26, 0.7)
      shadow(mul(tabM, M(0, -0.0008, 0)), 0.36, 0.28, 0.55); shadow(mul(phoM, M(0, -0.0008, 0)), 0.22, 0.15, 0.55); shadow(M(-1.0, 0.7515, -1.72), 0.25, 0.25, 0.6)
      shadow(mul(lapM, M(0, 0.0015, 0)), 0.42, 0.32, 0.6)
      const shGeo = own(new THREE.BufferGeometry())
      shGeo.setAttribute('position', new THREE.Float32BufferAttribute(SH.pos, 3)); shGeo.setAttribute('uv', new THREE.Float32BufferAttribute(SH.uv, 2)); shGeo.setAttribute('aStr', new THREE.Float32BufferAttribute(SH.str, 1)); shGeo.setIndex(SH.idx)
      const shMat = ownM(new THREE.ShaderMaterial({ vertexShader: SHADOW_VS, fragmentShader: SHADOW_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }))
      const shMesh = new THREE.Mesh(shGeo, shMat); shMesh.renderOrder = 1; scene.add(shMesh)

      const GQ = { pos: [], uv: [], rect: [], kind: [], a: [], idx: [], own: [] }
      function glow(m, w, d, kind, scr, wall) { // wall: quad stands in the local xy plane, else lies in xz with s along +z
        const c = wall ? [[-w / 2, -d / 2, 0], [w / 2, -d / 2, 0], [w / 2, d / 2, 0], [-w / 2, d / 2, 0]] : [[-w / 2, 0, 0.03], [w / 2, 0, 0.03], [w / 2, 0, 0.03 + d], [-w / 2, 0, 0.03 + d]]
        const uv = [[0, 0], [1, 0], [1, 1], [0, 1]], b = GQ.pos.length / 3, v = new THREE.Vector3(), r = ctx.loopRect(scr)
        c.forEach((p, k) => { v.set(p[0], p[1], p[2]).applyMatrix4(m); GQ.pos.push(v.x, v.y, v.z); GQ.uv.push(uv[k][0], uv[k][1]); GQ.rect.push(r[0], r[1], r[2], r[3]); GQ.kind.push(kind); GQ.a.push(0, 0) })
        GQ.idx.push(b, b + 1, b + 2, b, b + 2, b + 3); GQ.own.push(scr)
      }
      for (let i = 0; i < 3; i++) glow(mul(monM[i], M(0, 0.0025, 0)), 0.62, 0.55, 0, i, false)         // mirrored loop on the desk
      for (let i = 0; i < 3; i++) glow(M((i - 1) * 0.62, 1.07, -1.994), 1.15, 0.85, 1, i, true)         // halo on the wall behind
      glow(mul(tabM, mul(M(0, 0.0025, 0), M(0, 0, 0, 0, Math.PI / 2))), 0.62, 0.46, 1, 4, true)         // patch under the tablet (stands in xy, turned flat)
      glow(mul(phoM, mul(M(0, 0.0025, 0), M(0, 0, 0, 0, Math.PI / 2))), 0.42, 0.3, 1, 5, true)
      glow(mul(M(1.27, 0.6165, -1.55), M(0, 0, 0, 0, Math.PI / 2)), 0.6, 0.5, 1, 3, true)
      const gGeo = own(new THREE.BufferGeometry())
      gGeo.setAttribute('position', new THREE.Float32BufferAttribute(GQ.pos, 3)); gGeo.setAttribute('uv', new THREE.Float32BufferAttribute(GQ.uv, 2))
      gGeo.setAttribute('aRect', new THREE.Float32BufferAttribute(GQ.rect, 4)); gGeo.setAttribute('aKind', new THREE.Float32BufferAttribute(GQ.kind, 1)); gGeo.setIndex(GQ.idx)
      const aA = new THREE.Float32BufferAttribute(GQ.a, 2); aA.setUsage(THREE.DynamicDrawUsage); gGeo.setAttribute('aA', aA)
      const gMat = ownM(new THREE.ShaderMaterial({ uniforms: { uMap: { value: ctx.atlas } }, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
      const gMesh = new THREE.Mesh(gGeo, gMat); gMesh.renderOrder = 2; gMesh.frustumCulled = false; scene.add(gMesh)

      // ---- hover tags: HUD children of the camera, in px ---------------------------------------------------------------------------------------------
      const hud = new THREE.Group(); camera.add(hud)
      const unit = own(new THREE.PlaneGeometry(1, 1))
      const mkText = (str, opts) => {
        const t = ctx.text(str, opts); texs.push(t.texture)
        const m = ownM(new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false }))
        const mesh = new THREE.Mesh(unit, m); mesh.renderOrder = 61
        return { mesh, mat: m, canvas: t.canvas }
      }
      const PAD = 14
      const tags = works.map((w) => {
        const title = mkText(w.title, { size: 120 }), meta = mkText(`${w.kind} · ${w.year}`, { caps: true, size: 28, color: '#8f8f8f' })
        const plateMat = ownM(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false }))
        const plate = new THREE.Mesh(unit, plateMat); plate.renderOrder = 60
        const group = new THREE.Group(); group.visible = false; group.add(plate, title.mesh, meta.mesh); hud.add(group)
        return { group, plate, plateMat, title, meta, wpx: 0, hpx: 0 }
      })
      function layoutTags() {
        const tfp = clamp(size.w * 0.05, 34, 80), mfp = clamp(size.w * 0.011, 12, 17)
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

      // ---- state -------------------------------------------------------------------------------------------------------------------------------------
      const ons = screens.map(() => ({ v: 0 })), lampOn = { v: 0 }, roomOn = { v: 0 }, reelMix = { v: 0 }, fly = { k: 0 }
      const bright = new Float32Array(8), grow = new Float32Array(8), near = new Float32Array(8)
      const ndc = new Float32Array(24) // per screen: x, y, half-height
      const fp = screens.map(() => new THREE.Vector3()), fq = screens.map(() => new THREE.Quaternion())
      let portrait = false, N = 6, progress = 0, pS = 0, lastScroll = 0
      let opening = false, flying = false, flyIdx = -1, hot = -1, hoverOn = false, focusCell = -1, tagCell = 0, tagA = 0
      let chairYaw = 0, chairV = 0, tl = null, flyTl = null, backTw = null
      const look = { x: 0, y: 0 }
      const curveP = new THREE.CatmullRomCurve3([], false, 'centripetal'), curveT = new THREE.CatmullRomCurve3([], false, 'centripetal')
      const posA = new THREE.Vector3(), tgtA = new THREE.Vector3(), qLook = new THREE.Quaternion(), eul = new THREE.Euler(), qHead = new THREE.Quaternion(), qHeadT = new THREE.Quaternion(), aim = new THREE.Vector3()
      const V = new THREE.Vector3(), V2 = new THREE.Vector3(), RO = new THREE.Vector3(), RD = new THREE.Vector3(), MB = new THREE.Matrix4()

      function buildPath() {
        const L = portrait ? STOPS_P : STOPS_L
        curveP.points = L.map((s) => new THREE.Vector3(...s[0])); curveT.points = L.map((s) => new THREE.Vector3(...s[1])); N = L.length
      }
      function flyPose(i) { // camera straight in front of screen i, so its loop just fills the view
        const s = screens[i], tn = Math.tan((camera.fov * Math.PI) / 360), a = camera.aspect
        const d = (0.97 * Math.min(s.w / a, s.h)) / (2 * tn)
        fp[i].copy(s.c).addScaledVector(s.n, d)
        MB.makeBasis(s.r, s.u, s.n); fq[i].setFromRotationMatrix(MB)
      }
      // ---- picking: ray against the 8 screen planes, by hand ------------------------------------------------------------------------------------------------
      function pick(nx, ny, margin) {
        RO.setFromMatrixPosition(camera.matrixWorld)
        RD.set(nx, ny, 0.5).unproject(camera).sub(RO).normalize()
        let best = -1, bt = 1e9
        for (let i = 0; i < 8; i++) {
          const s = screens[i], den = RD.dot(s.n)
          if (den > -1e-4) continue
          V.copy(s.c).sub(RO); const t = V.dot(s.n) / den
          if (t < 0.02 || t >= bt) continue
          V.copy(RO).addScaledVector(RD, t).sub(s.c)
          if (Math.abs(V.dot(s.r)) < (s.w / 2) * margin + 0.012 && Math.abs(V.dot(s.u)) < (s.h / 2) * margin + 0.012) { best = i; bt = t }
        }
        return best
      }

      // ---- the four moments --------------------------------------------------------------------------------------------------------------------------------
      function startOpening() {
        opening = true; flyIdx = 1; fly.k = 1; reelMix.v = 1
        tl = gsap.timeline({ onComplete: () => { opening = false; flyIdx = -1 } })
        tl.to(ons[1], { v: 1, duration: 0.7, ease: 'power2.out' }, 0.2)                    // the centre monitor wakes
        tl.to(fly, { k: 0, duration: 1.7, ease: 'power3.inOut' }, 0.95)                    // pull back from it
        tl.to(reelMix, { v: 0, duration: 0.5, ease: 'power1.inOut' }, 1.5)                 // the Showreel hands over to its Work
        tl.to(roomOn, { v: 1, duration: 1.8, ease: 'power1.inOut' }, 1.0)
        tl.to(ons[0], { v: 1, duration: 0.5, ease: 'power2.out' }, 1.2).to(ons[2], { v: 1, duration: 0.5, ease: 'power2.out' }, 1.5)
        tl.to(lampOn, { v: 1, duration: 0.6, ease: 'power2.out' }, 1.8)
        tl.to(ons[4], { v: 1, duration: 0.45, ease: 'power2.out' }, 2.0).to(ons[5], { v: 1, duration: 0.45, ease: 'power2.out' }, 2.1)
        tl.to(ons[3], { v: 1, duration: 0.45, ease: 'power2.out' }, 2.2).to(ons[6], { v: 1, duration: 0.45, ease: 'power2.out' }, 2.35).to(ons[7], { v: 1, duration: 0.45, ease: 'power2.out' }, 2.45)
      }
      function endOpening() { if (tl) tl.progress(1); opening = false; flyIdx = -1 } // progress() fires no callbacks by default, so set the flags here
      function flyTo(i) {
        if (flying || opening || i < 0) return
        flying = true; flyIdx = i; hot = i; ctx.cursor.hover(false); hoverOn = false
        flyPose(i)
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        flyTl.to(fly, { k: 1, duration: 0.8, ease: 'power3.inOut' }, 0)
      }

      // ---- per frame ---------------------------------------------------------------------------------------------------------------------------------------------
      function update(t, dt) {
        dt = clamp(dt, 0.0001, 0.05)
        const w = size.w, h = size.h
        // scroll -> position on the path, with weight
        progress = clamp(progress + (sc.y - lastScroll) / SCROLL_LEN, 0, 1); lastScroll = sc.y
        pS += (progress - pS) * (1 - Math.exp(-dt * 4.5))
        const f = pS - (0.55 * Math.sin(pS * (N - 1) * Math.PI * 2)) / ((N - 1) * Math.PI * 2) // lingers at each stop
        curveP.getPoint(clamp(f, 0, 1), posA); curveT.getPoint(clamp(f, 0, 1), tgtA)
        // pointer looks around, with weight
        const want = P.inside && !touch ? 1 : 0, kk = 1 - Math.exp(-dt * 2.6), fk = 1 - fly.k
        look.x += (-P.nx * 0.17 * want - look.x) * kk; look.y += (P.ny * 0.1 * want - look.y) * kk
        camera.position.copy(posA); camera.lookAt(tgtA)
        camera.quaternion.multiply(qLook.setFromEuler(eul.set(look.y * fk, look.x * fk, 0, 'YXZ')))
        if (fly.k > 0 && flyIdx >= 0) {
          camera.position.lerp(fp[flyIdx], fly.k); camera.quaternion.slerp(fq[flyIdx], fly.k)
        }
        camera.updateMatrixWorld(true)

        // which Work is under the hand
        let hit = -1
        if (!opening && !flying && !touch && P.inside) hit = pick(P.nx, P.ny, 1.12)
        if ((hit >= 0) !== hoverOn) { hoverOn = hit >= 0; ctx.cursor.hover(hoverOn) }
        hot = flying ? flyIdx : hit >= 0 ? hit : !opening && focusCell >= 0 ? focusCell : -1

        // screens project to NDC once: pointer proximity per screen
        const asp = camera.aspect
        for (let i = 0; i < 8; i++) {
          const s = screens[i]
          V.copy(s.c).project(camera); V2.copy(s.c).addScaledVector(s.u, s.h / 2).project(camera)
          ndc[i * 3] = V.x; ndc[i * 3 + 1] = V.y; ndc[i * 3 + 2] = Math.max(Math.abs(V2.y - V.y), 0.03)
          let nr = 0
          if (want && V.z < 1 && !opening) { const dx = (P.nx - V.x) * asp, dy = P.ny - V.y, r = ndc[i * 3 + 2] * 2.4 * asp; nr = Math.exp(-(dx * dx + dy * dy) / (r * r)) }
          near[i] += (nr - near[i]) * (1 - Math.exp(-dt * 6))
        }
        // brightness: others dim to half, the hot one pushes past full; its glow grows
        const bk = 1 - Math.exp(-dt * 9)
        for (let i = 0; i < 8; i++) {
          const s = screens[i], base = s.base
          const tgt = ons[i].v * (hot < 0 ? base + 0.22 * near[i] : hot === i ? 1.22 : 0.5 * base)
          bright[i] += (tgt - bright[i]) * bk
          grow[i] += ((hot === i ? 1 : 0) - grow[i]) * bk
          s.mat.uniforms.uB.value = bright[i]
        }
        screens[1].mat.uniforms.uReelMix.value = reelMix.v
        for (const i of lightOf) LP[i].w = screens[i].I * bright[i]

        // lamp head follows the pointer a little, its pool moves with it
        RO.setFromMatrixPosition(camera.matrixWorld); RD.set(P.nx, P.ny, 0.5).unproject(camera).sub(RO).normalize()
        if (want && RD.y < -0.02) { const tt = (0.75 - RO.y) / RD.y; aim.copy(RO).addScaledVector(RD, tt).sub(lampPos).normalize(); aim.lerp(LDIR, 0.72).normalize() } else aim.copy(LDIR)
        qHeadT.setFromUnitVectors(LDIR, aim); qHead.slerp(qHeadT, 1 - Math.exp(-dt * 3)); head.quaternion.copy(qHead)
        const lamp = lampOn.v * (1 + 0.025 * Math.sin(t * 3.1) * Math.sin(t * 1.3))
        V.copy(LDIR).applyQuaternion(qHead); LP[6].set(lampPos.x + V.x * 0.07, lampPos.y + V.y * 0.07, lampPos.z + V.z * 0.07, 3.2 * lamp); LD[6].set(V.x, V.y, V.z, 3)
        V.copy(LDIR2).applyQuaternion(qHead); LP[7].set(lampPos.x, lampPos.y, lampPos.z, 3.4 * lamp); LD[7].set(V.x, V.y, V.z, 3)
        bulbMat.color.setScalar(0.93 * clamp(lampOn.v, 0, 1))
        LU.uRoom.value = roomOn.v; LU.uT.value = t

        // chair turns a little as the pointer passes
        if (want) {
          V.set(0, 0.7, -0.85).project(camera)
          const dx = (P.nx - V.x) * asp, dy = P.ny - V.y, pr = Math.exp(-(dx * dx + dy * dy) / 0.16)
          chairV += clamp(P.dx, -40, 40) * 0.006 * pr
        }
        chairV += (-chairYaw * 14 - chairV * 3.2) * dt; chairYaw = clamp(chairYaw + chairV * dt, -0.55, 0.55); chair.rotation.y = chairYaw

        // glow quads follow their screen's brightness
        const a = aA.array
        for (let q = 0; q < GQ.own.length; q++) { const s = GQ.own[q], I = bright[s] * bright[s] * (hot === s ? 1.5 : 1), g = grow[s]; for (let k = 0; k < 4; k++) { a[(q * 4 + k) * 2] = I; a[(q * 4 + k) * 2 + 1] = g } }
        aA.needsUpdate = true

        // glass push on speed, opening and fly-in
        ctx.crt.push = clamp(Math.abs(sc.v) / 3600 + (opening ? 0.4 * Math.sin(clamp(1 - fly.k, 0, 1) * Math.PI) : 0) + (flying ? 0.55 * Math.sin(clamp(fly.k, 0, 1) * Math.PI) + 0.2 * fly.k : 0), 0, 1)

        // tag beside the hot screen
        const show = hot >= 0 && !flying && !opening
        if (show && hot !== tagCell) { tags[tagCell].group.visible = false; tagCell = hot; tagA = 0 }
        tagA += ((show ? 1 : 0) - tagA) * (1 - Math.exp(-dt * 12))
        const tg = tags[tagCell]
        tg.group.visible = tagA > 0.01
        if (tg.group.visible) {
          const s = screens[tagCell]; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9
          for (let k = 0; k < 4; k++) {
            V.copy(s.c).addScaledVector(s.r, k & 1 ? s.w / 2 : -s.w / 2).addScaledVector(s.u, k & 2 ? s.h / 2 : -s.h / 2).project(camera)
            const px = (V.x * 0.5 + 0.5) * w, py = (0.5 - V.y * 0.5) * h
            if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py
          }
          const TOP = w < 768 ? 130 : 96, G = 18
          let l, tt
          if (!portrait && x1 + G + tg.wpx <= w - 16) { l = x1 + G; tt = (y0 + y1) / 2 - tg.hpx / 2 }
          else if (!portrait && x0 - G - tg.wpx >= 16) { l = x0 - G - tg.wpx; tt = (y0 + y1) / 2 - tg.hpx / 2 }
          else { l = (x0 + x1) / 2 - tg.wpx / 2; tt = y1 + 14 > h - 16 - tg.hpx ? y0 - 14 - tg.hpx : y1 + 14 }
          l = clamp(l, 16, Math.max(16, w - 16 - tg.wpx)); tt = clamp(tt, TOP, Math.max(TOP, h - 16 - tg.hpx))
          const upp = (2 * Math.tan((camera.fov * Math.PI) / 360) * HUD) / h
          tg.group.position.set((l + tg.wpx / 2 - w / 2 - (1 - tagA) * 12) * upp, -(tt + tg.hpx / 2 - h / 2) * upp, -HUD); tg.group.scale.setScalar(upp)
          tg.plateMat.opacity = 0.86 * tagA; tg.title.mat.opacity = tagA; tg.meta.mat.opacity = tagA
        }
      }

      function frame(w, h) {
        const asp = w / h
        portrait = asp < 0.9
        camera.aspect = asp; camera.fov = 58 + (1 - sstep(0.6, 1.3, asp)) * 17; camera.updateProjectionMatrix()
        buildPath(); layoutTags()
        for (let i = 0; i < 8; i++) flyPose(i)
      }
      frame(size.w, size.h)
      if (ctx.reduced) { ons.forEach((o) => { o.v = 1 }); lampOn.v = 1; roomOn.v = 1 } else startOpening()

      return {
        scene, camera, update,
        resize(w, h) { frame(w, h) },
        tap() {
          if (opening) { endOpening(); return }
          if (flying) return
          const i = touch ? pick(P.nx, P.ny, 1.6) : hot >= 0 ? hot : pick(P.nx, P.ny, 1.12)
          if (i >= 0) flyTo(i)
        },
        focus(i) { focusCell = i },
        activate(i) {
          if (opening) endOpening()
          if (flying) return
          flyTo(i)
        },
        back() {
          if (flyTl) flyTl.kill()
          if (backTw) backTw.kill()
          backTw = gsap.to(fly, { k: 0, duration: 0.9, ease: 'power3.inOut', onComplete: () => { flying = false; flyIdx = -1; focusCell = -1 } })
        },
        dispose() {
          if (tl) tl.kill(); if (flyTl) flyTl.kill(); if (backTw) backTw.kill()
          gsap.killTweensOf(fly); gsap.killTweensOf(lampOn); gsap.killTweensOf(roomOn); gsap.killTweensOf(reelMix); ons.forEach((o) => gsap.killTweensOf(o))
          ctx.cursor.hover(false)
          geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((x) => x.dispose())
          scene.remove(camera)
        },
      }
    },
  })
})()
