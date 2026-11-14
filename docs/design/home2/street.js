// THROWAWAY prototype: Street. His clients' street at night, a low-poly model at eye level. The camera stands on the near
// pavement and looks across a wet road at a row of eight small shopfronts; each shows the Work Taha made for it on a screen
// in its window (bright, true 16:9). Scroll walks the camera along the pavement (clamped at both ends) past near lamp posts,
// bench, bins, a tree trunk, the far-side lamps and the shops: real parallax. The pointer looks around (about 10 degrees); the
// pavement and road mirror everything (a flipped copy under a dark glass plane) and ripple under the pointer and the rain.
// The shop you point at answers: sign brightens, awning lifts, door opens a crack, light spills further. Pointing at its screen
// = hover: the camera turns to face it, the screen grows out of the window (about 36% of the width, 80% on portrait), the
// neighbours dim, title + kind/year + the fake shop name appear beside it. Fly-in: the camera walks in on the screen.
// Opening: Showreel fills the view, pulls back to be the screen in the first shop, shops flicker on, the lamps come on in turn.
// The hero sentence is painted on the blank side wall at the start of the street, lit by a lamp bracket.
// FAKE: every shop name, the cat, the people, the bike, all of the invented street furniture.
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const lerp = (a, b, k) => a + (b - a) * k
  const TAN = Math.tan((40 * Math.PI) / 360)
  const PITCH = 4, SHOP_W = 3.9 // shop x spacing, building width
  const SCR_W = 1.6, SCR_H = 0.9, SCR_Z = -0.35, SCR_Y = 1.45, SCR_DX = -0.5 // screen in the window: size, plane, centre offset to the shop centre
  const CAM_Y = 1.35, CAM_Z = 9
  // fake: invented businesses, one per Work
  const SHOPS = [
    ['Küçük Kahve', 'serif', 'cafe'], ['Berber Salih', 'caps', 'barber'], ['Sabah Fırını', 'serif', 'bakery'], ['Papatya Çiçekçi', 'serif', 'florist'],
    ['Zincir Bisiklet', 'caps', 'bike'], ['Dönence Plak', 'serif', 'records'], ['Demir Spor', 'caps', 'gym'], ['Dr. Aydın Diş Hekimi', 'serif', 'dental'],
  ]

  // ---------------------------------------------------------------------------------------------------- shaders
  const VC_VS = 'attribute vec3 color; varying vec3 vC; void main(){ vC = color; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }'
  const VC_FS = 'precision highp float; varying vec3 vC; uniform float uBlock; void main(){ gl_FragColor = vec4(vC*uBlock, 1.); }'
  const SCR_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }'
  const SCR_FS = `
    precision highp float; varying vec2 vUv; uniform sampler2D uAtlas, uReel; uniform vec4 uRect; uniform float uB, uMix;
    void main(){
      vec3 c = texture2D(uAtlas, uRect.xy + clamp(vUv, .003, .997)*uRect.zw).rgb;
      c = mix(c, texture2D(uReel, vUv).rgb, uMix);
      float e = smoothstep(0., .03, min(min(vUv.x, 1. - vUv.x)*1.6, min(vUv.y, 1. - vUv.y)));
      gl_FragColor = vec4(c*uB*(.88 + .12*e), 1.);
    }`
  const GLOW_VS = `
    attribute float aK, aB, aS; varying vec2 vUv; varying float vK, vB, vS; varying vec3 vW;
    void main(){ vUv = uv; vK = aK; vB = aB; vS = aS; vW = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }`
  const GLOW_FS = `
    precision highp float; varying vec2 vUv; varying float vK, vB, vS; varying vec3 vW;
    uniform float uT, uBlock, uSwX, uSwA;
    float h11(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
    void main(){
      float a = 0.;
      if(vK < .5){ vec2 q = abs(vUv*2. - 1.); a = (1. - smoothstep(.45, 1., max(q.x, q.y*.9)))*(.65 + .35*vUv.y)*.55; }              // lit shop interior
      else if(vK < 1.5){ a = (1. - smoothstep(.55, 1., abs(vUv.x*2. - 1.)))*pow(1. - vUv.y, 1.7)*.42; }                                  // light on the pavement
      else if(vK < 2.5){ a = pow(1. - abs(vUv.x*2. - 1.), .8)*pow(1. - vUv.y, 1.3)*.5; }                                                // door crack spill
      else if(vK < 3.5){ float e = 1. - abs(vUv.x*2. - 1.); float c = floor(vUv.x*60.), h = h11(c);                                    // lamp cone in drizzle
        float yy = fract(vUv.y*.9 + uT*(.5 + h*.6) + h*9.); float stk = step(.62, h)*smoothstep(0., .1, yy)*smoothstep(.25, .1, yy);
        a = pow(e, .8)*(1. - vUv.y*.5)*(.45 + .9*stk)*.32; }
      else if(vK < 4.5){ float r = length(vUv*2. - 1.); a = pow(clamp(1. - r, 0., 1.), 2.2)*(vS > 0. ? .8 + .2*sin(uT*2.6 + vS*40.) : 1.); } // bulb, lamp head, pool
      else if(vK < 5.5){ float d = (vW.x - uSwX)/3.4; a = exp(-d*d)*exp(-vW.y*.22)*.3*uSwA; }                                           // passing car's light
      else { float d = length((vUv - vec2(.5, 1.))*vec2(.55, .8)); a = pow(clamp(1. - d, 0., 1.), 1.6)*.5; }                              // lamp wash on the wall
      a *= vB*uBlock;
      gl_FragColor = vec4(vec3(a), 1.);
    }`
  const SIGN_VS = 'attribute float aB; varying vec2 vUv; varying float vB; void main(){ vUv = uv; vB = aB; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }'
  const SIGN_FS = 'precision highp float; varying vec2 vUv; varying float vB; uniform sampler2D uTex; uniform float uBlock; void main(){ float a = texture2D(uTex, vUv).a; gl_FragColor = vec4(vec3(.95)*vB*uBlock, a); }'
  const HERO_FS = `
    precision highp float; varying vec2 vUv; uniform sampler2D uTex; uniform float uA;
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
    void main(){
      float a = texture2D(uTex, vUv).a;
      float wash = .62 + .38*(1. - clamp(length((vUv - vec2(.5, 1.2))*vec2(.9, .8)), 0., 1.));
      float paint = .86 + .14*h12(floor(vUv*vec2(260., 90.)));
      gl_FragColor = vec4(vec3(.93*wash*paint*uA), a*(.92 + .08*paint));
    }`
  const GROUND_VS = 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }'
  const GROUND_FS = `
    precision highp float; varying vec3 vW; uniform float uBlock;
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
    void main(){
      float z = vW.z;
      float pav = (1. - step(1.6, z)) + step(6.2, z);
      float seam = smoothstep(.485, .5, abs(fract(vW.x/.9) - .5)) + smoothstep(.485, .5, abs(fract(z/.9) - .5));
      float g = mix(.018, .06, pav)*(1. + .25*h12(floor(vW.xz*4.))) - seam*pav*.02;
      g += (1. - smoothstep(0., .06, abs(z - 1.6)))*.05 + (1. - smoothstep(0., .06, abs(z - 6.2)))*.05;
      gl_FragColor = vec4(vec3(max(g, 0.))*uBlock, mix(.8, .6, pav));
    }`
  const SKY_FS = `
    precision highp float; varying vec3 vW; uniform float uBlock;
    void main(){ gl_FragColor = vec4(vec3(mix(.1, .035, smoothstep(2., 30., vW.y)))*uBlock, 1.); }`
  const RAIN_VS = `
    attribute float aEnd, aSp; uniform float uT; varying float vA;
    void main(){ vec3 p = position; p.y = mod(p.y - uT*aSp, 7.) + aEnd*.5; p.x += aEnd*.06; vA = 1. - aEnd*.4;
      gl_Position = projectionMatrix*modelViewMatrix*vec4(p, 1.); }`
  const RAIN_FS = 'precision highp float; varying float vA; uniform float uA; void main(){ gl_FragColor = vec4(vec3(.2*vA*uA), 1.); }'
  const RIP_VS = 'attribute vec2 aC; attribute float aT; varying vec2 vUv; varying float vT; void main(){ vUv = uv*2. - 1.; vT = aT; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }'
  const RIP_FS = `
    precision highp float; varying vec2 vUv; varying float vT; uniform float uT;
    void main(){
      float age = (uT - vT)/1.5; if(age < 0. || age > 1.) discard;
      float r = length(vUv), ring = 1. - smoothstep(0., .09, abs(r - age));
      gl_FragColor = vec4(vec3(ring*(1. - age)*.4), 1.);
    }`

  // ---------------------------------------------------------------------------------------------------- helpers
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
  // merged static geometry with baked shading in vertex colours (top lit, bottom dark = fake ambient occlusion)
  function Builder() {
    const pos = [], col = []
    const FACES = [
      [[[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], 1], [[[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], 0.6],
      [[[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], 0.8], [[[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], 0.7],
      [[[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], 1.4], [[[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], 0.45],
    ]
    return {
      box(x, y, z, w, h, d, g) {
        for (const [cs, sh] of FACES) for (const k of [0, 1, 2, 0, 2, 3]) {
          const c = cs[k]
          pos.push(x + (c[0] * w) / 2, y + (c[1] * h) / 2, z + (c[2] * d) / 2)
          const v = clamp(g * sh * (c[1] < 0 ? 0.7 : 1), 0, 1); col.push(v, v, v)
        }
      },
      geo(g, x, y, z, sx, sy, sz, grey, ry = 0) { // any three geometry, scaled, turned about y, placed
        const ng = g.index ? g.toNonIndexed() : g, p = ng.attributes.position, n = ng.attributes.normal, c = Math.cos(ry), s = Math.sin(ry)
        for (let i = 0; i < p.count; i++) {
          const lx = p.getX(i) * sx, ly = p.getY(i) * sy, lz = p.getZ(i) * sz
          pos.push(x + c * lx + s * lz, y + ly, z - s * lx + c * lz)
          const nx = c * n.getX(i) + s * n.getZ(i), v = clamp(grey * (0.55 + 0.5 * Math.max(n.getY(i), 0) + 0.15 * nx) * (p.getY(i) < 0 ? 0.85 : 1), 0, 1)
          col.push(v, v, v)
        }
        g.dispose(); if (ng !== g) ng.dispose()
      },
      geometry() {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
        return geo
      },
    }
  }
  const cyl = (r, h, s = 10, r2 = r) => new THREE.CylinderGeometry(r, r2, h, s, 1)
  const sph = (r = 1, s = 8) => new THREE.SphereGeometry(r, s, Math.max(4, s - 2))

  HOME.register({
    name: 'Street',
    create(ctx) {
      const works = ctx.works, touch = ctx.touch, size = ctx.size, P = ctx.pointer
      const geos = [], mats = [], texs = []
      const keep = (list, o) => { list.push(o); return o }
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.1, 90)
      scene.add(camera)
      const portrait = () => size.w / size.h < 0.9
      const XS = () => (portrait() ? -8.4 : -6.1), XE = 26.5 // walk range (camera x); the view looks 0.2 rad down the street, so the start frames the hero wall
      const shopX = (i) => i * PITCH

      const S = { open: 1, block: 0, rain: 0, f: 0, hot: -1, last: 0, opening: false, flying: false, mix0: 0 }
      const hv = new Float32Array(8) // hover amount per shop
      const en = new Float32Array(8) // "answer" energy per shop (sign, awning, door, spill)
      const shopOn = new Float32Array(8).fill(1), lampOn = new Float32Array(7).fill(1)
      let focusI = -1, dwell = 0, cand = -1, hoverOn = false, look = -1
      let sSm = 0, pxS = 0, pyS = 0, tl = null, flyTl = null, backTw = null, t0 = 0

      // ---- materials ----------------------------------------------------------------------------------------------------
      const bodyMat = keep(mats, new THREE.ShaderMaterial({ vertexShader: VC_VS, fragmentShader: VC_FS, uniforms: { uBlock: { value: 0 } } }))
      const glowU = { uT: { value: 0 }, uBlock: { value: 0 }, uSwX: { value: 0 }, uSwA: { value: 0 } }
      const glowMat = keep(mats, new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: GLOW_FS, uniforms: glowU, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
      const unit = keep(geos, new THREE.PlaneGeometry(1, 1))

      // ---- static street (body) ------------------------------------------------------------------------------------------
      const b = Builder(), rand = rng(portrait() ? 5 : 9)
      const quads = [] // glow quads: [kind, corners(4 x [x,y,z]), seed]
      const Q = (kind, c, seed = 0) => { quads.push({ kind, c, seed }); return quads.length - 1 }
      const iWin = [], iSpill = [], iDoor = [], iDoorIn = [], iSignHalo = [], iBulb = [], iHead = [], iCone = [], iPool = []
      let iSweep = 0, iWash = 0

      // wall at the start of the street: blank plaster, a roller shutter along the foot, a lamp bracket above the text
      b.box(-6.9, 4, -2, 7.9, 8, 4, 0.12)
      for (let k = 0; k < 22; k++) b.box(-9.3 + k * 0.2455 + 0.1, 0.75, 0.03, 0.2, 1.5, 0.04, k % 2 ? 0.16 : 0.12)
      b.box(-6.6, 1.55, 0.05, 5.5, 0.1, 0.1, 0.2)
      b.box(-6.6, 4.05, 0.12, 0.08, 0.5, 0.08, 0.2); b.box(-6.6, 4.28, 0.3, 0.08, 0.06, 0.45, 0.2); b.box(-6.6, 4.22, 0.5, 0.3, 0.08, 0.2, 0.55)
      iHead.push(Q(4, [[-7.1, 3.8, 0.6], [-6.1, 3.8, 0.6], [-6.1, 4.8, 0.6], [-7.1, 4.8, 0.6]]))
      iWash = Q(6, [[-9.3, 1.4, 0.04], [-3.9, 1.4, 0.04], [-3.9, 4.4, 0.04], [-9.3, 4.4, 0.04]])

      for (let i = 0; i < 8; i++) {
        const X = shopX(i), r = rand, H = i % 3 === 1 ? 6.4 : 9, wall = 0.1 + r() * 0.05
        // upper floors
        b.box(X, 3.1 + (H - 3.1) / 2, -2, SHOP_W, H - 3.1, 4, wall)
        for (let fl = 0; fl < (H > 7 ? 2 : 1); fl++) for (let w = 0; w < 3; w++) {
          const wx = X - 1.2 + w * 1.2, wy = 4.4 + fl * 2.6, lit = r() < 0.3
          b.box(wx, wy, 0.0, 0.98, 1.18, 0.06, 0.2); b.box(wx, wy, 0.04, 0.84, 1.04, 0.04, lit ? 0.3 + r() * 0.15 : 0.025)
          b.box(wx, wy - 0.6, 0.12, 1.1, 0.06, 0.2, 0.22)
        }
        b.box(X, H + 0.1, 0.05, SHOP_W + 0.1, 0.2, 0.5, 0.15)
        // ground floor: lintel with the sign board, piers, stallriser, hollow shop behind the window
        b.box(X, 2.75, -0.05, SHOP_W, 0.7, 0.3, wall * 1.1); b.box(X, 2.86, 0.1, 3.6, 0.52, 0.1, 0.07); b.box(X, 2.61, 0.12, 3.64, 0.04, 0.14, 0.2)
        b.box(X - 1.775, 1.45, -0.1, 0.25, 1.9, 0.3, wall); b.box(X + 0.725, 1.45, -0.1, 0.15, 1.9, 0.3, wall); b.box(X + 1.775, 1.45, -0.1, 0.25, 1.9, 0.3, wall)
        b.box(X - 0.5, 0.25, -0.05, 2.3, 0.5, 0.3, wall * 0.9); b.box(X + 1.2, 2.25, -0.1, 0.8, 0.3, 0.3, wall); b.box(X - 0.5, 0.5, 0.02, 2.4, 0.04, 0.14, 0.2)
        b.box(X - 1.85, 1.0, -0.8, 0.1, 2.0, 1.4, wall * 0.8); b.box(X + 1.85, 1.0, -0.8, 0.1, 2.0, 1.4, wall * 0.8)
        b.box(X, 2.45, -0.8, 3.6, 0.1, 1.4, 0.05); b.box(X, 0.0, -0.8, 3.6, 0.04, 1.4, 0.05)
        b.box(X - 0.5, 1.45, -1.4, 2.3, 1.9, 0.1, 0.06); b.box(X + 1.2, 1.05, -1.4, 0.8, 2.1, 0.1, 0.05)
        // the screen's bezel and stand
        b.box(X + SCR_DX, SCR_Y, SCR_Z - 0.06, SCR_W + 0.12, SCR_H + 0.12, 0.06, 0.05); b.box(X + SCR_DX, 0.95, SCR_Z - 0.2, 0.08, 0.1, 0.2, 0.08)
        shopDisplay(b, X, SHOPS[i][2], r)
        iWin.push(Q(0, [[X - 1.65, 0.55, -1.3], [X + 0.65, 0.55, -1.3], [X + 0.65, 2.4, -1.3], [X - 1.65, 2.4, -1.3]]))
        iDoorIn.push(Q(0, [[X + 0.8, 0.1, -1.3], [X + 1.6, 0.1, -1.3], [X + 1.6, 2.1, -1.3], [X + 0.8, 2.1, -1.3]]))
        iSpill.push(Q(1, [[X - 1.65, 0.012, 0.2], [X + 0.65, 0.012, 0.2], [X + 0.65, 0.012, 3.4], [X - 1.65, 0.012, 3.4]]))
        iDoor.push(Q(2, [[X + 0.8, 0.014, 0.1], [X + 1.6, 0.014, 0.1], [X + 1.8, 0.014, 4.2], [X + 0.6, 0.014, 4.2]]))
        iSignHalo.push(Q(0, [[X - 1.9, 2.5, 0.2], [X + 1.9, 2.5, 0.2], [X + 1.9, 3.2, 0.2], [X - 1.9, 3.2, 0.2]]))
      }
      // the street's lamps (far side, at the shop borders), near lamp posts, string lights between the far lamps
      const lampXs = [2, 10, 18, 26]
      lampXs.forEach((x) => {
        b.box(x, 1.75, 1.2, 0.07, 3.5, 0.07, 0.14); b.box(x + 0.18, 3.5, 1.2, 0.4, 0.05, 0.05, 0.14); b.box(x + 0.4, 3.45, 1.2, 0.3, 0.07, 0.2, 0.55); b.box(x, 0.12, 1.2, 0.22, 0.24, 0.22, 0.1)
        iHead.push(Q(4, [[x - 0.1, 3.05, 1.3], [x + 0.9, 3.05, 1.3], [x + 0.9, 4.05, 1.3], [x - 0.1, 4.05, 1.3]]))
        iCone.push(Q(3, [[x + 0.3, 3.4, 1.25], [x + 0.5, 3.4, 1.25], [x + 1.9, 0.02, 1.25], [x - 1.1, 0.02, 1.25]]))
        iPool.push(Q(4, [[x - 1.1, 0.014, 0.2], [x + 1.9, 0.014, 0.2], [x + 1.9, 0.014, 2.8], [x - 1.1, 0.014, 2.8]]))
      })
      ;[5, 21].forEach((x) => { b.box(x, 2, 6.8, 0.08, 4, 0.08, 0.13); b.box(x + 0.2, 4.0, 6.8, 0.45, 0.05, 0.05, 0.13); b.box(x + 0.4, 3.95, 6.8, 0.3, 0.07, 0.2, 0.4); b.box(x, 0.12, 6.8, 0.25, 0.24, 0.25, 0.1) })
      for (let s = 0; s < 3; s++) {
        const xa = lampXs[s] + 0.1, xb = lampXs[s + 1] + 0.1, n = 14
        for (let k = 0; k <= n; k++) {
          const u = k / n, x = lerp(xa, xb, u), y = 3.75 - 0.45 * Math.sin(u * Math.PI) * 1 + 0.0
          if (k < n) b.box(lerp(x, lerp(xa, xb, (k + 1) / n), 0.5), y - 0.015, 1.2, (xb - xa) / n, 0.015, 0.015, 0.1)
          iBulb.push(Q(4, [[x - 0.09, y - 0.2, 1.2], [x + 0.09, y - 0.2, 1.2], [x + 0.09, y - 0.02, 1.2], [x - 0.09, y - 0.02, 1.2]], 0.2 + rand()))
        }
      }
      // near pavement: bench, bins, bike against a post, tree trunks (dark shapes in front of the shops)
      b.box(11, 0.45, 7.7, 1.6, 0.06, 0.5, 0.2); b.box(11, 0.85, 7.95, 1.6, 0.4, 0.05, 0.2); b.box(10.3, 0.22, 7.7, 0.06, 0.44, 0.45, 0.12); b.box(11.7, 0.22, 7.7, 0.06, 0.44, 0.45, 0.12)
      ;[15, 24].forEach((x) => { b.geo(cyl(0.28, 0.95, 12), x, 0.48, 7.3, 1, 1, 1, 0.16); b.geo(cyl(0.3, 0.06, 12), x, 0.97, 7.3, 1, 1, 1, 0.2) })
      b.geo(new THREE.TorusGeometry(0.33, 0.025, 5, 16), 4.5, 0.35, 6.8, 1, 1, 1, 0.2); b.geo(new THREE.TorusGeometry(0.33, 0.025, 5, 16), 5.4, 0.35, 6.8, 1, 1, 1, 0.2)
      b.box(4.95, 0.62, 6.8, 0.7, 0.03, 0.03, 0.22); b.box(4.7, 0.62, 6.8, 0.03, 0.55, 0.03, 0.22); b.box(5.3, 0.7, 6.8, 0.03, 0.7, 0.03, 0.22); b.box(5.3, 1.05, 6.8, 0.04, 0.04, 0.35, 0.22); b.box(4.7, 0.95, 6.8, 0.2, 0.04, 0.04, 0.22)
      ;[-1.5, 13.5, 26.5].forEach((x) => { b.geo(cyl(0.13, 3.6, 8, 0.17), x, 1.8, 7.1, 1, 1, 1, 0.11); b.geo(sph(1.3, 7), x, 5.0, 7.1, 1, 0.8, 1, 0.08) })
      // the cat on the sill of the second shop's first-floor window, a silhouette against the lit pane
      { const cx = shopX(1) - 0.4; b.geo(sph(0.17, 7), cx, 4.08, 0.12, 1.3, 0.75, 0.8, 0.02); b.geo(sph(0.1, 6), cx + 0.2, 4.2, 0.12, 1, 1, 1, 0.02); b.geo(new THREE.ConeGeometry(0.04, 0.09, 4), cx + 0.17, 4.31, 0.12, 1, 1, 1, 0.02); b.geo(new THREE.ConeGeometry(0.04, 0.09, 4), cx + 0.24, 4.31, 0.12, 1, 1, 1, 0.02); b.box(cx - 0.25, 4.06, 0.12, 0.2, 0.03, 0.03, 0.02) }
      // sweep of a passing car's lights across all the facades
      iSweep = Q(5, [[-14, 0.02, 0.45], [60, 0.02, 0.45], [60, 6, 0.45], [-14, 6, 0.45]])

      const bodyGeo = keep(geos, b.geometry())
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.frustumCulled = false

      // ---- glow quads (one merged additive mesh, per-quad brightness attribute) ------------------------------------------
      const NQ = quads.length, qp = new Float32Array(NQ * 12), qu = new Float32Array(NQ * 8), qk = new Float32Array(NQ * 4), qb = new Float32Array(NQ * 4), qs = new Float32Array(NQ * 4), qi = []
      const UV = [0, 0, 1, 0, 1, 1, 0, 1]
      quads.forEach((q, n) => {
        for (let v = 0; v < 4; v++) {
          qp.set(q.c[v], (n * 4 + v) * 3); qu[n * 8 + v * 2] = UV[v * 2]; qu[n * 8 + v * 2 + 1] = UV[v * 2 + 1]; qk[n * 4 + v] = q.kind; qs[n * 4 + v] = q.seed
        }
        qi.push(n * 4, n * 4 + 1, n * 4 + 2, n * 4, n * 4 + 2, n * 4 + 3)
      })
      const glowGeo = keep(geos, new THREE.BufferGeometry())
      glowGeo.setAttribute('position', new THREE.BufferAttribute(qp, 3)); glowGeo.setAttribute('uv', new THREE.BufferAttribute(qu, 2)); glowGeo.setAttribute('aK', new THREE.BufferAttribute(qk, 1))
      glowGeo.setAttribute('aS', new THREE.BufferAttribute(qs, 1)); const qbAttr = new THREE.BufferAttribute(qb, 1); qbAttr.setUsage(THREE.DynamicDrawUsage); glowGeo.setAttribute('aB', qbAttr); glowGeo.setIndex(qi)
      const glows = new THREE.Mesh(glowGeo, glowMat); glows.frustumCulled = false; glows.renderOrder = 3
      const setQ = (n, v) => { qb[n * 4] = qb[n * 4 + 1] = qb[n * 4 + 2] = qb[n * 4 + 3] = v }

      // ---- kinetic parts: awnings (lift) and doors (open a crack), positions rewritten per frame ------------------------------
      const AW = 10, VPS = AW * 12 + 12 // vertices per shop
      const kPos = new Float32Array(8 * VPS * 3), kCol = new Float32Array(8 * VPS * 3)
      for (let i = 0; i < 8; i++) {
        let v = i * VPS
        for (let s = 0; s < AW; s++) {
          const base = 0.2 + 0.05 * (i % 3), c = s % 2 ? base + 0.14 : base
          for (let k = 0; k < 6; k++) { kCol.fill(c, (v + k) * 3, (v + k) * 3 + 3) } v += 6
          for (let k = 0; k < 6; k++) { kCol.fill(c * 0.6, (v + k) * 3, (v + k) * 3 + 3) } v += 6
        }
        for (let k = 0; k < 6; k++) kCol.fill(0.12, (v + k) * 3, (v + k) * 3 + 3); v += 6
        for (let k = 0; k < 6; k++) kCol.fill(0.34, (v + k) * 3, (v + k) * 3 + 3)
      }
      const kGeo = keep(geos, new THREE.BufferGeometry()), kAttr = new THREE.BufferAttribute(kPos, 3); kAttr.setUsage(THREE.DynamicDrawUsage)
      kGeo.setAttribute('position', kAttr); kGeo.setAttribute('color', new THREE.BufferAttribute(kCol, 3))
      const kin = new THREE.Mesh(kGeo, keep(mats, new THREE.ShaderMaterial({ vertexShader: VC_VS, fragmentShader: VC_FS, uniforms: { uBlock: bodyMat.uniforms.uBlock }, side: THREE.DoubleSide }))); kin.frustumCulled = false
      let kv = 0
      const quad = (a, b2, c, d) => { for (const p of [a, b2, c, a, c, d]) { kPos[kv++] = p[0]; kPos[kv++] = p[1]; kPos[kv++] = p[2] } }
      function writeKinetic(i, lift, open) {
        kv = i * VPS * 3
        const X = shopX(i), x0 = X - 1.8, dw = 3.6 / AW, yf = 2.28 + 0.3 * lift, zf = 0.8 - 0.12 * lift
        for (let s = 0; s < AW; s++) {
          const xa = x0 + s * dw, xb = xa + dw
          quad([xa, 2.6, 0.02], [xb, 2.6, 0.02], [xb, yf, zf], [xa, yf, zf])
          quad([xa, yf, zf], [xb, yf, zf], [xb, yf - 0.1, zf], [xa, yf - 0.1, zf])
        }
        const hx = X + 1.6, th = open, ex = hx - Math.cos(th) * 0.8, ez = 0.02 + Math.sin(th) * 0.8
        quad([hx, 0.02, 0.02], [ex, 0.02, ez], [ex, 2.1, ez], [hx, 2.1, 0.02])
        const ax = hx - Math.cos(th) * 0.64, az = 0.03 + Math.sin(th) * 0.64, bx = hx - Math.cos(th) * 0.16, bz = 0.03 + Math.sin(th) * 0.16
        quad([bx, 1.1, bz + 0.005], [ax, 1.1, az + 0.005], [ax, 1.9, az + 0.005], [bx, 1.9, bz + 0.005])
      }

      // ---- sign atlas: eight shop names + OPEN, one texture, one mesh -------------------------------------------------------
      const ROWS = 9, SW = 1024, RH = 128
      const signCv = document.createElement('canvas'); signCv.width = SW; signCv.height = ROWS * RH
      const sg = signCv.getContext('2d')
      SHOPS.forEach(([name, style], i) => {
        const t = ctx.text(name, style === 'caps' ? { caps: true, size: 64, color: '#ffffff' } : { size: 110, color: '#ffffff' })
        const k = Math.min((SW - 24) / t.canvas.width, (RH - 8) / t.canvas.height), w = t.canvas.width * k, h = t.canvas.height * k
        sg.drawImage(t.canvas, (SW - w) / 2, i * RH + (RH - h) / 2, w, h); t.texture.dispose()
      })
      { const t = ctx.text('open', { caps: true, size: 64, color: '#ffffff' }), k = Math.min((SW - 24) / t.canvas.width, (RH - 8) / t.canvas.height); sg.drawImage(t.canvas, (SW - t.canvas.width * k) / 2, 8 * RH + (RH - t.canvas.height * k) / 2, t.canvas.width * k, t.canvas.height * k); t.texture.dispose() }
      const signTex = keep(texs, new THREE.CanvasTexture(signCv)); signTex.generateMipmaps = false; signTex.minFilter = signTex.magFilter = THREE.LinearFilter
      const sp = new Float32Array(16 * 12), su = new Float32Array(16 * 8), sb = new Float32Array(16 * 4), si = []
      for (let i = 0; i < 8; i++) {
        const X = shopX(i)
        const rects = [[X - 1.7, 2.63, X + 1.7, 3.09, 0.16, i], [X + 0.05, 1.8, X + 0.55, 2.0, -0.1, 8]] // [x0,y0,x1,y1,z,row]
        rects.forEach(([x0, y0, x1, y1, z, row], k) => {
          const n = i * 2 + k, v0 = 1 - (row + 1) / ROWS, v1 = 1 - row / ROWS
          sp.set([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], n * 12); su.set([0, v0, 1, v0, 1, v1, 0, v1], n * 8)
          si.push(n * 4, n * 4 + 1, n * 4 + 2, n * 4, n * 4 + 2, n * 4 + 3)
        })
      }
      const sGeo = keep(geos, new THREE.BufferGeometry()), sAttr = new THREE.BufferAttribute(sb, 1); sAttr.setUsage(THREE.DynamicDrawUsage)
      sGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sGeo.setAttribute('uv', new THREE.BufferAttribute(su, 2)); sGeo.setAttribute('aB', sAttr); sGeo.setIndex(si)
      const signMat = keep(mats, new THREE.ShaderMaterial({ vertexShader: SIGN_VS, fragmentShader: SIGN_FS, uniforms: { uTex: { value: signTex }, uBlock: bodyMat.uniforms.uBlock }, transparent: true, depthWrite: false, side: THREE.DoubleSide }))
      const signs = new THREE.Mesh(sGeo, signMat); signs.frustumCulled = false; signs.renderOrder = 2
      const setSign = (i, name, open) => { for (let v = 0; v < 4; v++) { sb[(i * 2) * 4 + v] = name; sb[(i * 2 + 1) * 4 + v] = open } }

      // ---- the screens: the Works in the windows --------------------------------------------------------------------------
      const screenGeo = keep(geos, new THREE.PlaneGeometry(SCR_W, SCR_H))
      const screens = [], screensR = []
      for (let i = 0; i < 8; i++) {
        const m = keep(mats, new THREE.ShaderMaterial({ vertexShader: SCR_VS, fragmentShader: SCR_FS, uniforms: { uAtlas: { value: ctx.atlas }, uReel: { value: ctx.showreel.texture }, uRect: { value: new THREE.Vector4(...ctx.loopRect(i)) }, uB: { value: 1 }, uMix: { value: 0 } } }))
        const s = new THREE.Mesh(screenGeo, m); s.position.set(shopX(i) + SCR_DX, SCR_Y, SCR_Z); s.frustumCulled = false; screens.push(s)
      }

      // ---- ground, sky, hero text, rain, ripples ---------------------------------------------------------------------------
      const groundMat = keep(mats, new THREE.ShaderMaterial({ vertexShader: GROUND_VS, fragmentShader: GROUND_FS, uniforms: { uBlock: bodyMat.uniforms.uBlock }, transparent: true, depthWrite: false }))
      const ground = new THREE.Mesh(keep(geos, new THREE.PlaneGeometry(130, 14)), groundMat); ground.rotation.x = -Math.PI / 2; ground.position.set(12, 0, 7); ground.renderOrder = 1; ground.frustumCulled = false
      const sky = new THREE.Mesh(keep(geos, new THREE.PlaneGeometry(260, 70)), keep(mats, new THREE.ShaderMaterial({ vertexShader: GROUND_VS, fragmentShader: SKY_FS, uniforms: { uBlock: bodyMat.uniforms.uBlock } })))
      sky.position.set(12, 24, -10); sky.renderOrder = -10; sky.frustumCulled = false
      const heroMat = keep(mats, new THREE.ShaderMaterial({ vertexShader: SCR_VS, fragmentShader: HERO_FS, uniforms: { uTex: { value: null }, uA: { value: 0 } }, transparent: true, depthWrite: false }))
      const heroMesh = new THREE.Mesh(unit, heroMat); heroMesh.renderOrder = 4; heroMesh.frustumCulled = false
      const hero = { tex: null, aspect: 1, por: null }
      function buildHero(por) {
        if (hero.tex && hero.por === por) return
        if (hero.tex) { hero.tex.dispose(); texs.splice(texs.indexOf(hero.tex), 1) }
        const n = por ? 5 : 3, words = ctx.hero.split(/\s+/), target = ctx.hero.length / n, lines = []
        let cur = ''
        for (const w of words) { const nx = cur ? cur + ' ' + w : w; if (cur && nx.length > target * 1.1 && lines.length < n - 1) { lines.push(cur); cur = w } else cur = nx }
        lines.push(cur)
        const ts = lines.map((s) => ctx.text(s, { size: 160, color: '#ffffff' }))
        const cw = 1536, amax = Math.max(...ts.map((t) => t.aspect)), lh = Math.min((0.96 * cw) / amax, 250), pitch = lh * 0.76, ch = Math.round(pitch * lines.length + lh * 0.5)
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
        const g = cv.getContext('2d')
        ts.forEach((t, k) => { const wpx = t.aspect * lh; g.drawImage(t.canvas, (cw - wpx) / 2, lh * 0.25 + pitch * (k + 0.5) - lh / 2, wpx, lh); t.texture.dispose() })
        const tex = keep(texs, new THREE.CanvasTexture(cv)); tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter
        hero.tex = tex; hero.aspect = cw / ch; hero.por = por; heroMat.uniforms.uTex.value = tex
      }
      const NR = touch ? 220 : 450
      const rp = new Float32Array(NR * 6), rEnd = new Float32Array(NR * 2), rSp = new Float32Array(NR * 2)
      for (let k = 0; k < NR; k++) {
        const x = (rand() - 0.5) * 24, y = rand() * 7, z = rand() * 12 - 1, sp2 = 6 + rand() * 4
        rp.set([x, y, z, x, y, z], k * 6); rEnd[k * 2] = 0; rEnd[k * 2 + 1] = 1; rSp[k * 2] = rSp[k * 2 + 1] = sp2
      }
      const rGeo = keep(geos, new THREE.BufferGeometry())
      rGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rGeo.setAttribute('aEnd', new THREE.BufferAttribute(rEnd, 1)); rGeo.setAttribute('aSp', new THREE.BufferAttribute(rSp, 1))
      const rainU = { uT: { value: 0 }, uA: { value: 0 } }
      const rain = new THREE.LineSegments(rGeo, keep(mats, new THREE.ShaderMaterial({ vertexShader: RAIN_VS, fragmentShader: RAIN_FS, uniforms: rainU, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })))
      rain.frustumCulled = false; rain.renderOrder = 6
      const NRIP = 48, ripP = new Float32Array(NRIP * 12), ripUv = new Float32Array(NRIP * 8), ripT = new Float32Array(NRIP * 4).fill(-9), ripI = []
      for (let k = 0; k < NRIP; k++) { ripUv.set(UV, k * 8); ripI.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3) }
      const ripGeo = keep(geos, new THREE.BufferGeometry()), ripPA = new THREE.BufferAttribute(ripP, 3), ripTA = new THREE.BufferAttribute(ripT, 1)
      ripPA.setUsage(THREE.DynamicDrawUsage); ripTA.setUsage(THREE.DynamicDrawUsage)
      ripGeo.setAttribute('position', ripPA); ripGeo.setAttribute('uv', new THREE.BufferAttribute(ripUv, 2)); ripGeo.setAttribute('aT', ripTA); ripGeo.setAttribute('aC', new THREE.BufferAttribute(new Float32Array(NRIP * 8), 2)); ripGeo.setIndex(ripI)
      const ripU = { uT: { value: 0 } }
      const ripples = new THREE.Mesh(ripGeo, keep(mats, new THREE.ShaderMaterial({ vertexShader: RIP_VS, fragmentShader: RIP_FS, uniforms: ripU, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })))
      ripples.frustumCulled = false; ripples.renderOrder = 3
      let ripN = 0, ripClock = 0
      function ripple(x, z, R, now) {
        const k = ripN++ % NRIP
        ripP.set([x - R, 0.02, z + R, x + R, 0.02, z + R, x + R, 0.02, z - R, x - R, 0.02, z - R], k * 12)
        ripT[k * 4] = ripT[k * 4 + 1] = ripT[k * 4 + 2] = ripT[k * 4 + 3] = now
        ripPA.needsUpdate = true; ripTA.needsUpdate = true
      }

      // ---- people (silhouettes on the far pavement) ------------------------------------------------------------------------
      const pb = Builder()
      pb.geo(cyl(0.2, 0.75, 8), 0, 0.95, 0, 1, 1, 0.7, 0.03); pb.geo(cyl(0.09, 0.6, 6), -0.09, 0.3, 0, 1, 1, 1, 0.025); pb.geo(cyl(0.09, 0.6, 6), 0.09, 0.3, 0, 1, 1, 1, 0.025); pb.geo(sph(0.12, 7), 0, 1.5, 0, 1, 1.1, 1, 0.03)
      const personGeo = keep(geos, pb.geometry())
      const person = new THREE.Mesh(personGeo, bodyMat); person.visible = false; person.frustumCulled = false
      let ppl = { on: false, x: 0, dir: 1, next: 7 }

      // ---- mirror: a flipped dim copy under the wet ground (the dark glass over it does the dimming) --------------------------
      const mirror = new THREE.Group(); mirror.scale.y = -1
      const dup = (m, order) => { const c = new THREE.Mesh(m.geometry, m.material); c.frustumCulled = false; if (order !== undefined) c.renderOrder = order; return c }
      const mBody = dup(body), mKin = dup(kin), mSigns = dup(signs, 0), mGlows = dup(glows, 0), mPerson = dup(person)
      const mScreens = screens.map((s) => dup(s))
      mirror.add(mBody, mKin, mSigns, mGlows, mPerson, ...mScreens)
      scene.add(sky, body, kin, signs, ...screens, ground, glows, heroMesh, rain, ripples, person, mirror)

      // ---- hover tags: HUD children of the camera, in px ---------------------------------------------------------------------
      const hud = new THREE.Group(); camera.add(hud); hud.position.z = -2
      const PAD = 16
      const mkText = (str, opts) => {
        const t = ctx.text(str, opts); texs.push(t.texture)
        const m = keep(mats, new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false }))
        const mesh = new THREE.Mesh(unit, m); mesh.renderOrder = 61
        return { mesh, mat: m, canvas: t.canvas }
      }
      const tags = works.map((w, i) => {
        const title = mkText(w.title, { size: 120 }), meta = mkText(`${w.kind} · ${w.year}`, { caps: true, size: 28, color: '#8f8f8f' }), shop = mkText(SHOPS[i][0], { caps: true, size: 24, color: '#8f8f8f' })
        const plateMat = keep(mats, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false }))
        const plate = new THREE.Mesh(unit, plateMat); plate.renderOrder = 60
        const group = new THREE.Group(); group.visible = false
        group.add(plate, title.mesh, meta.mesh, shop.mesh); hud.add(group)
        return { group, plate, plateMat, title, meta, shop, wpx: 0, hpx: 0 }
      })
      const layoutTags = () => {
        const tfp = clamp(size.w * 0.05, 34, 80), mfp = clamp(size.w * 0.011, 13, 18)
        tags.forEach((t) => {
          let tf = tfp / 120, mf = mfp / 28, sf = mfp / 24 * 0.9
          const dims = () => [t.title.canvas.width * tf, t.title.canvas.height * tf, t.meta.canvas.width * mf, t.meta.canvas.height * mf, t.shop.canvas.width * sf, t.shop.canvas.height * sf]
          let [tw, th, mw, mh, sw, sh] = dims()
          const k = (size.w - 64) / (Math.max(tw, mw, sw) + PAD * 2)
          if (k < 1) { tf *= k; mf *= k; sf *= k; [tw, th, mw, mh, sw, sh] = dims() }
          const pw = Math.max(tw, mw, sw) + PAD * 2, ph = th * 0.82 + mh * 0.9 + sh * 0.9 + PAD * 2 + 6
          t.wpx = pw; t.hpx = ph
          t.plate.scale.set(pw, ph, 1); t.title.mesh.scale.set(tw, th, 1); t.meta.mesh.scale.set(mw, mh, 1); t.shop.mesh.scale.set(sw, sh, 1)
          const pT = Math.ceil(120 * 0.18) * tf, pM = Math.ceil(28 * 0.18) * mf, pS = Math.ceil(24 * 0.18) * sf
          t.title.mesh.position.set(-pw / 2 + PAD + tw / 2 - pT, ph / 2 - PAD - th / 2 + 3, 0.01)
          t.meta.mesh.position.set(-pw / 2 + PAD + mw / 2 - pM, -ph / 2 + PAD + sh * 0.9 + 6 + mh / 2, 0.01)
          t.shop.mesh.position.set(-pw / 2 + PAD + sw / 2 - pS, -ph / 2 + PAD + sh / 2 - 1, 0.01)
        })
      }

      // ---- poses -----------------------------------------------------------------------------------------------------------
      const pB = { x: 0, y: 0, z: 0, rx: 0, ry: 0 }, pH = { x: 0, y: 0, z: 0, rx: 0, ry: 0 }, pI = { x: 0, y: 0, z: 0, rx: 0, ry: 0 }, pF = { x: 0, y: 0, z: 0, rx: 0, ry: 0 }, pR = { x: 0, y: 0, z: 0, rx: 0, ry: 0 }, pO = { x: 0, y: 0, z: 0, rx: 0, ry: 0 }
      const mixP = (o, a, c, k) => { o.x = lerp(a.x, c.x, k); o.y = lerp(a.y, c.y, k); o.z = lerp(a.z, c.z, k); o.rx = lerp(a.rx, c.rx, k); o.ry = lerp(a.ry, c.ry, k); return o }
      const HOVER_S = 1.45, HOVER_Z = 0.5 // the screen grows to this scale and steps out of the window by this much
      function hoverPose(o, i) {
        const asp = size.w / size.h, por = asp < 0.9, W = SCR_W * HOVER_S, sz = SCR_Z + HOVER_Z
        const D = W / (2 * (por ? 0.8 : 0.36) * TAN * asp), nx = por ? 0 : -0.2, ny = por ? 0.24 : 0.04, hH = D * TAN, hW = hH * asp
        o.x = shopX(i) + SCR_DX - nx * hW; o.y = SCR_Y - ny * hH; o.z = sz + D; o.rx = 0; o.ry = 0
      }
      function fillPose(o, i, scale, z) {
        const asp = size.w / size.h, D = Math.min((0.92 * SCR_W * scale) / (2 * TAN * asp), (0.92 * SCR_H * scale) / (2 * TAN))
        o.x = shopX(i) + SCR_DX; o.y = SCR_Y; o.z = z + D; o.rx = 0; o.ry = 0
      }
      // pointer ray against a vertical plane z = zp and the ground
      const v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3()
      let hx = 0, hy = 0, hit = false
      function rayPlane(nx, ny, zp) {
        v3.set(nx, ny, 0.5).unproject(camera); v3.sub(camera.position)
        if (v3.z >= -1e-6) { hit = false; return }
        const tt = (zp - camera.position.z) / v3.z; hx = camera.position.x + v3.x * tt; hy = camera.position.y + v3.y * tt; hit = tt > 0
      }
      function pick(nx, ny, stickIdx) { // -> shop index whose SCREEN is under the pointer
        rayPlane(nx, ny, SCR_Z + HOVER_Z * (stickIdx >= 0 ? hv[stickIdx] : 0))
        if (!hit) return -1
        const i = Math.round((hx - SCR_DX) / PITCH); if (i < 0 || i > 7) return -1
        const m = i === stickIdx ? 1.5 : 1.0, sc = 1 + (HOVER_S - 1) * hv[i]
        return Math.abs(hx - (shopX(i) + SCR_DX)) < (SCR_W * sc * m) / 2 + 0.05 && Math.abs(hy - SCR_Y) < (SCR_H * sc * m) / 2 + 0.05 ? i : -1
      }
      function lookAt(nx, ny) { // which shopfront the pointer is over (looser than the screen)
        rayPlane(nx, ny, 0)
        if (!hit) return -1
        const i = Math.round(hx / PITCH); if (i < 0 || i > 7) return -1
        return Math.abs(hx - shopX(i)) < SHOP_W / 2 && hy > 0 && hy < 3.4 ? i : -1
      }

      // ---- moments ---------------------------------------------------------------------------------------------------------
      function startOpening() {
        S.opening = true; S.open = 1; S.block = 0; S.rain = 0; S.mix0 = 1; shopOn.fill(0); shopOn[0] = 1; lampOn.fill(0)
        tl = gsap.timeline({ onComplete: () => { S.opening = false } })
        tl.to(S, { open: 0, duration: 2.5, ease: 'power3.inOut' }, 0.3)
        tl.to(S, { mix0: 0, duration: 1.3, ease: 'power1.inOut' }, 1.3)
        tl.to(S, { block: 1, duration: 1.8, ease: 'power1.inOut' }, 0.8)
        tl.to(S, { rain: 1, duration: 1.6, ease: 'power1.in' }, 1.2)
        for (let i = 1; i < 8; i++) { // a shop light flickers on: up, down, up
          const at = 1.2 + i * 0.13
          tl.to(shopOn, { [i]: 0.6, duration: 0.12, ease: 'none' }, at); tl.to(shopOn, { [i]: 0.15, duration: 0.1, ease: 'none' }, at + 0.12); tl.to(shopOn, { [i]: 1, duration: 0.3, ease: 'power2.out' }, at + 0.22)
        }
        for (let k = 0; k < 7; k++) tl.to(lampOn, { [k]: 1, duration: 0.5, ease: 'power2.out' }, 2.6 + k * 0.28) // hero lamp, then down the street
      }
      function skipOpening() { if (tl) { tl.progress(1); tl = null } S.opening = false; S.open = 0; S.block = 1; S.rain = 1; S.mix0 = 0; shopOn.fill(1); lampOn.fill(1) }
      function hoverTo(i) {
        if (i === S.hot) return
        S.hot = i; if (i >= 0) S.last = i
        if (hoverOn !== (i >= 0)) { hoverOn = i >= 0; ctx.cursor.hover(hoverOn) }
      }
      function flyTo(i) {
        if (S.flying || S.opening || i < 0) return
        S.flying = true; S.last = i; S.hot = i; hoverOn = false; ctx.cursor.hover(false)
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        flyTl.to(S, { f: 1, duration: 0.85, ease: 'power3.in' }, 0)
        flyTl.to(ctx.crt, { push: 0.45, duration: 0.3, ease: 'power2.out' }, 0.1)
        flyTl.to(ctx.crt, { push: 0, duration: 0.5 }, 0.45)
      }

      // ---- resize ----------------------------------------------------------------------------------------------------------
      function resize(w, h) {
        const asp = w / h, por = asp < 0.9
        camera.aspect = asp; camera.updateProjectionMatrix()
        hud.scale.setScalar((2 * 2 * TAN) / h)
        buildHero(por)
        const ww = por ? 2.7 : 5.4; heroMesh.scale.set(ww, ww / hero.aspect, 1); heroMesh.position.set(-6.6, por ? 2.75 : 2.6, 0.04)
        layoutTags()
      }

      // ---- update ----------------------------------------------------------------------------------------------------------
      const tmpV = new THREE.Vector3()
      function update(t, dt) {
        dt = clamp(dt, 0.0001, 0.05)
        const w = size.w, h = size.h, asp = w / h, reduced = ctx.reduced
        if (!t0) t0 = t
        const tt = reduced ? 0 : t - t0
        // walk: scroll maps to a position along the pavement (clamped at both ends), weighted
        const sT = clamp(ctx.scroll.y / 4200, 0, 1)
        sSm += (sT - sSm) * (1 - Math.exp(-dt * 2.6))
        const nx = P.inside || P.down ? P.nx : 0, ny = P.inside || P.down ? P.ny : 0
        pxS += (nx - pxS) * (1 - Math.exp(-dt * 3.5)); pyS += (ny - pyS) * (1 - Math.exp(-dt * 3.5))
        pB.x = lerp(XS(), XE, sSm); pB.y = CAM_Y + pyS * 0.05; pB.z = CAM_Z; pB.rx = pyS * 0.12 - 0.02; pB.ry = -0.2 - pxS * 0.17
        // hover amounts per shop (smoothed), blended into the pose
        pH.x = pB.x; pH.y = pB.y; pH.z = pB.z; pH.rx = pB.rx; pH.ry = pB.ry
        mixP(pO, pB, pB, 0)
        for (let i = 0; i < 8; i++) {
          hv[i] += ((S.hot === i ? 1 : 0) - hv[i]) * (1 - Math.exp(-dt * (S.hot === i ? 5 : 6)))
          if (hv[i] > 0.0005) { hoverPose(pI, i); const k = hv[i] * hv[i] * (3 - 2 * hv[i]); mixP(pO, pO, pI, k) }
        }
        const hot = clamp(S.last, 0, 7)
        fillPose(pF, hot, HOVER_S, SCR_Z + HOVER_Z); fillPose(pR, 0, 1, SCR_Z)
        let hAmt = 0; for (let i = 0; i < 8; i++) hAmt = Math.max(hAmt, hv[i])
        const fk = S.f * S.f * (3 - 2 * S.f)
        mixP(pO, pO, pF, fk); mixP(pO, pO, pR, S.open)
        camera.position.set(pO.x, pO.y, pO.z); camera.rotation.set(pO.rx, pO.ry, 0); camera.updateMatrixWorld()

        // pointer: hover on a screen, or "look" at a shopfront; puddles ripple under it
        const live = !S.opening && !S.flying && !reduced && P.inside && !(touch && !P.down)
        if (live) {
          const k = pick(P.nx, P.ny, S.hot)
          if (k >= 0 && k === S.hot) { cand = k; dwell = 1 } else { if (k !== cand) { cand = k; dwell = 0 } else dwell += dt; if (k >= 0 && dwell > 0.1) hoverTo(k); else if (k < 0 && S.hot >= 0 && focusI < 0) hoverTo(-1) }
          look = S.hot >= 0 ? S.hot : lookAt(P.nx, P.ny)
          ripClock -= dt
          if (Math.hypot(P.dx, P.dy) > 2 && ripClock < 0) { v3.set(P.nx, P.ny, 0.5).unproject(camera); v3.sub(camera.position); if (v3.y < -1e-4) { const k2 = -camera.position.y / v3.y; const gx = camera.position.x + v3.x * k2, gz = camera.position.z + v3.z * k2; if (gz > 0.3 && gz < 12) { ripple(gx, gz, 0.55, tt); ripClock = 0.09 } } }
        } else if (!S.flying && !S.opening) { look = -1; if (focusI >= 0) hoverTo(focusI); else if (S.hot >= 0 && !touch) hoverTo(-1) }
        if (focusI >= 0 && !live && !S.flying) hoverTo(focusI)
        // rain on the road: ripples at random
        if (!reduced) { ripClock -= 0; const n = Math.floor(dt * 9 + Math.random()); for (let k = 0; k < n; k++) ripple(pO.x - 7 + Math.random() * 16, 1.8 + Math.random() * 4.4, 0.3 + Math.random() * 0.2, tt) }

        // energies + the things that answer
        const dimN = 1 - 0.55 * hAmt
        for (let i = 0; i < 8; i++) {
          const target = S.hot === i ? 1 : look === i ? 0.5 : 0
          en[i] += (target - en[i]) * (1 - Math.exp(-dt * 5))
          const own = S.hot === i ? 1 : dimN, on = shopOn[i], pulse = 0.55 + 0.45 * Math.sin(tt * 1.6 + i * 1.3)
          setQ(iWin[i], on * own * (0.75 + 0.25 * en[i])); setQ(iDoorIn[i], on * own * (0.45 + 0.9 * en[i])); setQ(iSpill[i], on * own * (0.55 + 0.8 * en[i]))
          setQ(iDoor[i], on * own * (0.1 + 1.0 * en[i])); setQ(iSignHalo[i], on * own * (0.25 + 0.7 * en[i]))
          setSign(i, on * own * (0.8 + 0.7 * en[i]), on * own * (0.35 + 0.65 * pulse))
          writeKinetic(i, en[i] * 0.9, 0.04 + 0.32 * en[i])
          // screen: grows out of the window while hovered
          const s = screens[i], k = hv[i] * hv[i] * (3 - 2 * hv[i]), sc = 1 + (HOVER_S - 1) * k
          s.scale.set(sc, sc, 1); s.position.set(shopX(i) + SCR_DX, SCR_Y + 0.06 * k, SCR_Z + HOVER_Z * k)
          s.material.uniforms.uB.value = (S.hot === i ? 1 : 0.95 * dimN) * clamp(on * 3, 0, 1)
          s.material.uniforms.uMix.value = i === 0 ? S.mix0 : 0
          mScreens[i].position.copy(s.position); mScreens[i].scale.copy(s.scale)
        }
        // lamps: hero bracket (0), the four far lamps (1-4), string lights; flicker-free slow breathing
        setQ(iHead[0], lampOn[0]); setQ(iWash, lampOn[0] * (1 - 0.5 * hAmt))
        for (let k = 0; k < 4; k++) { const l = lampOn[k + 1] * (1 - 0.35 * hAmt); setQ(iHead[k + 1], l); setQ(iCone[k], l); setQ(iPool[k], l * 0.9) }
        const bl = lampOn[5] * (1 - 0.4 * hAmt); for (const n of iBulb) setQ(n, bl)
        // passing car light and people
        if (!reduced) {
          const swT = (tt % 19) / 3, sw = swT < 1
          glowU.uSwA.value = sw ? Math.sin(swT * Math.PI) : 0; glowU.uSwX.value = pB.x - 14 + swT * 32
          ppl.next -= dt
          if (!ppl.on && ppl.next < 0 && !S.opening) { ppl.on = true; ppl.dir = Math.random() < 0.5 ? -1 : 1; ppl.x = pB.x + ppl.dir * -9; ppl.next = 9 + Math.random() * 8 }
          if (ppl.on) { ppl.x += ppl.dir * 1.2 * dt; if (Math.abs(ppl.x - pB.x) > 11) ppl.on = false }
        }
        setQ(iSweep, 1)
        qbAttr.needsUpdate = true; sAttr.needsUpdate = true; kAttr.needsUpdate = true
        person.visible = mPerson.visible = ppl.on
        if (ppl.on) { const bob = Math.abs(Math.sin(tt * 6)) * 0.03; person.position.set(ppl.x, bob, 1.05); person.rotation.z = Math.sin(tt * 6) * 0.03; person.rotation.y = ppl.dir > 0 ? 0 : Math.PI; mPerson.position.copy(person.position); mPerson.rotation.copy(person.rotation) }
        // uniforms
        const blk = S.block
        bodyMat.uniforms.uBlock.value = blk; glowU.uBlock.value = blk; glowU.uT.value = tt; rainU.uT.value = tt; ripU.uT.value = tt
        rainU.uA.value = S.rain * (1 - 0.8 * fk); rain.position.x = pO.x
        heroMat.uniforms.uA.value = (0.25 + 0.75 * lampOn[0]) * blk * (1 - hAmt) * (1 - fk)

        // tag beside the hovered screen
        for (let k = 0; k < 8; k++) tags[k].group.visible = k === hot && hAmt > 0.02 && fk < 0.2
        const tg = tags[hot]
        if (tg.group.visible) {
          const sc = screens[hot]
          v3.copy(sc.position).project(camera); v4.set(sc.position.x + (SCR_W * sc.scale.x) / 2, sc.position.y, sc.position.z).project(camera); v5.set(sc.position.x, sc.position.y - (SCR_H * sc.scale.y) / 2, sc.position.z).project(camera)
          const cxp = (v3.x * 0.5 + 0.5) * w, cyp = (0.5 - v3.y * 0.5) * h, hwp = Math.abs(v4.x - v3.x) * 0.5 * w, hhp = Math.abs(v3.y - v5.y) * 0.5 * h
          let tx, ty
          if (asp < 0.9) { tx = clamp(cxp, 16 + tg.wpx / 2, w - 16 - tg.wpx / 2); ty = cyp + hhp + 16 + tg.hpx / 2 }
          else { tx = clamp(cxp + hwp + 28 + tg.wpx / 2, 16 + tg.wpx / 2, w - 16 - tg.wpx / 2); ty = cyp }
          tg.group.position.set(tx - w / 2, h / 2 - ty, 0)
          const a = hAmt * hAmt; tg.plateMat.opacity = 0.5 * a; tg.title.mat.opacity = a; tg.meta.mat.opacity = a; tg.shop.mat.opacity = a
        }
        ctx.crt.glow = 0.7
      }

      // ---- go --------------------------------------------------------------------------------------------------------------
      resize(Math.max(size.w, 2), Math.max(size.h, 2))
      if (ctx.reduced) { S.open = 0; S.block = 1; S.rain = 1; S.mix0 = 0; sSm = 0 } else startOpening()
      shopOn.forEach((_, i) => writeKinetic(i, 0, 0.04))

      return {
        scene, camera, update, resize,
        tap() {
          if (S.opening) { skipOpening(); return }
          if (S.flying) return
          let i = S.hot
          if (i < 0 || touch) i = pick(P.nx, P.ny, -1)
          if (i >= 0) flyTo(i)
        },
        focus(i) { focusI = i },
        activate(i) { if (S.opening) skipOpening(); if (!S.flying) flyTo(i) },
        back() {
          if (flyTl) flyTl.kill()
          if (backTw) backTw.kill()
          backTw = gsap.to(S, { f: 0, duration: 0.8, ease: 'power3.inOut', onComplete: () => { S.flying = false; focusI = -1 } })
        },
        dispose() {
          if (tl) tl.kill(); if (flyTl) flyTl.kill(); if (backTw) backTw.kill()
          gsap.killTweensOf(S); gsap.killTweensOf(shopOn); gsap.killTweensOf(lampOn); gsap.killTweensOf(ctx.crt)
          ctx.cursor.hover(false)
          geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((x) => x.dispose())
          scene.remove(camera)
        },
      }
    },
  })

  // what sits in each shop window, by kind (simple shapes, fake)
  function shopDisplay(b, X, kind, r) {
    const z = -0.85
    if (kind === 'cafe') { for (const dx of [-1.15, 0.2]) { b.geo(cyl(0.2, 0.03, 12), X + dx, 0.68, z, 1, 1, 1, 0.4); b.geo(cyl(0.025, 0.18, 6), X + dx, 0.58, z, 1, 1, 1, 0.3); b.geo(cyl(0.045, 0.07, 8, 0.035), X + dx + 0.06, 0.74, z, 1, 1, 1, 0.5); b.geo(sph(0.09, 7), X + dx + 0.1, 2.15, z, 1, 1, 1, 0.5); b.box(X + dx + 0.1, 2.3, z, 0.01, 0.2, 0.01, 0.2) } }
    else if (kind === 'barber') { b.box(X - 1.2, 0.68, z, 0.4, 0.08, 0.4, 0.3); b.box(X - 1.2, 0.95, z - 0.18, 0.4, 0.5, 0.06, 0.28); b.box(X - 1.2, 0.5, z, 0.08, 0.35, 0.08, 0.2); b.box(X + 0.1, 1.9, z - 0.3, 0.5, 0.5, 0.04, 0.5)
      for (let k = 0; k < 5; k++) b.geo(cyl(0.06, 0.2, 8), X + 1.72, 0.9 + k * 0.2, 0.15, 1, 1, 1, k % 2 ? 0.55 : 0.18) }
    else if (kind === 'bakery') { b.box(X - 0.5, 0.75, z, 1.9, 0.04, 0.4, 0.3); for (let k = 0; k < 5; k++) b.geo(sph(0.1, 7), X - 1.2 + k * 0.4, 0.84, z + (k % 2) * 0.05, 1.6, 0.8, 0.9, 0.5); b.geo(cyl(0.18, 0.15, 10, 0.14), X + 0.35, 0.58, z, 1, 1, 1, 0.3) }
    else if (kind === 'florist') { for (let k = 0; k < 3; k++) { const x = X - 1.25 + k * 0.65; b.geo(cyl(0.13, 0.28, 9, 0.1), x, 0.64, z, 1, 1, 1, 0.3); for (let s = 0; s < 3; s++) { const dx = (s - 1) * 0.07; b.geo(cyl(0.008, 0.4, 4), x + dx, 0.95, z, 1, 1, 1, 0.2); b.geo(sph(0.065, 6), x + dx * 1.6, 1.18 + (s % 2) * 0.05, z, 1, 1, 1, 0.55) } } }
    else if (kind === 'bike') { for (const dx of [-1.2, -0.45]) b.geo(new THREE.TorusGeometry(0.29, 0.02, 5, 16), X + dx, 0.82, z, 1, 1, 1, 0.3); b.box(X - 0.83, 0.98, z, 0.7, 0.025, 0.025, 0.35); b.box(X - 0.7, 0.9, z, 0.025, 0.3, 0.025, 0.35); b.box(X - 1.0, 1.1, z, 0.1, 0.03, 0.03, 0.35) }
    else if (kind === 'records') { for (let k = 0; k < 2; k++) b.box(X - 1.15 + k * 0.7, 0.65, z, 0.55, 0.25, 0.35, 0.22); for (let k = 0; k < 7; k++) b.box(X - 1.35 + k * 0.1 + (k % 2) * 0.01, 0.9, z - 0.05, 0.05, 0.28, 0.28, 0.2 + (k % 3) * 0.1) }
    else if (kind === 'gym') { for (const dx of [-1.2, -0.4]) { b.geo(cyl(0.025, 0.4, 6).rotateZ(Math.PI / 2), X + dx, 0.62, z, 1, 1, 1, 0.3); for (const e of [-0.2, 0.2]) b.geo(cyl(0.09, 0.05, 10).rotateZ(Math.PI / 2), X + dx + e, 0.62, z, 1, 1, 1, 0.26) } b.geo(sph(0.13, 8), X + 0.3, 0.68, z, 1, 1, 1, 0.3); b.box(X + 0.3, 0.84, z, 0.12, 0.03, 0.03, 0.3) }
    else { b.geo(sph(0.13, 8), X - 1.0, 0.68, z, 1, 1, 1, 0.5); b.geo(cyl(0.035, 0.12, 6), X - 1.05, 0.55, z, 1, 1, 1, 0.45); b.geo(cyl(0.035, 0.12, 6), X - 0.95, 0.55, z, 1, 1, 1, 0.45); b.box(X + 0.1, 0.7, z, 0.4, 0.08, 0.4, 0.3); b.box(X + 0.1, 0.95, z - 0.18, 0.4, 0.5, 0.06, 0.28) }
  }
})()
