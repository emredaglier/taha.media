// THROWAWAY prototype 2: Phones. How small clients see the work: eight phones lie loose on a dark glossy tabletop (seen at ~46
// degrees), each playing one Work, 16:9 whole, with its title under it like a reel caption. Phones live: now and then one gets a
// (fake) message: it buzzes, its screen brightens, a notification pill drops in. The pointer over a phone makes it rise on its edge
// and turn its screen toward the pointer (spring, overshoot); press-and-drag slides it with inertia (bumping the others, flicks
// spin it); scroll pans along the table and sends a buzz wave through the phones in order. Hover/focus on a Work: that phone
// stands up, faces the camera at ~36% of the view width, the rest dim. Fly-in: the loop fills the view.
// Opening: the Showreel fills the view, the camera pulls back to one phone held upright, it is laid down on the table and the
// other seven light up one by one, each with a buzz.
// Cheap on purpose: bodies, screens, mirrors and shadows are four InstancedMeshes; glow on the table is done in the table shader.
// fake: the notification text, every title, the hero sentence.
;(() => {
  const PI = Math.PI, clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, sm = (t) => t * t * (3 - 2 * t)
  const AY = new THREE.Vector3(0, 1, 0), AX = new THREE.Vector3(1, 0, 0)
  const LX = 0.7, LZ = 0.7                       // shadows fall down-right
  const BW = 3.65, BH = 2.3, TOP = 0.154           // phone body (landscape on the table), top surface height
  const SW = 3.45, SH = 2.2, LW = 3.2, LH = 1.8    // screen, loop (16:9) inside it
  const LV1 = 1 - 0.06 / SH, LV0 = LV1 - LH / SH, LU0 = (SW - LW) / 2 / SW
  const LOOP_OFF = (SH - LH) / 2 - 0.06            // the loop centre sits this far above the screen centre
  const HW = BW / 2, HD = BH / 2
  const LAND = [[3.3, -1.3, 8], [6.9, 1.5, -14], [10.1, -1.1, 24], [13.7, 1.3, -7], [17.0, -1.4, 13], [20.5, 1.4, -22], [23.8, -1.1, 6], [27.3, 1.3, -12]]
  const PORT = [[2.6, 1.2, 10], [5.7, -1.3, -12], [8.8, 1.3, 16], [12.0, -1.2, -8], [15.1, 1.4, 12], [18.3, -1.3, -17], [21.5, 1.2, 7], [24.7, -1.2, -10]]
  const ZB = 4

  // ---- shaders -------------------------------------------------------------------------------------------------------
  const GLOW = `
    uniform vec4 uPh[8];
    float glowAt(vec2 p){                          // each screen lights the table around it: a soft patch, long along the phone
      float g = 0.;
      for (int i = 0; i < 8; i++){
        vec2 d = p - uPh[i].xy; float c = cos(uPh[i].w), s = sin(uPh[i].w);
        float lx = d.x*c - d.y*s, lz = d.x*s + d.y*c;
        g += uPh[i].z*exp(-(lx*lx/13.5 + lz*lz/6.5));
      }
      return g;
    }`
  const TABLE_VS = 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }'
  const TABLE_FS = `
    precision highp float; varying vec3 vW; uniform vec2 uCam;` + GLOW + `
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
    float nz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(h21(i), h21(i+vec2(1.,0.)), f.x), mix(h21(i+vec2(0.,1.)), h21(i+vec2(1.,1.)), f.x), f.y); }
    void main(){
      vec2 p = vW.xz;
      float n = nz(p*vec2(5., .7))*.6 + nz(p*vec2(19., 2.))*.4;
      vec3 c = vec3(.045 + n*.022) + vec3(.55)*glowAt(p);
      float far = 1. - smoothstep(8., 19., length(p - uCam));
      gl_FragColor = vec4(c*far, .78);
    }`
  const HERO_FS = `
    precision highp float; varying vec3 vW; varying vec2 vUv; uniform sampler2D uText;` + GLOW + `
    void main(){                                   // laser-etched: the nearest screens light it, a bright rim catches on one edge
      float m = texture2D(uText, vUv).a, m2 = texture2D(uText, vUv + vec2(.0012, -.0026)).a;
      float g = glowAt(vW.xz);
      vec3 col = vec3(.22 + .8*g) + vec3(.4)*clamp(m - m2, 0., 1.)*(.4 + g);
      gl_FragColor = vec4(col, m);
    }`
  const HERO_VS = 'varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }'
  const INST = 'vec4 w = vec4(position, 1.);\n#ifdef USE_INSTANCING\n w = instanceMatrix*w;\n#endif\n w = modelMatrix*w;'
  const SCREEN_VS = `attribute vec4 aRect, aSt; varying vec2 vUv; varying vec4 vRect, vSt;
    void main(){ vUv = uv; vRect = aRect; vSt = aSt; ` + INST + ` gl_Position = projectionMatrix*viewMatrix*w; }`
  const SCREEN_FS = `
    precision highp float; varying vec2 vUv; varying vec4 vRect, vSt;
    uniform sampler2D uAtlas, uReel, uCap, uPill; uniform float uMir, uMirA;
    void main(){
      vec2 uv = vUv, p = (uv - .5)*vec2(${SW.toFixed(2)}, ${SH.toFixed(2)});
      vec2 q = abs(p) - (vec2(${SW.toFixed(2)}, ${SH.toFixed(2)})*.5 - .22);
      if (length(max(q, 0.)) + min(max(q.x, q.y), 0.) - .22 > 0.) discard;        // rounded glass
      vec2 l = vec2((uv.x - ${LU0.toFixed(4)})/(1. - ${(2 * LU0).toFixed(4)}), (uv.y - ${LV0.toFixed(4)})/${(LV1 - LV0).toFixed(4)});
      float inL = step(0., l.x)*step(l.x, 1.)*step(0., l.y)*step(l.y, 1.);
      vec2 lc = clamp(l, .004, .996);
      vec3 loop = mix(texture2D(uAtlas, vRect.xy + lc*vRect.zw).rgb, texture2D(uReel, lc).rgb, vSt.z);
      vec2 cu = vec2((uv.x - .04)/.92, (uv.y - .03)/.118);
      float inC = step(0., cu.x)*step(cu.x, 1.)*step(0., cu.y)*step(cu.y, 1.);
      vec4 cap = texture2D(uCap, vec2(clamp(cu.x, 0., 1.), 1. - (vSt.w + 1.)/8. + clamp(cu.y, 0., 1.)/8.));
      float pc = mix(1.25, .83, vSt.y);
      vec2 pu = vec2((uv.x - .08)/.84, (uv.y - (pc - .093))/.186);
      float inP = step(0., pu.x)*step(pu.x, 1.)*step(0., pu.y)*step(pu.y, 1.);
      vec4 pill = texture2D(uPill, clamp(pu, 0., 1.));
      vec3 col = vec3(.012);
      col = mix(col, loop, inL);
      col = mix(col, cap.rgb, cap.a*inC*(1. - vSt.z));
      col = mix(col, pill.rgb, pill.a*inP);
      col += vec3(.04)*(1. - smoothstep(0., .18, abs(uv.x*.55 + uv.y*.8 - .7)));    // a streak of window light on the glass
      col *= vSt.x;
      gl_FragColor = vec4(col*(uMir > .5 ? 1.3 : 1.), uMir > .5 ? uMirA : 1.);
    }`
  const SHADOW_VS = `attribute vec4 aSh; varying vec2 vUv; varying vec4 vSh;
    void main(){ vUv = uv; vSh = aSh; ` + INST + ` gl_Position = projectionMatrix*viewMatrix*w; }`
  const SHADOW_FS = `precision highp float; varying vec2 vUv; varying vec4 vSh;
    void main(){ vec2 p = (vUv - .5)*2.; vec2 q = abs(p) - vec2(vSh.z, vSh.w);
      float d = length(max(q, 0.)) + min(max(q.x, q.y), 0.);
      gl_FragColor = vec4(0., 0., 0., (1. - smoothstep(-vSh.y*.5, vSh.y, d))*vSh.x); }`

  // ---- vertex-coloured phone body (frame, bezel, camera bump, buttons) ---------------------------------------------------------------
  function rrShape(w, d, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -d / 2
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r)
    s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r)
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s
  }
  function bodyGeometry() {
    const pos = [], col = [], c = new THREE.Color()
    const put = (g, top, side) => {
      g = g.index ? g.toNonIndexed() : g
      const pa = g.attributes.position.array, na = g.attributes.normal.array
      c.set(top); const tr = c.r, tg = c.g, tb = c.b; c.set(side); const sr = c.r, sg = c.g, sb = c.b
      for (let i = 0; i < pa.length / 3; i++) {
        pos.push(pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2])
        const ny = na[i * 3 + 1]
        if (ny > 0.5) col.push(tr, tg, tb)
        else { const f = clamp(0.8 - 0.3 * (na[i * 3] + na[i * 3 + 2]) * 0.7071, 0.35, 1); col.push(sr * f, sg * f, sb * f) }
      }
      g.dispose()
    }
    const ext = (w, d, r, h, y0, x, z, top, side) => { const g = new THREE.ExtrudeGeometry(rrShape(w, d, r), { depth: h, bevelEnabled: false, curveSegments: 6 }); g.rotateX(-PI / 2); g.translate(x, y0, z); put(g, top, side) }
    ext(BW, BH, 0.3, TOP - 0.04, 0.04, 0, 0, 0x0c0c0c, 0x6c6c6c)                      // slab: dark bezel on top, metal frame at the sides
    ext(0.78, 0.78, 0.16, 0.04, 0, 1.25, -0.55, 0x161616, 0x2a2a2a)                  // camera bump under the phone (shows when it stands on its edge)
    for (const [x, z] of [[1.1, -0.72], [1.4, -0.38]]) { const g = new THREE.CylinderGeometry(0.15, 0.15, 0.03, 14); g.translate(x, -0.012, z); put(g, 0x050505, 0x303030) }
    const b = new THREE.BoxGeometry(0.55, 0.06, 0.08); b.translate(-0.7, 0.1, BH / 2 + 0.03); put(b, 0x7a7a7a, 0x7a7a7a) // side button
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    return geo
  }
  function fit(hw, hd) { const r = hd, span = hw - r, n = Math.max(2, Math.ceil(span / (r * 0.85)) + 1), out = []; for (let k = 0; k < n; k++) out.push({ lx: -span + (2 * span * k) / (n - 1), lz: 0, r }); return out }

  HOME.register({
    name: 'Phones',
    create(ctx) {
      const size = ctx.size, works = ctx.works, P = ctx.pointer, touch = ctx.touch
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(30, size.w / size.h, 0.3, 300)
      scene.add(camera)
      const keep = []
      const track = (o) => { keep.push(o); return o }
      const flat = (w, h) => { const g = new THREE.PlaneGeometry(w, h); g.rotateX(-PI / 2); return track(g) }
      const plain = (cv) => { const t = new THREE.CanvasTexture(cv); t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; return track(t) }
      const PHW = new Array(8).fill(0).map(() => new THREE.Vector4())

      // caption atlas (8 rows, small caps title + muted kind/year) and the fake notification pill; made from ctx.text canvases
      const capCv = document.createElement('canvas'); capCv.width = 1024; capCv.height = 86 * 8
      { const g = capCv.getContext('2d')
        works.forEach((w, i) => {
          const a = ctx.text(w.title, { caps: true, size: 40, color: '#ededed' }), b = ctx.text(`${w.kind} · ${w.year}`, { caps: true, size: 26, color: '#8f8f8f' })
          const ha = 52, wa = a.aspect * ha, hb = 36, wb = b.aspect * hb
          g.drawImage(a.canvas, 10, i * 86 + 14, wa, ha); g.drawImage(b.canvas, 1014 - wb, i * 86 + 22, wb, hb); a.texture.dispose(); b.texture.dispose()
        }) }
      const pillCv = document.createElement('canvas'); pillCv.width = 1024; pillCv.height = 190
      { const g = pillCv.getContext('2d')
        g.fillStyle = 'rgba(26,26,26,0.96)'; g.strokeStyle = '#2a2a2a'; g.lineWidth = 3
        g.beginPath(); g.moveTo(95, 6); g.arcTo(1018, 6, 1018, 184, 89); g.arcTo(1018, 184, 6, 184, 89); g.arcTo(6, 184, 6, 6, 89); g.arcTo(6, 6, 1018, 6, 89); g.closePath(); g.fill(); g.stroke()
        g.fillStyle = '#ededed'; g.beginPath(); g.arc(100, 95, 38, 0, 7); g.fill()
        const a = ctx.text('Yeni mesaj', { caps: true, size: 30, color: '#8f8f8f' }), b = ctx.text('Revizyon var mı? Akşama bakar mısın', { font: 'sans', size: 64, color: '#ededed' }) // fake
        g.drawImage(a.canvas, 170, 26, a.aspect * 46, 46); g.drawImage(b.canvas, 170, 84, Math.min(b.aspect * 78, 800), 78); a.texture.dispose(); b.texture.dispose() }
      const capTex = plain(capCv), pillTex = plain(pillCv)

      // ---- instanced pieces ---------------------------------------------------------------------------------------------------
      const bodyMat = track(new THREE.MeshBasicMaterial({ vertexColors: true }))
      const bodies = new THREE.InstancedMesh(track(bodyGeometry()), bodyMat, 8); bodies.frustumCulled = false; bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(bodies)
      const screenGeo = flat(SW, SH); screenGeo.translate(0, TOP + 0.004, 0)
      const aRect = new THREE.InstancedBufferAttribute(new Float32Array(32), 4), aSt = new THREE.InstancedBufferAttribute(new Float32Array(32), 4)
      aSt.setUsage(THREE.DynamicDrawUsage)
      for (let i = 0; i < 8; i++) { const r = ctx.loopRect(i); aRect.setXYZW(i, r[0], r[1], r[2], r[3]) }
      screenGeo.setAttribute('aRect', aRect); screenGeo.setAttribute('aSt', aSt)
      const screenMat = (mir) => track(new THREE.ShaderMaterial({
        vertexShader: SCREEN_VS, fragmentShader: SCREEN_FS, side: mir ? THREE.DoubleSide : THREE.FrontSide, transparent: mir, depthWrite: !mir,
        uniforms: { uAtlas: { value: ctx.atlas }, uReel: { value: ctx.showreel.texture }, uCap: { value: capTex }, uPill: { value: pillTex }, uMir: { value: mir ? 1 : 0 }, uMirA: { value: 0.85 } },
      }))
      const screens = new THREE.InstancedMesh(screenGeo, screenMat(false), 8), mirrors = new THREE.InstancedMesh(screenGeo, screenMat(true), 8)
      for (const m of [screens, mirrors]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m) }
      mirrors.renderOrder = -1                                                        // under the glossy table: a faint reflection
      const aSh = new THREE.InstancedBufferAttribute(new Float32Array(32), 4); aSh.setUsage(THREE.DynamicDrawUsage)
      const MARG = 1.3, shGeo = flat(1, 1); shGeo.setAttribute('aSh', aSh)
      const shadows = new THREE.InstancedMesh(shGeo, track(new THREE.ShaderMaterial({ vertexShader: SHADOW_VS, fragmentShader: SHADOW_FS, transparent: true, depthWrite: false })), 8)
      shadows.frustumCulled = false; shadows.renderOrder = 1; shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(shadows)
      const table = new THREE.Mesh(flat(130, 130), track(new THREE.ShaderMaterial({ vertexShader: TABLE_VS, fragmentShader: TABLE_FS, transparent: true, depthWrite: false, uniforms: { uPh: { value: PHW }, uCam: { value: new THREE.Vector2() } } })))
      table.frustumCulled = false; table.renderOrder = 0; scene.add(table)
      const dimMat = track(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }))
      const dimPlane = new THREE.Mesh(flat(300, 300), dimMat); dimPlane.renderOrder = 10; dimPlane.frustumCulled = false; dimPlane.position.y = 2.6; dimPlane.visible = false; scene.add(dimPlane)
      let hero = null, heroTex = null

      // ---- hover tags (HUD children of the camera, in px) -----------------------------------------------------------------------------
      const HUD = 3, hud = new THREE.Group(); camera.add(hud)
      const unit = track(new THREE.PlaneGeometry(1, 1))
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

      // ---- state -----------------------------------------------------------------------------------------------------------------------
      const ph = [], pose = []
      for (let i = 0; i < 8; i++) {
        const cs = fit(HW, HD)
        ph.push({ i, u: 0, x: 0, z: 0, a: 0, vx: 0, vz: 0, w: 0, m: 1, im: 1, iI: 1 / ((HW * HW + HD * HD) / 3), cs, wx: new Float32Array(cs.length), wz: new Float32Array(cs.length),
          lx: 0, lz: 0, lvx: 0, lvz: 0, lift: 0, bz: 0, bzO: 0, flash: 0, flT: 0, pillAt: -99, waveT: -1, on: 1, reel: 0, e: 0, bright: 1,
          pos: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 })
        pose.push({ x: 0, y: 0, w: 0, l: 0, t: 0, init: false })
      }
      const O = { cam: 1, lay: 1 }, fly = { k: 0 }
      let portrait = false, builtP = null, TN = 0.27, asp = 1, dist = 18, PITCH = 0.8, VWd = 17, uc0 = 8.4, uc1 = 20.7, SCR = 2600, dc = 3.3, ZT = 1.5
      let opening = false, flying = false, flyIdx = -1, hot = -1, hoverOn = false, focusCell = -1, cand = -1, dwell = 0
      let tagCell = 0, tagA = 0, dim = 0, dol = 0, acc = 0, wasDown = false, tl = null, flyTl = null, backTw = null, grab = null
      let nextMsg = 2.5, waveAt = -99, now = 0
      const look = { x: 0, y: 0 }, pd = { x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, sp: 0, ok: false, init: false }, cam = { x: 0, z: 0, px: 0, pz: 0 }
      const bnd = { x0: -0.2, x1: 30.5, z0: -3.4, z1: 3.3 }
      const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3(), V5 = new THREE.Vector3()
      const Qa = new THREE.Quaternion(), Qt = new THREE.Quaternion(), QF = new THREE.Quaternion(), QR = new THREE.Quaternion().setFromAxisAngle(AX, PI / 2)
      const MK = new THREE.Matrix4(), SK = new THREE.Vector3(), ray = new THREE.Raycaster(), ndc = { x: 0, y: 0 }, hp = { x: 0, z: 0 }

      // ---- layout ----------------------------------------------------------------------------------------------------------------------
      function layoutHero() {
        if (hero) { scene.remove(hero); hero.material.dispose(); hero.geometry.dispose(); heroTex.dispose() }
        const words = ctx.hero.split(/\s+/), nLines = portrait ? 3 : 2, tgt = ctx.hero.length / nLines, lines = []
        let c = ''
        for (const w of words) { const nx = c ? c + ' ' + w : w; if (c && nx.length > tgt * 1.1 && lines.length < nLines - 1) { lines.push(c); c = w } else c = nx }
        lines.push(c)
        const ts = lines.map((s) => ctx.text(s, { size: 160 })), cw = 1536, amax = Math.max(...ts.map((t) => t.aspect)), lh = Math.min((0.94 * cw) / amax, 250), pitch = lh * 0.78
        const ch = Math.round(pitch * lines.length + lh * 0.35), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
        const g = cv.getContext('2d')
        ts.forEach((t, k) => { const wpx = t.aspect * lh; g.drawImage(t.canvas, (cw - wpx) / 2, lh * 0.1 + pitch * k, wpx, lh); t.texture.dispose() })
        heroTex = new THREE.CanvasTexture(cv); heroTex.anisotropy = 4
        const W = portrait ? 6.2 : 10.4, H = (W * ch) / cw
        const geo = new THREE.PlaneGeometry(W, H); geo.rotateX(-PI / 2)
        hero = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: HERO_VS, fragmentShader: HERO_FS, transparent: true, depthWrite: false, uniforms: { uText: { value: heroTex }, uPh: { value: PHW } } }))
        hero.position.set(portrait ? 0 : 8.4, 0.01, portrait ? ZB + 1.4 + H / 2 : 4.7); hero.renderOrder = 2; hero.frustumCulled = false; scene.add(hero)
      }
      function layout() {
        const spec = portrait ? PORT : LAND
        ph.forEach((p, i) => {
          const [u, v, d] = spec[i]; p.u = u
          p.x = portrait ? v : u; p.z = portrait ? ZB - u : v; p.a = (d * PI) / 180
          p.vx = p.vz = p.w = 0; p.lx = p.lz = p.lvx = p.lvz = 0; p.lift = 0
        })
        if (portrait) { bnd.x0 = -3.95; bnd.x1 = 3.95; bnd.z0 = ZB - 29; bnd.z1 = 3.3 } else { bnd.x0 = -0.2; bnd.x1 = 30.6; bnd.z0 = -3.5; bnd.z1 = 3.3 }
        relax(); layoutHero(); builtP = portrait
      }

      // ---- physics: circle pairs, impulses, desk walls -------------------------------------------------------------------------------------
      const E = 0.35
      function worldCircles(b) { const c = Math.cos(b.a), s = Math.sin(b.a); for (let k = 0; k < b.cs.length; k++) { const q = b.cs[k]; b.wx[k] = b.x + c * q.lx + s * q.lz; b.wz[k] = b.z - s * q.lx + c * q.lz } }
      function pairs(positional) {
        for (let i = 0; i < 8; i++) {
          const A = ph[i]
          for (let j = i + 1; j < 8; j++) {
            const B = ph[j]
            if (Math.hypot(A.x - B.x, A.z - B.z) > 2 * (HW + 0.3)) continue
            for (let p = 0; p < A.cs.length; p++) for (let q = 0; q < B.cs.length; q++) {
              const dx = B.wx[q] - A.wx[p], dz = B.wz[q] - A.wz[p], r = A.cs[p].r + B.cs[q].r, d = Math.hypot(dx, dz), pen = r - d
              if (pen <= 0) continue
              let nx = 1, nz = 0; if (d > 1e-6) { nx = dx / d; nz = dz / d }
              if (!positional) {
                const cx = A.wx[p] + nx * A.cs[p].r, cz = A.wz[p] + nz * A.cs[p].r, rax = cx - A.x, raz = cz - A.z, rbx = cx - B.x, rbz = cz - B.z
                const vn = (B.vx + B.w * rbz - A.vx - A.w * raz) * nx + (B.vz - B.w * rbx - A.vz + A.w * rax) * nz
                if (vn < 0) {
                  const cA = raz * nx - rax * nz, cB = rbz * nx - rbx * nz, jj = (-(1 + E) * vn) / (2 + (cA * cA + cB * cB) * A.iI)
                  A.vx -= jj * nx; A.vz -= jj * nz; A.w -= jj * cA * A.iI; B.vx += jj * nx; B.vz += jj * nz; B.w += jj * cB * B.iI
                }
              }
              const k = pen * 0.4
              A.x -= nx * k; A.z -= nz * k; B.x += nx * k; B.z += nz * k
              A.wx[p] -= nx * k; A.wz[p] -= nz * k; B.wx[q] += nx * k; B.wz[q] += nz * k
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
            const rx = b.wx[k] - nx * r - b.x, rz = b.wz[k] - nz * r - b.z, vn = (b.vx + b.w * rz) * nx + (b.vz - b.w * rx) * nz
            if (vn < 0) { const c = rz * nx - rx * nz, jj = (-(1 + 0.4) * vn) / (1 + c * c * b.iI); b.vx += jj * nx; b.vz += jj * nz; b.w += jj * c * b.iI }
          }
        }
      }
      function relax() { for (let it = 0; it < 24; it++) { for (const b of ph) worldCircles(b); pairs(true); for (const b of ph) { worldCircles(b); walls(b, false) } } for (const b of ph) b.vx = b.vz = b.w = 0 }
      const STEP = 1 / 120, KG = 150, DG = 21
      function step() {
        const dl = Math.exp(-2.6 * STEP), da = Math.exp(-0.9 * STEP)   // a little friction on the table, little on the spin: a flicked phone spins like a bottle
        for (const b of ph) {
          if (grab && grab.b === b) {
            const c = Math.cos(b.a), s = Math.sin(b.a), rx = c * grab.lx + s * grab.lz, rz = -s * grab.lx + c * grab.lz
            const vgx = b.vx + b.w * rz, vgz = b.vz - b.w * rx
            let ax = KG * (pd.x - (b.x + rx)) - DG * vgx, az = KG * (pd.z - (b.z + rz)) - DG * vgz
            const am = Math.hypot(ax, az); if (am > 380) { ax *= 380 / am; az *= 380 / am }
            b.vx += ax * STEP; b.vz += az * STEP; b.w += (rz * ax - rx * az) * b.iI * STEP
          }
          b.vx *= dl; b.vz *= dl; b.w *= da
          const sp = Math.hypot(b.vx, b.vz); if (sp > 30) { b.vx *= 30 / sp; b.vz *= 30 / sp }
          b.w = clamp(b.w, -16, 16)
          b.x += b.vx * STEP; b.z += b.vz * STEP; b.a += b.w * STEP
          worldCircles(b)
        }
        pairs(false)
        for (const b of ph) walls(b, true)
      }

      // ---- picking -----------------------------------------------------------------------------------------------------------------------------
      function deskAt(nx, ny, h, out) {
        ndc.x = nx; ndc.y = ny; ray.setFromCamera(ndc, camera)
        const o = ray.ray.origin, d = ray.ray.direction
        if (d.y > -1e-4) return false
        const t = (h - o.y) / d.y; out.x = o.x + d.x * t; out.z = o.z + d.z * t; return true
      }
      const inside = (b, x, z, m) => { const c = Math.cos(b.a), s = Math.sin(b.a), dx = x - b.x, dz = z - b.z; return Math.abs(dx * c - dz * s) <= HW + m && Math.abs(dx * s + dz * c) <= HD + m }
      function hitPhone(nx, ny, m) {
        if (!deskAt(nx, ny, TOP, hp)) return -1
        let best = -1, bd = 1e9
        for (const b of ph) if (b.e < 0.5 && inside(b, hp.x, hp.z, m)) { const d = Math.hypot(hp.x - b.x, hp.z - b.z); if (d < bd) { bd = d; best = b.i } }
        return best
      }

      // ---- showcase pose ---------------------------------------------------------------------------------------------------------------------------
      const visW = (d) => 2 * TN * d * asp
      function frameOf(i, dt) {
        const w = size.w, h = size.h, b = ph[i], tg = tags[i], ps = pose[i]
        V1.set(b.x, 0.1, b.z).project(camera)
        const hx = (V1.x * 0.5 + 0.5) * w
        const fwp = (w / h < 1 ? 0.8 : 0.36) * w, fhp = (fwp * SH) / SW, M = 24, TOPPX = w < 768 ? 136 : 104, BOT = h - 24
        let fcx, fcy, tl_, tt
        if (w / h >= 1 && fwp + 22 + tg.wpx + 2 * M <= w) {
          const right = hx <= w / 2, gw = fwp + 22 + tg.wpx, gl = clamp(right ? hx - fwp / 2 : hx + fwp / 2 - gw, M, w - M - gw)
          fcx = right ? gl + fwp / 2 : gl + tg.wpx + 22 + fwp / 2; tl_ = right ? gl + fwp + 22 : gl
          fcy = clamp(h * 0.55, TOPPX + fhp / 2, Math.max(TOPPX + fhp / 2, BOT - fhp / 2)); tt = fcy - tg.hpx / 2
        } else {
          const gt = clamp(h * 0.5 - fhp / 2, TOPPX, Math.max(TOPPX, BOT - (fhp + 16 + tg.hpx)))
          fcx = w / 2; fcy = gt + fhp / 2
          tl_ = clamp(fcx - fwp / 2, M, Math.max(M, w - M - tg.wpx)); tt = gt + fhp + 16
        }
        tt = clamp(tt, TOPPX, Math.max(TOPPX, BOT - tg.hpx))
        const k = ps.init ? 1 - Math.exp(-dt * 14) : 1
        ps.init = true; ps.x += (fcx - ps.x) * k; ps.y += (fcy - ps.y) * k; ps.w += (fwp - ps.w) * k; ps.l += (tl_ - ps.l) * k; ps.t += (tt - ps.t) * k
      }
      const held = new THREE.Vector3(), restAt = new THREE.Vector3()
      function poseOf(p, ee, fk) { // table pose (with lean, buzz) -> held in the hand (opening) -> showcase (hover) -> filling the view (fly-in)
        const A = Math.max(p.bz, p.bzO), t = now
        Qa.setFromAxisAngle(AY, p.a + A * 0.07 * Math.sin(t * 46 + p.i * 1.7))
        V1.set(p.x + A * 0.03 * Math.sin(t * 53 + p.i), p.lift, p.z)
        const th = Math.hypot(p.lx, p.lz)
        if (th > 0.002) {
          const dx = p.lx / th, dz = p.lz / th, ca = Math.cos(p.a), sa = Math.sin(p.a), e = Math.abs(dx * ca - dz * sa) * HW + Math.abs(dx * sa + dz * ca) * HD
          Qt.setFromAxisAngle(V2.set(dz, 0, -dx), th); Qa.premultiply(Qt)
          V1.x += dx * e * (1 - Math.cos(th)); V1.z += dz * e * (1 - Math.cos(th)); V1.y += e * Math.sin(th)
        }
        let s = 1
        if (p.i === 0 && O.lay < 1) { // opening: the phone starts upright in the air facing the camera, then is laid down
          const l = sm(clamp(O.lay, 0, 1))
          V1.lerp(held.set(restAt.x, 1.6, restAt.z), 1 - l); V1.y += Math.sin(l * PI) * 0.5; Qa.slerp(QR, 1 - l)
        }
        if (ee > 0.0005 || (fk > 0 && p.i === flyIdx)) {
          const ps = pose[p.i], dS = dist * 0.6
          V2.set((ps.x / size.w) * 2 - 1, 1 - (ps.y / size.h) * 2, 0.5).unproject(camera).sub(camera.position).normalize()
          V3.set(0, 0, -1).applyQuaternion(camera.quaternion)
          V2.multiplyScalar(dS / Math.max(V2.dot(V3), 0.2)).add(camera.position)
          const sS = ((ps.w / size.w) * visW(dS)) / SW
          V1.lerp(V2, ee); Qa.slerp(QF, ee); s = lerp(1, sS, ee)
          if (fk > 0 && p.i === flyIdx) { // loop centre onto the view centre, loop covering the view
            const dF = dist * 0.35, sF = (Math.max(visW(dF), 2 * TN * dF * (16 / 9)) * 1.02) / LW
            V5.set(0, 1, 0).applyQuaternion(camera.quaternion)
            V4.copy(V3).multiplyScalar(dF).add(camera.position).addScaledVector(V5, -LOOP_OFF * sF).addScaledVector(V3, TOP * sF)
            V1.lerp(V4, fk); s = lerp(s, sF, fk)
          }
        }
        p.pos.copy(V1); p.q.copy(Qa); p.s = s
      }

      // ---- the four moments ----------------------------------------------------------------------------------------------------------------------------
      const order = ph.slice()
      function buzz(p, amp) { p.bz = Math.max(p.bz, amp); p.flT = Math.max(p.flT, amp); p.vx += (Math.random() - 0.5) * 1.8 * amp; p.vz += (Math.random() - 0.5) * 1.8 * amp; p.w += (Math.random() - 0.5) * 1.6 * amp }
      function startOpening() {
        opening = true; O.cam = 0; O.lay = 0
        ph.forEach((p) => { p.on = p.i === 0 ? 1 : 0; p.reel = p.i === 0 ? 1 : 0 })
        tl = gsap.timeline({ onComplete: () => { opening = false } })
        tl.to(O, { cam: 1, duration: 1.75, ease: 'power2.inOut' }, 0.45)  // pull back from the Showreel to one phone held upright, then down onto the table
        tl.to(O, { lay: 1, duration: 0.9, ease: 'none' }, 1.2)
        order.slice().sort((a, b) => a.u - b.u).filter((p) => p.i !== 0).forEach((p, k) => {
          const at = 1.55 + k * 0.14
          tl.to(p, { on: 1, duration: 0.3, ease: 'power1.out' }, at)
          tl.fromTo(p, { bzO: 1 }, { bzO: 0, duration: 0.7, ease: 'power2.out', immediateRender: false }, at)
        })
        tl.to(ph[0], { reel: 0, duration: 0.5, ease: 'power1.inOut' }, 2.2)
      }
      function skipOpening() { if (tl) tl.progress(1); opening = false }
      function flyTo(i) {
        if (flying || opening || i < 0) return
        flying = true; flyIdx = i; hot = i; ctx.cursor.hover(false); hoverOn = false; grab = null
        frameOf(i, 0.016)
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        flyTl.to(fly, { k: 1, duration: 0.74, ease: 'power3.in' }, 0.12)
      }

      // ---- camera --------------------------------------------------------------------------------------------------------------------------------------
      function layoutCam() {
        asp = size.w / size.h; portrait = asp < 0.85
        camera.fov = portrait ? 38 : 30; camera.aspect = asp; TN = Math.tan((camera.fov * PI) / 360)
        VWd = portrait ? 8.2 : 17; PITCH = portrait ? 0.9 : 0.8
        dist = VWd / (2 * TN * asp); camera.updateProjectionMatrix()
        uc0 = portrait ? 3.9 : 8.4; uc1 = portrait ? 15.7 : 20.7; SCR = portrait ? 1500 : 2600
        dc = Math.min((LW * 0.985) / (2 * TN * asp), (LH * 0.985) / (2 * TN))
      }
      function placeCamera(dt) {
        const sc = ctx.scroll, s = clamp(sc.y / SCR, 0, 1)
        dol += (clamp(Math.abs(sc.v) / 900, 0, 1) - dol) * Math.min(1, dt * 6)
        const uc = lerp(uc0, uc1, s), e = clamp(O.cam, 0, 1)
        V1.set(portrait ? 0 : uc, 0, portrait ? ZB - uc : ZT)
        let dd = dist * (1 - 0.04 * dol), pitch = PITCH + look.y * 0.05
        if (e < 1) {                                          // opening: start on the held phone's loop, head-on
          const lc = restAt; V2.set(lc.x, 1.6 + LOOP_OFF, lc.z + TOP)
          const ee = e, e2 = sm(clamp((ee - 0.35) / 0.65, 0, 1))
          V1.lerp(V2, 1 - ee); dd = dc * Math.pow(dd / dc, ee); pitch = pitch * e2
        }
        const az = look.x * 0.12
        cam.x = V1.x; cam.z = V1.z
        camera.position.set(V1.x + dd * Math.sin(az) * Math.cos(pitch), V1.y + dd * Math.sin(pitch), V1.z + dd * Math.cos(az) * Math.cos(pitch))
        camera.up.set(0, 1, 0); camera.lookAt(V1.x, V1.y, V1.z)
        camera.updateMatrixWorld(true)
        QF.copy(camera.quaternion).multiply(QR)
        table.position.set(V1.x, 0, V1.z); table.material.uniforms.uCam.value.set(V1.x, V1.z)
      }

      // ---- frame ------------------------------------------------------------------------------------------------------------------------------------------
      function update(t, dt) {
        dt = clamp(dt, 0.0001, 0.05); now = t
        const sc = ctx.scroll, w = size.w, h = size.h
        if (builtP !== portrait) { layout(); layoutCam(); if (ctx.reduced) O.cam = O.lay = 1 }
        restAt.set(ph[0].x, 0, ph[0].z)
        const lk = Math.min(1, dt * 3)
        look.x += ((P.inside && !touch ? P.nx : 0) - look.x) * lk; look.y += ((P.inside && !touch ? P.ny : 0) - look.y) * lk
        cam.px = cam.x; cam.pz = cam.z
        placeCamera(dt)

        // pointer on the table
        pd.ok = deskAt(P.nx, P.ny, 0.15, hp)
        if (pd.ok) {
          pd.px = pd.x; pd.pz = pd.z; pd.x = hp.x; pd.z = hp.z
          if (!pd.init) { pd.init = true; pd.px = pd.x; pd.pz = pd.z; cam.px = cam.x; cam.pz = cam.z }
          const k = Math.min(1, dt * 14)
          pd.vx += (((pd.x - pd.px) - (cam.x - cam.px)) / dt - pd.vx) * k; pd.vz += (((pd.z - pd.pz) - (cam.z - cam.pz)) / dt - pd.vz) * k
          pd.sp = Math.hypot(pd.vx, pd.vz)
        } else pd.sp = 0

        // grab and release (a finger scrolls instead)
        const down = P.down && !opening && !flying && !touch
        if (down && !wasDown) { const i = hitPhone(P.nx, P.ny, 0.05); if (i >= 0 && ph[i].e < 0.2) { const b = ph[i], c = Math.cos(b.a), s = Math.sin(b.a), dx = pd.x - b.x, dz = pd.z - b.z; grab = { b, lx: dx * c - dz * s, lz: dx * s + dz * c } } }
        if (!down && grab) grab = null
        wasDown = down

        // hover (dwell on a phone; a quick pass only turns its screen toward the pointer)
        let hit = -1
        const live = !opening && !flying && !touch && P.inside && !grab
        if (live) {
          const px = ((P.nx + 1) / 2) * w, py = ((1 - P.ny) / 2) * h
          let keepHot = false
          if (hot >= 0 && ph[hot].e > 0.5) { const ps = pose[hot]; keepHot = Math.abs(px - ps.x) < (ps.w / 2) * 1.06 && Math.abs(py - ps.y) < ((ps.w * SH) / SW / 2) * 1.06 }
          if (keepHot) { hit = hot; dwell = 1; cand = hot } else {
            const c2 = hitPhone(P.nx, P.ny, 0.05)
            if (c2 !== cand) { dwell = 0; cand = c2 } else if (c2 >= 0 && pd.sp < 6) dwell += dt
            hit = c2 >= 0 && dwell > 0.16 && pd.sp < 4 ? c2 : -1
          }
        } else { dwell = 0; cand = -1 }
        if ((hit >= 0) !== hoverOn) { hoverOn = hit >= 0; ctx.cursor.hover(hoverOn) }
        hot = flying ? flyIdx : hit >= 0 ? hit : !opening && focusCell >= 0 ? focusCell : -1

        // life: a message every few seconds; scroll speed sends a buzz wave through the phones in order
        if (!opening && !flying && hot < 0 && t > nextMsg) {
          const free = ph.filter((p) => !(grab && grab.b === p) && t - p.pillAt > 4)
          if (free.length) { const p = free[Math.floor(Math.random() * free.length)]; buzz(p, 1); p.pillAt = t }
          nextMsg = t + 2.6 + Math.random() * 2.4
        }
        if (!opening && Math.abs(sc.v) > 380 && t - waveAt > 1.8) {
          waveAt = t; const dir = sc.v > 0 ? 1 : -1
          for (const p of ph) p.waveT = ((dir > 0 ? p.u - 3 : 28 - p.u) * 0.06) + 0.02
        }
        for (const p of ph) if (p.waveT >= 0) { p.waveT -= dt; if (p.waveT < 0) { buzz(p, 0.65); p.waveT = -1 } }

        // physics (frozen while the opening plays)
        if (!opening) { acc += dt; let n = 0; while (acc >= STEP && n < 4) { step(); acc -= STEP; n++ } if (n === 4) acc = 0 }

        // per phone: the sunflower lean (spring with overshoot), buzz decay, hover blend, pose
        let maxE = 0
        const ex = !touch && P.inside && pd.ok && !opening && !grab && hot < 0
        for (const p of ph) {
          let tx = 0, tz = 0
          if (ex) {
            const dx = pd.x - p.x, dz = pd.z - p.z, d = Math.hypot(dx, dz), s = clamp(1 - (d - 1.3) / 2.2, 0, 1)
            if (s > 0 && d > 0.05) { tx = (dx / d) * s * 0.95; tz = (dz / d) * s * 0.95 }
          }
          p.lvx += (90 * (tx - p.lx) - 9 * p.lvx) * dt; p.lvz += (90 * (tz - p.lz) - 9 * p.lvz) * dt
          p.lx += p.lvx * dt; p.lz += p.lvz * dt
          p.lift += ((grab && grab.b === p ? 0.28 : 0) - p.lift) * Math.min(1, dt * 14)
          p.bz *= Math.exp(-dt * 4.5); p.flT = Math.max(0, p.flT - dt * 2.2)
          p.flash += (p.flT - p.flash) * Math.min(1, dt * (p.flT > p.flash ? 18 : 3))
          const tgt = hot === p.i ? 1 : 0
          p.e += (tgt - p.e) * Math.min(1, dt * (tgt ? 9 : 6)); if (p.e < 0.003 && !tgt) { p.e = 0; pose[p.i].init = false }
          if (p.e > 0 || tgt) frameOf(p.i, dt)
          maxE = Math.max(maxE, sm(p.e))
        }
        for (const p of ph) {
          const ee = sm(p.e), fk = p.i === flyIdx ? fly.k : 0
          poseOf(p, ee, fk)
          MK.compose(p.pos, p.q, SK.setScalar(p.s))
          bodies.setMatrixAt(p.i, MK); screens.setMatrixAt(p.i, MK)
          const el = MK.elements; el[1] = -el[1]; el[5] = -el[5]; el[9] = -el[9]; el[13] = -el[13]; mirrors.setMatrixAt(p.i, MK)
          // soft contact shadow, thrown away from the light and spreading as the phone rises
          const y = p.pos.y, off = y * 0.5 + 0.08, spread = 1 + 0.07 * y, hs = (HW + MARG) * p.s * spread, hd = (HD + MARG) * p.s * spread
          Qa.setFromAxisAngle(AY, p.a * (1 - ee)); V1.set(p.pos.x + LX * off, 0.006, p.pos.z + LZ * off); MK.compose(V1, Qa, V2.set(hs * 2, 1, hd * 2))
          shadows.setMatrixAt(p.i, MK)
          aSh.setXYZW(p.i, (0.62 / (1 + 0.28 * y)) * (1 - 0.45 * ee), 0.35 + 0.05 * y, HW / (HW + MARG) / spread * 0.98, HD / (HD + MARG) / spread * 0.98)
          p.bright = p.on * (1 + 0.55 * p.flash) * (1 + 0.1 * ee)
          // the pill drops in, waits, goes
          const u = t - p.pillAt; let pill = 0
          if (u >= 0 && u < 0.45) { const k = u / 0.45 - 1; pill = 1 + 2.2 * Math.pow(k, 3) + 1.2 * k * k }   // ease out back
          else if (u >= 0.45 && u < 2.7) pill = 1
          else if (u >= 2.7 && u < 3.1) pill = 1 - sm((u - 2.7) / 0.4)
          aSt.setXYZW(p.i, p.bright, pill, p.reel, p.i)
          PHW[p.i].set(p.pos.x, p.pos.z, 0.5 * p.on * (1 + 0.8 * p.flash) * (1 - 0.8 * ee) * (y > 3 ? 0 : 1), p.a)
        }
        bodies.instanceMatrix.needsUpdate = true; screens.instanceMatrix.needsUpdate = true; mirrors.instanceMatrix.needsUpdate = true
        shadows.instanceMatrix.needsUpdate = true; aSh.needsUpdate = true; aSt.needsUpdate = true

        dim += ((hot >= 0 ? 0.72 : 0) - dim) * Math.min(1, dt * 7)
        mirrors.material.uniforms.uMirA.value = 0.85 * (1 - maxE)
        dimMat.opacity = dim; dimPlane.visible = dim > 0.004; dimPlane.position.x = cam.x; dimPlane.position.z = cam.z

        ctx.crt.push = clamp(Math.abs(sc.v) / 3200 + fly.k * 0.5 + (opening ? 0.35 * Math.sin(clamp(O.cam, 0, 1) * PI) : 0) + (grab ? Math.min(0.15, Math.hypot(grab.b.vx, grab.b.vz) / 120) : 0), 0, 1)

        // the tag beside the standing phone
        const want = hot >= 0 && ph[hot].e > 0.25 && !flying && !opening
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

      layoutCam(); layout(); layoutCam(); layoutTags()
      if (ctx.reduced) { O.cam = 1; O.lay = 1 } else startOpening()

      return {
        scene, camera, update,
        resize() { layoutCam(); layoutTags() },
        tap() {
          if (opening) { skipOpening(); return }
          if (flying) return
          let i = hot
          if (i < 0 || touch) i = hitPhone(P.nx, P.ny, touch ? 0.35 : 0.05)
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
          gsap.killTweensOf(O); gsap.killTweensOf(fly); ph.forEach((p) => gsap.killTweensOf(p))
          ctx.cursor.hover(false)
          if (hero) { hero.material.dispose(); hero.geometry.dispose(); heroTex.dispose() }
          for (const m of [bodies, screens, mirrors, shadows, table, dimPlane]) { m.material.dispose(); scene.remove(m) }
          bodies.dispose(); screens.dispose(); mirrors.dispose(); shadows.dispose()
          keep.forEach((o) => o.dispose()); scene.remove(camera)
        },
      }
    },
  })
})()
