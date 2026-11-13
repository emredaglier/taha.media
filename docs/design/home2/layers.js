// THROWAWAY prototype 2: Layers. A motion designer's comp pulled apart in depth, the way After Effects shows layers in 3D:
// a 16:9 frame exploded into 14 flat layers (plate, soft shapes, grid, strokes, masks, the hero type layer and the eight
// Works as footage layers with outline, name tag and corner handles) along the view axis, seen at three-quarter angle.
// Pointer orbits the stack with weight (yaw +-40, pitch +-15); at yaw 0 and gap 0 it is the flat finished frame. Press
// squeezes the gaps shut while held, release springs them out with overshoot (the glass is pushed). Scroll walks the camera
// through the stack front to back (each layer passed slides aside and fades, loops). Hover/focus solos a footage layer.
// Opening: the Showreel is the flat frame; the camera swings aside and the frame comes apart layer by layer from the back.
// FAKE: the layer name tags ("A_01"), the shape layers, the guide lines. Titles come from ctx.works.
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const lerp = (a, b, t) => a + (b - a) * t
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

  const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }`
  // one shader for every layer kind: 0 plate, 1 soft shapes, 2 grid, 3 type, 4 strokes, 5 masks, 6 footage. uShadow > 0 draws the
  // blurred dark copy of the layer's own shape (the soft darkening cast on the layer behind).
  const FS = `
    precision highp float;
    uniform float uType, uT, uDim, uAlpha, uBright, uFar, uShadow, uBlur;
    uniform vec2 uSize; uniform vec4 uRect; uniform sampler2D uMap;
    varying vec2 vUv;
    float rectA(vec2 q){ return step(0., q.x)*step(q.x, 1.)*step(0., q.y)*step(q.y, 1.); }
    float stroke(vec2 p, float y0, float amp, float fr, float ph, float k){
      float tri = abs(fract(uT*.05 + k)*2. - 1.);
      float e = tri*tri*(3. - 2.*tri);
      float x0 = -8.5 + 17.*e;
      float arg = p.x*fr + ph + uT*.2;
      float y = y0 + amp*sin(arg);
      float sl = amp*fr*cos(arg);
      float dy = abs(p.y - y)/sqrt(1. + sl*sl);
      float ln = (1. - smoothstep(.03, .075, dy))*(1. - smoothstep(x0 - .03, x0, p.x));
      float tip = (1. - smoothstep(0., .22, length(p - vec2(x0, y0 + amp*sin(x0*fr + ph + uT*.2)))))*.9;
      return max(ln, tip);
    }
    vec4 layer(vec2 uv){
      vec2 p = (uv - .5)*uSize;
      float inside = rectA(uv);
      if (uType < .5) {
        vec2 c = uv - .5;
        float g = mix(.075, .13, uv.y)*(1. - .9*dot(c, c)) + .012*sin(uv.x*30. + uT*.2);
        return vec4(vec3(g), inside);
      }
      if (uType < 1.5) {
        vec3 col = vec3(0.); float a = 0.;
        vec2 c1 = vec2(-4.6 + sin(uT*.13)*1.4, 1.6 + cos(uT*.11)*.8);
        float a1 = (1. - smoothstep(-2., 1.8, length(p - c1) - 4.2))*.7;
        col = mix(col, vec3(.17), a1); a = a1;
        vec2 c2 = vec2(5.2 + cos(uT*.1)*1.1, -1.8 + sin(uT*.14)*.9);
        float a2 = (1. - smoothstep(-1.6, 1.5, length(p - c2) - 3.3))*.75;
        col = mix(col, vec3(.24), a2); a = a + a2*(1. - a);
        float r3 = 1.1 + (.5 + .5*sin(uT*.4))*1.6;
        float a3 = (1. - smoothstep(-.03, .03, length(p - vec2(.8, -3.4)) - r3))*.8;
        col = mix(col, vec3(.5), a3); a = a + a3*(1. - a);
        for (int i = 0; i < 3; i++) {
          float f = fract(uT*.07 + float(i)*.3333);
          float rg = (1. - smoothstep(0., .06, abs(length(p - vec2(1.5, .3)) - f*10.)))*(1. - f)*.55;
          col = mix(col, vec3(.56), rg); a = a + rg*(1. - a);
        }
        return vec4(col, a*inside);
      }
      if (uType < 2.5) {
        vec2 dl = .5 - abs(fract(p) - .5);
        vec2 dm = (.5 - abs(fract(p/4.) - .5))*4.;
        float a = (1. - smoothstep(0., .03, min(dl.x, dl.y)))*.16 + (1. - smoothstep(0., .05, min(dm.x, dm.y)))*.34;
        a *= .7 + .3*sin(length(p)*.6 - uT*.9);
        return vec4(vec3(.56), a*inside);
      }
      if (uType < 3.5) {
        vec4 t = texture2D(uMap, uv);
        return vec4(t.rgb, t.a*inside);
      }
      if (uType < 4.5) {
        float s = stroke(p, 2.6, .5, .7, 0., 0.) + stroke(p, 1.1, .8, .5, 1.3, .21) + stroke(p, -.4, .35, 1.1, 2.1, .43)
                + stroke(p, -1.9, .9, .4, .5, .62) + stroke(p, -3.2, .5, .9, 3.3, .81);
        return vec4(vec3(.93), min(s, 1.)*.85*inside);
      }
      if (uType < 5.5) {
        vec2 q = p - vec2(-2.6, .5); vec2 dq = abs(q) - vec2(4.4, 2.4);
        float dr = max(dq.x, dq.y);
        float sweep = -4.4 + 8.8*(.5 + .5*sin(uT*.32));
        float wipe = 1. - smoothstep(-.15, .15, q.x - sweep);
        float fill = (1. - smoothstep(-.02, .02, dr))*wipe*.3;
        float out1 = 1. - smoothstep(0., .045, abs(dr));
        vec2 ep = (p - vec2(4.6, -1.6))/vec2(2.6, 1.7*(.85 + .15*sin(uT*.5)));
        float de = (length(ep) - 1.)*1.7;
        float fill2 = (1. - smoothstep(-.02, .02, de))*.24;
        float out2 = 1. - smoothstep(0., .045, abs(de));
        float o = max(out1, out2);
        return vec4(mix(vec3(.56), vec3(.93), o), max(max(fill, fill2), o*.9)*inside);
      }
      vec2 u = clamp(uv, .003, .997);
      vec3 c = texture2D(uMap, uRect.xy + u*uRect.zw).rgb;
      if (uFar > .02) {
        float o = uFar*.014;
        vec3 s = texture2D(uMap, uRect.xy + clamp(u + vec2(o, 0.), .003, .997)*uRect.zw).rgb
               + texture2D(uMap, uRect.xy + clamp(u - vec2(o, 0.), .003, .997)*uRect.zw).rgb
               + texture2D(uMap, uRect.xy + clamp(u + vec2(0., o), .003, .997)*uRect.zw).rgb
               + texture2D(uMap, uRect.xy + clamp(u - vec2(0., o), .003, .997)*uRect.zw).rgb;
        c = c*.4 + s*.15;
      }
      vec2 e = min(uv, 1. - uv)*uSize;
      float ln = 1. - smoothstep(.03, .06, min(e.x, e.y));
      float m = max(e.x, e.y);
      float hd = step(m, .2)*(1. - step(m, .13))*step(min(e.x, e.y), .2);
      c = mix(c, vec3(.93), max(ln*.9, hd));
      return vec4(c, inside);
    }
    void main(){
      if (uShadow > .001) {
        vec2 b = vec2(uBlur)/uSize;
        float a = layer(vUv).a*2. + layer(vUv + vec2(b.x, 0.)).a + layer(vUv - vec2(b.x, 0.)).a
                + layer(vUv + vec2(0., b.y)).a + layer(vUv - vec2(0., b.y)).a;
        gl_FragColor = vec4(0., 0., 0., a/6.*uShadow*uAlpha);
        return;
      }
      vec4 c = layer(vUv);
      gl_FragColor = vec4(c.rgb*uDim*uBright, c.a*uAlpha);
    }`

  HOME.register({
    name: 'Layers',
    create(ctx) {
      const size = ctx.size, works = ctx.works, P = ctx.pointer, touch = ctx.touch
      const N = 14, G = 2.4, PV = 3, FW = 6.4, FH = (FW * 9) / 16, PXL = 380, HUD = 3
      const RAD = Math.PI / 180

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(30, size.w / size.h, 1, 400)
      scene.add(camera)
      const stack = new THREE.Group(); stack.rotation.order = 'YXZ'; scene.add(stack)
      const disp = []; const keep = (o) => { disp.push(o); return o }
      const U = { t: { value: 0 }, dim: { value: 1 } }

      const mkMat = (type, map, rect, w, h) => {
        const u = {
          uType: { value: type }, uT: U.t, uDim: U.dim, uAlpha: { value: 1 }, uBright: { value: 1 }, uFar: { value: 0 }, uShadow: { value: 0 }, uBlur: { value: 0.3 },
          uSize: { value: new THREE.Vector2(w, h) }, uMap: { value: map || null }, uRect: { value: new THREE.Vector4(rect ? rect[0] : 0, rect ? rect[1] : 0, rect ? rect[2] : 1, rect ? rect[3] : 1) },
        }
        const mat = keep(new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide }))
        const shMat = keep(new THREE.ShaderMaterial({ uniforms: Object.assign({}, u, { uShadow: { value: 0.5 }, uAlpha: { value: 0 }, uBlur: { value: 0.3 } }), vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: false }))
        return { u, mat, shMat }
      }

      // ---- the hero type layer: its own canvas, two lines (three on portrait) ------------------------------------------------
      let heroTex = null, heroPortrait = null
      const heroLayout = (portrait) => {
        const n = portrait ? 3 : 2, words = ctx.hero.split(/\s+/), target = ctx.hero.length / n, lines = []
        let cur = ''
        for (const w of words) {
          const nx = cur ? cur + ' ' + w : w
          if (cur && nx.length > target * 1.1 && lines.length < n - 1) { lines.push(cur); cur = w } else cur = nx
        }
        lines.push(cur)
        const ts = lines.map((s) => ctx.text(s, { size: 160 }))
        const cw = 1536, amax = Math.max(...ts.map((t) => t.aspect)), lh = Math.min((0.92 * cw) / amax, 300), pitch = lh * 0.8
        const ch = Math.round(pitch * lines.length + lh * 0.3)
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
        const g = cv.getContext('2d')
        ts.forEach((t, k) => { const wpx = t.aspect * lh; g.drawImage(t.canvas, (cw - wpx) / 2, lh * 0.15 + pitch * k, wpx, lh); t.texture.dispose() })
        const tex = new THREE.CanvasTexture(cv); tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter
        return { tex, ratio: ch / cw }
      }

      // ---- the 14 layers, back to front -----------------------------------------------------------------------------------------
      const SPEC = [
        { t: 0 }, { t: 1 }, { w: 0, x: -5.6, y: 2.3 }, { t: 2 }, { w: 1, x: 5.4, y: 2.2 }, { w: 2, x: -5.2, y: -2.3 }, { t: 4 },
        { w: 3, x: 5.3, y: -2.2 }, { t: 5 }, { w: 4, x: 0.2, y: 3.0 }, { w: 5, x: 6.6, y: 0.2 }, { w: 6, x: -0.3, y: -3.1 }, { w: 7, x: -6.2, y: 2.4 }, { t: 3 },
      ]
      const frameGeo = keep(new THREE.PlaneGeometry(16, 9)), footGeo = keep(new THREE.PlaneGeometry(FW, FH))
      const tagGeo = keep(new THREE.PlaneGeometry(1, 1))
      const layers = [], foot = []
      SPEC.forEach((s, k) => {
        const isFoot = s.w !== undefined, w = isFoot ? FW : 16, h = isFoot ? FH : 9
        const m = mkMat(isFoot ? 6 : s.t, isFoot ? ctx.atlas : null, isFoot ? ctx.loopRect(s.w) : null, w, h)
        const mesh = new THREE.Mesh(isFoot ? footGeo : frameGeo, m.mat); mesh.frustumCulled = false; stack.add(mesh)
        const shadow = new THREE.Mesh(isFoot ? footGeo : frameGeo, m.shMat); shadow.frustumCulled = false; shadow.visible = false; stack.add(shadow)
        const L = { k, s, isFoot, mesh, shadow, u: m.u, shU: m.shMat.uniforms, x0: isFoot ? s.x : 0, y0: isFoot ? s.y : 0, side: k % 2 ? 1 : -1, rw: 0, a: 0, z: 0, slx: 0, tag: null, tagMat: null }
        if (s.t === 3) L.y0 = -0.2
        if (isFoot) {
          const t = ctx.text(`A_${String(s.w + 1).padStart(2, '0')}  ${works[s.w].title}`, { caps: true, size: 28 }) // fake: the A_01 numbering
          keep(t.texture)
          L.tagMat = keep(new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false }))
          const th = 0.34, tw = th * t.aspect
          L.tag = new THREE.Mesh(tagGeo, L.tagMat); L.tag.scale.set(tw, th, 1); L.tag.position.set(-FW / 2 + tw / 2 - 0.05, FH / 2 + 0.26, 0.01); L.tag.frustumCulled = false
          mesh.add(L.tag)
          foot[s.w] = L
        }
        layers.push(L)
      })
      const heroL = layers[13] // the type layer is the front layer: nothing covers the sentence at rest
      function buildHero() {
        const portrait = size.w / size.h < 1
        if (heroPortrait === portrait) return
        heroPortrait = portrait
        if (heroTex) heroTex.dispose()
        const r = heroLayout(portrait); heroTex = r.tex
        const w = portrait ? 14.6 : 11.6, h = w * r.ratio
        const old = heroL.mesh.geometry
        const geo = new THREE.PlaneGeometry(w, h)
        heroL.mesh.geometry = geo; heroL.shadow.geometry = geo
        if (old !== frameGeo) old.dispose()
        heroL.u.uSize.value.set(w, h); heroL.u.uMap.value = heroTex
        heroL.y0 = portrait ? -0.4 : -0.2
      }
      buildHero()

      // ---- guide lines: the corners of consecutive layers joined (the comp frustum) ---------------------------------------------
      const NP = N - 1, lpos = new Float32Array(NP * 4 * 2 * 3), lcol = new Float32Array(NP * 4 * 2 * 3)
      const lgeo = keep(new THREE.BufferGeometry())
      lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3).setUsage(THREE.DynamicDrawUsage))
      lgeo.setAttribute('color', new THREE.BufferAttribute(lcol, 3).setUsage(THREE.DynamicDrawUsage))
      const lines = new THREE.LineSegments(lgeo, keep(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false })))
      lines.frustumCulled = false; lines.renderOrder = 1500; stack.add(lines)

      // ---- the Showreel as the flat finished frame (opening) ------------------------------------------------------------------------
      const reelMat = keep(new THREE.MeshBasicMaterial({ map: ctx.showreel.texture, transparent: true, depthTest: false, depthWrite: false }))
      const reel = new THREE.Mesh(keep(new THREE.PlaneGeometry(16.5, 9.28)), reelMat); reel.renderOrder = 2500; reel.frustumCulled = false; reel.position.z = 0.3; stack.add(reel)

      // ---- solo clones (scene level, so a layer can leave the stack) --------------------------------------------------------------------
      const clones = works.map((_, i) => {
        const m = mkMat(6, ctx.atlas, ctx.loopRect(i), FW, FH)
        m.u.uDim = { value: 1 }
        const mesh = new THREE.Mesh(footGeo, m.mat); mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 3000; scene.add(mesh)
        return { mesh, u: m.u }
      })

      // ---- hover tags: HUD children of the camera, in px ---------------------------------------------------------------------------------
      const hud = new THREE.Group(); camera.add(hud)
      const mkText = (str, opts) => {
        const t = ctx.text(str, opts); keep(t.texture)
        const m = keep(new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false }))
        const mesh = new THREE.Mesh(tagGeo, m); mesh.renderOrder = 4001; mesh.frustumCulled = false
        return { mesh, mat: m, canvas: t.canvas }
      }
      const PAD = 16
      const tags = works.map((w) => {
        const title = mkText(w.title, { size: 120 }), meta = mkText(`${w.kind} · ${w.year}`, { caps: true, size: 28, color: '#8f8f8f' })
        const plateMat = keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false }))
        const plate = new THREE.Mesh(tagGeo, plateMat); plate.renderOrder = 4000; plate.frustumCulled = false
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

      // ---- state ---------------------------------------------------------------------------------------------------------------------------
      const gk = layers.map(() => ({ v: 1 })) // per layer opening gap (0 flat, 1 apart)
      const O = { fill: 0, reel: 0, yawK: 1 }
      const fly = { k: 0 }
      const sp = { gs: 1, gv: 0, yaw: 22 * RAD, yv: 0, pit: -4 * RAD, pv: 0 }
      let t = 0, orb = 0, D = 34, Dfit = 34, Dcover = 20, TN = Math.tan(15 * RAD), portrait = false
      let opening = false, flying = false, flyIdx = -1, hot = -1, hoverOn = false, focusCell = -1, cand = -1, dwell = 0
      let tagCell = 0, tagA = 0, wasDown = false, kick = 0
      const solo = works.map(() => ({ e: 0 })), px = works.map(() => ({ cx: 0, cy: 0, w: 0, tl: 0, tt: 0, init: false }))
      let tl = null, flyTl = null, backTw = null
      const rc = new THREE.Raycaster(), ndc = new THREE.Vector2(), V = new THREE.Vector3(), Qa = new THREE.Quaternion(), Sa = new THREE.Vector3(), Pa = new THREE.Vector3()

      // ---- layout of the solo pose in px ----------------------------------------------------------------------------------------------------
      function frameOf(i) {
        const w = size.w, h = size.h, tg = tags[i], p = px[i], M = 24, TOP = w < 768 ? 130 : 104, BOT = h - 24
        foot[i].mesh.getWorldPosition(V); V.project(camera)
        const hx = (V.x * 0.5 + 0.5) * w
        let fw, cx, cy, tl_, tt
        if (w / h >= 1) {
          fw = 0.36 * w; const fh = (fw * 9) / 16
          cx = clamp(hx, M + fw / 2, w - M - fw / 2); cy = clamp(h * 0.52, TOP + fh / 2, Math.max(TOP + fh / 2, BOT - fh / 2))
          if (cx + fw / 2 + 22 + tg.wpx + M <= w) tl_ = cx + fw / 2 + 22
          else if (cx - fw / 2 - 22 - tg.wpx >= M) tl_ = cx - fw / 2 - 22 - tg.wpx
          else { tl_ = clamp(cx - tg.wpx / 2, M, Math.max(M, w - M - tg.wpx)); cy = Math.min(cy, BOT - fh / 2 - tg.hpx - 16) }
          tt = tl_ > cx + fw / 2 || tl_ < cx - fw / 2 ? cy - tg.hpx / 2 : cy + fh / 2 + 16
        } else {
          fw = 0.8 * w; const fh = (fw * 9) / 16, gt = clamp(h * 0.45 - fh / 2, TOP, Math.max(TOP, BOT - (fh + 16 + tg.hpx)))
          cx = w / 2; cy = gt + fh / 2; tl_ = clamp(cx - fw / 2, 16, Math.max(16, w - 16 - tg.wpx)); tt = gt + fh + 16
        }
        tt = clamp(tt, TOP, Math.max(TOP, BOT - tg.hpx))
        p.cx = cx; p.cy = cy; p.w = fw; p.tl = tl_; p.tt = tt
      }

      // ---- rig sizes -----------------------------------------------------------------------------------------------------------------------------
      function fit() {
        const a = size.w / size.h; portrait = a < 1
        camera.fov = portrait ? 40 : 30; camera.aspect = a; camera.updateProjectionMatrix()
        TN = Math.tan((camera.fov * RAD) / 2)
        Dfit = portrait ? 9.7 / (TN * a) : Math.max(11.4 / (TN * a), 6.5 / TN)
        Dcover = Math.min(8 / (TN * a), 4.5 / TN) * 0.97
      }

      // ---- the four moments -----------------------------------------------------------------------------------------------------------------------
      function startOpening() {
        opening = true; O.fill = 1; O.reel = 1; O.yawK = 0; gk.forEach((g) => { g.v = 0 })
        tl = gsap.timeline({ onComplete: () => { opening = false } })
        tl.to(O, { fill: 0, duration: 1.0, ease: 'power3.inOut' }, 0.45)
        tl.to(O, { yawK: 1, duration: 1.1, ease: 'power3.inOut' }, 0.45)
        tl.to(O, { reel: 0, duration: 0.5, ease: 'power1.in' }, 0.95)
        gk.forEach((g, k) => tl.to(g, { v: 1, duration: 0.9, ease: 'back.out(1.2)' }, 1.0 + k * 0.07))
      }
      function flyTo(i) {
        if (flying || opening || i < 0) return
        flying = true; flyIdx = i; hot = i; ctx.cursor.hover(false); hoverOn = false
        frameOf(i)
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        flyTl.to(fly, { k: 1, duration: 0.72, ease: 'power3.in' }, 0.1)
      }

      function update(tm, dt) {
        dt = clamp(dt, 0.0001, 0.05); t = tm; U.t.value = tm
        const w = size.w, h = size.h, sc = ctx.scroll, down = P.down && !opening && !flying

        // ---- squeeze spring: press closes the gaps, release springs them out with overshoot (and pushes the glass)
        const tgt = down ? 0.02 : 1, kS = down ? 160 : 70, cS = down ? 24 : 5.5
        sp.gv += (kS * (tgt - sp.gs) - cS * sp.gv) * dt; sp.gs += sp.gv * dt
        if (sp.gs < 0) { sp.gs = 0; sp.gv = 0 }
        if (sp.gs > 1.5) { sp.gs = 1.5; sp.gv = 0 }
        const flat = 0.15 + 0.85 * clamp(sp.gs, 0, 1)
        if (wasDown && !down) kick = 0.6 // release: the glass is pushed on the snap
        wasDown = down

        // ---- orbit with weight
        orb += ((P.inside && !touch ? 1 : 0) - orb) * Math.min(1, dt * 4)
        const yb = portrait ? 12 : 22, idleY = yb + Math.sin(tm * 0.31) * 3, idleP = -4 + Math.sin(tm * 0.23) * 1.5
        const yT = lerp(idleY, clamp(yb + P.nx * 18, -40, 40), orb) * RAD * O.yawK * flat
        const pT = lerp(idleP, clamp(P.ny * 15, -15, 15), orb) * RAD * O.yawK * flat
        sp.yv += (40 * (yT - sp.yaw) - 9 * sp.yv) * dt; sp.yaw += sp.yv * dt
        sp.pv += (40 * (pT - sp.pit) - 9 * sp.pv) * dt; sp.pit += sp.pv * dt
        stack.rotation.set(sp.pit, sp.yaw, 0)
        D = lerp(Dfit, Dcover, O.fill)
        camera.position.set(0, 0, D); camera.updateMatrixWorld()

        // ---- scroll walks the camera through the stack: focus kf runs front (13) to back (0), looping
        const kf = N - 1 - (sc.y - 0) / PXL

        // ---- layer transforms
        for (let k = 0; k < N; k++) {
          const L = layers[k], r = k - kf, rw = r - 14 * Math.floor((r + 13.5) / 14)
          L.rw = rw
          const slide = sstep(0, 0.5, rw), depth = clamp(-rw / 13, 0, 1)
          let a = (1 - sstep(0, 0.5, rw)) * sstep(-13.5, -13, rw)
          const sl = L.isFoot ? solo[L.s.w].e : 0
          a *= 1 - sstep(0, 0.3, sl)
          L.a = a
          L.z = (rw + PV) * G * sp.gs * gk[k].v
          L.slx = L.side * slide * 15
          const m = L.mesh
          m.position.set(L.x0 + L.slx, L.y0 + L.side * slide * 2, L.z)
          m.rotation.set(0, L.side * slide * 0.5, L.side * slide * 0.2)
          m.renderOrder = Math.round(rw * 100)
          m.visible = a > 0.003
          L.u.uAlpha.value = a
          L.u.uBright.value = L.isFoot ? 1 - 0.3 * depth : 1 - 0.55 * depth
          L.u.uFar.value = depth * depth
          if (L.tag) { L.tagMat.opacity = a * (1 - 0.4 * depth); L.tag.renderOrder = m.renderOrder + 1 }
        }
        // shadows: layer k darkens the layer behind it (k-1), offset along the light
        for (let k = 1; k < N; k++) {
          const L = layers[k], B = layers[k - 1], gap = L.z - B.z
          const ok = Math.abs(L.rw - B.rw - 1) < 0.001 && gap > 0.05
          const a = ok ? Math.min(L.a, B.a) : 0
          L.shadow.visible = a > 0.003
          if (!L.shadow.visible) continue
          const o = gap * 0.22
          L.shadow.position.set(L.mesh.position.x + o * 0.8, L.mesh.position.y - o, B.z + 0.01)
          L.shadow.rotation.copy(L.mesh.rotation)
          L.shadow.renderOrder = B.mesh.renderOrder + 50
          L.shU.uAlpha.value = a; L.shU.uShadow.value = 0.5 * Math.min(1, gap); L.shU.uBlur.value = 0.15 + gap * 0.3
        }
        // guide lines
        for (let k = 1; k < N; k++) {
          const L = layers[k], B = layers[k - 1], ok = Math.abs(L.rw - B.rw - 1) < 0.001
          const v = ok ? Math.min(L.a, B.a) * 0.32 * U.dim.value : 0
          for (let c = 0; c < 4; c++) {
            const sx = c & 1 ? 8 : -8, sy = c & 2 ? 4.5 : -4.5, o = ((k - 1) * 4 + c) * 6
            lpos[o] = sx + B.slx; lpos[o + 1] = sy; lpos[o + 2] = B.z; lpos[o + 3] = sx + L.slx; lpos[o + 4] = sy; lpos[o + 5] = L.z
            lcol[o] = lcol[o + 1] = lcol[o + 2] = lcol[o + 3] = lcol[o + 4] = lcol[o + 5] = v
          }
        }
        lgeo.attributes.position.needsUpdate = true; lgeo.attributes.color.needsUpdate = true
        reelMat.opacity = O.reel; reel.visible = O.reel > 0.003
        scene.updateMatrixWorld(true)

        // ---- hover: pick a footage layer with the ray; a soloed layer keeps the hover while the pointer is on it
        let hit = -1
        const live = !opening && !flying && !touch && P.inside && !down
        if (live) {
          const x = ((P.nx + 1) / 2) * w, y = ((1 - P.ny) / 2) * h
          let keepHot = false
          if (hot >= 0 && solo[hot].e > 0.5) { const p = px[hot]; keepHot = Math.abs(x - p.cx) < (p.w / 2) * 1.05 && Math.abs(y - p.cy) < ((p.w * 9) / 32) * 1.05 }
          if (keepHot) { hit = hot; dwell = 1; cand = hot } else {
            rc.setFromCamera(ndc.set(P.nx, P.ny), camera)
            let best = -1, bd = 1e9
            for (let i = 0; i < 8; i++) {
              const L = foot[i]; if (L.a < 0.4) continue
              const r = rc.intersectObject(L.mesh, false)
              if (r.length && r[0].distance < bd) { bd = r[0].distance; best = i }
            }
            if (best !== cand) { dwell = 0; cand = best } else if (best >= 0) dwell += dt
            hit = best >= 0 && dwell > 0.12 ? best : -1
          }
        } else { dwell = 0; cand = -1 }
        if ((hit >= 0) !== hoverOn) { hoverOn = hit >= 0; ctx.cursor.hover(hoverOn) }
        hot = flying ? flyIdx : hit >= 0 ? hit : !opening && focusCell >= 0 ? focusCell : -1
        U.dim.value += (((hot >= 0 ? 0.25 : 1) * (1 - fly.k)) - U.dim.value) * Math.min(1, dt * 8)

        // ---- solo clones
        const fill = Math.max(w, (h * 16) / 9) * 1.03, dT = 8, upp2 = (2 * TN * dT) / h // the solo frame hangs 8 units in front of the camera
        for (let i = 0; i < 8; i++) {
          const s = solo[i], c = clones[i], tg2 = hot === i ? 1 : 0
          s.e += (tg2 - s.e) * Math.min(1, dt * (tg2 ? 8 : 6)); if (s.e < 0.002 && !tg2) s.e = 0
          c.mesh.visible = s.e > 0.002
          if (!c.mesh.visible) { px[i].init = false; continue }
          frameOf(i)
          const p = px[i], e = s.e * s.e * (3 - 2 * s.e), fk = i === flyIdx ? fly.k : 0
          const cx = lerp(p.cx, w / 2, fk), cy = lerp(p.cy, h / 2, fk), wp = lerp(p.w, fill, fk)
          foot[i].mesh.matrixWorld.decompose(Pa, Qa, Sa)
          Pa.x = lerp(Pa.x, (cx - w / 2) * upp2, e) + Math.sin(Math.PI * e) * foot[i].side * 2.5
          Pa.y = lerp(Pa.y, -(cy - h / 2) * upp2, e)
          Pa.z = lerp(Pa.z, D - dT, e)
          c.mesh.position.copy(Pa)
          c.mesh.quaternion.copy(Qa).slerp(camera.quaternion, e)
          const sc2 = lerp(Sa.x, (wp * upp2) / FW, e); c.mesh.scale.set(sc2, sc2, 1)
          c.u.uAlpha.value = sstep(0, 0.15, s.e); c.u.uBright.value = 1 + 0.1 * e
        }

        // ---- crt push: scroll speed, release snap, fly
        kick = Math.max(0, kick - dt * 1.6)
        ctx.crt.push = clamp(Math.abs(sc.v) / 3200 + kick + fly.k * 0.5 + (opening ? 0.4 * Math.sin(clamp(O.yawK, 0, 1) * Math.PI) : 0), 0, 1)

        // ---- tag beside the solo frame
        const want = hot >= 0 && solo[hot].e > 0.25 && !flying && !opening
        if (want && hot !== tagCell) { tags[tagCell].group.visible = false; tagCell = hot; tagA = 0 }
        tagA += ((want ? 1 : 0) - tagA) * Math.min(1, dt * 12)
        const tg = tags[tagCell], p = px[tagCell]
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
      if (ctx.reduced) { O.fill = 0; O.reel = 0; O.yawK = 1 } else startOpening()

      return {
        scene, camera, update,
        resize(w, h) { fit(); buildHero(); layoutTags() },
        tap() {
          if (opening) { tl.progress(1); return }
          if (flying) return
          if (hot >= 0) flyTo(hot)
          else if (touch || !P.inside) {
            rc.setFromCamera(ndc.set(P.nx, P.ny), camera)
            let best = -1, bd = 1e9
            for (let i = 0; i < 8; i++) { const L = foot[i]; if (L.a < 0.4) continue; const r = rc.intersectObject(L.mesh, false); if (r.length && r[0].distance < bd) { bd = r[0].distance; best = i } }
            if (best >= 0) flyTo(best)
          }
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
          gsap.killTweensOf(O); gsap.killTweensOf(fly); gk.forEach((g) => gsap.killTweensOf(g))
          ctx.cursor.hover(false)
          disp.forEach((d) => d.dispose()); if (heroTex) heroTex.dispose()
          if (heroL.mesh.geometry !== frameGeo) heroL.mesh.geometry.dispose()
          scene.remove(camera)
        },
      }
    },
  })
})()
