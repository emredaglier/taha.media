// THROWAWAY prototype: Ribbon. One endless band twists through space as a knot. Front side: the hero cell + the
// eight Works as 16:9 frames with their loops. Back side: the hero sentence, printed again and again.
// Scroll slides the printing along the band (UV slide, geometry is built once). Hover flattens a frame to face
// the camera; fly-in pulls the band taut and rushes into the frame; opening: the Showreel is one frame, then the
// band uncoils into its knot.
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const wrap = (d, L) => d - L * Math.floor(d / L + 0.5)

  HOME.register({
    name: 'Ribbon',
    create(ctx) {
      const TAU = Math.PI * 2, S = 480, CR = 6, FOV = 50, HUD = 3, DRIFT = 0.5
      const size = ctx.size, works = ctx.works
      const BW = 3, FW = (BW * 16) / 9, G = 0.7, C = FW + G // band width, frame width, gap, cell pitch
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(FOV, size.w / size.h, 0.1, 200)
      scene.add(camera)

      // ---- hero sheet: the sentence in two lines, drawn once into one canvas ----------------------------------
      const textures = [], geos = [], mats = []
      const words = ctx.hero.split(/\s+/)
      let l1 = '', l2 = ''
      { // two balanced lines (cut near the middle, at a word)
        const half = ctx.hero.length / 2
        for (const w of words) { if (!l1 || (l1 + ' ' + w).length <= half * 1.1) l1 = l1 ? l1 + ' ' + w : w; else l2 = l2 ? l2 + ' ' + w : w }
      }
      const lines = [l1, l2].filter(Boolean).map((s) => { const t = ctx.text(s, { size: 160 }); textures.push(t.texture); return t })
      const TH = BW * 0.56
      const HL = Math.max(...lines.map((l) => l.aspect * TH)) + 1.3 // hero cell length
      const LC = 8 * C // one lap of the band: the eight Works; the hero sentence is printed on the back side
      const heroCanvas = document.createElement('canvas')
      heroCanvas.width = 1536; heroCanvas.height = Math.round((1536 * BW) / HL)
      {
        const g = heroCanvas.getContext('2d'), pxu = 1536 / HL, pitch = TH * 0.78
        lines.forEach((l, k) => {
          const wpx = l.aspect * TH * pxu, hpx = TH * pxu, cy = heroCanvas.height / 2 + (k - (lines.length - 1) / 2) * pitch * pxu
          g.drawImage(l.canvas, (1536 - wpx) / 2, cy - hpx / 2, wpx, hpx)
        })
      }
      const heroTex = new THREE.CanvasTexture(heroCanvas)
      heroTex.generateMipmaps = false; heroTex.minFilter = heroTex.magFilter = THREE.LinearFilter
      textures.push(heroTex)

      // ---- the knot: a trefoil lying flat (xz), seen from above, a belt standing on it. The band bends only about
      // its width axis, so the printing is never stretched (a band bent in its own plane stretches its outer edge).
      const asp0 = size.w / size.h, sx = clamp(asp0 * 0.6, 0.6, 1.15), EL0 = clamp(1.05 - 0.32 * asp0, 0.42, 0.85)
      const dense = 4000, dp = new Float32Array((dense + 1) * 3), cum = new Float32Array(dense + 1)
      for (let i = 0; i <= dense; i++) {
        const t = (i / dense) * TAU
        dp[i * 3] = (Math.sin(t) + 2 * Math.sin(2 * t)) * sx
        dp[i * 3 + 1] = -Math.sin(3 * t) * 0.3
        dp[i * 3 + 2] = Math.cos(t) - 2 * Math.cos(2 * t)
        if (i) cum[i] = cum[i - 1] + Math.hypot(dp[i * 3] - dp[i * 3 - 3], dp[i * 3 + 1] - dp[i * 3 - 2], dp[i * 3 + 2] - dp[i * 3 - 1])
      }
      const kappa = LC / cum[dense]
      let Pa = new Float32Array((S + 1) * 3)
      for (let j = 0, d = 0; j <= S; j++) {
        const s = (j / S) * cum[dense]
        while (d < dense - 1 && cum[d + 1] < s) d++
        const f = clamp((s - cum[d]) / Math.max(cum[d + 1] - cum[d], 1e-9), 0, 1)
        for (let c = 0; c < 3; c++) Pa[j * 3 + c] = (dp[d * 3 + c] + (dp[(d + 1) * 3 + c] - dp[d * 3 + c]) * f) * kappa
      }
      Pa.copyWithin(S * 3, 0, 3) // closed: last point == first
      const Ta = new Float32Array((S + 1) * 3), Wa = new Float32Array((S + 1) * 3), Na = new Float32Array((S + 1) * 3)
      const tangents = () => {
        for (let j = 0; j <= S; j++) {
          const a = ((j - 1 + S) % S) * 3, b = ((j + 1) % S) * 3
          const x = Pa[b] - Pa[a], y = Pa[b + 1] - Pa[a + 1], z = Pa[b + 2] - Pa[a + 2], l = Math.hypot(x, y, z) || 1
          Ta[j * 3] = x / l; Ta[j * 3 + 1] = y / l; Ta[j * 3 + 2] = z / l
        }
      }
      tangents()
      // the reading window: nearest the camera, tangent mostly horizontal
      let jw = 0
      const frames = () => { // width vector = the binormal (perpendicular to the bending), so the band never bends in its own plane and the
        // printing is not stretched; a small twist wobble that is zero at the window
        const K = 6
        for (let j = 0; j < S; j++) {
          const t = j * 3, tx = Ta[t], ty = Ta[t + 1], tz = Ta[t + 2], a = ((j - K + S) % S) * 3, b = ((j + K) % S) * 3
          let nx = Ta[b] - Ta[a], ny = Ta[b + 1] - Ta[a + 1], nz = Ta[b + 2] - Ta[a + 2]
          const d = nx * tx + ny * ty + nz * tz; nx -= tx * d; ny -= ty * d; nz -= tz * d
          const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl
          let wx = ty * nz - tz * ny, wy = tz * nx - tx * nz, wz = tx * ny - ty * nx // B = T x N
          if (wy < 0) { wx = -wx; wy = -wy; wz = -wz }
          const x = ((j - jw + S) % S) / S, al = 0.4 * Math.sin(TAU * x) * (1 - Math.cos(TAU * x)) * 0.5, ca = Math.cos(al), sa = Math.sin(al)
          const rx = ty * wz - tz * wy, ry = tz * wx - tx * wz, rz = tx * wy - ty * wx // T x W
          const ox = wx * ca + rx * sa, oy = wy * ca + ry * sa, oz = wz * ca + rz * sa
          Wa[t] = ox; Wa[t + 1] = oy; Wa[t + 2] = oz
          Na[t] = ty * oz - tz * oy; Na[t + 1] = tz * ox - tx * oz; Na[t + 2] = tx * oy - ty * ox // n = T x W
        }
        for (let c = 0; c < 3; c++) { Wa[S * 3 + c] = Wa[c]; Na[S * 3 + c] = Na[c] }
      }
      frames() // first pass, only to find the window
      let zmax = 0
      for (let j = 0; j < S; j++) zmax = Math.max(zmax, Pa[j * 3 + 2])
      const windowScore = (j) => Pa[j * 3 + 2] / zmax + 1.2 * Math.abs(Ta[j * 3]) + 2 * Wa[j * 3 + 1] // near, horizontal, band standing upright
      for (let j = 1; j < S; j++) if (windowScore(j) > windowScore(jw)) jw = j
      if (Ta[jw * 3] < 0) { // make the tangent run left to right at the window, so the front faces the camera
        for (let j = 0; j < Math.floor(S / 2); j++) for (let c = 0; c < 3; c++) { const a = Pa[j * 3 + c]; Pa[j * 3 + c] = Pa[(S - j) * 3 + c]; Pa[(S - j) * 3 + c] = a }
        Pa.copyWithin(S * 3, 0, 3)
        tangents(); jw = (S - jw) % S
      }
      frames() // final: twist is zero at the window
      let hx = 0, hy = 0, zc = 0
      const ce = Math.cos(EL0), se = Math.sin(EL0)
      for (let j = 0; j < S; j++) {
        const x = Pa[j * 3], y = Pa[j * 3 + 1], z = Pa[j * 3 + 2]
        hx = Math.max(hx, Math.abs(x)); hy = Math.max(hy, Math.abs(y * ce - z * se)); zc = Math.max(zc, y * se + z * ce)
      }
      hx += BW / 2; hy += (BW / 2) * ce + 0.4

      // ---- mesh --------------------------------------------------------------------------------------------------
      const pos = new Float32Array((S + 1) * (CR + 1) * 3), nor = new Float32Array(pos.length), uvs = new Float32Array((S + 1) * (CR + 1) * 2)
      for (let j = 0; j <= S; j++) for (let c = 0; c <= CR; c++) {
        const i = j * (CR + 1) + c, v = c / CR, o = j * 3
        for (let k = 0; k < 3; k++) { pos[i * 3 + k] = Pa[o + k] + Wa[o + k] * (v - 0.5) * BW; nor[i * 3 + k] = Na[o + k] }
        uvs[i * 2] = j / S; uvs[i * 2 + 1] = v
      }
      const idx = new Uint32Array(S * CR * 6)
      for (let j = 0, n = 0; j < S; j++) for (let c = 0; c < CR; c++) {
        const a = j * (CR + 1) + c, b = a + 1, d = a + CR + 1, e = d + 1
        idx[n++] = a; idx[n++] = d; idx[n++] = b; idx[n++] = b; idx[n++] = d; idx[n++] = e
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1))
      geo.computeBoundingSphere(); geos.push(geo)

      const rects = []
      for (let i = 0; i < 8; i++) { const q = ctx.loopRect(i); rects.push(new THREE.Vector4(q[0], q[1], q[2], q[3])) }
      const V3 = () => ({ value: new THREE.Vector3() })
      const mat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {
          uMap: { value: ctx.atlas }, uHero: { value: heroTex }, uRects: { value: rects }, uTime: { value: 0 }, uSlide: { value: 0 },
          uLc: { value: LC }, uHl: { value: HL }, uC: { value: C }, uG: { value: G }, uBw: { value: BW }, uFw: { value: FW },
          uFlutter: { value: 0 }, uPtrO: V3(), uPtrD: V3(), uPtrAmt: { value: 0 },
          uHx: { value: 0 }, uHAmt: { value: 0 }, uHC: V3(), uFx: V3(), uFy: V3(), uHsc: { value: 1 },
          uAHC: V3(), uAT: V3(), uAW: V3(), uAu: { value: 0 }, uUncoil: { value: 1 },
        },
        vertexShader: `
          uniform float uTime,uSlide,uLc,uBw,uFw,uFlutter,uPtrAmt,uHx,uHAmt,uHsc,uAu,uUncoil;
          uniform vec3 uPtrO,uPtrD,uHC,uFx,uFy,uAHC,uAT,uAW;
          varying vec2 vUv; varying vec3 vN, vP;
          void main(){
            float u = uv.x, v = uv.y;
            vec3 P = position, N = normal;
            // anchor: the straight tape through one frame (opening: the window; fly-in: the chosen frame)
            float dl = u - uAu; dl -= floor(dl + .5); dl *= uLc;
            vec3 tape = uAHC + uAT*dl + uAW*((v - .5)*uBw);
            float wU = smoothstep(0., 1., uUncoil*1.7 - (1. - abs(dl)/(.5*uLc))*.7);
            P = mix(tape, P, wU); N = normalize(mix(cross(uAT, uAW), N, wU));
            // hover: the frame flattens to face the camera, the band bends into it
            float dx = u*uLc - uSlide - uHx; dx -= uLc*floor(dx/uLc + .5);
            float wF = uHAmt*(1. - smoothstep(uFw*.5, uFw*.5 + 2.4, abs(dx)));
            vec3 fl = uHC + (uFx*dx + uFy*((v - .5)*uBw))*uHsc;
            P = mix(P, fl, wF); N = normalize(mix(N, cross(uFx, uFy), wF));
            // pointer: the nearby band leans toward the pointer ray
            vec3 dq = uPtrO + uPtrD*dot(P - uPtrO, uPtrD) - P;
            P += dq*.34*exp(-dot(dq, dq)/2.6)*uPtrAmt*(1. - wF);
            // speed: the band flutters
            float ph = u*uLc*.85 - uTime*9. + (v - .5)*2.6;
            P += N*(sin(ph)*.22 + sin(u*uLc*2.1 + uTime*6.3)*.08)*uFlutter*(1. - wF);
            vUv = uv; vN = N; vP = P;
            gl_Position = projectionMatrix*viewMatrix*vec4(P, 1.);
          }`,
        fragmentShader: `
          precision highp float;
          uniform sampler2D uMap, uHero; uniform vec4 uRects[8];
          uniform float uSlide,uLc,uHl,uC,uG,uBw,uFw,uHx,uHAmt;
          varying vec2 vUv; varying vec3 vN, vP;
          void main(){
            vec3 V = normalize(cameraPosition - vP);
            float fac = dot(normalize(vN), V);
            float v = vUv.y;
            float xt = vUv.x*uLc - uSlide;
            float xs = mod(xt, uLc);
            float ci = min(floor(xs/uC), 7.);
            float lx = xs - ci*uC;
            float fx = (lx - uG*.5)/(uC - uG);
            vec4 rc = uRects[int(ci)];
            float xb = mod(-xt, uLc), kb = floor(xb/uHl);
            // all texture reads happen outside branches, so no mip/derivative seams at the cell edges
            vec3 aF = texture2D(uMap, rc.xy + clamp(vec2(fx, v), .004, .996)*rc.zw).rgb;
            vec4 hB = texture2D(uHero, vec2(clamp((xb - kb*uHl)/uHl, 0., 1.), v));
            vec3 col = vec3(.102);
            float dx = xt - uHx; dx -= uLc*floor(dx/uLc + .5);
            float hb = uHAmt*(1. - smoothstep(uFw*.5 - .02, uFw*.5, abs(dx)));
            if (fac > 0.) {
              if (fx >= 0. && fx <= 1.) {
                col = aF*1.15*(1. + .4*hb);
                float e = min((.5 - abs(fx - .5))*(uC - uG), (.5 - abs(v - .5))*uBw);
                col *= mix(.3, 1., smoothstep(0., .05, e));
                col = mix(col, vec3(.95), hb*(1. - smoothstep(0., .07, e))*.85);
              }
            } else if (kb < floor(uLc/uHl)) col = mix(col, hB.rgb, hB.a);
            float sh = fac > 0. ? mix(.85, 1., smoothstep(0., .5, fac)) : .45; // facing side near full, back side at 45%
            sh *= mix(.8, 1., 1. - smoothstep(16., 40., length(cameraPosition - vP)));
            float edge = 1. - smoothstep(.018, .05, min(v, 1. - v)*uBw); // thin bright line along both band edges
            gl_FragColor = vec4(mix(col*sh, vec3(.93), edge*(fac > 0. ? 1. : .6)), 1.);
          }`,
      })
      mats.push(mat)
      const band = new THREE.Mesh(geo, mat)
      band.frustumCulled = false
      scene.add(band)

      // ---- showreel frame (opening): one frame of the band at the window --------------------------------------------
      const reelMat = new THREE.MeshBasicMaterial({ map: ctx.showreel.texture, transparent: true, depthWrite: false })
      const reelGeo = new THREE.PlaneGeometry(FW, BW)
      const reel = new THREE.Mesh(reelGeo, reelMat); reel.renderOrder = 5
      scene.add(reel); mats.push(reelMat); geos.push(reelGeo)

      // ---- hover tags: HUD children of the camera ---------------------------------------------------------------------
      const hud = new THREE.Group(); camera.add(hud)
      const mkText = (str, opts) => {
        const t = ctx.text(str, opts); textures.push(t.texture)
        const m = new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false }); mats.push(m)
        const mesh = new THREE.Mesh(unit, m); mesh.renderOrder = 31
        return { mesh, mat: m, canvas: t.canvas }
      }
      const unit = new THREE.PlaneGeometry(1, 1); geos.push(unit)
      const PAD = 16
      const tags = works.map((w) => {
        const title = mkText(w.title, { size: 120 }), meta = mkText(`${w.kind} · ${w.year}`, { caps: true, size: 28, color: '#8f8f8f' })
        const plateMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false }); mats.push(plateMat)
        const plate = new THREE.Mesh(unit, plateMat); plate.renderOrder = 30
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
          const k = (size.w - 56) / (Math.max(tw, mw) + PAD * 2)
          if (k < 1) { tf *= k; mf *= k; [tw, th, mw, mh] = dims() }
          const pw = Math.max(tw, mw) + PAD * 2, ph = th * 0.82 + mh * 0.9 + PAD * 2
          t.wpx = pw; t.hpx = ph
          t.plate.scale.set(pw, ph, 1); t.title.mesh.scale.set(tw, th, 1); t.meta.mesh.scale.set(mw, mh, 1)
          const padT = Math.ceil(120 * 0.18) * tf, padM = Math.ceil(28 * 0.18) * mf
          t.title.mesh.position.set(-pw / 2 + PAD + tw / 2 - padT, ph / 2 - PAD - th / 2 + 3, 0.01)
          t.meta.mesh.position.set(-pw / 2 + PAD + mw / 2 - padM, -ph / 2 + PAD + mh / 2 - 1, 0.01)
        })
      }

      // ---- helpers on the curve --------------------------------------------------------------------------------------
      const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3()
      const sample = (arr, u, out) => {
        const f = (((u % 1) + 1) % 1) * S, i = Math.min(Math.floor(f), S - 1), k = f - i
        return out.set(arr[i * 3] + (arr[i * 3 + 3] - arr[i * 3]) * k, arr[i * 3 + 1] + (arr[i * 3 + 4] - arr[i * 3 + 1]) * k, arr[i * 3 + 2] + (arr[i * 3 + 5] - arr[i * 3 + 2]) * k)
      }
      const cellX = (i) => i * C + C / 2
      const uw = jw / S, slideRest = uw * LC - cellX(0) // slide that puts frame 0 at the window

      // ---- state --------------------------------------------------------------------------------------------------------
      const open = { cam: 1, unc: 1, reel: 0, sl: 0, kick: 0 }
      const fly = { p: 0, r: 0 }
      const look = { x: 0, y: 0 }
      let slide = slideRest, slideV = 0, speedEff = 0, flutter = 0, prevSl = 0
      let opening = false, flying = false, touched = false, locked = false
      let hot = -1, hoverOn = false, shown = -1, hAmt = 0, focusCell = -1, tagA = 0, tagCell = 0
      let tl = null, flyTl = null, focusTween = null, ptrAmt = 0, D = 22, fovNow = FOV
      let hsc = 1
      const fs = { x: 0, y: 0, l: 0, t: 0, cell: -2 } // the flattened frame and its tag, in px, eased
      const hc = new THREE.Vector3(), fx = new THREE.Vector3(), fy = new THREE.Vector3(), fn = new THREE.Vector3()
      const camR = new THREE.Vector3(), camU = new THREE.Vector3(), camB = new THREE.Vector3()
      const baseQ = new THREE.Quaternion(), startQ = new THREE.Quaternion(), tq = new THREE.Quaternion(), tpos = new THREE.Vector3(), startP = new THREE.Vector3(), basePos = new THREE.Vector3()
      const wHC = new THREE.Vector3(), wT = new THREE.Vector3(), wW = new THREE.Vector3(), wN = new THREE.Vector3()
      const ray = new THREE.Raycaster(), ptr2 = new THREE.Vector2(), mx = new THREE.Matrix4(), hits = []
      sample(Pa, uw, wHC); sample(Ta, uw, wT); sample(Wa, uw, wW); sample(Na, uw, wN)
      const U = mat.uniforms
      U.uAHC.value.copy(wHC); U.uAT.value.copy(wT); U.uAW.value.copy(wW); U.uAu.value = uw

      const fitDist = () => {
        const tn = Math.tan((FOV * Math.PI) / 360), a = size.w / size.h
        D = Math.max(hy / (0.88 * tn), hx / (0.88 * tn * a)) * (a < 1 ? 0.6 : 0.82) + zc * 0.6 // portrait: crop the knot so the band is ~30% of the width
      }
      const coverDist = () => {
        const tn = Math.tan((FOV * Math.PI) / 360), a = size.w / size.h
        return Math.min(BW / (2 * tn), FW / (2 * tn * a)) * 0.98
      }

      function cellAtHit(h) { // which Work frame is printed where the ray hit the band (front side only)
        const j = Math.round(h.uv.x * S) % S
        const ray3 = ray.ray.direction
        if (Na[j * 3] * ray3.x + Na[j * 3 + 1] * ray3.y + Na[j * 3 + 2] * ray3.z >= 0) return -1
        const x = ((h.uv.x * LC - slide - open.sl) % LC + LC) % LC
        const ci = Math.min(Math.floor(x / C), 7), lx = x - ci * C
        return lx < G / 2 || lx > C - G / 2 ? -1 : ci
      }
      function rayCell() {
        hits.length = 0
        ray.intersectObject(band, false, hits)
        return hits.length ? cellAtHit(hits[0]) : -1
      }
      const slideNow = () => slide + open.sl

      function frameOf(i, dt) { // the frame flattens upright, comes forward to ~40% of the view width, tag beside it
        const w = size.w, h = size.h, asp = w / h, tg = tags[i]
        sample(Pa, (cellX(i) + slideNow()) / LC, hc)
        tmpB.copy(hc).project(camera)
        const cx = ((tmpB.x + 1) / 2) * w, cy = ((1 - tmpB.y) / 2) * h
        const fwp = (asp < 1 ? 0.84 : 0.4) * w, fhp = (fwp * 9) / 16, M = 28, TOP = w < 768 ? 84 : 100, BOT = h - 30
        let fcx, fcy, tl_, tt
        if (asp >= 1 && fwp + 22 + tg.wpx + 2 * M <= w) { // side by side
          const right = cx <= w / 2, gw = fwp + 22 + tg.wpx, gl = clamp(right ? cx - fwp / 2 : cx + fwp / 2 - gw, M, w - M - gw)
          fcx = right ? gl + fwp / 2 : gl + tg.wpx + 22 + fwp / 2; tl_ = right ? gl + fwp + 22 : gl
          fcy = clamp(cy, TOP + fhp / 2, Math.max(TOP + fhp / 2, BOT - fhp / 2)); tt = fcy - tg.hpx / 2
        } else { // stacked: frame, then the tag under it
          const gt = clamp(cy - fhp / 2, TOP, Math.max(TOP, BOT - (fhp + 16 + tg.hpx)))
          fcx = clamp(cx, M + fwp / 2, w - M - fwp / 2); fcy = gt + fhp / 2
          tl_ = clamp(fcx - fwp / 2, M, Math.max(M, w - M - tg.wpx)); tt = gt + fhp + 16
        }
        tt = clamp(tt, TOP, Math.max(TOP, BOT - tg.hpx))
        const k = fs.cell === i ? 1 - Math.exp(-dt * 14) : 1
        fs.cell = i; fs.x += (fcx - fs.x) * k; fs.y += (fcy - fs.y) * k; fs.l += (tl_ - fs.l) * k; fs.t += (tt - fs.t) * k
        const tn = Math.tan((camera.fov * Math.PI) / 360), dT = D * 0.45, visH = 2 * tn * dT, visW = visH * asp
        hc.copy(camera.position).addScaledVector(camR, ((fs.x / w) * 2 - 1) * (visW / 2)).addScaledVector(camU, (1 - (fs.y / h) * 2) * (visH / 2)).addScaledVector(camB, -dT)
        hsc = ((fwp / w) * visW) / FW
        fx.copy(camR); fy.copy(camU); fn.copy(camB)
        U.uHx.value = cellX(i); U.uHC.value.copy(hc); U.uFx.value.copy(fx); U.uFy.value.copy(fy); U.uHsc.value = hsc
      }
      function startOpening() {
        opening = true
        open.cam = 0; open.unc = 0; open.reel = 1; open.sl = -LC; open.kick = 0
        tl = gsap.timeline({ onComplete: () => { opening = false } })
        tl.to(open, { cam: 1, duration: 1.9, ease: 'power3.inOut' }, 0.6)
        tl.to(open, { unc: 1, duration: 1.8, ease: 'power2.inOut' }, 0.7)
        tl.to(open, { reel: 0, duration: 0.7, ease: 'power1.in' }, 1.6)
        tl.to(open, { sl: 0, duration: 1.7, ease: 'power3.out' }, 1.2)
        tl.to(open, { kick: 1, duration: 0.8, ease: 'power2.out' }, 1.0).to(open, { kick: 0, duration: 1.0, ease: 'power2.inOut' }, 1.8)
      }
      function flyTo(i) {
        if (flying || opening || i < 0) return
        flying = true; locked = true; touched = true; ctx.cursor.hover(false); hoverOn = false
        shown = i; frameOf(i, 0.016) // the chosen frame flattens, then the camera rushes into it
        const u = (cellX(i) + slideNow()) / LC
        sample(Pa, u, U.uAHC.value); sample(Ta, u, U.uAT.value); sample(Wa, u, U.uAW.value); U.uAu.value = ((u % 1) + 1) % 1
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        flyTl.to(fly, { p: 1, duration: 0.85, ease: 'power3.in' }, 0)
        flyTl.to(fly, { r: 1, duration: 0.7, ease: 'power2.inOut' }, 0)
        flyTl.to(open, { unc: 0, duration: 0.8, ease: 'power2.inOut' }, 0) // the band pulls taut
      }
      function bring(i, then) { // keyboard: slide the printing so Work i's frame sits in the reading window
        touched = true
        if (focusTween) focusTween.kill()
        const target = uw * LC - cellX(i), from = slide, to = from + wrap(target - from, LC), o = { v: 0 }
        locked = true
        focusTween = gsap.to(o, { v: 1, duration: 0.65, ease: 'power3.inOut', onUpdate: () => { slide = from + (to - from) * o.v }, onComplete: () => { locked = false; if (then) then() } })
      }

      function update(t, dt) {
        dt = clamp(dt, 0.0001, 0.05)
        const sc = ctx.scroll
        if (Math.abs(sc.v) > 40) touched = true

        // slide dynamics: scroll pulls the band with inertia; hovering slows it so a frame can be caught
        if (!opening && !flying && !locked) {
          let target
          target = (DRIFT + clamp(sc.v, -4000, 4000) * 0.012) * (hot >= 0 ? 0.25 : 1)
          slideV += (clamp(target, -40, 40) - slideV) * (1 - Math.exp(-dt * 2.4))
          slide += slideV * dt
        } else if (flying) slideV *= 0.85
        const vOpen = (open.sl - prevSl) / dt; prevSl = open.sl
        speedEff = slideV + vOpen
        flutter += (clamp((Math.abs(speedEff) - 1.5) / 18, 0, 1) + 0.12 - flutter) * Math.min(1, dt * 6)

        // camera: orbit with weight, pointer is the look-around; opening and fly-in blend away from it
        const steer = !opening && !flying && !ctx.touch && ctx.pointer.inside
        const px = steer ? ctx.pointer.nx : 0, py = steer ? ctx.pointer.ny : 0, k = 1 - Math.exp(-dt * 3)
        look.x += (-px * 0.45 - look.x) * k; look.y += (-py * 0.22 - look.y) * k
        const el = EL0 + look.y + Math.sin(t * 0.23) * 0.02, az = look.x + Math.sin(t * 0.17) * 0.03
        const fovT = FOV + 6 * clamp(Math.abs(speedEff) / 40, 0, 1) + 8 * open.kick
        if (Math.abs(fovT - fovNow) > 0.01) { fovNow = fovT; camera.fov = fovT; camera.updateProjectionMatrix() }
        basePos.set(D * Math.sin(az) * Math.cos(el), D * Math.sin(el), D * Math.cos(az) * Math.cos(el))
        camera.position.copy(basePos); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0)
        if (opening && open.cam < 1) {
          startP.copy(wHC).addScaledVector(wN, coverDist()); startQ.setFromRotationMatrix(mx.makeBasis(wT, wW, wN))
          camera.position.lerpVectors(startP, basePos, open.cam)
          baseQ.copy(camera.quaternion); camera.quaternion.copy(startQ).slerp(baseQ, open.cam)
        }
        if (flying && (fly.p > 0 || fly.r > 0)) {
          const tn = Math.tan((camera.fov * Math.PI) / 360), a = size.w / size.h
          const fill = Math.min((BW * hsc) / (2 * tn), (FW * hsc) / (2 * tn * a)) * 0.97
          tpos.copy(hc).addScaledVector(fn, fill)
          tq.setFromRotationMatrix(mx.makeBasis(fx, fy, fn))
          camera.position.lerp(tpos, fly.p); camera.quaternion.slerp(tq, fly.r)
        }
        camera.updateMatrixWorld(true)
        camera.matrixWorld.extractBasis(camR, camU, camB)

        // hover: the flattened frame keeps the hover while the pointer is on it; otherwise ray vs the band
        let hit = -1
        const live = !opening && !flying && !ctx.touch && ctx.pointer.inside && Math.abs(speedEff) < 14
        if (live) {
          ray.setFromCamera(ptr2.set(ctx.pointer.nx, ctx.pointer.ny), camera)
          let keep = false
          if (shown >= 0 && hAmt > 0.5 && hot === shown) {
            const o = ray.ray.origin, d = ray.ray.direction, den = d.dot(fn)
            if (Math.abs(den) > 1e-4) {
              const tt = tmpA.copy(hc).sub(o).dot(fn) / den
              tmpB.copy(o).addScaledVector(d, tt).sub(hc)
              keep = tt > 0 && Math.abs(tmpB.dot(fx)) < (FW * hsc) / 2 * 1.08 && Math.abs(tmpB.dot(fy)) < (BW * hsc) / 2 * 1.08
            }
          }
          hit = keep ? shown : rayCell()
          if (hit >= 0) touched = true
        }
        if ((hit >= 0) !== hoverOn) { hoverOn = hit >= 0; ctx.cursor.hover(hoverOn) }
        hot = flying ? shown : hit >= 0 ? hit : !opening && focusCell >= 0 ? focusCell : -1
        U.uPtrAmt.value = ptrAmt += ((steer && ctx.pointer.inside ? 1 : 0) - ptrAmt) * Math.min(1, dt * 6)
        if (steer) { ray.setFromCamera(ptr2.set(ctx.pointer.nx, ctx.pointer.ny), camera); U.uPtrO.value.copy(ray.ray.origin); U.uPtrD.value.copy(ray.ray.direction) }

        // flatten state: one frame at a time; swap only after the old one has settled back
        if (hot !== shown && !flying) {
          hAmt += (0 - hAmt) * Math.min(1, dt * 14)
          if (hAmt < 0.04) { hAmt = 0; shown = hot }
        } else hAmt += ((shown >= 0 && hot === shown ? 1 : 0) - hAmt) * Math.min(1, dt * 9)
        if (shown >= 0 && !flying) frameOf(shown, dt)
        U.uHAmt.value = shown >= 0 ? hAmt : 0

        U.uTime.value = t; U.uSlide.value = slideNow(); U.uFlutter.value = flutter; U.uUncoil.value = open.unc
        reel.position.copy(wHC).addScaledVector(wN, 0.03)
        reel.quaternion.setFromRotationMatrix(mx.makeBasis(wT, wW, wN))
        reelMat.opacity = open.reel; reel.visible = open.reel > 0.01

        // the glass: speed, the opening and the fly-in push it
        ctx.crt.push = clamp((Math.abs(speedEff) - 1.5) / 26 + (opening ? 0.3 * (1 - open.cam) : 0) + fly.p * 0.6, 0, 1)

        // tag beside the flattened frame
        const want = hAmt > 0.25 && shown >= 0 && !flying && !opening
        if (want && shown !== tagCell) { tags[tagCell].group.visible = false; tagCell = shown; tagA = 0 }
        tagA += ((want ? 1 : 0) - tagA) * Math.min(1, dt * 12)
        const tg = tags[tagCell]
        tg.group.visible = tagA > 0.01
        if (tg.group.visible) {
          const w = size.w, h = size.h, upp = (2 * Math.tan((camera.fov * Math.PI) / 360) * HUD) / h
          tg.group.position.set((fs.l + tg.wpx / 2 - w / 2 - (1 - tagA) * 14) * upp, -(fs.t + tg.hpx / 2 - h / 2) * upp, -HUD)
          tg.group.scale.setScalar(upp)
          tg.plateMat.opacity = 0.86 * tagA; tg.title.mat.opacity = tagA; tg.meta.mat.opacity = tagA
        }
      }

      fitDist(); layoutTags()
      if (ctx.reduced) { open.sl = 0 } else startOpening()

      return {
        scene, camera, update,
        resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); fitDist(); layoutTags() },
        tap() {
          if (opening) { tl.progress(1); return }
          if (flying) return
          let i = hot
          if (i < 0 || ctx.touch) { camera.updateMatrixWorld(true); ray.setFromCamera(ptr2.set(ctx.pointer.nx, ctx.pointer.ny), camera); i = rayCell() }
          if (i >= 0) {
            flyTo(i)
          }
        },
        focus(i) {
          if (focusTween) focusTween.kill()
          locked = false
          focusCell = i
          if (i >= 0 && !opening) bring(i)
        },
        activate(i) {
          if (opening) tl.progress(1)
          if (flying) return
          focusCell = i; bring(i, () => flyTo(i))
        },
        back() {
          if (flyTl) flyTl.kill()
          gsap.to(fly, { p: 0, r: 0, duration: 0.9, ease: 'power3.inOut' })
          gsap.to(open, { unc: 1, duration: 0.9, ease: 'power3.inOut', onComplete: () => { flying = false; locked = false; focusCell = -1 } })
        },
        dispose() {
          if (tl) tl.kill(); if (flyTl) flyTl.kill(); if (focusTween) focusTween.kill()
          gsap.killTweensOf(fly); gsap.killTweensOf(open)
          ctx.cursor.hover(false)
          geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); textures.forEach((x) => x.dispose())
          scene.remove(camera, band, reel)
        },
      }
    },
  })
})()
