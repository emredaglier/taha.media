// THROWAWAY prototype 'Singularity'. Contract: docs/design/home/CONTRACT.md.
// The wall of Works is drawn into my own render target each frame; the returned scene is one full-screen quad whose
// fragment shader bends that picture around a black hole that follows the pointer with weight.
// View units: y in [-1, 1] (up), x in [-aspect, aspect].
;(function () {
  'use strict'
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

  const QUAD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }'

  const lensFS = (ns) => `
    precision highp sampler2D;
    #define NS ${ns}
    uniform sampler2D tWall, tReel, tAtlas;
    uniform float uA, uT, uTE, uRs, uAcc, uPort, uHh, uOn, uRe, uTw, uPull, uSw;
    uniform vec2 uH, uFar, uPC;
    uniform vec4 uTrail[8]; uniform vec4 uWave[2]; uniform vec4 uRect;
    varying vec2 vUv;

    vec3 wall(vec2 p){ vec2 u = vec2(p.x / uA, p.y) * .5 + .5; return texture2D(tWall, abs(mod(u + 1., 2.) - 1.)).rgb; }
    vec3 reelAt(vec2 s){
      float cov = max(uA, 1.7778);
      return texture2D(tReel, clamp(vec2(s.x / (2. * cov) + .5, s.y / (2. * cov * .5625) + .5), .002, .998)).rgb;
    }
    // where on the wall does the light that reaches the screen point s come from
    vec2 lens(vec2 s){
      vec2 d = s - uH; float r2 = dot(d, d) + 1e-5; float te2 = max(uTE * uTE, 1e-6);
      vec2 src = uH + d * (1. - te2 / r2);
      src += (uFar - uH) * exp(-r2 / (4.84 * te2)); // near the ring the far side of the wall wraps around
      for (int i = 0; i < 8; i++) { vec4 w = uTrail[i]; vec2 e = s - w.xy; src -= w.z * e / (dot(e, e) + w.w * w.w); }
      for (int j = 0; j < 2; j++) { vec4 w = uWave[j]; vec2 e = s - w.xy; float r = length(e) + 1e-4; float x = r - w.z * 1.5; src += e / r * w.w * exp(-w.z * 1.4) * exp(-x * x / .012) * sin(x * 38.); }
      return src;
    }
    void main(){
      vec2 s = vec2((vUv.x * 2. - 1.) * uA, vUv.y * 2. - 1.);
      vec2 d = s - uH; float r = length(d);
      float rs = max(uRs, .0008);
      vec3 c;
      float tE = max(uTE, .002);
      float z = 1. - smoothstep(1.9 * tE, 2.7 * tE, r);
      if (z > .001) { // accretion smear: the wall's own pixels dragged around the hole
        vec3 acc = vec3(0.);
        float sm = z * uAcc * 1.7 * tE / (r + .35 * tE);
        float rot = uT * .5 * tE / (r + .5 * tE) * z;
        for (int k = 0; k < NS; k++) {
          float f = float(k) / float(NS - 1) - .5;
          float a = f * sm + rot; float ca = cos(a), sa = sin(a);
          acc += wall(lens(uH + vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y)));
        }
        c = acc / float(NS);
      } else c = wall(lens(s));
      // opening: the Showreel gets sucked into a spiral by the pinpoint at the centre
      if (uOn > .5) {
        float edge = length(s) - uRe;
        float al = smoothstep(0., .07, edge);
        if (al > .001) {
          float tw = uTw * exp(-max(edge, 0.) / .55); float cs = cos(tw), sn = sin(tw);
          vec2 sp = vec2(cs * s.x - sn * s.y, sn * s.x + cs * s.y) * (1. + uPull * exp(-max(edge, 0.) / .4));
          c = mix(c, reelAt(sp), al);
        }
        c += vec3(.7) * exp(-pow(edge / .03, 2.)) * step(.01, uRe);
      }
      float ang = atan(d.y, d.x);
      float acc2 = exp(-pow((r - 1.8 * rs) / (.95 * rs), 2.));
      c *= 1. + 1.5 * acc2 * (.55 + .45 * cos(ang - .5)) * uAcc;
      c *= 1. + .3 * exp(-pow((r - uTE) / (.06 * tE), 2.));
      c *= smoothstep(rs, rs * 1.9, r); // the dark disc
      c += vec3(.93) * (exp(-pow((r - rs * 1.1) / max(rs * .05, .0028), 2.)) * 1.2 + exp(-pow((r - rs * 1.1) / (rs * .45), 2.)) * .22 * uAcc);
      // caught Work: a clean upright magnified loop inside the ring; when swallowing it grows to fill the view
      if (uPort > .001) {
        vec2 pd = s - uPC; float pr = length(pd);
        float inn = 1. - smoothstep(uPort - .004, uPort, pr);
        vec2 pu = vec2(pd.x / (2. * uHh * 1.7778), pd.y / (2. * uHh)) + .5;
        float m = step(0., pu.x) * step(pu.x, 1.) * step(0., pu.y) * step(pu.y, 1.);
        vec3 pic = texture2D(tAtlas, uRect.xy + clamp(pu, .002, .998) * uRect.zw).rgb * 1.05;
        pic *= 1. - .35 * smoothstep(.7, 1., pr / uPort) * (1. - uSw);
        c = mix(c, pic * m, inn);
        c += vec3(.95) * exp(-pow((pr - uPort) / .011, 2.)) * (1. - uSw * .8);
      }
      gl_FragColor = vec4(min(c, vec3(1.)), 1.);
    }`

  const BG_VS = 'varying vec2 vP; void main(){ vP = (modelMatrix * vec4(position, 1.)).xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }'
  const BG_FS = `
    varying vec2 vP;
    void main(){
      vec2 g = abs(fract(vP / .2 + .5) - .5);
      float ln = 1. - smoothstep(0., .022, min(g.x, g.y));
      float dt = 1. - smoothstep(.0, .05, length(g));
      gl_FragColor = vec4(vec3(.1 * ln + .1 * dt + .02), 1.);
    }`

  HOME.register({
    name: 'Singularity',
    create(ctx) {
      const P = ctx.pointer, scroll = ctx.scroll, crt = ctx.crt, renderer = ctx.renderer, touch = ctx.touch
      const tls = [], geos = [], mats = [], texs = []
      const mat = (m) => (mats.push(m), m), geo = (g) => (geos.push(g), g)
      let aspect = 1.6, pw = 1280, ph = 800, portrait = false, disposed = false, opened = false, busy = false
      let cyo = 0, REND = 2.6, REST_TE = 0.2, safeX = 1.5, safeY = 0.85, rpC = 0.3
      const S = { re: 0, pin: 0, sw: 0, pulse: 0 }

      // ---- the returned scene: one quad (+ labels) --------------------------------------------------------
      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(-1.6, 1.6, 1, -1, -1, 1)
      const rt = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })
      const trail = [], wave = []
      for (let i = 0; i < 8; i++) trail.push(new THREE.Vector4(0, 0, 0, 0.1))
      for (let i = 0; i < 2; i++) wave.push(new THREE.Vector4(0, 0, 9, 0))
      const U = {
        tWall: { value: rt.texture }, tReel: { value: ctx.showreel.texture }, tAtlas: { value: ctx.atlas },
        uA: { value: 1.6 }, uT: { value: 0 }, uTE: { value: 0.2 }, uRs: { value: 0.06 }, uAcc: { value: 0.7 }, uPort: { value: 0 }, uHh: { value: 0.3 },
        uOn: { value: 1 }, uRe: { value: 0 }, uTw: { value: 0 }, uPull: { value: 0 }, uSw: { value: 0 },
        uH: { value: new THREE.Vector2() }, uFar: { value: new THREE.Vector2() }, uPC: { value: new THREE.Vector2() },
        uTrail: { value: trail }, uWave: { value: wave }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      }
      const quad = new THREE.Mesh(geo(new THREE.PlaneGeometry(2, 2)), mat(new THREE.ShaderMaterial({ uniforms: U, vertexShader: QUAD_VS, fragmentShader: lensFS(touch ? 4 : 6), depthTest: false, depthWrite: false })))
      quad.frustumCulled = false; quad.renderOrder = -1
      scene.add(quad)

      // ---- the wall (rendered into rt) ---------------------------------------------------------------------
      const wallScene = new THREE.Scene()
      const wallCam = new THREE.OrthographicCamera(-1.6, 1.6, 1, -1, -10, 10)
      const bg = new THREE.Mesh(geo(new THREE.PlaneGeometry(2, 2)), mat(new THREE.ShaderMaterial({ vertexShader: BG_VS, fragmentShader: BG_FS, depthTest: false, depthWrite: false })))
      bg.renderOrder = 0; bg.frustumCulled = false
      wallScene.add(bg)
      const frameGeo = geo(new THREE.PlaneGeometry(1, 1))
      const works = []
      for (let i = 0; i < 8; i++) {
        const fm = mat(new THREE.MeshBasicMaterial({ color: 0xededed, transparent: true, depthTest: false, depthWrite: false }))
        const frame = new THREE.Mesh(frameGeo, fm); frame.renderOrder = 1; frame.frustumCulled = false
        const wm = mat(new THREE.MeshBasicMaterial({ map: ctx.atlas, transparent: true, depthTest: false, depthWrite: false }))
        const mesh = new THREE.Mesh(geo(ctx.loopGeometry(i, 1, 0.5625)), wm); mesh.renderOrder = 2; mesh.frustumCulled = false
        wallScene.add(frame); wallScene.add(mesh)
        works.push({ frame, mesh, fm, wm, bx: 0, by: 0, w: 0.4, x: 0, y: 0 })
      }
      const heroMat = mat(new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }))
      const heroMesh = new THREE.Mesh(frameGeo, heroMat); heroMesh.renderOrder = 5; heroMesh.frustumCulled = false
      wallScene.add(heroMesh)
      let heroTex = null

      // ---- labels (in the returned scene, crisp, never lensed) -----------------------------------------------
      const labels = []
      for (let i = 0; i < 8; i++) {
        const mk = (str, o) => {
          const t = ctx.text(str, o); texs.push(t.texture)
          const mm = mat(new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }))
          const mesh = new THREE.Mesh(frameGeo, mm); mesh.renderOrder = 20; mesh.visible = false; mesh.frustumCulled = false
          scene.add(mesh)
          return { mesh, mm, aspect: t.aspect }
        }
        labels.push({ t: mk(ctx.works[i].title, { size: 150 }), m: mk(ctx.works[i].kind + '  ·  ' + ctx.works[i].year, { caps: true, size: 40 }) })
      }

      const wideLines = ctx.hero.replace(/\.\s+/g, '.\n').split('\n').filter(Boolean)
      const tallLines = []
      { let cur = ''; for (const w of ctx.hero.split(/\s+/)) { if (cur && (cur + ' ' + w).length > 15) { tallLines.push(cur); cur = w } else cur = (cur ? cur + ' ' : '') + w } if (cur) tallLines.push(cur) }
      const lineImgs = {}
      const lineImg = (str, key) => { if (!lineImgs[key]) { const t = ctx.text(str, { size: 200 }); t.texture.dispose(); lineImgs[key] = t } return lineImgs[key] }

      // ---- hole state ------------------------------------------------------------------------------------------
      let hx = 0, hy = 0, hvx = 0, hvy = 0, park = [0, 0], mass = 0, massV = 0, wasDown = false, havePointer = false
      let phi = 0, clock = 0, spd = 0, restT = 0, kbIdx = -1, catchIdx = -1, catchWant = -1, catchK = 0, labelAmp = 0
      let ti = 0, wi = 0, lastGX = 0, lastGY = 0, prevDown = false, forced = -1, lastLabel = -1
      const RpC = () => rpC
      const hero = { y: 0 }

      // ---- opening: the Showreel is sucked into a spiral, the wall is left behind -----------------------------------
      const open = gsap.timeline(); tls.push(open)
      open.to(S, { pin: 1, duration: 0.5, ease: 'power2.out' }, 0.25)
        .to(S, { re: () => REND * 1.05, duration: 2.0, ease: 'power2.inOut' }, 0.6)
        .to(S, { pulse: 0.7, duration: 0.5, ease: 'power2.out' }, 1.0)
        .to(S, { pulse: 0, duration: 1.0, ease: 'power2.inOut' }, 1.5)
      const finish = () => { open.kill(); S.re = 99; S.pin = 1; S.pulse = 0; opened = true }
      if (ctx.reduced) finish()

      // ---- layout ---------------------------------------------------------------------------------------------------
      function layout() {
        const a = aspect, por = a < 0.95
        portrait = por
        const topPx = por ? 132 : (pw < 768 ? 68 : 84) + 12
        const kx = (1 + (0.2 * a * a) / (a * a + 1)) / 1.2, ky = (1 + 0.2 / (a * a + 1)) / 1.2 // how far the glass bends the edges in
        safeX = a * kx * 0.96; safeY = ky * 0.94
        const SX = safeX
        const yTop = Math.min(1 - (2 * topPx) / ph, safeY), yBot = Math.max(-1 + (2 * (por ? 20 : 16)) / ph, -safeY)
        cyo = (yTop + yBot) / 2
        const halfH = (yTop - yBot) / 2
        let bandH, maxW
        if (!por) {
          const m = 0.03 * SX, tw = Math.min(0.43 * SX, (((2 * halfH - 0.56) / 2) * 16) / 9 / 1.02), thB = tw * 0.5625
          const p = (2 * SX - 2 * m - tw) / 3
          const o0 = [0.02, -0.03, 0.035, -0.02], sj0 = [1, 0.95, 1.03, 0.97]
          for (let i = 0; i < 8; i++) {
            const c = i % 4, r = i >> 2, cc = r === 0 ? c : 3 - c // the bottom row mirrors the top row, so a half-turn maps the wall onto itself
            const w = tw * sj0[cc], off = o0[cc] + 0.032
            works[i].w = w; works[i].bx = -SX + m + tw / 2 + c * p
            works[i].by = r === 0 ? yTop - thB / 2 - off : yBot + thB / 2 + off
          }
          bandH = 2 * halfH - 2 * thB - 0.12; maxW = 2 * SX * 0.52
        } else {
          const tw = SX - 0.036, th = tw * 0.5625, g = 0.045
          const ys = [yTop - th / 2, yTop - th * 1.5 - g, yBot + th * 1.5 + g, yBot + th / 2], sx = [-0.02, 0.02, -0.02, 0.02]
          for (let i = 0; i < 8; i++) {
            const c = i % 2, r = i >> 1
            works[i].w = tw; works[i].bx = (c ? 1 : -1) * (tw / 2 + 0.012) + sx[r]; works[i].by = ys[r]
          }
          bandH = ys[1] - ys[2] - th - 0.06; maxW = 2 * SX * 0.95
        }
        for (let i = 0; i < 8; i++) {
          const k = works[i], w = k.w
          k.mesh.scale.set(w, w, 1); k.frame.scale.set(w + 0.014, w * 0.5625 + 0.014, 1)
        }
        // hero: serif lines with a dark halo so it still reads when a Work drifts behind it
        const lines = por ? tallLines : wideLines, n = lines.length
        const imgs = lines.map((l, k) => lineImg(l, 'h' + k + (por ? 't' : 'w')))
        const maxA = Math.max.apply(null, imgs.map((m) => m.aspect)), kk = 0.62 * (n - 1) + 1
        const Lh = Math.min(maxW / maxA, (bandH * 0.92) / kk), rw = Lh * maxA, rh = Lh * kk, pad = Lh * 0.25
        const ppu = Math.min((ph * Math.max(1, ctx.size.dpr)) / 2, 2000 / (rw + 2 * pad))
        const cv = document.createElement('canvas'); cv.width = Math.max(8, Math.round((rw + 2 * pad) * ppu)); cv.height = Math.max(8, Math.round((rh + 2 * pad) * ppu))
        const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'
        const draw = (blur) => {
          g.shadowColor = blur ? 'rgba(0,0,0,.95)' : 'rgba(0,0,0,0)'; g.shadowBlur = blur
          imgs.forEach((m, k) => { const w = Lh * m.aspect * ppu, h = Lh * ppu; g.drawImage(m.canvas, (cv.width - w) / 2, (pad + k * 0.62 * Lh) * ppu, w, h) })
        }
        draw(Lh * ppu * 0.1); draw(Lh * ppu * 0.1); draw(0)
        if (heroTex) heroTex.dispose()
        heroTex = new THREE.CanvasTexture(cv); heroTex.generateMipmaps = false; heroTex.minFilter = heroTex.magFilter = THREE.LinearFilter
        heroMat.map = heroTex; heroMat.needsUpdate = true
        heroMesh.scale.set(rw + 2 * pad, rh + 2 * pad, 1); heroMesh.position.set(0, cyo, 0)
        REND = Math.hypot(a, 1) * 1.15
        REST_TE = Math.min(0.2, 0.42 * a)
        park = por ? [SX * 0.5, yBot + 0.28] : [SX * 0.8, cyo]
        if (!havePointer && opened) { hx = park[0]; hy = park[1] }
      }

      // ---- caught Work: title + kind/year beside the portal, inside the view ----------------------------------------------
      function placeLabel(i, a, cx, cy, R, big) {
        const L = labels[i], m16 = 32 / ph, A = safeX, g = 0.05, rr = R * 1.28 + g
        const asp = L.t.aspect, maxTh = big ? 0.26 : 0.2
        const roomR = A - m16 - (cx + rr), roomL = cx - rr + A - m16
        const side = roomR >= roomL ? 1 : -1, room = Math.max(roomR, roomL)
        let th = Math.min(maxTh, room / asp), below = false
        if (th < maxTh * 0.55) { below = true; th = Math.min(maxTh, (2 * A - 2 * m16) / asp) }
        const tw = th * asp
        let mh = th * 0.3
        const cap = below ? 2 * A - 2 * m16 : room
        if (mh * L.m.aspect > cap) mh = cap / L.m.aspect
        const mw = mh * L.m.aspect, wmax = Math.max(tw, mw), tot = th * 1.1 + mh
        let x0, ty
        if (!below) { x0 = side > 0 ? cx + rr : cx - rr - wmax; ty = cy } else {
          x0 = clamp(cx - wmax / 2, -A + m16, A - m16 - wmax)
          ty = cy - rr - tot / 2
          if (ty - tot / 2 < -1 + m16) ty = cy + rr + tot / 2
        }
        ty = clamp(ty, -1 + m16 + tot / 2, 1 - m16 - tot / 2)
        const slide = (1 - a) * 0.04 * side, top = ty + tot / 2
        L.t.mesh.position.set(x0 + tw / 2 + slide, top - th / 2, 0); L.t.mesh.scale.set(tw, th, 1)
        L.m.mesh.position.set(x0 + mw / 2 + slide, top - th * 1.1 - mh / 2, 0); L.m.mesh.scale.set(mw, mh, 1)
        L.t.mm.opacity = L.m.mm.opacity = a
      }

      function nearestWork(x, y, grow) {
        let best = -1, bd = 1e9
        for (let i = 0; i < 8; i++) {
          const k = works[i], hw = (k.w * grow) / 2, hh = hw * 0.5625
          const dx = Math.abs(x - k.x), dy = Math.abs(y - k.y)
          if (dx < hw + 0.04 && dy < hh + 0.04) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i } }
        }
        return best
      }

      function dive(i) {
        if (busy) return
        busy = true; forced = i; catchWant = i
        const tl = gsap.timeline({ onComplete: () => ctx.enter(i) }); tls.push(tl)
        tl.to(S, { sw: 1, duration: 0.62, ease: 'power2.in' }, 0.2)
          .to(S, { pulse: 0.9, duration: 0.4, ease: 'power2.out' }, 0.2)
          .to(S, { pulse: 0, duration: 0.45, ease: 'power1.in' }, 0.6)
      }
      const skip = () => { if (opened) return false; finish(); return true }

      return {
        scene, camera,
        update(t, dt) {
          if (disposed) return
          dt = Math.min(dt, 0.05); clock += dt
          const A = aspect
          if (!opened && open.progress() >= 1) opened = true
          const prog = clamp(S.re / REND, 0, 1)
          const inside = P.inside || P.down
          if (inside) havePointer = true

          // ---- pointer drives the hole with weight; a finger leaves it where it was left
          const down = P.down && inside
          let tx = hx, ty = hy
          const free = prog > 0.72 && !busy
          if (prog <= 0.72 && !opened) { tx = 0; ty = 0 }
          else if (busy && forced >= 0) { if (kbIdx >= 0) { tx = 0; ty = 0 } else { tx = works[forced].x; ty = works[forced].y } }
          else if (kbIdx >= 0 && !(Math.abs(P.dx) + Math.abs(P.dy) > 3)) { tx = 0; ty = 0 }
          else if (free && (touch ? down : inside)) { tx = P.nx * A; ty = P.ny; kbIdx = -1 }
          else if (free && !havePointer) { tx = park[0]; ty = park[1] }
          tx = clamp(tx, -safeX, safeX); ty = clamp(ty, -safeY, safeY)
          const kf = 38 / (1 + 1.4 * mass), cf = 9.5
          hvx += ((tx - hx) * kf - hvx * cf) * dt; hvy += ((ty - hy) * kf - hvy * cf) * dt
          hx += hvx * dt; hy += hvy * dt
          spd = Math.hypot(hvx, hvy)

          // mass: slow to grow while pressed, snaps back with overshoot and a gravitational wave when released
          const want = down && free ? 1 : 0
          const kk = want ? 14 : 120, cc = want ? 7 : 9
          massV += ((want - mass) * kk - massV * cc) * dt; mass += massV * dt
          if (wasDown && !down && free && mass > 0.15) { wave[wi++ & 1].set(hx, hy, 0, 0.06 * clamp(mass, 0.3, 1)) }
          wasDown = down
          for (let i = 0; i < 2; i++) { const w = wave[i]; w.z += dt; if (w.z > 2.6) w.w = 0 }

          // wake: ghosts of the hole along its path, relaxing away
          if (opened && Math.hypot(hx - lastGX, hy - lastGY) > 0.055 && spd > 0.25) {
            trail[ti++ & 7].set(hx, hy, 0.016 * (0.35 + Math.min(1, spd / 1.2)), 0.1); lastGX = hx; lastGY = hy
          }
          for (let i = 0; i < 8; i++) trail[i].z *= Math.exp(-1.5 * dt)

          // ---- scroll orbits the wall (a half-turn detent when it rests); every Work stays upright
          const drive = scroll.y * 0.0011, idle = clamp(1 - Math.abs(scroll.v) / 90, 0, 1)
          const snapped = Math.round(drive / Math.PI) * Math.PI
          phi = damp(phi, drive + (snapped - drive) * idle * idle * (3 - 2 * idle), 7, dt)
          const cs = Math.cos(phi), sn = Math.sin(phi), shr = 1 - 0.26 * sn * sn
          for (let i = 0; i < 8; i++) {
            const k = works[i], nx = k.bx / A, ny = k.by - cyo
            k.x = A * (nx * cs - ny * sn) * shr; k.y = cyo + (nx * sn + ny * cs) * shr
          }

          // ---- catching: the hole rests near a Work
          let cand = -1
          if (opened && !busy && (havePointer || kbIdx >= 0)) cand = kbIdx >= 0 ? kbIdx : nearestWork(hx, hy, catchIdx >= 0 ? 1.7 : 1.1)
          const resting = spd < 0.55 && cand >= 0
          restT = resting ? restT + dt : 0
          if (!busy) {
            if (cand >= 0 && restT > 0.2) catchWant = cand
            else if (catchIdx >= 0 && (cand < 0 || spd > 1.4)) catchWant = -1
          }
          if (catchWant !== catchIdx) { if (catchK < 0.05) { catchIdx = catchWant; if (catchIdx >= 0) U.uRect.value.fromArray(ctx.loopRect(catchIdx)) } }
          catchK = damp(catchK, catchWant === catchIdx && catchIdx >= 0 ? 1 : 0, catchWant === catchIdx ? 9 : 14, dt)
          if (catchK < 0.002 && catchWant < 0) catchIdx = -1
          if ((catchIdx >= 0) !== (lastLabel >= 0)) ctx.cursor.hover(catchIdx >= 0)
          lastLabel = catchIdx

          // Works: the caught one is pulled into the hole and fades
          for (let i = 0; i < 8; i++) {
            const k = works[i], c = i === catchIdx ? catchK : 0
            const px = k.x + (hx - k.x) * c * 0.8, py = k.y + (hy - k.y) * c * 0.8, sc = 1 - c * 0.7
            k.mesh.position.set(px, py, 0); k.frame.position.set(px, py, 0)
            k.mesh.scale.set(k.w * sc, k.w * sc, 1); k.frame.scale.set((k.w + 0.014) * sc, (k.w * 0.5625 + 0.014) * sc, 1)
            k.wm.opacity = k.fm.opacity = 1 - c
          }
          heroMat.opacity = 1 - 0.75 * Math.max(catchK, S.sw)

          // ---- uniforms
          const baseR = Math.min(0.3, 0.62 * A)
          rpC = damp(rpC, kbIdx >= 0 ? Math.min(0.7, Math.max(0.34 * A, baseR)) : baseR, 6, dt)
          const e = S.sw * S.sw, rend = REND, teC = RpC() / 0.8
          const eo = opened ? 1 : sstep(0.1, 0.85, prog)
          let te = (REST_TE * (0.9 + 0.9 * clamp(mass, 0, 1.3))) * eo
          te = te + (teC - te) * catchK
          te = te + (rend / 0.8 - te) * e
          U.uTE.value = te
          U.uRs.value = Math.max(0.0035 + 0.02 * S.pin * (1 - eo), te * 0.32 * (1 - catchK))
          U.uAcc.value = (0.7 + 0.5 * clamp(mass, 0, 1)) * (0.2 + 0.8 * eo)
          U.uH.value.set(hx, hy); U.uT.value = clock; U.uA.value = A
          U.uFar.value.set(clamp(-hx * 0.6, -A * 0.8, A * 0.8), clamp(-0.6 * (hy - cyo) + cyo, -0.8, 0.8))
          const portR = (catchK * RpC()) * (1 - e) + rend * e
          U.uPort.value = portR < 0.002 ? 0 : portR
          U.uHh.value = RpC() * 1.04 * (1 - e) + ((A * 9) / 16) * e
          U.uPC.value.set(hx * (1 - e), hy * (1 - e) + 0 * e)
          U.uSw.value = e
          const on = S.re < REND * 1.02
          U.uOn.value = on ? 1 : 0; U.uRe.value = S.re
          U.uTw.value = 6.5 * Math.sin(Math.PI * prog) * (on ? 1 : 0); U.uPull.value = 0.9 * Math.sin(Math.PI * prog)

          crt.push = Math.min(1, clamp(mass, 0, 1.2) * 0.5 + S.pulse * 0.6 + S.sw * 0.7 + Math.min(0.35, Math.abs(scroll.v) / 3000) + Math.min(0.25, spd / 8))

          // ---- draw the wall into my own target
          const prev = renderer.getRenderTarget()
          renderer.setRenderTarget(rt); renderer.render(wallScene, wallCam); renderer.setRenderTarget(prev)

          // ---- label
          labelAmp = damp(labelAmp, catchIdx >= 0 && catchK > 0.5 && S.sw < 0.05 ? 1 : 0, 8, dt)
          for (let i = 0; i < 8; i++) {
            const on2 = i === catchIdx && labelAmp > 0.01
            labels[i].t.mesh.visible = labels[i].m.mesh.visible = on2
            if (on2) placeLabel(i, labelAmp, hx, hy, RpC(), kbIdx >= 0)
          }
        },
        resize(w, h) {
          pw = w; ph = h; aspect = w / h
          const sc = touch ? 0.75 : 1, dpr = ctx.size.dpr
          rt.setSize(Math.max(2, Math.round(w * dpr * sc)), Math.max(2, Math.round(h * dpr * sc)))
          camera.left = -aspect; camera.right = aspect; camera.top = 1; camera.bottom = -1; camera.updateProjectionMatrix()
          wallCam.left = -aspect; wallCam.right = aspect; wallCam.top = 1; wallCam.bottom = -1; wallCam.updateProjectionMatrix()
          bg.scale.set(aspect * 1.05, 1.05, 1)
          layout()
        },
        tap() {
          if (skip() || busy) return
          let i = catchIdx >= 0 && catchK > 0.3 ? catchIdx : nearestWork(P.nx * aspect, P.ny, 1.15)
          if (i < 0) i = nearestWork(hx, hy, 1.4)
          if (i >= 0) dive(i)
          else wave[wi++ & 1].set(P.nx * aspect, P.ny, 0, 0.04)
        },
        focus(i) { kbIdx = i },
        activate(i) { skip(); dive(i) },
        back() {
          const tl = gsap.timeline({ onComplete: () => { busy = false; forced = -1 } }); tls.push(tl)
          tl.to(S, { sw: 0, duration: 0.9, ease: 'power2.inOut' }, 0).to(S, { pulse: 0.5, duration: 0.3 }, 0).to(S, { pulse: 0, duration: 0.6 }, 0.3)
        },
        dispose() {
          disposed = true
          tls.forEach((x) => x.kill()); gsap.killTweensOf(S)
          rt.dispose(); geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((x) => x.dispose())
          if (heroTex) heroTex.dispose()
        },
      }
    },
  })
})()
