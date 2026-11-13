// THROWAWAY prototype: Tunnel. Fly down an endless hex tube whose wall is Work screens (instanced).
// Scroll = speed (screens whip past, stretch, glass pushes). Pointer steers. Hover lifts a screen; tap flies in.
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

  HOME.register({
    name: 'Tunnel',
    create(ctx) {
      const PER = 6, NR = 22, P = 3.0, RA = 4.4, W = 4.7, H = (W * 9) / 16, L = NR * P, N = PER * NR
      const FOV = 70, HUD = 3, HERO_Z = 4.4, DRIFT = 1.4, TAU = Math.PI * 2, BILL_D = 6
      const works = ctx.works, size = ctx.size
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(FOV, size.w / size.h, 0.1, 140)
      camera.rotation.order = 'YXZ'
      scene.add(camera)

      // ---- the wall: N instanced screens, all placement maths in the vertex shader -------------------------
      const ringOf = new Float32Array(N), ang = new Float32Array(N), workOf = new Int8Array(N)
      const aRect = new Float32Array(N * 4), lift = new Float32Array(N)
      for (let i = 0; i < N; i++) {
        const r = Math.floor(i / PER), k = i % PER
        ringOf[i] = r
        ang[i] = (k + (r & 1 ? 0 : 0.5)) * (TAU / PER) // even rings: panel on top and bottom; odd rings: on the sides
        workOf[i] = i % 8
        const q = ctx.loopRect(workOf[i]), ix = 0.002
        aRect.set([q[0] + ix, q[1] + ix, q[2] - ix * 2, q[3] - ix * 2], i * 4)
      }
      const geo = new THREE.InstancedBufferGeometry()
      geo.copy(new THREE.PlaneGeometry(1, 1))
      geo.instanceCount = N
      geo.setAttribute('aRing', new THREE.InstancedBufferAttribute(ringOf, 1))
      geo.setAttribute('aAng', new THREE.InstancedBufferAttribute(ang, 1))
      geo.setAttribute('aRect', new THREE.InstancedBufferAttribute(aRect, 4))
      const liftAttr = new THREE.InstancedBufferAttribute(lift, 1)
      liftAttr.setUsage(THREE.DynamicDrawUsage)
      geo.setAttribute('aLift', liftAttr)
      const wallMat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {
          uMap: { value: ctx.atlas }, uS: { value: 0 }, uL: { value: L }, uP: { value: P }, uRa: { value: RA },
          uW: { value: W }, uH: { value: H }, uStretch: { value: 0 }, uWave: { value: 1000 }, uCap: { value: 1000 }, uCrest: { value: 0 },
          uCamP: { value: new THREE.Vector3() }, uCamR: { value: new THREE.Vector3(1, 0, 0) }, uCamU: { value: new THREE.Vector3(0, 1, 0) }, uCamB: { value: new THREE.Vector3(0, 0, 1) },
          uBillS: { value: 1 }, uBillD: { value: BILL_D }, uBillLim: { value: new THREE.Vector2() },
        },
        vertexShader: `
          attribute float aRing; attribute float aAng; attribute vec4 aRect; attribute float aLift;
          uniform float uS,uL,uP,uRa,uW,uH,uStretch,uBillS,uBillD; uniform vec3 uCamP,uCamR,uCamU,uCamB; uniform vec2 uBillLim;
          varying vec2 vUv, vL; varying float vD, vLift;
          void main(){
            float d = mod(aRing*uP - uS + 2.*uP, uL) - 2.*uP;
            float cs = cos(aAng), sn = sin(aAng);
            float sg = sn > .01 ? -1. : 1.; // upper half: roll the panel 180 deg, so its loop keeps its up toward screen up
            vec3 x = vec3(-sn,cs,0.)*sg, y = vec3(0.,0.,-1.)*sg;
            vec3 c = vec3(cs,sn,0.)*(uRa - .02*mod(aRing,3.)) + vec3(0.,0.,-d);
            vec3 wp = c + x*position.x*uW + y*position.y*uH*(1. + uStretch*.9);
            // lifted: the screen turns to face the camera and comes forward as a big upright billboard
            vec3 loc = normalize(c - uCamP)*uBillD;
            vec3 bc = uCamP + uCamR*clamp(dot(loc,uCamR), -uBillLim.x, uBillLim.x) + uCamU*clamp(dot(loc,uCamU), -uBillLim.y, uBillLim.y) + uCamB*dot(loc,uCamB);
            vec3 bp = bc + (uCamR*position.x*uW + uCamU*position.y*uH)*uBillS;
            wp = mix(wp, bp, smoothstep(0., 1., aLift));
            gl_Position = projectionMatrix*viewMatrix*vec4(wp,1.);
            vUv = aRect.xy + uv*aRect.zw; vL = uv; vD = d; vLift = aLift;
          }`,
        fragmentShader: `
          precision highp float;
          uniform sampler2D uMap; uniform float uW,uH,uL,uWave,uCap,uCrest,uStretch;
          varying vec2 vUv, vL; varying float vD, vLift;
          void main(){
            if (vD > uCap) discard; // opening: the tube ends at the Showreel cap
            vec3 col = texture2D(uMap, vUv).rgb*1.12;
            float e = min(min(vL.x,1.-vL.x)*uW, min(vL.y,1.-vL.y)*uH);
            col *= mix(.25, 1., smoothstep(0., .07, e));
            col = mix(col, vec3(.93), (1. - smoothstep(0., .05, e))*vLift*.9);
            float fade = 1. - smoothstep(.42*uL, .92*uL, vD);
            float t = uWave - vD;
            float lit = mix(.08, 1., 1. - smoothstep(uWave - 6., uWave, vD));
            float crest = uCrest*exp(-pow((t - 2.)/2.2, 2.))*smoothstep(0., 1., t);
            float k = (.92 + .5*vLift)*fade*lit;
            col = col*k + vec3(crest*.5*fade) + vec3(uStretch*.05*fade);
            gl_FragColor = vec4(col, 1.);
          }`,
      })
      const wall = new THREE.Mesh(geo, wallMat)
      wall.frustumCulled = false
      scene.add(wall)

      // ---- opening end cap: the Showreel, which turns out to be the end of the tube -------------------------
      const CAP_W = 8, CAP_H = 4.5
      const reelMat = new THREE.MeshBasicMaterial({ map: ctx.showreel.texture, transparent: true, depthWrite: false })
      const reel = new THREE.Mesh(new THREE.PlaneGeometry(CAP_W, CAP_H), reelMat)
      scene.add(reel)
      const coverDist = () => {
        const tn = Math.tan((FOV * Math.PI) / 360), a = ctx.size.w / ctx.size.h
        return Math.min(CAP_H / (2 * tn), CAP_W / (2 * tn * a)) * 0.98
      }

      // ---- hero sentence + dark veil + hover tags: all children of the camera, so always inside the view ------
      const hud = new THREE.Group()
      camera.add(hud)
      const textMat = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
      const textures = [], mats = [], geos = [geo]
      const mkText = (str, opts) => {
        const t = ctx.text(str, opts); textures.push(t.texture)
        const m = textMat(t.texture); mats.push(m)
        const g = new THREE.PlaneGeometry(1, 1); geos.push(g)
        const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 20
        return { mesh, mat: m, aspect: t.aspect, canvas: t.canvas }
      }
      const splitLines = (str, n) => {
        const words = str.split(/\s+/), target = (str.length / n) * 0.9, out = []
        let cur = ''
        for (const w of words) {
          cur = cur ? cur + ' ' + w : w
          if (cur.length >= target && out.length < n - 1) { out.push(cur); cur = '' }
        }
        if (cur) out.push(cur)
        return out
      }
      const variants = [2, 4].map((n) => {
        const group = new THREE.Group(); group.visible = false
        const lines = splitLines(ctx.hero, n).map((s) => mkText(s, { size: 160 }))
        lines.forEach((l) => group.add(l.mesh))
        hud.add(group)
        return { group, lines }
      })
      let variant = variants[0]
      const veilMat = new THREE.ShaderMaterial({
        transparent: true, depthTest: false, depthWrite: false, uniforms: { uA: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `varying vec2 vUv; uniform float uA;
          void main(){ float r = length((vUv - .5)*2.); gl_FragColor = vec4(0., 0., 0., uA*.82*(1. - smoothstep(.1, 1., r))); }`,
      })
      const veilGeo = new THREE.PlaneGeometry(1, 1); geos.push(veilGeo)
      const veil = new THREE.Mesh(veilGeo, veilMat)
      veil.position.z = -HERO_Z - 0.05; veil.renderOrder = 19
      hud.add(veil)
      const heroIn = { l0: 0, l1: 0, l2: 0, l3: 0 }
      let lineBase = [], lineH = 1

      const layoutHero = () => {
        const a = size.w / size.h, tn = Math.tan((FOV * Math.PI) / 360)
        const visH = 2 * tn * HERO_Z, visW = visH * a
        variants.forEach((v) => (v.group.visible = false))
        variant = a < 0.9 ? variants[1] : variants[0]
        variant.group.visible = true
        const ls = variant.lines, n = ls.length
        const maxA = Math.max(...ls.map((l) => l.aspect))
        lineH = Math.min((Math.min(visW * 0.84, 9.4)) / maxA, (visH * 0.55) / (n * 0.8))
        lineBase = ls.map((l, j) => {
          l.mesh.scale.set(lineH * l.aspect, lineH, 1)
          const y = ((n - 1) / 2 - j) * lineH * 0.8
          l.mesh.position.set(0, y, -HERO_Z)
          return y
        })
        veil.scale.set(Math.min(visW * 1.1, maxA * lineH * 1.5), n * lineH * 0.8 * 2.4 + lineH, 1)
      }

      // hover tags (one per Work), laid out in px, shown as HUD at depth HUD
      const tags = works.map((w) => {
        const title = mkText(w.title, { size: 120 }), meta = mkText(`${w.kind} · ${w.year}`, { caps: true, size: 28, color: '#8f8f8f' })
        const plateMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false })
        mats.push(plateMat)
        const plate = new THREE.Mesh(veilGeo, plateMat); plate.renderOrder = 30
        title.mesh.renderOrder = 31; meta.mesh.renderOrder = 31
        const group = new THREE.Group(); group.visible = false
        group.add(plate, title.mesh, meta.mesh); hud.add(group)
        return { group, plate, plateMat, title, meta, wpx: 0, hpx: 0 }
      })
      const PAD = 16
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
          t.plate.scale.set(pw, ph, 1)
          t.title.mesh.scale.set(tw, th, 1); t.meta.mesh.scale.set(mw, mh, 1)
          const padT = Math.ceil(120 * 0.18) * tf, padM = Math.ceil(28 * 0.18) * mf
          t.title.mesh.position.set(-pw / 2 + PAD + tw / 2 - padT, ph / 2 - PAD - th / 2 + 3, 0.01)
          t.meta.mesh.position.set(-pw / 2 + PAD + mw / 2 - padM, -ph / 2 + PAD + mh / 2 - 1, 0.01)
        })
      }

      // ---- state -----------------------------------------------------------------------------------------------
      const open = { dist: 0, d0: 0, extra: 0, wave: 0, reel: 0, kick: 0, crest: 0, ta: 1 }
      const fly = { p: 0, r: 0 }
      const look = { x: 0, y: 0 }, pos = { x: 0, y: 0 }
      let sBase = 0, sFocus = 0, sNow = 0, speedS = DRIFT, stretch = 0, prevDist = 0
      let opening = false, flying = false, flySlot = -1, hot = -1, hoverOn = false, focusSlot = -1
      let tagWork = 0, tagA = 0, focusTween = null, tl = null, flyTl = null, fovNow = FOV, heroA = 0
      const ray = new THREE.Raycaster(), ptr2 = new THREE.Vector2(), tpos = new THREE.Vector3(), tq = new THREE.Quaternion()
      const vb = new THREE.Vector3(), vr = new THREE.Vector3(), vu = new THREE.Vector3(), flyBC = new THREE.Vector3(), flyB = new THREE.Vector3(), flyQ = new THREE.Quaternion()
      const rect = { cx: 0, cy: 0, hx: 0, hy: 0 }, tagPos = { l: 0, t: 0 }, camR = new THREE.Vector3(), camU = new THREE.Vector3(), camB = new THREE.Vector3()
      let returning = false, limX = 0, limY = 0, hwW = 1, hhW = 1

      const slotD = (i, s) => {
        let d = (ringOf[i] * P - s + 2 * P) % L
        if (d < 0) d += L
        return d - 2 * P
      }
      const U = wallMat.uniforms
      const billCenter = (i, out) => { // where the lifted screen hangs: same maths as the vertex shader
        const a = ang[i], cs = Math.cos(a), sn = Math.sin(a), ra = RA - 0.02 * (ringOf[i] % 3)
        out.set(cs * ra, sn * ra, -slotD(i, sNow)).sub(U.uCamP.value).normalize().multiplyScalar(BILL_D)
        const lx = clamp(out.dot(U.uCamR.value), -limX, limX), ly = clamp(out.dot(U.uCamU.value), -limY, limY), lz = out.dot(U.uCamB.value)
        return out.copy(U.uCamP.value).addScaledVector(U.uCamR.value, lx).addScaledVector(U.uCamU.value, ly).addScaledVector(U.uCamB.value, lz)
      }
      const billRect = (i) => { // the billboard in picture NDC
        billCenter(i, vb)
        vr.copy(vb).addScaledVector(U.uCamR.value, hwW).project(camera); vu.copy(vb).addScaledVector(U.uCamU.value, hhW).project(camera); vb.project(camera)
        rect.cx = vb.x; rect.cy = vb.y; rect.hx = Math.abs(vr.x - vb.x); rect.hy = Math.abs(vu.y - vb.y)
      }
      const pick = () => { // ray vs wall screens; the pointer is already mapped through the glass bend
        camera.updateMatrixWorld(true)
        ray.setFromCamera(ptr2.set(ctx.pointer.nx, ctx.pointer.ny), camera)
        const o = ray.ray.origin, dr = ray.ray.direction, st = 1 + stretch * 0.9
        if (hot >= 0 && lift[hot] > 0.4) { // the lifted screen keeps the hover while the pointer is on it
          billRect(hot)
          if (Math.abs(ctx.pointer.nx - rect.cx) < rect.hx * 1.08 && Math.abs(ctx.pointer.ny - rect.cy) < rect.hy * 1.08) return hot
        }
        let best = -1, bt = 1e9
        for (let i = 0; i < N; i++) {
          const d = slotD(i, sNow)
          if (d < 0.6 || d > 42) continue
          const a = ang[i], cs = Math.cos(a), sn = Math.sin(a)
          const den = -(dr.x * cs + dr.y * sn)
          if (den > -1e-4) continue
          const ra = RA - 0.02 * (ringOf[i] % 3)
          const cx = cs * ra, cy = sn * ra, cz = -d
          const t = (-(cx - o.x) * cs - (cy - o.y) * sn) / den
          if (t <= 0 || t >= bt) continue
          const px = o.x + dr.x * t, py = o.y + dr.y * t, pz = o.z + dr.z * t
          const u = (-sn * (px - cx) + cs * (py - cy)) / (W / 2), v = -(pz - cz) / ((H * st) / 2)
          const tol = 1
          if (Math.abs(u) < tol && Math.abs(v) < tol) { best = i; bt = t }
        }
        return best
      }

      // ---- the four moments ------------------------------------------------------------------------------------
      function startOpening() {
        open.d0 = coverDist(); open.dist = open.d0; prevDist = open.d0
        open.extra = 0; open.wave = -8; open.reel = 1; open.kick = 0; open.crest = 1; open.ta = 1
        heroIn.l0 = heroIn.l1 = heroIn.l2 = heroIn.l3 = 0
        opening = true
        tl = gsap.timeline({ onComplete: () => { opening = false; open.reel = 0; open.crest = 0 } })
        tl.to(open, { dist: open.d0 * 0.94, duration: 0.7, ease: 'sine.out' }, 0) // breath: the Showreel fills the view
        tl.to(open, { dist: 52, duration: 1.8, ease: 'power3.inOut' }, 0.7) // camera falls back, the tube appears
        tl.to(open, { kick: 1, duration: 0.9, ease: 'power2.out' }, 0.8).to(open, { kick: 0, duration: 1.0, ease: 'power2.inOut' }, 1.7)
        tl.to(open, { wave: 90, duration: 1.6, ease: 'power1.inOut' }, 1.1) // the wall lights up in a running wave
        tl.to(open, { reel: 0, duration: 0.8, ease: 'power1.in' }, 1.7)
        tl.to(open, { extra: 90, duration: 0.8, ease: 'power1.in' }, 2.2)
        tl.to(open, { crest: 0, duration: 0.6, ease: 'power1.out' }, 2.6)
        ;['l0', 'l1', 'l2', 'l3'].forEach((k, j) => tl.to(heroIn, { [k]: 1, duration: 1.0, ease: 'power3.out' }, 1.9 + j * 0.12))
      }
      function setRest() {
        open.d0 = coverDist(); open.dist = 52; open.extra = 90; open.wave = 90; open.reel = 0; open.kick = 0; open.crest = 0
        heroIn.l0 = heroIn.l1 = heroIn.l2 = heroIn.l3 = 1
        prevDist = open.dist
      }
      function flyTo(i) {
        if (flying || opening || i < 0) return
        flying = true; returning = false; flySlot = i; ctx.cursor.hover(false); hoverOn = false
        flyB.copy(U.uCamB.value); flyQ.copy(camera.quaternion); billCenter(i, flyBC) // the camera rushes at the billboard, which stays put
        const w = workOf[i]
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(w) })
        flyTl.to(fly, { p: 1, duration: 0.85, ease: 'power3.in' }, 0)
        flyTl.to(fly, { r: 1, duration: 0.7, ease: 'power2.inOut' }, 0)
      }
      function bringToView(i, then) { // keyboard: slide the tube so Work i's screen sits in view
        const wi = i
        let best = -1, bd = 1e9
        for (let k = 0; k < N; k++) {
          if (workOf[k] !== wi) continue
          const d = slotD(k, sNow)
          if (d >= 7 && d < bd) { bd = d; best = k }
        }
        if (best < 0) return
        focusSlot = best
        const from = sFocus, to = sFocus + (bd - 9)
        if (focusTween) focusTween.kill()
        const o = { v: 0 }
        focusTween = gsap.to(o, { v: 1, duration: 0.6, ease: 'power3.inOut', onUpdate: () => { sFocus = from + (to - from) * o.v }, onComplete: () => then && then(best) })
      }

      // ---- per frame -----------------------------------------------------------------------------------------------
      function update(t, dt) {
        dt = clamp(dt, 0.0001, 0.05)
        const sc = ctx.scroll
        // speed: drift at rest, scroll adds (either way)
        const target = clamp(DRIFT + clamp(sc.v, -4000, 4000) * 0.011, -45, 45)
        speedS += (target - speedS) * Math.min(1, dt * 6)
        if (!opening && !flying) sBase += speedS * dt
        const sOpen = open.d0 - open.dist
        sNow = sBase + sOpen + sFocus
        const vOpen = (open.dist - prevDist) / dt; prevDist = open.dist
        const sT = Math.max(clamp((Math.abs(speedS) - 2.2) / 24, 0, 1), opening ? clamp(Math.abs(vOpen) / 32, 0, 1) : 0)
        stretch += (sT - stretch) * Math.min(1, dt * 8)

        // camera: the pointer steers inside the tube with weight; scroll widens the lens
        const steer = !opening && !ctx.touch && ctx.pointer.inside && !flying
        const px = steer ? ctx.pointer.nx : 0, py = steer ? ctx.pointer.ny : 0, k = 1 - Math.exp(-dt * 3)
        look.x += (-px * 0.32 - look.x) * k; look.y += (py * 0.22 - look.y) * k
        pos.x += (px * 0.8 - pos.x) * k * 0.7; pos.y += (py * 0.55 - pos.y) * k * 0.7
        camera.position.set(pos.x + Math.sin(t * 0.37) * 0.12, pos.y + Math.sin(t * 0.51) * 0.1, 0)
        camera.rotation.set(look.y, look.x, -look.x * 0.12 + Math.sin(t * 0.3) * 0.01)
        const fovT = FOV + 12 * stretch + 9 * open.kick
        if (Math.abs(fovT - fovNow) > 0.01) { fovNow = fovT; camera.fov = fovT; camera.updateProjectionMatrix() }

        if (flying && flySlot >= 0 && (fly.p > 0 || fly.r > 0)) { // rush at the screen until its loop fills the view, with a little bank
          const tn = Math.tan((camera.fov * Math.PI) / 360), a = size.w / size.h, bs = U.uBillS.value
          tpos.copy(flyBC).addScaledVector(flyB, Math.min((H * bs) / (2 * tn), (W * bs) / (2 * tn * a)) * 0.97)
          camera.position.lerp(tpos, fly.p)
          camera.quaternion.slerp(flyQ, fly.r)
          camera.rotateZ(0.1 * Math.sin(Math.PI * fly.p))
        }
        camera.updateMatrixWorld(true)
        if (!flying) { // billboard frame: where the camera is now, how big, how far it may sit from the centre
          camera.matrixWorld.extractBasis(camR, camU, camB)
          U.uCamP.value.copy(camera.position); U.uCamR.value.copy(camR); U.uCamU.value.copy(camU); U.uCamB.value.copy(camB)
          const tn = Math.tan((camera.fov * Math.PI) / 360), aa = size.w / size.h, visH = 2 * tn * BILL_D, visW = visH * aa
          const bw = (aa < 1 ? 0.72 : 0.35) * visW
          U.uBillS.value = bw / W; hwW = bw / 2; hhW = (bw * H) / W / 2
          limX = Math.max(0, visW / 2 - hwW - 0.04 * visW); limY = Math.max(0, visH / 2 - hhW - 0.1 * visH)
          U.uBillLim.value.set(limX, limY)
        }
        if (pending.length) for (let n = 0; n < 2 && pending.length; n++) { try { ctx.renderer.initTexture(pending.pop()) } catch (e) { pending.length = 0 } } // upload text textures over the first frames, not at first hover

        // hover
        let hit = -1
        if (!opening && !flying && stretch < 0.45 && !ctx.touch && ctx.pointer.inside) hit = pick()
        const want = flying ? flySlot : hit >= 0 ? hit : !opening && focusSlot >= 0 ? focusSlot : -1
        hot = want
        if ((hit >= 0) !== hoverOn) { hoverOn = hit >= 0; ctx.cursor.hover(hoverOn) }
        const kk = Math.min(1, dt * 10)
        let moved = false
        for (let i = 0; i < N; i++) {
          const tg = i === hot && !returning ? 1 : 0, v = lift[i]
          if (v === tg) continue
          lift[i] = Math.abs(tg - v) < 0.002 ? tg : v + (tg - v) * kk; moved = true
        }
        if (moved) liftAttr.needsUpdate = true

        const u = U
        u.uS.value = sNow; u.uStretch.value = stretch
        u.uWave.value = opening ? open.wave : 1000; u.uCap.value = opening ? open.dist + open.extra : 1000
        u.uCrest.value = opening ? open.crest : 0
        reel.position.z = -open.dist
        reelMat.opacity = open.reel; reel.visible = open.reel > 0.01

        // glass: speed, the opening and the fly-in push it
        ctx.crt.push = clamp(stretch * 0.85 + (opening ? 0.25 * (1 - clamp((open.dist - open.d0) / 20, 0, 1)) : 0) + fly.p * 0.6, 0, 1)

        const hasTag = hot >= 0 && !flying && !opening
        if (hasTag && workOf[hot] !== tagWork) { tags[tagWork].group.visible = false; tagWork = workOf[hot]; tagA = 0 }
        tagA += ((hasTag ? 1 : 0) - tagA) * Math.min(1, dt * 12)

        // hero (dimmed to a quarter while a Work is hovered)
        heroA = clamp(open.ta, 0, 1) * (1 - 0.7 * stretch) * (1 - fly.p) * (1 - 0.75 * tagA)
        const ls = variant.lines, ins = [heroIn.l0, heroIn.l1, heroIn.l2, heroIn.l3]
        for (let j = 0; j < ls.length; j++) {
          const a = ins[j] * heroA
          ls[j].mat.opacity = a; ls[j].mesh.visible = a > 0.003
          ls[j].mesh.position.set(-px * 0.1, lineBase[j] - (1 - ins[j]) * lineH * 0.5 + (j % 2 ? -1 : 1) * stretch * lineH * 0.35, -HERO_Z)
        }
        veilMat.uniforms.uA.value = heroA * Math.min(ins[0], 1)
        veil.visible = veilMat.uniforms.uA.value > 0.003

        // tag: right beside the lifted screen (else left, else below or above it)
        if (hasTag) {
          const w = size.w, h = size.h, tg0 = tags[tagWork]
          billRect(hot)
          const rcx = ((rect.cx + 1) / 2) * w, rcy = ((1 - rect.cy) / 2) * h, hwp = (rect.hx * w) / 2, hhp = (rect.hy * h) / 2, M = 28, TOP = w < 768 ? 84 : 100
          let left = rcx + hwp + 22, top = rcy - tg0.hpx / 2
          if (left + tg0.wpx > w - M) left = rcx - hwp - 22 - tg0.wpx
          if (left < M) { left = clamp(rcx - hwp, M, Math.max(M, w - M - tg0.wpx)); top = rcy + hhp + 16; if (top + tg0.hpx > h - 30) top = rcy - hhp - 16 - tg0.hpx }
          tagPos.l = left; tagPos.t = clamp(top, TOP, Math.max(TOP, h - tg0.hpx - 30))
        }
        const tg = tags[tagWork]
        tg.group.visible = tagA > 0.01
        if (tg.group.visible) {
          const upp = (2 * Math.tan((camera.fov * Math.PI) / 360) * HUD) / size.h, w = size.w, h = size.h
          tg.group.position.set((tagPos.l + tg.wpx / 2 - w / 2 - (1 - tagA) * 14) * upp, -(tagPos.t + tg.hpx / 2 - h / 2) * upp, -HUD)
          tg.group.scale.setScalar(upp)
          tg.plateMat.opacity = 0.86 * tagA; tg.title.mat.opacity = tagA; tg.meta.mat.opacity = tagA
        }
      }

      if (ctx.reduced) setRest(); else startOpening()
      layoutHero(); layoutTags()
      const pending = textures.slice()
      if (ctx.renderer && ctx.renderer.compile) { // compile every program now, while nobody looks
        try { tags.forEach((t) => (t.group.visible = true)); ctx.renderer.compile(scene, camera) } catch (e) { /* first frame compiles instead */ }
        tags.forEach((t) => (t.group.visible = false))
      }
      if (!ctx.renderer || !ctx.renderer.initTexture) pending.length = 0

      return {
        scene, camera, update,
        resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); if (opening && open.dist === open.d0) open.d0 = open.dist = coverDist(); layoutHero(); layoutTags() },
        tap() {
          if (opening) { tl.progress(1); return }
          if (flying) return
          const i = ctx.touch || hot < 0 ? (camera.updateMatrixWorld(true), pick()) : hot
          if (i >= 0) flyTo(i)
        },
        focus(i) {
          if (focusTween) focusTween.kill()
          if (i < 0) { focusSlot = -1; return }
          if (!opening) bringToView(i)
        },
        activate(i) {
          if (opening) tl.progress(1)
          if (flying) return
          bringToView(i, (slot) => flyTo(slot))
        },
        back() {
          if (flyTl) flyTl.kill()
          returning = true // the screen drops back to the wall while the camera comes back
          gsap.to(fly, { p: 0, r: 0, duration: 0.9, ease: 'power3.inOut', onComplete: () => { flying = false; returning = false; flySlot = -1; focusSlot = -1 } })
        },
        dispose() {
          if (tl) tl.kill(); if (flyTl) flyTl.kill(); if (focusTween) focusTween.kill()
          gsap.killTweensOf(fly); gsap.killTweensOf(open); gsap.killTweensOf(heroIn)
          ctx.cursor.hover(false)
          geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); textures.forEach((x) => x.dispose())
          wallMat.dispose(); reelMat.dispose(); veilMat.dispose()
          scene.remove(camera, wall, reel)
        },
      }
    },
  })
})()
