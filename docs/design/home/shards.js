/* THROWAWAY prototype 'Shards': the Showreel is a pane of glass that has broken. One 16:9 pane is cut once into ~110
   shards in ONE BufferGeometry; the CPU choreographs every shard each frame, the vertex shader only places them.
   FAKE: everything comes from ctx (titles, loops, hero). Contract: docs/design/home/CONTRACT.md. */
;(function () {
  'use strict'
  HOME.register({
    name: 'Shards',
    create: function (ctx) {
      const NW = 8, CZ = 3.2, PW = 16, PH = 9, COLS = ctx.touch ? 6 : 12, ROWS = 6, TW = PW / 3, TH = PH / 3
      const CPT = COLS / 3, SPREAD = 1.04, ZH = 0.8, ZF = 1.0
      const clamp = (x, a, b) => (x < a ? a : x > b ? b : x)
      const lerp = (a, b, t) => a + (b - a) * t
      const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
      const outBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2) }
      const works = ctx.works

      const st = { open: 0, opened: false, asm: 0, expl: 0, apG: 0, fly: 0, flyIdx: -1, hov: -1, focus: -1, hovAmt: 0, lab: 0, labIdx: 0, busy: false }

      // --- the cut: built once -------------------------------------------------------------
      let seed = 20260513
      const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
      const cw = PW / COLS, chh = PH / ROWS
      const pts = []
      for (let j = 0; j <= ROWS; j++) {
        const row = []
        for (let i = 0; i <= COLS; i++) {
          let x = -PW / 2 + i * cw, y = -PH / 2 + j * chh
          if (i > 0 && i < COLS) x += (rnd() - 0.5) * 0.76 * cw
          if (j > 0 && j < ROWS) y += (rnd() - 0.5) * 0.76 * chh
          row.push([x, y])
        }
        pts.push(row)
      }
      const CRACK = [[-8.4, 3.4], [-6.2, 1.9], [-4.1, 2.3], [-2.2, 0.4], [0, 0.9], [2, -0.7], [4, -0.2], [6.2, -2.3], [8.4, -3.5]]
      function crackDist(x, y) {
        let dd = 1e9
        for (let i = 0; i < 8; i++) {
          const a = CRACK[i], b = CRACK[i + 1], ex = b[0] - a[0], ey = b[1] - a[1], wx = x - a[0], wy = y - a[1]
          const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1)
          dd = Math.min(dd, Math.hypot(wx - ex * h, wy - ey * h))
        }
        return dd
      }
      const MAP = [[0, 1, 2], [3, 8, 4], [5, 6, 7]]
      const pos = [], uvs = [], atl = [], bar = []
      const shards = []
      function addShard(g, tx, ty, tris) {
        const x0 = -PW / 2 + tx * TW, y0 = -PH / 2 + (2 - ty) * TH
        const set = []
        tris.forEach((t) => { for (let k = 0; k < 3; k++) if (set.indexOf(t[k]) < 0) set.push(t[k]) })
        let cx = 0, cy = 0
        set.forEach((p) => { cx += p[0]; cy += p[1] })
        cx /= set.length; cy /= set.length
        const tcx = x0 + TW / 2, tcy = y0 + TH / 2
        const rect = g < 8 ? ctx.loopRect(g) : null
        const s = { g, cx, cy, tcx, tcy, rx: cx - tcx, ry: cy - tcy, v0: pos.length / 3, nv: tris.length * 3 }
        tris.forEach((t) => {
          for (let k = 0; k < 3; k++) {
            const p = t[k]
            pos.push(p[0] - cx, p[1] - cy, 0)
            uvs.push((p[0] + PW / 2) / PW, (p[1] + PH / 2) / PH)
            const lu = clamp((p[0] - x0) / TW, 0.012, 0.988), lv = clamp((p[1] - y0) / TH, 0.012, 0.988)
            if (rect) atl.push(rect[0] + lu * rect[2], rect[1] + lv * rect[3]); else atl.push(0, 0)
            const b = [0, 0, 0]
            b[k] = 1
            if (t[3] >= 0) b[t[3]] += 1 // the shared diagonal of a quad shard is no edge
            bar.push(b[0], b[1], b[2])
          }
        })
        s.r1 = rnd(); s.r2 = rnd(); s.r3 = rnd(); s.r4 = rnd(); s.u1 = rnd(); s.u2 = rnd()
        s.ph = rnd() * 6.283; s.sp = 0.25 + rnd() * 0.5; s.sgn = rnd() < 0.5 ? -1 : 1
        let ax = rnd() - 0.5, ay = rnd() - 0.5, az = (rnd() - 0.5) * 0.6
        const al = Math.hypot(ax, ay, az) || 1
        s.ax = ax / al; s.ay = ay / al; s.az = az / al
        const ol = Math.hypot(cx, cy) || 1
        let ex = (cx / ol) * 0.6 + (rnd() - 0.5) * 0.8, ey = (cy / ol) * 0.6 + (rnd() - 0.5) * 0.8, ez = rnd() * 1.1 - 0.5
        const el = Math.hypot(ex, ey, ez) || 1
        s.ex = [ex / el, ey / el, ez / el]
        s.delay = 0.2 + 0.18 * clamp(crackDist(cx, cy) / 5.5, 0, 1) + 0.05 * s.r2
        s.zr = 0; s.hx = 0; s.hy = 0
        s.dx = 0; s.dy = 0; s.dz = 0; s.vx = 0; s.vy = 0; s.vz = 0; s.ka = 0; s.kv = 0
        shards.push(s)
      }
      for (let j = 0; j < ROWS; j++) {
        for (let i = 0; i < COLS; i++) {
          const A = pts[j][i], B = pts[j][i + 1], C = pts[j + 1][i + 1], D = pts[j + 1][i]
          const tx = Math.floor(i / CPT), ty = 2 - Math.floor(j / 2), g = MAP[ty][tx], m = rnd()
          if (m < 0.45) addShard(g, tx, ty, [[A, B, C, 1], [A, C, D, 2]])
          else if (m < 0.73) { addShard(g, tx, ty, [[A, B, C, -1]]); addShard(g, tx, ty, [[A, C, D, -1]]) }
          else { addShard(g, tx, ty, [[A, B, D, -1]]); addShard(g, tx, ty, [[B, C, D, -1]]) }
        }
      }
      const NV = pos.length / 3
      const poseA = new Float32Array(NV * 4), rotA = new Float32Array(NV * 4), mixA = new Float32Array(NV * 4)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
      geo.setAttribute('aAtlas', new THREE.BufferAttribute(new Float32Array(atl), 2))
      geo.setAttribute('aBary', new THREE.BufferAttribute(new Float32Array(bar), 3))
      const aPose = new THREE.BufferAttribute(poseA, 4), aRot = new THREE.BufferAttribute(rotA, 4), aMix = new THREE.BufferAttribute(mixA, 4)
      aPose.setUsage(THREE.DynamicDrawUsage); aRot.setUsage(THREE.DynamicDrawUsage); aMix.setUsage(THREE.DynamicDrawUsage)
      geo.setAttribute('aPose', aPose); geo.setAttribute('aRot', aRot); geo.setAttribute('aMix', aMix)

      // --- layout -------------------------------------------------------------------------------
      const slots = []
      for (let i = 0; i < NW; i++) slots.push([0, 0])
      const L = { asp: ctx.size.w / ctx.size.h, Ws: 0.86, kc: 0.1, kp: 0.2, kCov: 0.3, kH: 0.18, kF: 0.4, Wc: 3.6, hwv: 0.6 }
      const Gs = []
      for (let g = 0; g < 9; g++) Gs.push({ ha: 0, sx: 0, sy: 0, sz: 0, n: 0, cxv: 0, cyv: 0, czv: 0, hvx: 0, hvy: 0, wx: 0, wy: 0, bx: 0, by: 0, bz: 0, tcx: 0, tcy: 0, pj: 1 })
      shards.forEach((s) => { Gs[s.g].tcx = s.tcx; Gs[s.g].tcy = s.tcy })
      function layout() {
        const a = L.asp
        if (a >= 1) {
          // eight cracked 16:9 screens (~20% of the view width each) in two rows around the hero
          const Ws = Math.min(0.4 * a, 0.74), sp = Math.min(0.88, (a * 2 * 0.93 - Ws) / 3), ry = 0.3 + Ws * 0.5625 * 0.5 + 0.07
          L.Ws = Ws
          for (let i = 0; i < NW; i++) { slots[i][0] = ((i % 4) - 1.5) * sp; slots[i][1] = i < 4 ? ry : -ry }
        } else {
          const Ws = a * 0.86, ys = [0.84, 0.55, -0.55, -0.84]
          L.Ws = Ws
          for (let i = 0; i < NW; i++) { slots[i][0] = ((i % 2) - 0.5) * Ws * 1.06; slots[i][1] = ys[Math.floor(i / 2)] }
        }
        L.kc = L.Ws / (TW * SPREAD + 1.3)
        const paneW = Math.min(a * 1.8, 3.2)
        L.kp = paneW / PW
        L.Wc = Math.max(2 * a, (2 * 16) / 9) * 1.01
        L.kCov = L.Wc / PW
        const Wv = a >= 1 ? 0.76 * a : 1.6 * a // hovered screen: ~38% of the view width (more on a phone)
        L.kH = Wv / (CZ / (CZ - ZH)) / TW
        L.hwv = Wv / 2
        L.kF = L.Wc / (CZ / (CZ - ZF)) / TW
        shards.forEach((s) => {
          if (s.g < 8) s.zr = (((s.g * 37) % 5) - 2) * 0.05 + (s.r2 - 0.5) * 0.14
          else { s.hx = (s.u1 * 2 - 1) * a * 0.95; s.hy = (s.u2 * 2 - 1) * 0.92; s.zr = (s.r4 - 0.5) * 1.6 }
        })
      }
      layout()

      // --- hero sentence (floats among the shards) and the label atlas -------------------------------
      let heroTex = null, heroCa = 4, heroPortrait = null
      const heroMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 })
      const heroMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), heroMat)
      heroMesh.position.z = 0.15; heroMesh.visible = false; heroMesh.renderOrder = 2
      function buildHero() {
        const portrait = L.asp < 1
        heroPortrait = portrait
        const px = 180
        let lines
        if (portrait) {
          lines = []
          let cur = ''
          ctx.hero.split(/\s+/).forEach((w) => { if (cur && (cur + ' ' + w).length > 12) { lines.push(cur); cur = w } else cur = cur ? cur + ' ' + w : w })
          if (cur) lines.push(cur)
        } else lines = (ctx.hero.match(/[^.!?]+[.!?]*/g) || [ctx.hero]).map((s) => s.trim()).filter(Boolean)
        const ts = lines.map((l) => ctx.text(l, { size: px }))
        const step = px * 1.06
        let W = 8
        ts.forEach((t) => { W = Math.max(W, t.canvas.width) })
        const H = Math.ceil(step * (ts.length - 1) + ts[0].canvas.height)
        const c = document.createElement('canvas')
        c.width = W; c.height = H
        const g = c.getContext('2d')
        ts.forEach((t, i) => { g.drawImage(t.canvas, Math.round((W - t.canvas.width) / 2), Math.round(i * step)); t.texture.dispose() })
        if (heroTex) heroTex.dispose()
        heroTex = new THREE.CanvasTexture(c)
        heroTex.anisotropy = 4
        heroMat.map = heroTex; heroMat.needsUpdate = true
        heroCa = W / H
      }
      buildHero()

      const LW = 1024, LR = 200
      const labCanvas = document.createElement('canvas')
      labCanvas.width = LW; labCanvas.height = LR * NW
      const rowFrac = []
      {
        const g = labCanvas.getContext('2d')
        for (let i = 0; i < NW; i++) {
          const t = ctx.text(works[i].title, { size: 96 })
          const m = ctx.text(works[i].kind + ' · ' + works[i].year, { caps: true, size: 26 })
          const s = Math.min(1, (LW - 8) / t.canvas.width)
          g.drawImage(t.canvas, 0, i * LR, t.canvas.width * s, t.canvas.height * s)
          g.drawImage(m.canvas, 13, i * LR + 150)
          rowFrac.push(Math.min(1, Math.max(t.canvas.width * s, m.canvas.width + 13) / LW))
          t.texture.dispose(); m.texture.dispose()
        }
      }
      const labTex = new THREE.CanvasTexture(labCanvas)
      labTex.minFilter = labTex.magFilter = THREE.LinearFilter
      labTex.generateMipmaps = false
      const labMat = new THREE.ShaderMaterial({
        transparent: true, depthTest: false, depthWrite: false,
        uniforms: { tLabel: { value: labTex }, uAmt: { value: 0 }, uUV: { value: new THREE.Vector3(1, 1, 0.875) } },
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `
precision highp float;
varying vec2 vUv;
uniform sampler2D tLabel;
uniform float uAmt;
uniform vec3 uUV;
void main(){
  vec4 t=texture2D(tLabel,vec2(vUv.x*uUV.x,mix(uUV.z,uUV.y,vUv.y)));
  float w=clamp((uAmt*1.35-vUv.x)/.35,0.,1.);
  gl_FragColor=vec4(t.rgb,t.a*w);
}`,
      })
      const labMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), labMat)
      labMesh.visible = false; labMesh.renderOrder = 10; labMesh.frustumCulled = false

      // --- material -----------------------------------------------------------------------------------
      const uCr = CRACK.map((p) => new THREE.Vector2(p[0], p[1]))
      const U = { tAtlas: { value: ctx.atlas }, tReel: { value: ctx.showreel.texture }, uCrack: { value: 0 }, uCrackA: { value: 1 }, uCr: { value: uCr } }
      const material = new THREE.ShaderMaterial({
        uniforms: U, side: THREE.DoubleSide,
        vertexShader: `
attribute vec2 aAtlas;
attribute vec3 aBary;
attribute vec4 aPose;
attribute vec4 aRot;
attribute vec4 aMix;
varying vec2 vPane;
varying vec2 vAtlas;
varying vec4 vMix;
varying vec3 vBary;
varying vec3 vN;
varying vec3 vW;
vec3 rot(vec3 v,vec3 k,float a){
  float c=cos(a);
  float s=sin(a);
  return v*c+cross(k,v)*s+k*dot(k,v)*(1.-c);
}
void main(){
  vec3 w=aPose.xyz+rot(position*aPose.w,aRot.xyz,aRot.w);
  vPane=uv;
  vAtlas=aAtlas;
  vMix=aMix;
  vBary=aBary;
  vN=rot(vec3(0.,0.,1.),aRot.xyz,aRot.w);
  vW=w;
  gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);
}`,
        fragmentShader: `
precision highp float;
uniform sampler2D tAtlas;
uniform sampler2D tReel;
uniform float uCrack;
uniform float uCrackA;
uniform vec2 uCr[9];
varying vec2 vPane;
varying vec2 vAtlas;
varying vec4 vMix;
varying vec3 vBary;
varying vec3 vN;
varying vec3 vW;
float crackDist(vec2 p){
  float dd=1000.;
  for(int i=0;i<8;i++){
    vec2 a=uCr[i];
    vec2 b=uCr[i+1];
    float vis=clamp(uCrack*8.-float(i),0.,1.);
    if(vis>0.){
      vec2 e=mix(a,b,vis)-a;
      vec2 w=p-a;
      float h=clamp(dot(w,e)/max(dot(e,e),.00001),0.,1.);
      dd=min(dd,length(w-e*h));
    }
  }
  return dd;
}
void main(){
  vec3 a=texture2D(tAtlas,vAtlas).rgb;
  vec3 r=texture2D(tReel,vPane).rgb;
  vec3 c=mix(a,r,vMix.x);
  vec3 N=normalize(vN);
  if(!gl_FrontFacing) N=-N;
  vec3 V=normalize(cameraPosition-vW);
  vec3 Lt=normalize(vec3(-.35,.55,.75));
  float dif=.86+.2*dot(N,Lt);
  c*=dif*vMix.z;
  vec3 H=normalize(Lt+V);
  c+=vec3(pow(max(dot(N,H),0.),80.)*.4);
  float e=min(vBary.x,min(vBary.y,vBary.z));
  float ew=fwidth(e);
  float edge=1.-smoothstep(0.,max(ew*1.6,.0001),e);
  c=mix(c,vec3(.93),edge*vMix.y);
  c+=vec3(vMix.w*edge*.5);
  vec2 pp=vPane*vec2(16.,9.)-vec2(8.,4.5);
  if(uCrackA>.001){
    float cd=crackDist(pp);
    float line=1.-smoothstep(.015,.075,cd);
    c=mix(c,vec3(.95),line*uCrackA*.95);
    c+=vec3(exp(-cd*5.)*.1*uCrackA);
  }
  if(!gl_FrontFacing) c*=.55;
  gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`,
      })
      const mesh = new THREE.Mesh(geo, material)
      mesh.frustumCulled = false
      const scene = new THREE.Scene()
      scene.add(mesh, heroMesh, labMesh)
      const camera = new THREE.PerspectiveCamera((2 * Math.atan(1 / CZ) * 180) / Math.PI, ctx.size.w / ctx.size.h, 0.1, 20)
      camera.position.set(0, 0, CZ)

      // --- opening: full-screen Showreel, a crack, it breaks toward the camera and drifts into eight clusters ---
      const tl = gsap.timeline({ onComplete() { st.opened = true } })
      tl.fromTo(st, { open: 0 }, { open: 1, duration: 2.9, ease: 'none' })
      function skip() { tl.progress(1, false); st.open = 1; st.opened = true }
      if (ctx.reduced) skip()

      // --- hover, fly-in ----------------------------------------------------------------------------------
      function setHover(h) {
        const prev = st.hov
        st.hov = h
        ctx.cursor.hover(h >= 0)
        if (prev >= 0) gsap.to(Gs[prev], { ha: 0, duration: 0.55, ease: 'power2.inOut', overwrite: 'auto' })
        if (h >= 0) {
          st.labIdx = h
          gsap.to(Gs[h], { ha: 1, duration: 0.6, ease: 'power2.out', overwrite: 'auto' })
          gsap.fromTo(st, { lab: 0 }, { lab: 1, duration: 0.7, ease: 'power3.out', delay: 0.15, overwrite: 'auto' })
        } else gsap.to(st, { lab: 0, duration: 0.2, ease: 'power2.in', overwrite: 'auto' })
      }
      function go(g) {
        st.busy = true; st.flyIdx = g
        st.hov = -1; ctx.cursor.hover(false)
        gsap.to(st, { lab: 0, duration: 0.15, overwrite: 'auto' })
        gsap.timeline({ onComplete() { ctx.enter(g) } })
          .to(Gs[g], { ha: 1, duration: 0.28, ease: 'power2.out', overwrite: 'auto' })
          .to(st, { fly: 1, duration: 0.58, ease: 'power3.in', overwrite: 'auto' })
      }
      function pickGroup(px, py) {
        let best = -1, bs = 1e9
        for (let g = 0; g < NW; g++) {
          const G = Gs[g]
          let cx, cy, hw
          if (G.ha > 0.5) { cx = G.hvx; cy = G.hvy; hw = L.hwv } else {
            cx = G.cxv; cy = G.cyv; hw = (lerp(L.Ws / 2, (L.kp * TW) / 2, st.apG)) * G.pj + 0.04
          }
          const hh = hw * 0.5625, sc = Math.max(Math.abs(px - cx) / hw, Math.abs(py - cy) / hh)
          if (sc < (g === st.hov ? 1.12 : 1) && sc < bs) { bs = sc; best = g }
        }
        return best
      }
      const out = [0, 0]
      function place(cx, cy, hw, hh, bw, bh, mx, my) {
        const g = 0.05
        const fitR = cx + hw + g + bw <= mx, fitL = cx - hw - g - bw >= -mx
        let x0, y0 = cy - bh * 0.5
        if (cx < 0 ? fitR : fitL) x0 = cx < 0 ? cx + hw + g : cx - hw - g - bw // beside it, toward the middle
        else if (fitR) x0 = cx + hw + g
        else if (fitL) x0 = cx - hw - g - bw
        else {
          x0 = cx - bw * 0.5
          y0 = cy > 0 ? cy - hh - g - bh : cy + hh + g
        }
        out[0] = clamp(x0, -mx, mx - bw); out[1] = clamp(y0, -my, my - bh)
      }

      // --- frame ---------------------------------------------------------------------------------------------
      const RP = 0.5, FP = 46, KS = 42, CS = 4.2
      function update(t, dt) {
        const P = ctx.pointer, S = ctx.scroll, asp = L.asp
        st.asm += (clamp(S.y / 1000, -1.1, 1.1) - st.asm) * (1 - Math.exp(-dt * 4))
        st.expl = Math.max(-st.asm, 0)
        st.apG = clamp(st.asm * 1.5 - 0.25, 0, 1)
        const vk = Math.min(Math.abs(S.v) / 2500, 1)
        const px = P.nx * asp, py = P.ny
        const active = !ctx.touch && P.inside && st.opened && !st.busy

        // where a hovered group's whole 16:9 screen sits (view units), kept inside the view
        const projH = CZ / (CZ - ZH)
        for (let g = 0; g < NW; g++) {
          const G = Gs[g]
          let sx = lerp(slots[g][0], G.tcx * L.kp, st.apG), sy = lerp(slots[g][1], G.tcy * L.kp, st.apG)
          const hhv = L.hwv * 0.5625
          if (asp < 1) { sx = 0; sy = 0.2 } // phone: centred, label directly under it
          else { sx = clamp(sx, -(asp * 0.94 - L.hwv), asp * 0.94 - L.hwv); sy = clamp(sy, -(0.9 - hhv), 0.9 - hhv) }
          G.hvx = sx; G.hvy = sy; G.wx = sx / projH; G.wy = sy / projH
        }
        const apart = st.asm < 0.2 // while scroll holds the single Showreel pane, hover does nothing
        let hv = active && apart ? pickGroup(px, py) : -1
        if (hv < 0 && st.focus >= 0 && st.opened && !st.busy && apart) hv = st.focus
        if (hv !== st.hov) setHover(hv)
        st.hovAmt += ((st.hov >= 0 ? 1 : 0) - st.hovAmt) * (1 - Math.exp(-dt * 6))
        for (let g = 0; g < 9; g++) {
          const G = Gs[g]
          G.sx = 0; G.sy = 0; G.sz = 0; G.n = 0
          G.bx = 0.025 * Math.sin(t * 0.31 + g * 1.7); G.by = 0.02 * Math.cos(t * 0.27 + g * 2.3); G.bz = 0.06 * Math.sin(t * 0.23 + g)
        }

        const so = st.open
        for (let n = 0; n < shards.length; n++) {
          const s = shards[n], g = s.g, G = Gs[g], isW = g < 8
          let X, Y, Z, SC
          if (isW) { X = slots[g][0] + s.rx * L.kc * SPREAD + G.bx; Y = slots[g][1] + s.ry * L.kc * SPREAD + G.by; SC = L.kc * 0.95 * (1 + 0.015 * Math.sin(t * 0.6 + g)) }
          else { X = s.hx; Y = s.hy; SC = L.kc * 0.85 * Math.min(1, st.expl * 2.5) } // debris only shows when the glass is blown apart
          Z = s.zr + 0.03 * Math.sin(t * 0.45 + s.ph) + (isW ? G.bz : 0)
          // neighbours of the hovered cluster make room
          if (st.hov >= 0 && g !== st.hov) {
            const hs = slots[st.hov], ddx = X - hs[0], ddy = Y - hs[1], dd = Math.hypot(ddx, ddy) + 0.05
            const f = st.hovAmt * 0.16 * Math.max(0, 1 - dd / 1.4)
            X += (ddx / dd) * f; Y += (ddy / dd) * f
          }
          // scroll the other way: explode further
          const ex = st.expl * (0.55 + 0.75 * s.r3)
          X += s.ex[0] * ex * 2; Y += s.ex[1] * ex * 1.6; Z += s.ex[2] * ex * 1.5
          // scroll one way: reassemble into the single Showreel pane (staggered)
          const apS = (() => { const x = clamp(st.asm * 1.6 - s.r1 * 0.6, 0, 1); return x * x * (3 - 2 * x) })()
          X = lerp(X, s.cx * L.kp, apS); Y = lerp(Y, s.cy * L.kp, apS); Z = lerp(Z, 0, apS); SC = lerp(SC, L.kp, apS)
          let ang = (0.09 + 0.07 * s.r4) * (1 + st.expl * 7) * Math.sin(t * s.sp + s.ph) * (1 - apS) * (1 + vk * 0.6)
          let reel = isW ? apS : 1
          let edge = lerp(0.55, 0.22, apS)
          let bright = 1
          if (isW && st.hov >= 0 && g !== st.hov) bright = 1 - 0.45 * st.hovAmt
          if (st.flyIdx >= 0 && g !== st.flyIdx) {
            const f = st.fly
            X += s.ex[0] * f * 3.5; Y += s.ex[1] * f * 3.5; Z -= f; SC *= 1 - 0.4 * f; bright *= 1 - f
          }
          // hover: the cluster snaps together into one whole screen facing the camera; fly-in: it rushes to fill the view
          if (isW && G.ha > 0.0001) {
            const has = outBack(clamp(G.ha * 1.35 - s.r2 * 0.35, 0, 1)) * (g === st.flyIdx ? 1 : 1 - sstep(0.1, 0.25, st.asm)) // a pane held whole by scroll stays whole
            const f = g === st.flyIdx ? st.fly : 0
            const HX = lerp(G.wx + s.rx * L.kH, s.rx * L.kF, f), HY = lerp(G.wy + s.ry * L.kH, s.ry * L.kF, f)
            const HZ = lerp(ZH, ZF, f), HS = lerp(L.kH, L.kF, f)
            X = lerp(X, HX, has); Y = lerp(Y, HY, has); Z = lerp(Z, HZ, has); SC = lerp(SC, HS, has)
            ang *= 1 - clamp(has, 0, 1); s.ka *= 1 - clamp(has, 0, 1) * 0.5
            reel *= 1 - clamp(has, 0, 1)
            edge = lerp(edge, 0.08 * (1 - f), clamp(has, 0, 1))
          }
          // opening: the pane covers the view, cracks, breaks toward the camera, drifts into its cluster
          let burst = 0
          if (so < 1) {
            const p = clamp((so - s.delay) / 0.55, 0, 1), e = 1 - Math.pow(1 - p, 3)
            burst = Math.sin(Math.PI * p)
            X = lerp(s.cx * L.kCov, X, e); Y = lerp(s.cy * L.kCov, Y, e); Z = lerp(0, Z, e); SC = lerp(L.kCov, SC, e)
            X += s.ex[0] * burst * 0.55; Y += s.ex[1] * burst * 0.45; Z += (0.9 + 0.5 * s.r2) * burst
            ang += burst * 0.9 * s.sgn
            reel = lerp(1, reel, sstep(0.1, 0.55, p))
            edge *= sstep(0, 0.15, p)
            bright += 0.12 * burst
          }
          // pointer pushes shards away; a spring brings them back with a chime
          Z = Math.min(Z, 1.7)
          const pj = CZ / (CZ - Z)
          if (active && g !== st.hov && Math.abs(X * pj - px) < RP && Math.abs(Y * pj - py) < RP) {
            const ddx = X * pj - px, ddy = Y * pj - py, d2 = ddx * ddx + ddy * ddy
            if (d2 < RP * RP) {
              const d = Math.sqrt(d2) + 1e-3, ff = (1 - d / RP) * (1 - d / RP) * FP
              s.vx += (ddx / d) * ff * dt; s.vy += (ddy / d) * ff * dt; s.vz -= ff * 0.5 * dt; s.kv += s.sgn * ff * 0.8 * dt
            }
          }
          if (Math.abs(s.dx) + Math.abs(s.dy) + Math.abs(s.dz) + Math.abs(s.vx) + Math.abs(s.vy) + Math.abs(s.vz) + Math.abs(s.ka) + Math.abs(s.kv) > 1e-5) {
            s.vx += (-KS * s.dx - CS * s.vx) * dt; s.vy += (-KS * s.dy - CS * s.vy) * dt; s.vz += (-KS * s.dz - CS * s.vz) * dt
            s.kv += (-30 * s.ka - 3 * s.kv) * dt
            s.dx += s.vx * dt; s.dy += s.vy * dt; s.dz += s.vz * dt; s.ka += s.kv * dt
          }
          X += s.dx; Y += s.dy; Z = Math.min(Z + s.dz, 1.7)
          ang = clamp(ang + s.ka, -1.5, 1.5)
          const glow = clamp((Math.abs(s.vx) + Math.abs(s.vy) + Math.abs(s.vz)) * 0.35 + Math.abs(s.kv) * 0.1, 0, 1)
          for (let k = s.v0; k < s.v0 + s.nv; k++) {
            const o = k * 4
            poseA[o] = X; poseA[o + 1] = Y; poseA[o + 2] = Z; poseA[o + 3] = SC
            rotA[o] = s.ax; rotA[o + 1] = s.ay; rotA[o + 2] = s.az; rotA[o + 3] = ang
            mixA[o] = reel; mixA[o + 1] = edge; mixA[o + 2] = bright; mixA[o + 3] = glow
          }
          G.sx += X; G.sy += Y; G.sz += Z; G.n++
        }
        for (let g = 0; g < NW; g++) {
          const G = Gs[g]
          if (!G.n) continue
          const cz = G.sz / G.n, pj = CZ / (CZ - cz)
          G.czv = cz; G.pj = pj; G.cxv = (G.sx / G.n) * pj; G.cyv = (G.sy / G.n) * pj
        }
        aPose.needsUpdate = true; aRot.needsUpdate = true; aMix.needsUpdate = true

        U.uCrack.value = sstep(0.03, 0.2, so)
        U.uCrackA.value = so >= 1 ? 0 : 1 - sstep(0.55, 0.9, so)

        // hero sentence floats among the shards
        const ha = sstep(0.7, 1, so) * (1 - 0.9 * st.apG) * (1 - 0.75 * st.hovAmt) * (1 - st.fly)
        const hcz = (CZ - heroMesh.position.z) / CZ
        let hw = heroPortrait ? Math.min(asp * 0.9, 0.4 * heroCa) : Math.min(asp * 0.9, 1.45, 0.27 * heroCa)
        heroMesh.scale.set(2 * hw * hcz, ((2 * hw) / heroCa) * hcz, 1)
        heroMesh.position.y = Math.sin(t * 0.5) * 0.015
        heroMesh.rotation.y = P.nx * 0.05; heroMesh.rotation.x = -P.ny * 0.04
        heroMat.opacity = ha; heroMesh.visible = ha > 0.003

        // label beside the hovered screen
        if (st.lab > 0.001 && st.flyIdx < 0 && st.hov >= 0) {
          const G = Gs[st.labIdx], mx = asp - 32 / ctx.size.h, my = 0.9
          let k = asp < 1 ? 0.0011 : 0.0016, bw = rowFrac[st.labIdx] * LW * k
          if (bw > mx * 1.96) { k *= (mx * 1.96) / bw; bw = mx * 1.96 }
          const bh = LR * k, hwv = L.hwv, hhv = hwv * 0.5625
          if (asp < 1) { out[0] = clamp(G.hvx - bw / 2, -mx, mx - bw); out[1] = clamp(G.hvy - hhv - 0.04 - bh, -my, my - bh) }
          else place(G.hvx, G.hvy, hwv, hhv, bw, bh, mx, my)
          labMesh.position.set(out[0] + bw / 2, out[1] + bh / 2, 0); labMesh.scale.set(bw, bh, 1)
          labMat.uniforms.uAmt.value = st.lab
          labMat.uniforms.uUV.value.set(rowFrac[st.labIdx], 1 - st.labIdx / NW, 1 - (st.labIdx + 1) / NW)
          labMesh.visible = true
        } else labMesh.visible = false

        let push = Math.min(Math.abs(S.v) / 3500, 0.8)
        if (so < 1) push = Math.max(push, 0.5 * Math.sin(Math.PI * clamp((so - 0.2) / 0.25, 0, 1)))
        ctx.crt.push = Math.max(push, st.fly * (1 - st.fly) * 2.4)
      }

      return {
        scene, camera, update,
        resize(w, h) {
          L.asp = w / h
          camera.aspect = L.asp; camera.updateProjectionMatrix()
          layout()
          if ((L.asp < 1) !== heroPortrait) buildHero()
        },
        tap() {
          if (!st.opened) { skip(); return }
          if (st.busy || st.asm >= 0.2) return
          const g = pickGroup(ctx.pointer.nx * L.asp, ctx.pointer.ny)
          if (g >= 0) go(g)
        },
        focus(i) { st.focus = i },
        activate(i) { if (!st.opened) skip(); if (!st.busy) go(i) },
        back(i) {
          gsap.timeline({ onComplete() { st.busy = false; st.flyIdx = -1 } })
            .to(st, { fly: 0, duration: 0.7, ease: 'power3.out', overwrite: 'auto' })
            .to(Gs[i], { ha: 0, duration: 0.5, ease: 'power2.inOut', overwrite: 'auto' }, '-=0.2')
        },
        dispose() {
          gsap.killTweensOf(st); Gs.forEach((G) => gsap.killTweensOf(G)); tl.kill()
          ctx.cursor.hover(false); ctx.crt.push = 0
          geo.dispose(); material.dispose(); heroMesh.geometry.dispose(); heroMat.dispose(); labMesh.geometry.dispose(); labMat.dispose()
          if (heroTex) heroTex.dispose()
          labTex.dispose()
        },
      }
    },
  })
})()
