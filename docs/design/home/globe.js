// THROWAWAY prototype 'Globe'. Contract: docs/design/home/CONTRACT.md.
// A planet tiled with screens: eight bright continents (each a mosaic of one Work's loop), dim filler, the Showreel as a glowing core.
;(function () {
  'use strict'
  const R = 5, RC = R * 0.86, WC = 3.6, CC = 6, CR = 3, LIFTH = 2.2, FOV = 55, RR = R * 1.55
  const TAN = Math.tan((FOV * Math.PI) / 360)
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))
  const rng = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

  // ---- the tiles: shatter-in, magnet bulge, hover lift (a whole continent flattens, rises and faces the camera) ----
  const TILE_VS = `
    attribute vec3 aDir; attribute vec3 aRight; attribute vec4 aInfo; attribute vec4 aRect; attribute vec3 aC; attribute vec2 aXY;
    uniform float uR, uRC, uTime, uShatter, uSpeed, uPtrAmt, uLiftH;
    uniform float uHv[8];
    uniform vec3 uPtr, uCamR, uCamU, uCamN;
    varying vec2 vUv; varying vec4 vRect; varying float vE; varying vec3 vN; varying vec3 vL; varying vec3 vW;
    varying float vSeed, vWork, vHov, vInfl;
    void main(){
      float wi = aInfo.x, seed = aInfo.w;
      float e = clamp(uShatter * 1.7 - seed * .7, 0., 1.);
      float em = e - 1.;
      float eb = 1. + 2.70158 * em * em * em + 1.70158 * em * em;
      vec3 n = aDir;
      float cs = dot(n, uPtr);
      float infl = smoothstep(.86, 1., cs) * uPtrAmt;
      float hvv = 0.;
      if (wi > -.5) { hvv = uHv[int(wi + .5)]; hvv = hvv * hvv * (3. - 2. * hvv); }
      float lift = .04 * sin(uTime * .8 + seed * 40. + n.y * 3.) + infl * .8 + uSpeed * .2 * sin(n.y * 8. - uTime * 5. + seed * 3.) + (wi > -.5 ? .05 : 0.);
      vec3 curved = n * (uR + lift);
      vec3 flatP = aC * (uR + uLiftH) + (uCamR * aXY.x + uCamU * aXY.y) * 1.18;
      vec3 endP = mix(curved, flatP, hvv);
      vec3 tl = uPtr - n * cs;
      vec3 n2 = normalize(mix(normalize(n + tl * infl * .8), uCamN, hvv));
      vec3 r = normalize(mix(aRight, uCamR, hvv));
      r = normalize(r - n2 * dot(r, n2));
      float ang = (seed - .5) * 10. * (1. - clamp(eb, 0., 1.));
      vec3 r3 = r * cos(ang) + cross(n2, r) * sin(ang);
      vec3 u3 = cross(n2, r3);
      float sc = smoothstep(0., .25, e) * (1. + .18 * hvv + .15 * infl);
      vec3 o = (r3 * position.x * aInfo.y + u3 * position.y * aInfo.z) * sc;
      vec3 start = n * uRC;
      vec3 ctrl = n * (uR * 2.1) + (vec3(fract(seed * 17.3), fract(seed * 91.7), fract(seed * 53.1)) - .5) * 7.;
      vec3 pos = mix(mix(start, ctrl, eb), mix(ctrl, endP, eb), eb);
      vec3 local = pos + o;
      vec4 w = modelMatrix * vec4(local, 1.);
      vW = w.xyz; vL = normalize(local); vN = normalize(mat3(modelMatrix) * n2);
      vUv = position.xy + .5; vRect = aRect; vE = e; vSeed = seed; vWork = wi; vHov = hvv; vInfl = infl;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`
  const TILE_FS = `
    uniform sampler2D tAtlas, tReel; uniform float uTime;
    varying vec2 vUv; varying vec4 vRect; varying float vE; varying vec3 vN; varying vec3 vL; varying vec3 vW;
    varying float vSeed, vWork, vHov, vInfl;
    void main(){
      vec3 loop = texture2D(tAtlas, vRect.xy + vUv * vRect.zw).rgb;
      vec2 ruv = vec2(atan(vL.x, vL.z) / 6.2831853 + .5, asin(clamp(vL.y, -1., 1.)) / 3.14159265 + .5);
      vec3 reel = texture2D(tReel, ruv).rgb;
      float k = smoothstep(.55, .9, vE);
      vec3 c = mix(reel, loop, k);
      c = pow(c, vec3(.85)) * 1.12;
      bool isWork = vWork > -.5;
      float br = isWork ? 1. : .62 * (.85 + .15 * sin(uTime * (.7 + vSeed) + vSeed * 60.));
      br += vHov * .15 + vInfl * .55;
      vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
      float lit = .62 + .5 * max(dot(N, normalize(vec3(-.4, .5, .8))), 0.);
      float rim = pow(1. - max(dot(N, V), 0.), 3.);
      c = c * br * lit + vec3(rim) * (isWork ? .12 : .08);
      float b = min(min(vUv.x, 1. - vUv.x) * 1.5, min(vUv.y, 1. - vUv.y) * 1.5);
      c = mix(c, vec3(.9), (1. - smoothstep(.01, .035, b)) * (isWork ? .5 : .22) * k);
      gl_FragColor = vec4(min(c, vec3(1.)), 1.);
    }`
  // ---- the core: starts as the flat full-screen Showreel, curls into a sphere ------------------------------
  const CORE_VS = `
    uniform float uW, uRC, uReelDist; uniform vec2 uReel; uniform mat4 uCam;
    varying vec2 vUv; varying vec3 vL;
    void main(){
      vec2 uv = position.xy + .5;
      float lon = (uv.x - .5) * 6.2831853, lat = (uv.y - .5) * 3.14159265;
      vec3 dir = vec3(sin(lon) * cos(lat), sin(lat), cos(lon) * cos(lat));
      vec3 wsph = (modelMatrix * vec4(dir * uRC, 1.)).xyz;
      vec3 flatW = (uCam * vec4((uv.x - .5) * uReel.x, (uv.y - .5) * uReel.y, -uReelDist, 1.)).xyz;
      float wv = clamp(uW * 1.7 - uv.x * .7, 0., 1.);
      wv = wv * wv * wv * (wv * (wv * 6. - 15.) + 10.);
      vL = dir; vUv = uv;
      gl_Position = projectionMatrix * viewMatrix * vec4(mix(flatW, wsph, wv), 1.);
    }`
  const CORE_FS = `
    uniform sampler2D tReel; uniform float uSettle, uGlow, uPtrAmt; uniform vec3 uPtr;
    varying vec2 vUv; varying vec3 vL;
    void main(){
      vec3 c = pow(texture2D(tReel, vUv).rgb, vec3(.85)) * 1.1;
      float pr = smoothstep(.6, 1., dot(normalize(vL), uPtr)) * uPtrAmt;
      c *= mix(1., .25 + .12 * uGlow + .5 * pr, uSettle);
      gl_FragColor = vec4(min(c, vec3(1.)), 1.);
    }`
  const HALO_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`
  const HALO_FS = `
    uniform float uOp; varying vec2 vUv;
    void main(){ float r = length(vUv - .5) * 2.; float a = pow(smoothstep(1., .6, r), 2.) * .2 * uOp; gl_FragColor = vec4(vec3(.93) * a, a); }`
  const RING_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`
  const RING_FS = `
    uniform sampler2D tMap; uniform float uOp, uCopies; varying vec2 vUv;
    void main(){
      float u = gl_FrontFacing ? vUv.x : 1. - vUv.x;
      vec4 t = texture2D(tMap, vec2(fract(u * uCopies), vUv.y));
      float edge = 1. - smoothstep(0., .05, min(vUv.y, 1. - vUv.y));
      vec3 c = mix(vec3(0.), t.rgb, t.a); c = mix(c, vec3(.93), edge * .35);
      float a = max(max(.55, t.a), edge * .7);
      gl_FragColor = vec4(c, a * uOp);
    }`
  const BEAM_VS = `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`
  const BEAM_FS = `
    uniform float uTime; varying float vY;
    void main(){ float a = ((1. - vY) * .5 + .1) * (.75 + .25 * sin(vY * 30. - uTime * 5.)); gl_FragColor = vec4(vec3(.93) * a, a); }`
  const PULSE_VS = `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`
  const PULSE_FS = `
    uniform float uTime; varying vec3 vP;
    void main(){ float r = length(vP.xz); float a = max(0., 1. - abs(r - .37) / .13) * .7 * (.7 + .3 * sin(uTime * 3.)); gl_FragColor = vec4(vec3(.93) * a, a); }`

  HOME.register({
    name: 'Globe',
    create(ctx) {
      const P = ctx.pointer, scroll = ctx.scroll, crt = ctx.crt
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(FOV, 1.6, 0.05, 200)
      scene.add(camera)
      const planet = new THREE.Group(); scene.add(planet)
      let yaw = -0.35, pitch = 0.45, ya = 0, yt = 0, pa = 0, pt = 0, entered = false
      const geos = [], mats = [], texs = []
      const mat = (m) => (mats.push(m), m)
      const geo = (g) => (geos.push(g), g)
      let pxH = 800, aspect = 1.6, dFar = 12, dNear = R + 2.3, disposed = false

      const S = { w: 0, sh: 0, pulse: 0, ring: 0, fly: 0, turn: 0 }
      const hv = new Float32Array(8)
      const tls = [], tms = []
      let zs = 0, ez = 0, speed = 0, psx = 0, psy = 0, wx = 0, wy = 0, prevScroll = 0
      let ptrAmt = 0, hovIdx = -1, focusIdx = -1, forced = -1, sel = -1, lastSel = -1, busy = false, diving = false

      // ---- planet-space helpers, allocated once ----------------------------------------------------
      const V3 = THREE.Vector3, Q = THREE.Quaternion
      const va = new V3(), vb = new V3(), vc = new V3(), ax = new V3(), qd = new Q(), qi = new Q()
      const ptL = new V3(0, 0, 1), ptT = new V3(), AX = new V3(1, 0, 0), AY = new V3(0, 1, 0), AZ = new V3(0, 0, 1)
      const ray = new THREE.Raycaster(), v2 = new THREE.Vector2(), m4 = new THREE.Matrix4()
      
      // ---- the eight continents ---------------------------------------------------------------------
      const Cv = [], CRv = [], CUv = [], WY = [], WP = []
      const lats = [30, 30, 30, 30, -30, -30, -30, -30], lons = [20, 110, 200, 290, 65, 155, 245, 335]
      for (let i = 0; i < 8; i++) {
        const la = (lats[i] * Math.PI) / 180, lo = (lons[i] * Math.PI) / 180
        const c = new V3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo))
        const r = new V3(c.z, 0, -c.x).normalize(), u = new V3().crossVectors(c, r)
        Cv.push(c); CRv.push(r); CUv.push(u)
        WY.push(-lo); WP.push(la)
      }

      // ---- build the instances ----------------------------------------------------------------------
      const rnd = rng(11)
      const dirs = [], rights = [], infos = [], rects = [], cs = [], xys = []
      const add = (dir, right, wi, w, h, rect, c, x, y) => {
        dirs.push(dir.x, dir.y, dir.z); rights.push(right.x, right.y, right.z)
        infos.push(wi, w, h, rnd()); rects.push(rect[0], rect[1], rect[2], rect[3]); cs.push(c.x, c.y, c.z); xys.push(x, y)
      }
      const cw = WC / CC, ch = (WC * 9) / 16 / CR
      for (let i = 0; i < 8; i++) {
        const rc = ctx.loopRect(i)
        for (let cy = 0; cy < CR; cy++) {
          for (let cx = 0; cx < CC; cx++) {
            const x = (cx + 0.5 - CC / 2) * cw, y = (CR / 2 - cy - 0.5) * ch
            const d = vb.copy(Cv[i]).multiplyScalar(R).addScaledVector(CRv[i], x).addScaledVector(CUv[i], y).normalize()
            const r = va.copy(CRv[i]).addScaledVector(d, -CRv[i].dot(d)).normalize()
            add(d, r, i, cw * 0.93, ch * 0.93, [rc[0] + (rc[2] * cx) / CC, rc[1] + rc[3] * (1 - (cy + 1) / CR), rc[2] / CC, rc[3] / CR], Cv[i], x, y)
          }
        }
      }
      // rows of latitude, brick-offset, every tile upright (right = east): a dense, clean shell with small gaps
      const TW = 0.8, rowH = ((TW * 9) / 16) * 1.07, nRows = Math.floor((Math.PI * R) / rowH)
      for (let ri = 0; ri < nRows; ri++) {
        const lat = -Math.PI / 2 + ((ri + 0.5) * Math.PI) / nRows
        if (Math.abs(lat) > 1.45) continue
        const circ = 2 * Math.PI * R * Math.cos(lat), cnt = Math.max(6, Math.floor(circ / (TW * 1.07)))
        const w = Math.min(TW, (circ / cnt) * 0.94)
        for (let k = 0; k < cnt; k++) {
          const lo = ((k + (ri % 2) * 0.5) / cnt) * 2 * Math.PI
          const d = new V3(Math.cos(lat) * Math.sin(lo), Math.sin(lat), Math.cos(lat) * Math.cos(lo))
          let skipT = false
          for (let i = 0; i < 8; i++) {
            va.copy(d).multiplyScalar(R)
            if (va.dot(Cv[i]) > 0 && Math.abs(va.dot(CRv[i])) < WC / 2 + 0.5 && Math.abs(va.dot(CUv[i])) < WC * 0.28 + 0.35) skipT = true
          }
          if (skipT) continue
          add(d, new V3(d.z, 0, -d.x).normalize(), -1, w * 0.95, ((w * 9) / 16) * 0.95, ctx.loopRect(Math.floor(rnd() * 8)), d, 0, 0)
        }
      }
      const NT = dirs.length / 3
      const tg = geo(new THREE.InstancedBufferGeometry())
      const unit = new THREE.PlaneGeometry(1, 1)
      tg.index = unit.index; tg.attributes.position = unit.attributes.position; tg.attributes.uv = unit.attributes.uv
      const ia = (a, n, name) => tg.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(a), n))
      ia(dirs, 3, 'aDir'); ia(rights, 3, 'aRight'); ia(infos, 4, 'aInfo'); ia(rects, 4, 'aRect'); ia(cs, 3, 'aC'); ia(xys, 2, 'aXY')
      tg.instanceCount = NT

      const uCamR = new V3(1, 0, 0), uCamU = new V3(0, 1, 0), uCamN = new V3(0, 0, 1)
      const tileU = {
        uR: { value: R }, uRC: { value: RC }, uTime: { value: 0 }, uShatter: { value: 0 }, uSpeed: { value: 0 }, uPtrAmt: { value: 0 }, uLiftH: { value: LIFTH },
        uHv: { value: hv }, uPtr: { value: ptL }, uCamR: { value: uCamR }, uCamU: { value: uCamU }, uCamN: { value: uCamN },
        tAtlas: { value: ctx.atlas }, tReel: { value: ctx.showreel.texture },
      }
      const tiles = new THREE.Mesh(tg, mat(new THREE.ShaderMaterial({ uniforms: tileU, vertexShader: TILE_VS, fragmentShader: TILE_FS, side: THREE.DoubleSide })))
      tiles.frustumCulled = false; planet.add(tiles)

      const coreU = {
        uW: { value: 0 }, uRC: { value: RC }, uReelDist: { value: 8 }, uReel: { value: new THREE.Vector2(10, 6) }, uCam: { value: camera.matrixWorld },
        tReel: { value: ctx.showreel.texture }, uSettle: { value: 0 }, uGlow: { value: 0 }, uPtrAmt: { value: 0 }, uPtr: { value: ptL },
      }
      const core = new THREE.Mesh(geo(new THREE.PlaneGeometry(1, 1, 128, 64)), mat(new THREE.ShaderMaterial({ uniforms: coreU, vertexShader: CORE_VS, fragmentShader: CORE_FS, side: THREE.DoubleSide })))
      core.frustumCulled = false; planet.add(core)

      // halo behind the planet (camera child, resized every frame to keep its apparent size)
      const haloU = { uOp: { value: 0 } }
      const halo = new THREE.Mesh(geo(new THREE.PlaneGeometry(1, 1)), mat(new THREE.ShaderMaterial({ uniforms: haloU, vertexShader: HALO_VS, fragmentShader: HALO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })))
      halo.frustumCulled = false; halo.renderOrder = -1; camera.add(halo)

      // ---- hero sentence as a ring of type orbiting the planet --------------------------------------
      const ringT = ctx.text(ctx.hero + '   ·   ', { size: 200 }); texs.push(ringT.texture)
      const copyW = (2 * Math.PI * RR) / 3
      const ringU = { tMap: { value: ringT.texture }, uOp: { value: 0 }, uCopies: { value: 3 } }
      const ring = new THREE.Mesh(geo(new THREE.CylinderGeometry(RR, RR, copyW / ringT.aspect, 180, 1, true)), mat(new THREE.ShaderMaterial({ uniforms: ringU, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide })))
      ring.renderOrder = 5; ring.frustumCulled = false
      const ringG = new THREE.Group(); ringG.rotation.set(0.5, 0, -0.12); ringG.add(ring); scene.add(ringG)

      // ---- stalks of light + labels ------------------------------------------------------------------
      const beamU = { uTime: { value: 0 } }
      const beamM = mat(new THREE.ShaderMaterial({ uniforms: beamU, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
      const pulseM = mat(new THREE.ShaderMaterial({ uniforms: beamU, vertexShader: PULSE_VS, fragmentShader: PULSE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
      const beamG = geo(new THREE.CylinderGeometry(0.025, 0.1, 1, 12, 1, true)); beamG.translate(0, 0.5, 0)
      const pulseG = geo(new THREE.RingGeometry(0.2, 0.55, 40)); pulseG.rotateX(-Math.PI / 2)
      const stalks = [], labels = []
      const lg = geo(new THREE.PlaneGeometry(1, 1))
      for (let i = 0; i < 8; i++) {
        const g = new THREE.Group(); g.position.copy(Cv[i]).multiplyScalar(R); g.quaternion.setFromUnitVectors(AY, Cv[i]); g.visible = false
        const beam = new THREE.Mesh(beamG, beamM), pulse = new THREE.Mesh(pulseG, pulseM)
        beam.renderOrder = pulse.renderOrder = 6
        g.add(beam, pulse); planet.add(g); stalks.push({ g, beam, pulse })
        const mk = (str, o) => {
          const t = ctx.text(str, o); texs.push(t.texture)
          const mm = mat(new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }))
          const mesh = new THREE.Mesh(lg, mm); mesh.renderOrder = 20; mesh.visible = false; mesh.frustumCulled = false
          camera.add(mesh)
          return { mesh, aspect: t.aspect, mm }
        }
        const bgm = mat(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }))
        const bg = new THREE.Mesh(lg, bgm); bg.renderOrder = 19; bg.visible = false; bg.frustumCulled = false; camera.add(bg)
        labels.push({ t: mk(ctx.works[i].title, { size: 150 }), m: mk(ctx.works[i].kind + '  ·  ' + ctx.works[i].year, { caps: true, size: 40 }), bg, bgm })
      }

      // ---- opening: Showreel full screen, wraps into a sphere, shatters into the tiles -------------------
      const open = gsap.timeline()
      tls.push(open)
      open
        .to(S, { w: 1, duration: 1.25, ease: 'power3.inOut' }, 0.35)
        .to(S, { sh: 1, duration: 1.5, ease: 'none' }, 1.5)
        .to(S, { pulse: 1, duration: 0.25, ease: 'power2.out' }, 1.5)
        .to(S, { pulse: 0, duration: 0.8, ease: 'power2.inOut' }, 1.75)
        .to(S, { ring: 1, duration: 1, ease: 'power2.out' }, 2.1)

      function layout() {
        const tp = TAN * Math.min(1, aspect) * 0.9
        const planetFit = R * Math.sqrt(1 + 1 / (tp * tp)), ringFit = (RR * 1.05) / (TAN * aspect)
        dFar = aspect >= 1 ? Math.max(planetFit, ringFit) : planetFit
        dNear = R + Math.max(3.4, (WC * 1.05) / (2 * TAN * aspect))
        const portrait = aspect < 1
        ringG.scale.setScalar(portrait ? 0.72 : 1)
        ringU.uCopies.value = portrait ? 2 : 3; ring.scale.y = 3 / ringU.uCopies.value
        const rh = 2 * 8 * TAN, rw = rh * aspect
        const f = rw / rh < 16 / 9 ? [rh * (16 / 9), rh] : [rw, rw * (9 / 16)]
        coreU.uReel.value.set(f[0] * 1.02, f[1] * 1.02)
      }

      // the Work under the pointer, or -1 (front-facing continents only, nearest wins)
      function pick() {
        let best = -1, bd = 1e9
        for (let i = 0; i < 8; i++) {
          va.copy(Cv[i]).multiplyScalar(R + LIFTH * hv[i]).applyQuaternion(planet.quaternion)
          vb.copy(camera.position).sub(va)
          const facing = va.dot(vb) / (va.length() * vb.length())
          if (facing < 0.15) continue
          vc.copy(va).applyMatrix4(camera.matrixWorldInverse)
          const dd = Math.max(0.3, -vc.z)
          va.project(camera)
          const s = hv[i] > 0.3 ? 1.25 : 1.05, ff = Math.max(0.5, facing) * (1 - hv[i]) + hv[i]
          const hw = (WC * 0.5 * ff * s) / (dd * TAN * aspect), hh = (WC * 0.28 * Math.max(0.6, ff) * s) / (dd * TAN)
          if (Math.abs(P.nx - va.x) < hw && Math.abs(P.ny - va.y) < hh && dd < bd) { best = i; bd = dd }
        }
        return best
      }

      // title + kind/year next to the lifted continent, always inside the view (va = world centre of the continent)
      function placeLabel(i, a) {
        const L = labels[i], W = WC * 1.2, H = WC * 0.5625 * 1.2
        va.copy(Cv[i]).multiplyScalar(R + LIFTH * hv[i]).applyQuaternion(planet.quaternion).applyMatrix4(camera.matrixWorldInverse)
        const dv = Math.max(0.3, -va.z), hw = dv * TAN * aspect, hh = dv * TAN
        const m = Math.max(hh * 0.06, (16 / pxH) * 2 * hh), g = hh * 0.06   // 16 px margin to the view edge
        let th = H * 0.42, tw = th * L.t.aspect
        const cx = va.x, cy = va.y
        const side = cx > hw * 0.12 ? -1 : 1
        const avail = (side > 0 ? hw - (cx + W / 2) : hw + (cx - W / 2)) - g - m - th * 0.25
        const below = aspect < 1 || avail < tw * 0.55
        const s = below ? Math.min(1, (hw * 2 - 2 * m) / (tw * 1.2)) : Math.min(1, avail / tw)
        th *= s; tw *= s
        const mh = th * 0.3, mw = mh * L.m.aspect, total = th * 1.15 + mh, pad = th * 0.2, bw = Math.max(tw, mw) + 2 * pad
        let ty, my, tx, mx, bx
        if (!below) {
          const x0 = side > 0 ? cx + W / 2 + g : cx - W / 2 - g, sl = side * (1 - a) * th
          tx = x0 + (side * tw) / 2 - sl; mx = x0 + (side * mw) / 2 - sl; bx = x0 + (side * (bw - 2 * pad)) / 2 - sl
          const top = cy + total / 2
          ty = top - th / 2; my = top - th * 1.15 - mh / 2
        } else {
          tx = mx = bx = cx
          let top = cy - H / 2 - g
          if (top - total < -hh + m) top = cy + H / 2 + g + total
          ty = top - th / 2; my = top - th * 1.15 - mh / 2
        }
        const bh = total + 2 * pad, by = ty + th / 2 - total / 2
        // keep the whole plate inside the view
        const lx = Math.max(0, hw - bw / 2 - m), ly = Math.max(0, hh - bh / 2 - m)
        const dx = clamp(bx, -lx, lx) - bx, dy = clamp(by, -ly, ly) - by
        L.t.mesh.position.set(tx + dx, ty + dy, -dv); L.t.mesh.scale.set(tw, th, 1)
        L.m.mesh.position.set(mx + dx, my + dy, -dv); L.m.mesh.scale.set(mw, mh, 1)
        L.t.mm.opacity = L.m.mm.opacity = a
        L.bg.position.set(bx + dx, by + dy, -dv)
        L.bg.scale.set(bw, bh, 1); L.bgm.opacity = a * 0.82
      }

      const enterOnce = (i) => { if (!entered) { entered = true; ctx.enter(i) } }
      function dive(i) {
        if (busy) return
        busy = true; forced = i; diving = true; entered = false; wx = wy = 0
        ya = yaw; pa = pitch; pt = clamp(WP[i], -0.7, 0.7)
        yt = WY[i] + 2 * Math.PI * Math.round((yaw - WY[i]) / (2 * Math.PI))
        S.turn = 0
        const tl = gsap.timeline({ onComplete: () => enterOnce(i) })
        tls.push(tl)
        tl.to(S, { turn: 1, duration: 0.6, ease: 'power3.inOut' }, 0)
          .to(S, { fly: 1, duration: 0.55, ease: 'power3.in' }, 0.3)
          .to(S, { pulse: 0.8, duration: 0.3, ease: 'power2.out' }, 0.25)
          .to(S, { pulse: 0, duration: 0.3 }, 0.55)
        tls.push(gsap.delayedCall(0.95, () => enterOnce(i)))
        const tm = setTimeout(() => enterOnce(i), 1100); tms.push(tm)
      }
      let opened = false
      const finish = () => { open.kill(); S.w = 1; S.sh = 1; S.ring = 1; S.pulse = 0; opened = true }
      if (ctx.reduced) finish()
      const skip = () => { if (opened) return false; finish(); return true }

      return {
        scene, camera,
        update(t, dt) {
          if (disposed) return
          dt = Math.max(0.001, Math.min(dt, 0.05))
          const ready = S.sh > 0.9
          const inside = P.inside || P.down
          const ds = scroll.y - prevScroll; prevScroll = scroll.y
          speed = damp(speed, Math.min(1, Math.abs(scroll.v) / 1500), 4, dt)

          // zoom: scroll takes the camera from the whole planet down to the skimming surface
          zs = damp(zs, clamp(scroll.y / 1200, 0, 1), 4, dt); ez = zs * zs * (3 - 2 * zs)

          // spin with weight: follows the pointer while held, keeps going after release. North stays up (yaw + limited pitch).
          if (!opened && open.progress() >= 1) opened = true
          if (!diving) {
            if (P.down && ready && !busy) {
              const sens = 0.0035 / (1 + ez * 1.8)
              wy = damp(wy, (P.dx * sens) / dt, 16, dt)
              wx = damp(wx, (ctx.touch ? 0 : P.dy * sens) / dt, 16, dt)
            } else { const f = Math.exp(-dt * 0.7); wx *= f; wy *= f }
            wx = clamp(wx, -9, 9); wy = clamp(wy, -9, 9)
            yaw += wy * dt + ds * 0.0012
            pitch += wx * dt
            if (!P.down) { yaw += 0.07 * dt * (1 - ez * 0.8); pitch += (0.3 - pitch) * (1 - Math.exp(-dt * 0.5)) }
            if (focusIdx >= 0 && !P.down) {
              const y2 = WY[focusIdx] + 2 * Math.PI * Math.round((yaw - WY[focusIdx]) / (2 * Math.PI))
              yaw = damp(yaw, y2, 3, dt); pitch = damp(pitch, clamp(WP[focusIdx], -0.7, 0.7), 3, dt); wx = wy = 0
            }
            pitch = clamp(pitch, -0.7, 0.7)
          } else { yaw = ya + (yt - ya) * S.turn; pitch = pa + (pt - pa) * S.turn }
          planet.rotation.set(pitch, yaw, 0)
          planet.updateMatrixWorld(true)

          // camera on the +z axis, a little parallax; dives to the continent on fly-in
          psx = damp(psx, inside ? P.nx : 0, 2.5, dt); psy = damp(psy, inside ? P.ny : 0, 2.5, dt)
          const dEnd = R + LIFTH + Math.max((WC * 1.2) / (2 * TAN * aspect), (WC * 0.5625 * 1.2) / (2 * TAN))
          const D0 = dFar + (dNear - dFar) * ez
          const D = D0 + (dEnd - D0) * S.fly - S.pulse * 1.2
          const par = 1 - S.fly
          camera.position.set(psx * 0.8 * par, psy * 0.5 * par, D); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true)
          qi.copy(planet.quaternion).invert()
          uCamR.copy(AX).applyQuaternion(camera.quaternion).applyQuaternion(qi)
          uCamU.copy(AY).applyQuaternion(camera.quaternion).applyQuaternion(qi)
          uCamN.copy(AZ).applyQuaternion(camera.quaternion).applyQuaternion(qi)

          // selection
          hovIdx = inside && !ctx.touch && ready && !busy && !P.down ? pick() : -1
          sel = busy ? forced : hovIdx >= 0 ? hovIdx : focusIdx
          if ((sel >= 0) !== (lastSel >= 0)) ctx.cursor.hover(sel >= 0)
          lastSel = sel
          let hvMax = 0
          for (let i = 0; i < 8; i++) {
            hv[i] = damp(hv[i], sel === i ? 1 : 0, sel === i ? 6 : 4, dt)
            if (hv[i] > hvMax) hvMax = hv[i]
          }

          // magnet: where the pointer meets the planet (in planet space)
          ray.setFromCamera(v2.set(P.nx, P.ny), camera)
          const o = ray.ray.origin, d = ray.ray.direction
          const b = o.dot(d), disc = b * b - (o.dot(o) - (R + 0.3) * (R + 0.3))
          const hit = disc > 0 && inside
          if (hit) { const k = -b - Math.sqrt(disc); ptT.copy(o).addScaledVector(d, k).normalize().applyQuaternion(qi); ptL.lerp(ptT, 1 - Math.exp(-dt * 12)).normalize() }
          const want = hit && ready && !busy && sel < 0 && (!ctx.touch || P.down)
          ptrAmt = damp(ptrAmt, want ? 1 : 0, want ? 7 : 3, dt)

          tileU.uTime.value = t; tileU.uShatter.value = S.sh; tileU.uSpeed.value = speed; tileU.uPtrAmt.value = ptrAmt
          coreU.uW.value = S.w; coreU.uSettle.value = clamp(S.sh * 1.25, 0, 1); coreU.uGlow.value = Math.min(1, hvMax + speed); coreU.uPtrAmt.value = ptrAmt
          beamU.uTime.value = t
          crt.push = Math.min(1, Math.hypot(wx, wy) * 0.06 + speed * 0.6 + S.pulse * 0.6)

          for (let i = 0; i < 8; i++) {
            const h = hv[i], st = stalks[i], on = h > 0.02
            st.g.visible = on
            if (on) { const k = 0.5 + 0.5 * h; st.beam.scale.set(k, LIFTH * h, k); st.pulse.scale.setScalar(0.4 + h) }
            const a = on ? clamp((h - 0.15) / 0.7, 0, 1) : 0
            labels[i].t.mesh.visible = labels[i].m.mesh.visible = labels[i].bg.visible = a > 0.01
            if (a > 0.01) placeLabel(i, a)
          }

          // halo + ring of type (the ring leaves as the camera comes in)
          const dh = D + R * 1.05, hs = 1.6 * (R / Math.sqrt(Math.max(1, D * D - R * R))) * dh * 2
          halo.position.set(0, 0, -dh); halo.scale.set(hs, hs, 1)
          haloU.uOp.value = clamp((S.w - 0.8) * 5, 0, 1) * (1 - ez * 0.8)
          ringU.uOp.value = S.ring * (1 - clamp((ez - 0.05) / 0.4, 0, 1)) * (1 - clamp(S.fly / 0.35, 0, 1))
          ring.visible = ringU.uOp.value > 0.01
          ring.rotation.y += dt * (0.1 + wy * 0.15)
        },
        resize(w, h) {
          aspect = w / h; pxH = h
          camera.aspect = aspect; camera.fov = FOV; camera.updateProjectionMatrix()
          layout()
        },
        tap() { if (skip()) return; if (busy) return; const i = pick(); if (i >= 0) dive(i) },
        focus(i) { focusIdx = i },
        activate(i) { skip(); dive(i) },
        back() {
          const tl = gsap.timeline({ onComplete: () => { busy = false; diving = false; forced = -1 } })
          tls.push(tl)
          tl.to(S, { fly: 0, duration: 0.9, ease: 'power2.inOut' }, 0).to(S, { pulse: 0.5, duration: 0.3, ease: 'power2.out' }, 0).to(S, { pulse: 0, duration: 0.6 }, 0.3)
        },
        dispose() {
          disposed = true
          tls.forEach((t) => t.kill()); tms.forEach(clearTimeout); gsap.killTweensOf(S)
          geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose())
          unit.dispose()
        },
      }
    },
  })
})()
