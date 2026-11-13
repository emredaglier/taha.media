// THROWAWAY prototype: Miniature. Taha's room as a toy diorama (floor + two walls) on a turntable on a dark tabletop.
// Drag spins the turntable with inertia; the two walls fold down on whichever side faces the camera, so the room is
// always open to look into. Scroll zooms from the whole box to desk level. Hover turns that Work to the front, a leader
// line rises to a large floating copy of its loop. Fly-in dives from above into the little screen.
// Tilt-shift is done per fragment: haze by distance from the focus depth and by a top/bottom screen band, plus a top/bottom
// gradient veil. Fake AO is analytic in box coordinates (floor, back wall, left wall), contact shadows are soft quads.
// Opening: the Showreel fills the view (it is the little centre monitor), the camera pulls back while the box spins into place and the walls fold up.
// FAKE: every prop, the museum label text layout, the window and blinds, the plant, the shelf books.
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
  const lerp = (a, b, t) => a + (b - a) * t

  // ---- shaders --------------------------------------------------------------------------------------------------------------
  const HAZE = `
    uniform float uFocus, uRange, uBand; uniform vec2 uRes;
    float hazeK(float vz){
      float yy = gl_FragCoord.y / uRes.y;
      float band = max(smoothstep(.26, .0, yy), smoothstep(.74, 1., yy));
      float dep = smoothstep(.45, 1.7, abs(vz - uFocus) / uRange);
      return clamp(max(band * .85, dep * .8) * uBand, 0., 1.);
    }`
  const TOY_VS = `
    attribute vec3 aCol; uniform vec3 uOff;
    varying vec3 vL; varying vec3 vN; varying vec3 vC; varying float vVZ;
    void main(){
      vec4 w = modelMatrix * vec4(position, 1.); vec4 v = viewMatrix * w;
      vL = position + uOff; vN = normalize(mat3(modelMatrix) * normal); vC = aCol; vVZ = -v.z;
      gl_Position = projectionMatrix * v;
    }`
  const TOY_FS = `
    precision highp float;
    ${HAZE}
    uniform float uAO, uFloorY;
    varying vec3 vL; varying vec3 vN; varying vec3 vC; varying float vVZ;
    void main(){
      vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
      vec3 L = normalize(vec3(-.45, .85, .55));
      float lit = .36 + .58 * max(dot(N, L), 0.) + .16 * (N.y * .5 + .5);
      vec3 a3 = abs(N);
      float h = vL.y - uFloorY;
      float aoy = mix(1., mix(.42, 1., smoothstep(0., .4, h)), 1. - a3.y);
      float aoz = mix(1., mix(.4, 1., smoothstep(0., .45, vL.z + 1.3)), 1. - a3.z);
      float aox = mix(1., mix(.4, 1., smoothstep(0., .45, vL.x + 1.3)), 1. - a3.x);
      float ao = mix(1., aoy * aoz * aox, uAO);
      vec3 c = vC * lit * ao;
      #ifdef PLANKS
      float pl = step(.94, fract(vL.x * 4.5)); c *= 1. - .22 * pl;
      c *= 1. - .1 * step(.5, fract(floor(vL.x * 4.5) * .37 + vL.z * .8));
      #endif
      float k = hazeK(vVZ);
      c = mix(c, vec3(.12), k * .6);
      gl_FragColor = vec4(c, 1.);
    }`
  const TABLE_VS = 'varying vec3 vL; varying float vVZ; void main(){ vec4 w = modelMatrix*vec4(position,1.); vec4 v = viewMatrix*w; vL = w.xyz; vVZ = -v.z; gl_Position = projectionMatrix*v; }'
  const TABLE_FS = `
    precision highp float; ${HAZE}
    uniform float uShow; varying vec3 vL; varying float vVZ;
    void main(){
      float r = length(vL.xz);
      vec3 c = vec3(.165) * (.34 + .95 * exp(-r * r * .045)) * uShow;
      c = mix(c, vec3(.04), hazeK(vVZ) * .5);
      gl_FragColor = vec4(c, 1.);
    }`
  const SCR_VS = 'varying vec2 vUv; varying float vVZ; void main(){ vUv = uv; vec4 v = modelViewMatrix*vec4(position,1.); vVZ = -v.z; gl_Position = projectionMatrix*v; }'
  const SCR_FS = `
    precision highp float; ${HAZE}
    uniform sampler2D uMap; uniform sampler2D uReel; uniform vec4 uRect; uniform float uB, uReelMix, uHz;
    varying vec2 vUv; varying float vVZ;
    void main(){
      vec2 uv = clamp(vUv, .003, .997);
      vec3 c = mix(texture2D(uMap, uRect.xy + uv * uRect.zw).rgb, texture2D(uReel, uv).rgb, uReelMix) * uB;
      c = mix(c, vec3(.12), hazeK(vVZ) * .5 * uHz);
      gl_FragColor = vec4(c, 1.);
    }`
  const COPY_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }'
  const COPY_FS = 'precision highp float; uniform sampler2D uMap; uniform vec4 uRect; uniform float uB, uA; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(uMap, uRect.xy + clamp(vUv,.003,.997)*uRect.zw).rgb*uB, uA); }'
  const GLOW_VS = 'attribute float aA; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vA = aA; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }'
  const GLOW_FS = 'precision highp float; varying vec2 vUv; varying float vA; void main(){ float r = clamp(length(vUv*2.-1.),0.,1.); float h = 1.-smoothstep(0.,1.,r); gl_FragColor = vec4(vec3(h*h*.32*vA), 1.); }'
  const SHADOW_VS = 'attribute float aStr; varying vec2 vUv; varying float vS; void main(){ vUv = uv; vS = aStr; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }'
  const SHADOW_FS = 'precision highp float; uniform float uK, uE, uP; varying vec2 vUv; varying float vS; void main(){ float r = clamp(length(vUv*2.-1.),0.,1.); float a = 1.-smoothstep(uE,1.,r); gl_FragColor = vec4(0.,0.,0.,pow(a,uP)*vS*uK); }'
  const STRIPE_FS = `
    precision highp float; uniform float uT, uI; varying vec2 vUv;
    void main(){
      float st = smoothstep(.25, .4, abs(fract(vUv.x * 7. - uT * .05) - .5));
      float f = (1. - smoothstep(.0, 1., vUv.x)) * smoothstep(0., .2, vUv.y) * (1. - smoothstep(.8, 1., vUv.y));
      gl_FragColor = vec4(vec3(st * f * .12 * uI), 1.);
    }`
  const VEIL_FS = 'precision highp float; uniform float uV; varying vec2 vUv; void main(){ float y = vUv.y; float a = .5 * smoothstep(.14, .0, y) + .55 * smoothstep(.84, 1., y); gl_FragColor = vec4(0., 0., 0., a * uV); }'

  const B = 0.3, H = 1.5, DT = B + 0.5, HUD = 3, ZLEN = 2400, YAW0 = -0.62, TWO_PI = Math.PI * 2

  HOME.register({
    name: 'Miniature',
    create(ctx) {
      const size = ctx.size, works = ctx.works, P = ctx.pointer, touch = ctx.touch, sc = ctx.scroll
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(34, size.w / size.h, 0.05, 80)
      scene.add(camera)
      const geos = [], mats = [], texs = []
      const own = (g) => { geos.push(g); return g }
      const ownM = (m) => { mats.push(m); return m }
      ctx.crt.glow = 0.75

      // ---- build kit: rounded boxes (bevel at the 2nd and 3rd node of each face grid), matrices, a merger ----------------------
      function rbox(w, h, d, r) {
        r = Math.min(r, w * 0.45, h * 0.45, d * 0.45)
        const half = [w / 2, h / 2, d / 2], nodes = half.map((hh) => [-hh, -hh + r, hh - r, hh])
        const pos = [], nor = [], uv = [], idx = []
        const c = [0, 0, 0], p = [0, 0, 0]
        for (let a = 0; a < 3; a++) for (const s of [1, -1]) {
          const u = (a + 1) % 3, v = (a + 2) % 3, base = pos.length / 3
          for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
            p[a] = s * half[a]; p[u] = nodes[u][i]; p[v] = nodes[v][j]
            let l = 0
            for (let k = 0; k < 3; k++) { c[k] = clamp(p[k], -(half[k] - r), half[k] - r); l += (p[k] - c[k]) * (p[k] - c[k]) }
            l = Math.sqrt(l) || 1
            const nx = (p[0] - c[0]) / l, ny = (p[1] - c[1]) / l, nz = (p[2] - c[2]) / l
            pos.push(c[0] + nx * r, c[1] + ny * r, c[2] + nz * r); nor.push(nx, ny, nz); uv.push(i / 3, j / 3)
          }
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
            const k0 = base + i * 4 + j, k1 = k0 + 4, k2 = k1 + 1, k3 = k0 + 1
            if (s > 0) idx.push(k0, k1, k2, k0, k2, k3); else idx.push(k0, k2, k1, k0, k3, k2)
          }
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx)
        return g
      }
      const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1)
      const M = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz))
      const mul = (a, b) => a.clone().multiply(b)
      function makeMerge(ox = 0, oy = 0, oz = 0) { // everything is authored in box coordinates, shifted by the owner's origin
        const pos = [], nor = [], col = [], uvs = [], idx = []
        const v = new THREE.Vector3(), nv = new THREE.Vector3(), nm = new THREE.Matrix3()
        return {
          add(geo, m, hex) {
            const p = geo.attributes.position, nn = geo.attributes.normal, u = geo.attributes.uv, cnt = p.count, base = pos.length / 3
            nm.getNormalMatrix(m)
            for (let k = 0; k < cnt; k++) {
              v.fromBufferAttribute(p, k).applyMatrix4(m); pos.push(v.x - ox, v.y - oy, v.z - oz)
              nv.fromBufferAttribute(nn, k).applyMatrix3(nm).normalize(); nor.push(nv.x, nv.y, nv.z); uvs.push(u.getX(k), u.getY(k))
            }
            const r = ((hex >> 16) & 255) / 255
            for (let k = 0; k < cnt; k++) col.push(r, r, r)
            if (geo.index) for (let k = 0; k < geo.index.count; k++) idx.push(geo.index.getX(k) + base)
            else for (let k = 0; k < cnt; k++) idx.push(base + k)
            geo.dispose()
          },
          rb(w, h, d, r, x, y, z, hex, ry = 0, rx = 0, rz = 0) { this.add(rbox(w, h, d, r), M(x, y, z, ry, rx, rz), hex) },
          rod(a, b, t, hex) {
            const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), len = A.distanceTo(Bv)
            const m = new THREE.Matrix4().lookAt(A, Bv, new THREE.Vector3(0, 1, 0)); m.setPosition(A.clone().add(Bv).multiplyScalar(0.5))
            this.add(rbox(t, t, len, t * 0.4), m, hex)
          },
          build() {
            const g = new THREE.BufferGeometry()
            g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
            g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx)
            return g
          },
        }
      }

      // ---- shared uniforms and materials ------------------------------------------------------------------------------------------
      const HZ = { uFocus: { value: 7 }, uRange: { value: 3 }, uBand: { value: 1 }, uRes: { value: new THREE.Vector2(size.w * size.dpr, size.h * size.dpr) } }
      const toy = (off, ao, planks) => ownM(new THREE.ShaderMaterial({ uniforms: { ...HZ, uOff: { value: new THREE.Vector3(...off) }, uAO: { value: ao }, uFloorY: { value: B } }, vertexShader: TOY_VS, fragmentShader: TOY_FS, defines: planks ? { PLANKS: '' } : {}, side: THREE.DoubleSide }))

      // ---- the room ----------------------------------------------------------------------------------------------------------------
      const Y22 = (22 * Math.PI) / 180
      const monM = [M(-0.495, DT, -1.08, Y22), M(-0.125, DT, -1.12, 0), M(0.245, DT, -1.08, -Y22)]
      const lapM = M(0.5, B + 0.25, 0.4, Math.PI / 2), lapHinge = mul(lapM, M(0, 0.012, -0.068, 0, -0.21))
      const tabM = M(-0.3, B + 0.2255, 0.38, 0.35), FLAT = M(0, 0, 0, 0, -Math.PI / 2)
      const CHAIR_AT = [-0.125, B, -0.62], LAMP_AT = new THREE.Vector3(0.46, DT + 0.34, -1.05)

      const F = makeMerge(); F.rb(2.7, 0.14, 2.7, 0.05, 0, B - 0.07, 0, 0x4a4a4a)
      const PR = makeMerge()
      PR.rb(1.5, 0.016, 1.0, 0.007, -0.35, B + 0.008, 0.5, 0x303030)                                                   // rug
      PR.rb(1.45, 0.06, 0.5, 0.02, -0.125, B + 0.47, -1.05, 0x7a7a7a)                                                  // desk top
      for (const sx of [-1, 1]) PR.rb(0.06, 0.44, 0.46, 0.015, -0.125 + sx * 0.69, B + 0.22, -1.05, 0x4a4a4a)
      PR.rb(1.3, 0.28, 0.03, 0.01, -0.125, B + 0.3, -1.25, 0x3a3a3a); PR.rb(0.4, 0.38, 0.44, 0.02, 0.42, B + 0.2, -1.05, 0x555555); PR.rb(0.12, 0.02, 0.01, 0.006, 0.42, B + 0.3, -0.82, 0x8f8f8f)
      for (const mm of monM) {
        PR.add(rbox(0.14, 0.012, 0.1, 0.005), mul(mm, M(0, 0.006, 0.02)), 0x222222); PR.add(rbox(0.035, 0.1, 0.02, 0.01), mul(mm, M(0, 0.06, -0.03)), 0x222222)
        PR.add(rbox(0.34, 0.2, 0.03, 0.012), mul(mm, M(0, 0.17, -0.015)), 0x222222)
      }
      PR.rb(0.22, 0.012, 0.075, 0.005, -0.125, DT + 0.006, -0.82, 0x555555); PR.rb(0.035, 0.012, 0.05, 0.015, 0.07, DT + 0.006, -0.82, 0x555555)  // keyboard, mouse
      PR.rb(0.07, 0.12, 0.07, 0.02, -0.74, DT + 0.06, -1.12, 0x3a3a3a); PR.add(new THREE.CylinderGeometry(0.03, 0.026, 0.06, 12), M(0.35, DT + 0.03, -0.85), 0x8f8f8f) // speaker, mug
      PR.add(new THREE.CylinderGeometry(0.045, 0.05, 0.012, 14), M(0.55, DT + 0.006, -1.1), 0x2a2a2a)                  // lamp base, arms, head
      PR.rod([0.55, DT + 0.01, -1.1], [0.55, DT + 0.3, -1.1], 0.012, 0x2a2a2a); PR.rod([0.55, DT + 0.3, -1.1], [LAMP_AT.x, LAMP_AT.y, LAMP_AT.z], 0.01, 0x2a2a2a)
      PR.add(new THREE.CylinderGeometry(0.018, 0.05, 0.07, 12, 1, true), mul(M(LAMP_AT.x, LAMP_AT.y, LAMP_AT.z), M(0, 0, 0, 0, 0, 0.7)), 0x555555)
      // sofa facing -x, laptop base and lid, coffee table, tablet body, plant
      PR.rb(0.52, 0.16, 0.95, 0.04, 0.58, B + 0.11, 0.4, 0x555555); PR.rb(0.13, 0.4, 0.95, 0.05, 0.89, B + 0.33, 0.4, 0x555555)
      for (const sz of [-1, 1]) PR.rb(0.5, 0.26, 0.11, 0.04, 0.6, B + 0.18, 0.4 + sz * 0.52, 0x555555)
      PR.rb(0.4, 0.07, 0.8, 0.03, 0.53, B + 0.215, 0.4, 0x6a6a6a); PR.rb(0.08, 0.28, 0.8, 0.03, 0.82, B + 0.36, 0.4, 0x6a6a6a, 0, 0, 0.12)
      PR.add(rbox(0.2, 0.012, 0.14, 0.004), mul(lapM, M(0, 0.006, 0)), 0x2a2a2a); PR.add(rbox(0.2, 0.13, 0.01, 0.004), mul(lapHinge, M(0, 0.065, 0)), 0x222222)
      PR.rb(0.5, 0.05, 0.4, 0.02, -0.3, B + 0.2, 0.4, 0x7a7a7a)
      for (const [lx, lz] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) PR.rb(0.04, 0.18, 0.04, 0.012, -0.3 + lx, B + 0.09, 0.4 + lz, 0x4a4a4a)
      PR.add(rbox(0.25, 0.012, 0.175, 0.01), mul(tabM, M(0, 0.006, 0)), 0x222222)
      PR.add(new THREE.CylinderGeometry(0.11, 0.08, 0.16, 14), M(-1.0, B + 0.08, -0.98), 0x7a7a7a)
      const leaf = [[0, 0.3, 0, 0.13, 1.1, 0x555555], [0.07, 0.43, 0.03, 0.1, 1.2, 0x666666], [-0.06, 0.4, -0.04, 0.1, 1.3, 0x5e5e5e], [0.0, 0.54, 0.0, 0.08, 1.4, 0x666666]]
      for (const [lx, ly, lz, lr, sy, hex] of leaf) PR.add(new THREE.IcosahedronGeometry(lr, 1), M(-1.0 + lx, B + ly, -0.98 + lz, 0, 0, 0, 1, sy, 1), hex)
      const BK = makeMerge(0, B, -1.3)                                                                                  // back wall, in its hinge frame
      BK.add(rbox(2.8, H, 0.1, 0.03), M(0, B + H / 2, -1.35), 0x6a6a6a)
      BK.rb(1.0, 0.03, 0.14, 0.01, -0.3, B + 1.05, -1.23, 0x4a4a4a)
      const bh = [0.15, 0.12, 0.17, 0.13, 0.16, 0.11], bcol = [0x8f8f8f, 0x555555, 0x2a2a2a, 0x7a7a7a, 0x3a3a3a, 0x8f8f8f]
      for (let k = 0; k < 6; k++) BK.rb(0.035, bh[k], 0.1, 0.008, -0.72 + k * 0.045, B + 1.065 + bh[k] / 2, -1.23, bcol[k], 0, 0, k === 5 ? 0.2 : 0)
      BK.add(new THREE.CylinderGeometry(0.04, 0.03, 0.06, 10), M(-0.05, B + 1.095, -1.23), 0x7a7a7a); BK.add(new THREE.IcosahedronGeometry(0.06, 1), M(-0.05, B + 1.18, -1.23, 0, 0, 0, 1, 1.2, 1), 0x666666)
      for (const py of [0.95, 0.55]) BK.rb(0.56, 0.33, 0.02, 0.008, 0.92, B + py, -1.29, 0x222222)
      const LF = makeMerge(-1.3, B, 0)                                                                                  // left wall
      LF.add(rbox(0.1, H, 2.8, 0.03), M(-1.35, B + H / 2, 0), 0x6a6a6a)
      LF.rb(0.04, 0.39, 0.68, 0.012, -1.28, B + 0.8, 0.4, 0x222222)                                                    // TV body
      LF.rb(0.012, 0.52, 0.66, 0.004, -1.296, B + 0.95, -0.5, 0x3a3a3a)                                                // window glass (night)
      for (const [wy, wl, wz, wh, ww] of [[1.215, 0.03, -0.5, 0.03, 0.72], [0.685, 0.03, -0.5, 0.03, 0.72]]) LF.rb(0.03, wh, ww, 0.01, -1.285, B + wy - 0.03, wz, 0x8f8f8f)
      for (const sz of [-0.5 - 0.345, -0.5 + 0.345]) LF.rb(0.03, 0.56, 0.03, 0.01, -1.285, B + 0.95, sz, 0x8f8f8f)
      for (let k = 0; k < 6; k++) LF.rb(0.03, 0.012, 0.64, 0.005, -1.27, B + 1.17 - k * 0.04, -0.5, 0x8f8f8f, 0, 0, 0.5)      // half-open blinds
      const mBackWall = toy([0, B, -1.3], 1), mLeftWall = toy([-1.3, B, 0], 1)
      const mFloor = toy([0, 0, 0], 1, true), mProps = toy([0, 0, 0], 1)
      const floor = new THREE.Mesh(own(F.build()), mFloor), props = new THREE.Mesh(own(PR.build()), mProps)
      const backMesh = new THREE.Mesh(own(BK.build()), mBackWall), leftMesh = new THREE.Mesh(own(LF.build()), mLeftWall)

      // the chair: swivels now and then
      const CH = makeMerge()
      for (let k = 0; k < 5; k++) { const a = (k * TWO_PI) / 5; CH.rb(0.14, 0.016, 0.022, 0.006, Math.sin(a) * 0.07, 0.05, Math.cos(a) * 0.07, 0x2a2a2a, a + Math.PI / 2); CH.add(new THREE.CylinderGeometry(0.012, 0.012, 0.025, 8), M(Math.sin(a) * 0.14, 0.015, Math.cos(a) * 0.14), 0x111111) }
      CH.add(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8), M(0, 0.13, 0), 0x333333); CH.add(new THREE.CylinderGeometry(0.15, 0.14, 0.05, 18), M(0, 0.22, 0), 0x555555)
      CH.rb(0.28, 0.32, 0.045, 0.02, 0, 0.42, 0.125, 0x555555, 0, 0.1); CH.rb(0.18, 0.07, 0.05, 0.02, 0.0, 0.62, 0.14, 0x555555, 0, 0.1)
      const mChair = toy([CHAIR_AT[0], CHAIR_AT[1], CHAIR_AT[2]], 1)
      const chair = new THREE.Mesh(own(CH.build()), mChair); chair.position.set(CHAIR_AT[0], CHAIR_AT[1], CHAIR_AT[2])

      // ---- the eight screens --------------------------------------------------------------------------------------------------------
      const backH = new THREE.Group(), leftH = new THREE.Group(), box = new THREE.Group(), tt = new THREE.Group(), root = new THREE.Group()
      backH.position.set(0, B, -1.3); leftH.position.set(-1.3, B, 0)
      backH.add(backMesh); leftH.add(leftMesh); box.add(floor, props, chair, backH, leftH); tt.add(box); root.add(tt); scene.add(root)
      const sdefs = [
        { p: box, w: 0.3, m: mul(monM[0], M(0, 0.17, 0.0008)) }, { p: box, w: 0.3, m: mul(monM[1], M(0, 0.17, 0.0008)) }, { p: box, w: 0.3, m: mul(monM[2], M(0, 0.17, 0.0008)) },
        { p: box, w: 0.18, m: mul(lapHinge, M(0, 0.065, 0.0053)) },                                                           // laptop on the sofa
        { p: box, w: 0.225, m: mul(mul(tabM, M(0, 0.0128, 0)), FLAT) },                                                      // tablet on the coffee table
        { p: leftH, w: 0.62, m: M(0.0408, 0.8, 0.4, Math.PI / 2) },                                              // wall TV (fake: 0.02 off the wall)
        { p: backH, w: 0.52, m: M(0.92, 0.95, 0.0205) }, { p: backH, w: 0.52, m: M(0.92, 0.55, 0.0205) },                    // posters
      ]
      const screens = sdefs.map((d, i) => {
        const h = (d.w * 9) / 16, rect = ctx.loopRect(i)
        const mat = ownM(new THREE.ShaderMaterial({
          uniforms: { ...HZ, uMap: { value: ctx.atlas }, uReel: { value: ctx.showreel.texture }, uRect: { value: new THREE.Vector4(rect[0], rect[1], rect[2], rect[3]) }, uB: { value: 1 }, uReelMix: { value: 0 }, uHz: { value: 1 } },
          vertexShader: SCR_VS, fragmentShader: SCR_FS,
        }))
        const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(d.w, h)), mat)
        mesh.matrixAutoUpdate = false; mesh.matrix.copy(d.m); d.p.add(mesh)
        return { mesh, mat, w: d.w, h, c: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), n: new THREE.Vector3(), turn: 0 }
      })
      const bright = new Float32Array(8), near = new Float32Array(8)

      // ---- turntable, table, shadows, glows, stripes --------------------------------------------------------------------------------
      const DISC = makeMerge()
      DISC.add(new THREE.CylinderGeometry(2.05, 2.1, 0.16, 64), M(0, 0.08, 0), 0x2a2a2a)
      DISC.add(new THREE.RingGeometry(1.88, 1.96, 64), M(0, 0.1605, 0, 0, -Math.PI / 2), 0x555555)
      for (let k = 0; k < 48; k++) { const a = (k * TWO_PI) / 48; DISC.rb(0.03, 0.01, k % 4 === 0 ? 0.14 : 0.07, 0.003, Math.sin(a) * 2.0, 0.165, Math.cos(a) * 2.0, k % 4 === 0 ? 0x8f8f8f : 0x6a6a6a, a) }
      const disc = new THREE.Mesh(own(DISC.build()), toy([0, 0, 0], 0)); tt.add(disc)
      const open = { fold: 1, table: 1, label: 1 }
      const tableMat = ownM(new THREE.ShaderMaterial({ uniforms: { ...HZ, uShow: { value: 1 } }, vertexShader: TABLE_VS, fragmentShader: TABLE_FS }))
      const table = new THREE.Mesh(own(new THREE.PlaneGeometry(50, 50).rotateX(-Math.PI / 2)), tableMat); scene.add(table)
      const quadGeo = (list, attrs) => { // list: [matrix, w, d, strength...] -> flat soft quads
        const pos = [], uv = [], a = [], idx = [], v = new THREE.Vector3(), cu = [[0, 0], [1, 0], [1, 1], [0, 1]]
        list.forEach(([m, w, d, s], q) => {
          [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].forEach((c, k) => { v.set(c[0], 0, c[1]).applyMatrix4(m); pos.push(v.x, v.y, v.z); uv.push(cu[k][0], cu[k][1]); a.push(s) })
          idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3)
        })
        const g = own(new THREE.BufferGeometry())
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute(attrs, new THREE.Float32BufferAttribute(a, 1)); g.setIndex(idx)
        return g
      }
      const dropMat = ownM(new THREE.ShaderMaterial({ uniforms: { uK: { value: 1 }, uE: { value: 0.45 }, uP: { value: 1 } }, vertexShader: SHADOW_VS, fragmentShader: SHADOW_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }))
      const drop = new THREE.Mesh(quadGeo([[M(0.3, 0.004, -0.35), 5.4, 5.4, 0.95]], 'aStr'), dropMat); drop.renderOrder = 1; scene.add(drop) // soft shadow of the whole box on the table
      const y0 = B + 0.003, yD = DT + 0.0015
      const shMat = ownM(new THREE.ShaderMaterial({ uniforms: { uK: { value: 1 }, uE: { value: 0 }, uP: { value: 2 } }, vertexShader: SHADOW_VS, fragmentShader: SHADOW_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }))
      const sh = [
        [M(-0.125, y0, -0.62), 0.5, 0.5, 0.9], [M(-0.125, y0, -1.02), 1.75, 0.8, 0.9], [M(0.62, y0, 0.4), 1.0, 1.45, 0.85], [M(-0.3, y0, 0.4), 0.75, 0.65, 0.75], [M(-1.0, y0, -0.98), 0.4, 0.4, 0.75],
        [M(-0.125, yD, -0.82), 0.3, 0.14, 0.5], [M(-0.74, yD, -1.12), 0.14, 0.14, 0.6], [M(0.35, yD, -0.85), 0.1, 0.1, 0.6], [M(0.55, yD, -1.1), 0.12, 0.12, 0.6],
        [mul(monM[0], M(0, 0.0015, 0.02)), 0.3, 0.2, 0.8], [mul(monM[1], M(0, 0.0015, 0.02)), 0.3, 0.2, 0.8], [mul(monM[2], M(0, 0.0015, 0.02)), 0.3, 0.2, 0.8],
        [mul(lapM, M(0, 0.0015, 0)), 0.3, 0.22, 0.7], [mul(tabM, M(0, 0.0015, 0)), 0.34, 0.27, 0.6],
      ]
      const shMesh = new THREE.Mesh(quadGeo(sh, 'aStr'), shMat); shMesh.renderOrder = 1; box.add(shMesh)
      // glow patches on the desk / floor / sofa / table: [matrix, w, d, work (or -1 for the lamp)]
      const gl = [
        [mul(monM[0], M(0, 0.0025, 0.14)), 0.5, 0.36, 0], [mul(monM[1], M(0, 0.0025, 0.14)), 0.5, 0.36, 1], [mul(monM[2], M(0, 0.0025, 0.14)), 0.5, 0.36, 2],
        [M(0.5, B + 0.2595, 0.42), 0.3, 0.3, 3], [M(-0.3, B + 0.2275, 0.4), 0.42, 0.32, 4], [M(-0.7, y0 + 0.001, 0.4), 1.1, 1.1, 5], [M(0.38, DT + 0.0025, -0.98), 0.62, 0.42, -1],
      ]
      const gGeo = quadGeo(gl.map((g) => [g[0], g[1], g[2], 0]), 'aA'), gA = gGeo.attributes.aA; gA.setUsage(THREE.DynamicDrawUsage)
      const gMat = ownM(new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
      const gMesh = new THREE.Mesh(gGeo, gMat); gMesh.renderOrder = 2; gMesh.frustumCulled = false; box.add(gMesh)
      const stripeGeo = own(new THREE.PlaneGeometry(1.1, 0.9).rotateX(-Math.PI / 2).translate(-0.7, B + 0.005, -0.5))
      const stripeMat = ownM(new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uI: { value: 1 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: STRIPE_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
      const stripes = new THREE.Mesh(stripeGeo, stripeMat); stripes.renderOrder = 2; box.add(stripes)
      const bulbGeo = own(new THREE.CircleGeometry(0.028, 12).rotateX(Math.PI / 2).translate(LAMP_AT.x - 0.01, LAMP_AT.y - 0.04, LAMP_AT.z))
      const bulbMat = ownM(new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })); box.add(new THREE.Mesh(bulbGeo, bulbMat))

      // ---- the museum label on the tabletop -----------------------------------------------------------------------------------------------
      const labelG = new THREE.Group(); scene.add(labelG)
      let labelFor = null, labelMats = [], labelBox = { w: 4, z0: 2.4, z1: 3.4 }
      function buildLabel(portrait) {
        if (labelFor === portrait) return
        labelFor = portrait
        labelMats.forEach((m) => { m.map.dispose(); m.dispose() }); labelMats = []
        while (labelG.children.length) { const c = labelG.children.pop(); c.geometry.dispose() }
        const n = portrait ? 3 : 2, words = ctx.hero.split(/\s+/), tgt = ctx.hero.length / n, lines = []
        let cur = ''
        for (const w of words) { const nx = cur ? cur + ' ' + w : w; if (cur && nx.length > tgt * 1.1 && lines.length < n - 1) { lines.push(cur); cur = w } else cur = nx }
        lines.push(cur)
        const ts = lines.map((s) => ctx.text(s, { size: 160 })), W = portrait ? 4.0 : 5.4, amax = Math.max(...ts.map((t) => t.aspect))
        const lineH = Math.min(W / amax, 0.52), pitch = lineH * 0.82, z0 = 2.5
        ts.forEach((t, k) => {
          const m = new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, color: 0xcfcfcf, depthWrite: false }); labelMats.push(m)
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(t.aspect * lineH, lineH), m); mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, 0.006, z0 + pitch * (k + 0.5) + lineH * 0.1); mesh.renderOrder = 3; labelG.add(mesh)
        })
        labelBox = { w: amax * lineH, z0, z1: z0 + pitch * ts.length + lineH * 0.3 }
      }

      // ---- HUD: veil, hover copy, leader line, tag (children of the camera, px units) -------------------------------------------------------
      const hud = new THREE.Group(); hud.position.z = -HUD; camera.add(hud)
      const unit = own(new THREE.PlaneGeometry(1, 1))
      const veilMat = ownM(new THREE.ShaderMaterial({ uniforms: { uV: { value: 1 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: VEIL_FS, transparent: true, depthTest: false, depthWrite: false }))
      const veil = new THREE.Mesh(unit, veilMat); veil.renderOrder = 40; veil.position.z = -1; camera.add(veil)
      const mkText = (str, opts) => {
        const t = ctx.text(str, opts); texs.push(t.texture)
        const m = ownM(new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false }))
        const mesh = new THREE.Mesh(unit, m); mesh.renderOrder = 64
        return { mesh, mat: m, canvas: t.canvas }
      }
      const PAD = 14
      const tags = works.map((w) => {
        const title = mkText(w.title, { size: 120 }), meta = mkText(`${w.kind} · ${w.year}`, { caps: true, size: 28, color: '#8f8f8f' })
        const plateMat = ownM(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false }))
        const plate = new THREE.Mesh(unit, plateMat); plate.renderOrder = 63
        const group = new THREE.Group(); group.visible = false; group.add(plate, title.mesh, meta.mesh); hud.add(group)
        return { group, plate, plateMat, title, meta, wpx: 0, hpx: 0 }
      })
      function layoutTags() {
        const tfp = clamp(size.w * 0.045, 30, 64), mfp = clamp(size.w * 0.011, 12, 17)
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
      const copyMat = ownM(new THREE.ShaderMaterial({ uniforms: { uMap: { value: ctx.atlas }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uB: { value: 1.08 }, uA: { value: 0 } }, vertexShader: COPY_VS, fragmentShader: COPY_FS, transparent: true, depthTest: false, depthWrite: false }))
      const copy = new THREE.Mesh(unit, copyMat); copy.renderOrder = 62; copy.visible = false; hud.add(copy)
      const frameMat = ownM(new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, depthTest: false, depthWrite: false }))
      const frame = new THREE.Mesh(unit, frameMat); frame.renderOrder = 61; frame.visible = false; hud.add(frame)
      const lineMat = ownM(new THREE.MeshBasicMaterial({ color: 0xededed, transparent: true, depthTest: false, depthWrite: false }))
      const line = new THREE.Mesh(unit, lineMat); line.renderOrder = 62; line.visible = false; hud.add(line)
      const dotGeo = own(new THREE.CircleGeometry(0.5, 14)), dot = new THREE.Mesh(dotGeo, lineMat); dot.renderOrder = 62; dot.visible = false; hud.add(dot)

      // ---- state ----------------------------------------------------------------------------------------------------------------------------
      const st = { yaw: YAW0, yawV: 0 }, fly = { k: 0 }, reelMix = { v: 0 }, lampOn = { v: 1 }, chairS = { yaw: 0 }
      let portrait = false, zoomT = 0, zS = 0, lastScroll = 0
      let opening = false, flying = false, flyIdx = -1, hot = -1, hoverOn = false, focusCell = -1, cand = -1, dwell = 0, lost = 0, tagCell = 0, tagA = 0
      let tl = null, flyTl = null, backTw = null, swivel = null
      const look = { x: 0, y: 0 }
      const T0 = new THREE.Vector3(0, 0.8, 0.8), T1 = new THREE.Vector3(-0.125, 0.97, -1.12), tgt = new THREE.Vector3(), camP = new THREE.Vector3()
      let P0 = 0.61, P1 = 0.22, D0 = 8, D1 = 1.15
      const V = new THREE.Vector3(), V2 = new THREE.Vector3(), RO = new THREE.Vector3(), RD = new THREE.Vector3(), MB = new THREE.Matrix4(), qB = new THREE.Quaternion(), pB = new THREE.Vector3()
      const pxs = new Float32Array(16)

      const wrapNear = (target, cur) => target + TWO_PI * Math.round((cur - target) / TWO_PI)
      function syncBases() {
        root.updateMatrixWorld(true)
        for (const s of screens) { s.mesh.matrixWorld.extractBasis(s.r, s.u, s.n); s.c.setFromMatrixPosition(s.mesh.matrixWorld) }
      }
      function setFolds(fold, yaw) { // a wall folds down on the side that faces the camera; the opening folds both up from flat
        backH.rotation.x = -(1 - fold * sstep(-0.55, -0.05, Math.cos(yaw))) * (Math.PI / 2)
        leftH.rotation.z = (1 - fold * sstep(-0.55, -0.05, -Math.sin(yaw))) * (Math.PI / 2)
      }
      // each Work's turntable angle, from the rest pose: a wall Work faces the camera; a flat one is read upright
      setFolds(1, 0); tt.rotation.y = 0; syncBases()
      screens.forEach((s) => { s.turn = Math.abs(s.n.y) < 0.7 ? -Math.atan2(s.n.x, s.n.z) : Math.PI - Math.atan2(s.u.x, s.u.z) })
      tt.rotation.y = YAW0

      // frame the whole box + label inside the view (the view has a header on top): a few steps of "project, scale, shift"
      const fitCam = new THREE.PerspectiveCamera(34, 1.6, 0.05, 80), fitPts = []
      function fit() {
        fitPts.length = 0
        for (let k = 0; k < 8; k++) { const a = (k * TWO_PI) / 8; fitPts.push(new THREE.Vector3(Math.sin(a) * 2.1, 0.16, Math.cos(a) * 2.1)) }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) fitPts.push(new THREE.Vector3(sx * 1.4, B + H + 0.05, sz * 1.4))
        for (const sx of [-1, 1]) for (const z of [labelBox.z0, labelBox.z1]) fitPts.push(new THREE.Vector3(sx * labelBox.w * 0.5, 0, z))
        fitCam.fov = camera.fov; fitCam.aspect = camera.aspect; fitCam.updateProjectionMatrix()
        const dir = new THREE.Vector3(0, Math.sin(P0), Math.cos(P0)), up = new THREE.Vector3(0, Math.cos(P0), -Math.sin(P0)), tn = Math.tan((camera.fov * Math.PI) / 360)
        let d = 9; T0.set(0, 0.8, 0.9)
        for (let it = 0; it < 6; it++) {
          fitCam.position.copy(T0).addScaledVector(dir, d); fitCam.lookAt(T0); fitCam.updateMatrixWorld(true)
          let ymin = 1e9, ymax = -1e9, xm = 0
          for (const p of fitPts) { V.copy(p).project(fitCam); ymin = Math.min(ymin, V.y); ymax = Math.max(ymax, V.y); xm = Math.max(xm, Math.abs(V.x)) }
          d *= clamp(Math.max((ymax - ymin) / 2 / 0.79, xm / 0.92), 0.5, 2)
          T0.addScaledVector(up, ((ymin + ymax) / 2 + 0.01) * d * tn)
        }
        D0 = d
      }
      function resizeAll(w, h) {
        const asp = w / h
        portrait = asp < 0.9
        camera.aspect = asp; camera.fov = portrait ? 44 : 34; camera.updateProjectionMatrix()
        D1 = portrait ? 1.3 : 1.15
        HZ.uRes.value.set(w * size.dpr, h * size.dpr)
        const th = 2 * Math.tan((camera.fov * Math.PI) / 360)
        veil.scale.set(th * asp, th, 1)
        buildLabel(portrait); layoutTags(); fit()
      }

      // ---- picking: ray against the 8 screen planes ------------------------------------------------------------------------------------------
      function pick(nx, ny, margin) {
        RO.setFromMatrixPosition(camera.matrixWorld)
        RD.set(nx, ny, 0.5).unproject(camera).sub(RO).normalize()
        let best = -1, bt = 1e9
        for (let i = 0; i < 8; i++) {
          const s = screens[i], den = RD.dot(s.n)
          if (den > -1e-3) continue
          V.copy(s.c).sub(RO); const t = V.dot(s.n) / den
          if (t < 0.05 || t >= bt) continue
          V.copy(RO).addScaledVector(RD, t).sub(s.c)
          if (Math.abs(V.dot(s.r)) < (s.w / 2) * margin + 0.03 && Math.abs(V.dot(s.u)) < (s.h / 2) * margin + 0.03) { best = i; bt = t }
        }
        return best
      }
      function flyPoseOf(i, outP, outQ) { // camera straight in front of screen i so its loop fills the view
        const s = screens[i], tn = Math.tan((camera.fov * Math.PI) / 360), d = (0.97 * Math.min(s.w / camera.aspect, s.h)) / (2 * tn)
        outP.copy(s.c).addScaledVector(s.n, d); MB.makeBasis(s.r, s.u, s.n); outQ.setFromRotationMatrix(MB)
        return d
      }

      // ---- the moments ------------------------------------------------------------------------------------------------------------------------------
      function startOpening() {
        opening = true; flyIdx = 1; fly.k = 1; reelMix.v = 1; st.yaw = YAW0 - 2.4; st.yawV = 0; open.fold = 0; open.table = 0; open.label = 0; lampOn.v = 0
        tl = gsap.timeline()
        tl.to(fly, { k: 0, duration: 2.0, ease: 'power3.inOut' }, 0.7)                  // pull back and up from the centre monitor
        tl.to(st, { yaw: YAW0, duration: 2.4, ease: 'power2.out' }, 0.5)                 // the box spins into place
        tl.to(open, { fold: 1, duration: 1.5, ease: 'back.out(1.3)' }, 1.2)              // walls fold up
        tl.to(open, { table: 1, duration: 1.6, ease: 'power1.inOut' }, 0.9)
        tl.to(open, { label: 1, duration: 0.8, ease: 'power1.out' }, 2.3)
        tl.to(reelMix, { v: 0, duration: 0.5, ease: 'power1.inOut' }, 1.6)              // the Showreel hands over to its Work
        tl.to(lampOn, { v: 0.9, duration: 0.14 }, 2.4).to(lampOn, { v: 0.15, duration: 0.12 }).to(lampOn, { v: 1, duration: 0.35, ease: 'power1.out' }) // the lamp flickers on
        tl.call(() => { opening = false; flyIdx = -1; st.yawV = 0 }, null, 2.9)
      }
      function endOpening() { if (tl) tl.progress(1); opening = false; flyIdx = -1; st.yawV = 0 } // progress() fires no callbacks by default
      function flyTo(i) {
        if (flying || opening || i < 0) return
        flying = true; flyIdx = i; hot = i; ctx.cursor.hover(false); hoverOn = false
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        flyTl.to(fly, { k: 1, duration: 0.85, ease: 'power3.inOut' }, 0)
      }
      function scheduleSwivel() { // the chair turns by itself now and then
        swivel = gsap.to(chairS, { yaw: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6), duration: 1.5, ease: 'power2.inOut', delay: 3.5 + Math.random() * 4, onComplete: scheduleSwivel })
      }

      // ---- per frame ---------------------------------------------------------------------------------------------------------------------------------
      function update(t, dt) {
        dt = clamp(dt, 0.0001, 0.05)
        const w = size.w, h = size.h
        // scroll zooms; the pointer tilts the view a little
        zoomT = clamp(zoomT + (sc.y - lastScroll) / ZLEN, 0, 1); lastScroll = sc.y
        zS += (zoomT - zS) * (1 - Math.exp(-dt * 4.5))
        const zc = zS * zS * (3 - 2 * zS), want = P.inside && !touch ? 1 : 0, kk = 1 - Math.exp(-dt * 3)
        look.x += (P.nx * want - look.x) * kk; look.y += (P.ny * want - look.y) * kk

        // turntable: hand, hover turn, home at depth, or coast
        let dragging = P.down && !opening && !flying
        if (opening) { /* the opening tween owns yaw */ } else {
          if (dragging) {
            const d = P.dx * (6.5 / w) * (1 - 0.5 * zc)
            st.yaw += d; st.yawV += (d / dt - st.yawV) * (1 - Math.exp(-dt * 18))
          } else {
            const turnTo = hot >= 0 ? wrapNear(screens[hot].turn, st.yaw) : zc > 0.3 ? wrapNear(0, st.yaw) : null
            if (turnTo !== null) { const k = hot >= 0 ? 38 : 7 * sstep(0.3, 0.8, zc); st.yawV += (k * (turnTo - st.yaw) - 2 * Math.sqrt(k) * 0.95 * st.yawV) * dt }
            else st.yawV *= Math.exp(-dt * 1.7)
            st.yawV = clamp(st.yawV, -14, 14); st.yaw += st.yawV * dt
          }
        }
        tt.rotation.y = st.yaw
        setFolds(open.fold, st.yaw)
        chair.rotation.y = chairS.yaw

        // matrices, then the screens' world bases
        syncBases()

        // camera: spherical around a target that slides from the whole box to the desk
        const tgtZ = zc; tgt.lerpVectors(T0, T1, tgtZ)
        const pitch = lerp(P0, P1, zc) + look.y * 0.035, dist = lerp(D0, D1, Math.pow(zc, 0.85)), az = -look.x * 0.09
        camP.set(tgt.x + dist * Math.sin(az) * Math.cos(pitch), tgt.y + dist * Math.sin(pitch), tgt.z + dist * Math.cos(az) * Math.cos(pitch))
        camera.position.copy(camP); camera.lookAt(tgt)
        let focus = dist
        if (fly.k > 0 && flyIdx >= 0) {
          const d = flyPoseOf(flyIdx, pB, qB)
          camera.position.lerp(pB, fly.k); camera.quaternion.slerp(qB, fly.k); focus = lerp(dist, d, fly.k)
        }
        camera.updateMatrixWorld(true)
        HZ.uFocus.value = focus; HZ.uRange.value = Math.max(1.1, focus * 0.45); HZ.uBand.value = (1 - 0.3 * zc) * (1 - fly.k)
        veilMat.uniforms.uV.value = (1 - 0.4 * zc) * (1 - fly.k)

        // which Work: dwell on it, and keep it while the box turns it toward the front
        let hit = -1
        if (!opening && !flying && !touch && P.inside && !dragging) hit = pick(P.nx, P.ny, 1.25)
        if (hit < 0 && !opening && focusCell >= 0) hit = focusCell
        const settled = hot < 0 || (Math.abs(wrapNear(screens[hot].turn, st.yaw) - st.yaw) < 0.14 && Math.abs(st.yawV) < 0.6)
        if (flying) { hot = flyIdx } else if (opening || dragging) { hot = -1; cand = -1; dwell = 0 } else {
          if (hit !== cand) { cand = hit; dwell = 0 } else dwell += dt
          if (hit >= 0 && hit !== hot && (dwell > 0.1 || hot < 0) && (hot < 0 || settled || dwell > 0.5)) { hot = hit; lost = 0 }
          else if (hot >= 0 && hit !== hot) {
            lost = settled ? lost + dt : 0
            if (copyHit(P.nx, P.ny)) lost = 0
            if (lost > 0.35 && focusCell < 0) hot = -1
          } else lost = 0
          if (touch && !flying) hot = -1
        }
        if ((hot >= 0 && !flying) !== hoverOn) { hoverOn = hot >= 0 && !flying; ctx.cursor.hover(hoverOn) }

        // brightness: the hot Work pushes past full, the others sit lower; glows follow
        const bk = 1 - Math.exp(-dt * 9)
        for (let i = 0; i < 8; i++) {
          const s = screens[i]
          V.copy(s.c).project(camera)
          const tg = hot < 0 ? 0.95 : hot === i ? 1.25 : 0.62
          bright[i] += (tg - bright[i]) * bk
          s.mat.uniforms.uB.value = bright[i]; s.mat.uniforms.uHz.value = hot === i ? 0 : 1
          pxs[i * 2] = (V.x * 0.5 + 0.5) * w; pxs[i * 2 + 1] = (0.5 - V.y * 0.5) * h
        }
        screens[1].mat.uniforms.uReelMix.value = reelMix.v
        for (let q = 0; q < gl.length; q++) { const wk = gl[q][3], I = wk < 0 ? lampOn.v * 1.1 : bright[wk] * bright[wk]; for (let k = 0; k < 4; k++) gA.array[q * 4 + k] = I }
        gA.needsUpdate = true
        bulbMat.color.setScalar(0.93 * clamp(lampOn.v, 0, 1))
        stripeMat.uniforms.uT.value = t; stripeMat.uniforms.uI.value = open.fold
        tableMat.uniforms.uShow.value = open.table; dropMat.uniforms.uK.value = open.table; shMat.uniforms.uK.value = open.fold * 0.2 + 0.8
        labelMats.forEach((m) => { m.opacity = open.label })

        // glass: push on spin speed, opening and the dive
        ctx.crt.push = clamp(Math.abs(st.yawV) / 20 + Math.abs(sc.v) / 4200 + (opening ? 0.4 * Math.sin(clamp(1 - fly.k, 0, 1) * Math.PI) : 0) + (flying ? 0.55 * Math.sin(clamp(fly.k, 0, 1) * Math.PI) + 0.2 * fly.k : 0), 0, 1)

        // hover: copy + leader line + tag
        const show = hot >= 0 && !flying && !opening
        if (show && hot !== tagCell) { tags[tagCell].group.visible = false; tagCell = hot; tagA = 0 }
        tagA += ((show ? 1 : 0) - tagA) * (1 - Math.exp(-dt * 10))
        layoutHud(w, h)
      }
      let copyRect = { x0: 0, y0: 0, x1: 0, y1: 0 }, copyOn = false
      function copyHit(nx, ny) { // is the pointer over the floating copy? (px from NDC)
        if (!copyOn) return false
        const px = (nx * 0.5 + 0.5) * size.w, py = (0.5 - ny * 0.5) * size.h
        return px > copyRect.x0 - 12 && px < copyRect.x1 + 12 && py > copyRect.y0 - 12 && py < copyRect.y1 + 12
      }
      function layoutHud(w, h) {
        const upp = (2 * Math.tan((camera.fov * Math.PI) / 360) * HUD) / h
        hud.scale.setScalar(upp)
        const tg = tags[tagCell], on = tagA > 0.01
        copy.visible = frame.visible = line.visible = dot.visible = tg.group.visible = on; copyOn = on
        if (!on) return
        const i = tagCell, wx = pxs[i * 2], wy = pxs[i * 2 + 1], cw = portrait ? w * 0.8 : w * 0.34, ch = (cw * 9) / 16
        const top = portrait ? 150 : Math.max(100, h * 0.12), left = !portrait && wx > w * 0.5
        const cx = portrait ? w / 2 : left ? w * 0.27 : w * 0.73, cy = top + ch / 2, by = top + ch
        const sc0 = 0.94 + 0.06 * tagA
        copyRect.x0 = cx - cw / 2; copyRect.x1 = cx + cw / 2; copyRect.y0 = top; copyRect.y1 = by
        const r = ctx.loopRect(i); copyMat.uniforms.uRect.value.set(r[0], r[1], r[2], r[3]); copyMat.uniforms.uA.value = tagA
        const H2 = (px, py) => V2.set(px - w / 2, -(py - h / 2), 0)
        H2(cx, cy); copy.position.copy(V2); copy.scale.set(cw * sc0, ch * sc0, 1)
        frame.position.copy(V2); frame.scale.set(cw * sc0 + 10, ch * sc0 + 10, 1); frameMat.opacity = 0.9 * tagA
        // leader line from the Work up to the copy's bottom edge, growing as it rises
        const ex = clamp(wx, cx - cw / 2 + 16, cx + cw / 2 - 16), ey = by + 5, dx = ex - wx, dy = ey - wy, len = Math.hypot(dx, dy) * sstep(0, 1, tagA)
        const ang = Math.atan2(-(dy), dx), mx = wx + (dx / (Math.hypot(dx, dy) || 1)) * len * 0.5, my = wy + (dy / (Math.hypot(dx, dy) || 1)) * len * 0.5
        H2(mx, my); line.position.copy(V2); line.scale.set(len, 1.6, 1); line.rotation.z = ang; lineMat.opacity = tagA
        H2(wx, wy); dot.position.copy(V2); dot.scale.set(9, 9, 1)
        const tx = ex > cx ? cx - cw / 2 : cx + cw / 2 - tg.wpx, ty = clamp(by + 14, 96, Math.max(96, h - 16 - tg.hpx))
        H2(tx + tg.wpx / 2, ty + tg.hpx / 2); tg.group.position.copy(V2)
        tg.plateMat.opacity = 0.9 * tagA; tg.title.mat.opacity = tagA; tg.meta.mat.opacity = tagA
      }

      resizeAll(size.w, size.h)
      syncBases()
      if (ctx.reduced) { open.fold = open.table = open.label = 1; fly.k = 0 } else { startOpening(); scheduleSwivel() }
      if (ctx.reduced) tt.rotation.y = YAW0

      return {
        scene, camera, update,
        resize(w, h) { resizeAll(w, h) },
        tap() {
          if (opening) { endOpening(); return }
          if (flying) return
          const i = touch ? pick(P.nx, P.ny, 1.8) : hot >= 0 ? hot : pick(P.nx, P.ny, 1.25)
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
          backTw = gsap.to(fly, { k: 0, duration: 0.9, ease: 'power3.inOut', onComplete: () => { flying = false; flyIdx = -1; focusCell = -1; hot = -1 } })
        },
        dispose() {
          if (tl) tl.kill(); if (flyTl) flyTl.kill(); if (backTw) backTw.kill(); if (swivel) swivel.kill()
          gsap.killTweensOf(fly); gsap.killTweensOf(st); gsap.killTweensOf(open); gsap.killTweensOf(reelMix); gsap.killTweensOf(lampOn); gsap.killTweensOf(chairS)
          ctx.cursor.hover(false)
          labelMats.forEach((m) => { m.map.dispose(); m.dispose() }); labelG.children.forEach((c) => c.geometry.dispose())
          geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((x) => x.dispose())
          scene.remove(camera)
        },
      }
    },
  })
})()
