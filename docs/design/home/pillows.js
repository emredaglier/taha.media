/* THROWAWAY prototype 'Pillows': the eight Works as fat inflated vinyl cushions in a ball-pit pile; they squish, wobble, get poked, grabbed and thrown.
   FAKE: everything comes from ctx (titles, loops, hero). Contract: docs/design/home/CONTRACT.md. */
;(function () {
  'use strict'
  HOME.register({
    name: 'Pillows',
    create: function (ctx) {
      const NW = 8
      const clamp = (x, a, b) => (x < a ? a : x > b ? b : x)
      const lerp = (a, b, t) => a + (b - a) * t
      const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
      const works = ctx.works

      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000)
      camera.position.z = 1500

      // view in CSS px, origin at the centre, y up
      const V = { w: ctx.size.w, h: ctx.size.h, portrait: false, wp: 200, hp: 112, mulH: 1.6, topPad: 96, pileTop: 0 }
      const st = { opened: false, busy: false, popped: false, hov: -1, want: -1, fo: -1, fly: 0, flyIdx: -1, grab: -1, pd: false, lab: 0, labIdx: 0, hero: 0, hit: 0, I: 0, Iv: 0, tilt: 0, spd: 0 }
      const op = { sq: 0, puff: 1, rs: 1 }
      const gOff = { x: 0, y: 0 }
      let pvx = 0, pvy = 0

      // --- shaders ---------------------------------------------------------------------
      const PVS = `
uniform vec2 uSize; uniform float uPuff,uFlat; uniform vec3 uSq; uniform vec3 uDim;
varying vec3 vN; varying vec2 vS; varying float vM;
vec3 surf(vec2 s){
  float m=max(abs(s.x),abs(s.y));
  float r4=pow(abs(s.x),4.)+pow(abs(s.y),4.);
  float f=m>1e-4?m/pow(max(r4,1e-8),.25):1.;
  vec2 q=mix(s*f,s,uFlat);
  vec2 pp=q*uSize*.5;
  vec2 n=uSq.xy; vec2 t=vec2(-n.y,n.x); float a=uSq.z;
  pp+=-n*dot(pp,n)*a+t*dot(pp,t)*a*.55;
  float mm=min(m,.9995);
  float H=uSize.y*.5*uPuff*(1.+.9*a);
  float z=H*sqrt(max(1.-pow(mm,2.4),0.));
  float c=abs(s.x*s.y); z*=1.-.28*c*c;
  float d=length(q-uDim.xy); z-=uDim.z*H*.7*exp(-d*d*14.);
  return vec3(pp,max(z,0.));
}
void main(){
  vec2 s=position.xy*2.;
  vec3 P=surf(s);
  float e=.012;
  vec3 px=surf(s+vec2(e,0.))-surf(s-vec2(e,0.));
  vec3 py=surf(s+vec2(0.,e))-surf(s-vec2(0.,e));
  vN=normalize(cross(px,py));
  vS=s; vM=max(abs(s.x),abs(s.y));
  gl_Position=projectionMatrix*modelViewMatrix*vec4(P,1.);
}`
      const PFS = `
precision highp float;
varying vec3 vN; varying vec2 vS; varying float vM;
uniform sampler2D tTex; uniform vec4 uRect; uniform vec3 uLight; uniform float uAlpha,uFlat;
void main(){
  vec3 N=normalize(vN);
  vec2 uv=clamp(vS*.5+.5,.002,.998);
  vec3 loop=texture2D(tTex,uRect.xy+uv*uRect.zw).rgb;
  vec3 L=normalize(uLight);
  float nd=max(dot(N,L),0.);
  vec3 R=reflect(-L,N);
  float sp=pow(max(R.z,0.),38.)*.85+pow(max(R.z,0.),7.)*.14;
  float rim=pow(1.-clamp(N.z,0.,1.),2.2);
  float corner=abs(vS.x*vS.y);
  float ao=mix(1.,.5,smoothstep(.8,1.,vM))*(1.-.28*corner*corner);
  ao=mix(ao,1.,uFlat);
  vec3 col=loop*(.8+.3*nd)*ao;
  col+=(vec3(sp)+vec3(.55,.6,.7)*rim*.45)*(1.-uFlat);
  col=mix(col,vec3(1.),.05*rim*(1.-uFlat));
  gl_FragColor=vec4(clamp(col,0.,1.),uAlpha);
}`
      const HFS = `
precision highp float;
varying vec2 vUv; uniform sampler2D tText; uniform vec2 uPx; uniform vec3 uLight; uniform float uAlpha;
float A(vec2 o){return texture2D(tText,vUv+o).a;}
void main(){
  vec2 a=uPx*6.; vec2 b=uPx*14.;
  float c=A(vec2(0.));
  float hb=c+A(vec2(a.x,0.))+A(vec2(-a.x,0.))+A(vec2(0.,a.y))+A(vec2(0.,-a.y))+A(a)+A(-a)+A(vec2(a.x,-a.y))+A(vec2(-a.x,a.y));
  hb/=9.;
  float gx=A(vec2(a.x,0.))-A(vec2(-a.x,0.))+.5*(A(vec2(b.x,0.))-A(vec2(-b.x,0.)));
  float gy=A(vec2(0.,a.y))-A(vec2(0.,-a.y))+.5*(A(vec2(0.,b.y))-A(vec2(0.,-b.y)));
  vec3 N=normalize(vec3(-gx*1.6,-gy*1.6,1.));
  vec3 L=normalize(uLight);
  float nd=max(dot(N,L),0.);
  vec3 R=reflect(-L,N);
  float sp=pow(max(R.z,0.),30.)*.8;
  float rim=pow(1.-clamp(N.z,0.,1.),1.6);
  vec3 col=vec3(.93)*(.5+.55*nd)+vec3(sp)+vec3(.5,.55,.7)*rim*.35;
  float al=smoothstep(.28,.55,hb);
  gl_FragColor=vec4(clamp(col,0.,1.),al*uAlpha);
}`
      const BVS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}'
      const LFS = `
precision highp float; varying vec2 vUv; uniform sampler2D tLabel; uniform vec3 uRow; uniform float uAlpha;
void main(){
  vec4 t=texture2D(tLabel,vec2(vUv.x*uRow.x,mix(uRow.z,uRow.y,vUv.y)));
  float w=clamp((uAlpha*1.4-vUv.x)/.4,0.,1.);
  gl_FragColor=vec4(mix(vec3(0.),t.rgb,t.a),max(t.a,.6)*w);
}`

      // --- textures: hero sentence + label atlas --------------------------------------------
      let heroTex = null, heroAsp = 4, heroW = 8, heroH = 8, heroPortrait = false
      function buildHero() {
        const px = 180
        let lines
        if (V.portrait) {
          lines = []
          let cur = ''
          ctx.hero.split(/\s+/).forEach((w) => { if (cur && (cur + ' ' + w).length > 20) { lines.push(cur); cur = w } else cur = cur ? cur + ' ' + w : w })
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
        heroTex.minFilter = heroTex.magFilter = THREE.LinearFilter
        heroTex.generateMipmaps = false
        heroAsp = W / H; heroW = W; heroH = H
        if (heroMat) { heroMat.uniforms.tText.value = heroTex; heroMat.uniforms.uPx.value.set(1 / W, 1 / H) }
      }
      const LW = 1024, LR = 200
      const labCanvas = document.createElement('canvas')
      labCanvas.width = LW; labCanvas.height = LR * NW
      const labAsp = []
      {
        const g = labCanvas.getContext('2d')
        for (let i = 0; i < NW; i++) {
          const t = ctx.text(works[i].title, { size: 96 })
          const m = ctx.text(works[i].kind + ' · ' + works[i].year, { caps: true, size: 26 })
          const s = Math.min(1, (LW - 8) / t.canvas.width)
          g.drawImage(t.canvas, 0, i * LR, t.canvas.width * s, t.canvas.height * s)
          g.drawImage(m.canvas, 13, i * LR + 150)
          labAsp.push(Math.min(1, Math.max(t.canvas.width * s, m.canvas.width + 13) / LW))
          t.texture.dispose(); m.texture.dispose()
        }
      }
      const labTex = new THREE.CanvasTexture(labCanvas)
      labTex.minFilter = labTex.magFilter = THREE.LinearFilter
      labTex.generateMipmaps = false

      // --- meshes ---------------------------------------------------------------------------
      const LIGHT = new THREE.Vector3(-0.35, 0.55, 0.75)
      const geo = new THREE.PlaneGeometry(1, 1, 40, 24)
      function makeMat(tex, rect) {
        return new THREE.ShaderMaterial({
          uniforms: {
            tTex: { value: tex }, uRect: { value: new THREE.Vector4(rect[0], rect[1], rect[2], rect[3]) }, uSize: { value: new THREE.Vector2(100, 56) }, uPuff: { value: 1 }, uFlat: { value: 0 },
            uSq: { value: new THREE.Vector3(1, 0, 0) }, uDim: { value: new THREE.Vector3(0, 0, 0) }, uAlpha: { value: 1 }, uLight: { value: LIGHT },
          },
          vertexShader: PVS, fragmentShader: PFS, transparent: true, depthTest: false, depthWrite: false,
        })
      }
      const PL = []
      for (let i = 0; i < NW; i++) {
        const mat = makeMat(ctx.atlas, ctx.loopRect(i)), mesh = new THREE.Mesh(geo, mat)
        mesh.frustumCulled = false; mesh.visible = false
        scene.add(mesh)
        PL.push({ i, x: 0, y: 0, vx: 0, vy: 0, hx: 0, hy: 0, sw: 0, swv: 0, j: 0, jv: 0, sqx: 1, sqy: 0, sqa: 0, ax: 0, ay: 0, ap: 0, dent: 0, W: 100, H: 56, r: 25, li: 30, os: 0.3, mesh, mat })
      }
      const reelMat = makeMat(ctx.showreel.texture, [0, 0, 1, 1]), reel = new THREE.Mesh(geo, reelMat)
      reel.frustumCulled = false; reel.renderOrder = 500; scene.add(reel)

      let heroMat = null
      heroMat = new THREE.ShaderMaterial({
        uniforms: { tText: { value: null }, uPx: { value: new THREE.Vector2(0.01, 0.01) }, uLight: { value: LIGHT }, uAlpha: { value: 0 } },
        vertexShader: BVS, fragmentShader: HFS, transparent: true, depthTest: false, depthWrite: false,
      })
      buildHero()
      const hero = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), heroMat)
      hero.renderOrder = 0; hero.frustumCulled = false; scene.add(hero)
      const labMat = new THREE.ShaderMaterial({
        uniforms: { tLabel: { value: labTex }, uRow: { value: new THREE.Vector3(1, 1, 0.875) }, uAlpha: { value: 0 } },
        vertexShader: BVS, fragmentShader: LFS, transparent: true, depthTest: false, depthWrite: false,
      })
      const labMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), labMat)
      labMesh.renderOrder = 300; labMesh.frustumCulled = false; labMesh.visible = false; scene.add(labMesh)

      // --- layout (px, origin at centre) -----------------------------------------------------
      const heroBase = { w: 100, h: 30, y: 0 }
      function layout(w, h) {
        V.w = w; V.h = h; V.portrait = w / h < 1
        camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2; camera.updateProjectionMatrix()
        let swellW
        if (!V.portrait) {
          V.topPad = 96
          V.wp = Math.min(0.22 * w, ((0.62 * h) / 2.88) * (16 / 9)); V.hp = (V.wp * 9) / 16
          const sp = V.wp, yb = -h / 2 + 28 + V.hp / 2, dy = 0.94 * V.hp
          ;[[0, 1], [2, 3, 4], [5, 6, 7]].forEach((row, k) => row.forEach((i, c) => { PL[i].hx = (c - (row.length - 1) / 2) * sp + (((i * 37) % 5) - 2) * 0.002 * w; PL[i].hy = yb + (2 - k) * dy }))
          V.pileTop = -h / 2 + 28 + V.hp * 2.88
          swellW = 0.36 * w
        } else {
          V.topPad = 130
          V.wp = 0.42 * w; V.hp = (V.wp * 9) / 16
          const yb = -h / 2 + 20 + V.hp / 2, dy = 0.96 * V.hp
          for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) { const p = PL[r * 2 + c]; p.hx = (c ? 1 : -1) * (V.wp / 2 + 3) + (r % 2 ? 1 : -1) * V.wp * 0.06; p.hy = yb + (3 - r) * dy }
          V.pileTop = -h / 2 + 20 + V.hp * 3.88
          swellW = 0.8 * w
        }
        V.mulH = Math.max(1.1, Math.min(swellW / V.wp, (0.6 * h) / V.hp))
        if (V.portrait !== heroPortrait) { heroPortrait = V.portrait; buildHero() }
        const top = h / 2 - V.topPad, bot = V.pileTop + (V.portrait ? 14 : 16), avail = Math.max(top - bot, 40)
        const hh = Math.min(avail * 0.95, (V.portrait ? 0.86 * w : 0.6 * w) / heroAsp, 0.22 * h)
        heroBase.w = hh * heroAsp; heroBase.h = hh; heroBase.y = (top + bot) / 2
      }

      // --- helpers ----------------------------------------------------------------------------
      const ord = PL.slice()
      const mf = (p, fx, fy) => { const lx = (fx - p.x) / (p.W * 0.5), ly = (fy - p.y) / (p.H * 0.5), a = lx * lx, b = ly * ly; return Math.sqrt(Math.sqrt(a * a + b * b)) }
      function under(fx, fy, tol) {
        for (let k = ord.length - 1; k >= 0; k--) { const p = ord[k]; if (p.mesh.visible && mf(p, fx, fy) < (tol || 1)) return p.i }
        return -1
      }
      function setSizes(t) {
        const I = st.I
        for (let k = 0; k < NW; k++) {
          const p = PL[k], tf = clamp(p.sw, 0, 1)
          const br = 1 + 0.012 * Math.sin(t * 1.3 + k * 1.7)
          const sz = (1 + p.sw * (V.mulH - 1)) * (1 + I * 0.16) * br * p.os * (k === st.grab ? 1.06 : 1)
          p.W = V.wp * sz * (1 + p.j); p.H = V.hp * sz * (1 - 0.6 * p.j)
          p.r = (p.H / 2) * 0.92; p.li = Math.max(0, (p.W / 2) * 0.96 - p.r)
          p.tf = tf
        }
      }

      // --- opening: the Showreel as one giant pillow is squeezed and pops into eight ----------------
      function pop() {
        if (st.popped) return
        st.popped = true; reel.visible = false
        PL.forEach((p, k) => {
          const a = Math.atan2(p.hy + ((k % 3) - 1) * 10, p.hx + (k % 2 ? 5 : -5)), sp = 650 + ((k * 53) % 7) * 70
          p.x = Math.cos(a) * 30; p.y = Math.sin(a) * 30; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.os = 0.3; p.mesh.visible = true
          gsap.to(p, { os: 1, duration: 0.65, ease: 'back.out(2)', delay: k * 0.02 })
        })
        st.hit = 1500
      }
      const tl = gsap.timeline()
      tl.to(op, { sq: 0.36, puff: 1.35, duration: 0.55, ease: 'power2.inOut' }, 0.35)
        .to(op, { sq: 0.1, duration: 0.18, ease: 'power1.out' }, 0.9)
        .to(op, { rs: 0.86, duration: 0.2, ease: 'power2.in' }, 0.9)
        .call(pop, null, 1.12)
        .to(st, { hero: 1, duration: 0.7, ease: 'power2.out' }, 1.65)
        .call(() => { st.opened = true }, null, 2.5)
      function skip() {
        tl.kill(); pop()
        PL.forEach((p) => { gsap.killTweensOf(p); p.os = 1; p.x = p.hx; p.y = p.hy; p.vx = p.vy = 0 })
        st.opened = true; st.hero = 1; st.hit = 0
      }
      layout(ctx.size.w, ctx.size.h)
      if (ctx.reduced) skip()

      // --- fly-in ----------------------------------------------------------------------------------
      function go(i) {
        if (st.busy) return
        st.busy = true; st.flyIdx = i; st.grab = -1; st.hov = -1
        if (st.want !== -1) { st.want = -1; ctx.cursor.hover(false) }
        gsap.to(st, { fly: 1, duration: 0.8, ease: 'power3.in', overwrite: 'auto', onComplete() { ctx.enter(i) } })
      }

      // --- frame -------------------------------------------------------------------------------------
      const KH = 16, CV = 5.5
      function update(t, dt) {
        dt = Math.max(dt, 0.001)
        const Pt = ctx.pointer, S = ctx.scroll, f = st.fly
        const live = st.opened && !st.busy, mouse = !ctx.touch && Pt.inside
        const fingerOn = live && Pt.inside && (!ctx.touch || Pt.down)
        const fx = Pt.nx * V.w * 0.5, fy = Pt.ny * V.h * 0.5, FR = Math.max(26, 0.04 * Math.min(V.w, V.h))
        pvx += (Pt.dx / dt - pvx) * 0.5; pvy += (-Pt.dy / dt - pvy) * 0.5
        LIGHT.set(-0.35 + 0.25 * Pt.nx, 0.55 + 0.25 * Pt.ny, 0.75)
        st.spd += (Math.abs(S.v) - st.spd) * (1 - Math.exp(-dt * 6))
        // scroll inflates and deflates the whole pit, then it sags; it also tilts gravity a little
        const It = clamp(S.v / 1400, -0.35, 0.5)
        st.Iv += ((It - st.I) * 70 - st.Iv * 7) * dt; st.I += st.Iv * dt
        st.tilt += (clamp(S.v / 3000, -0.4, 0.4) - st.tilt) * (1 - Math.exp(-dt * 3))

        // hover (mouse) with hysteresis; keyboard focus counts as hover
        if (live && mouse && st.grab < 0 && !Pt.down) st.hov = st.hov >= 0 && mf(PL[st.hov], fx, fy) < 1.22 ? st.hov : under(fx, fy)
        else if (!live || !mouse) st.hov = -1
        const want = st.hov >= 0 ? st.hov : live ? st.fo : -1
        if (want !== st.want) { st.want = want; ctx.cursor.hover(want >= 0); if (want >= 0) st.labIdx = want }

        // press grabs a pillow; release throws it
        const pd = live && Pt.down
        if (pd && !st.pd) { const i = under(fx, fy, 1.02); if (i >= 0) { st.grab = i; gOff.x = PL[i].x - fx; gOff.y = PL[i].y - fy; pvx = pvy = 0 } }
        if (!pd && st.pd && st.grab >= 0) {
          const p = PL[st.grab], sp = Math.hypot(pvx, pvy)
          if (sp > 60) { const k = Math.min(1, 2600 / sp); p.vx = pvx * k; p.vy = pvy * k; p.jv += 0.8 * Math.min(sp / 2000, 1) }
          st.grab = -1
        }
        st.pd = pd

        for (const p of PL) { p.swv += (((p.i === st.want ? 1 : 0) - p.sw) * 90 - p.swv * 13) * dt; p.sw += p.swv * dt }
        setSizes(t)
        PL.forEach((p) => { p.cxx = 0; p.cyy = 0; p.cxy = 0; p.ap = 0; p.im = p.i === st.grab || p.i === st.flyIdx ? 0 : 1 / (1 + 2.2 * p.tf) })
        let hit = 0
        const shX = st.tilt * V.wp * 0.35, ui = fingerOn ? under(fx, fy) : -1
        const sq = (p, nx, ny, pen) => { const w = pen / Math.max(p.r, 1); p.cxx += nx * nx * w; p.cyy += ny * ny * w; p.cxy += nx * ny * w; p.ap += pen }
        for (let sub = 0; sub < 2; sub++) {
          const h = dt / 2
          if (st.popped) {
            for (const p of PL) {
              if (p.i === st.grab) {
                const ox = p.x, oy = p.y, k = 1 - Math.exp(-h * 30)
                p.x += (fx + gOff.x - p.x) * k; p.y += (fy + gOff.y - p.y) * k; p.vx = (p.x - ox) / h; p.vy = (p.y - oy) / h
              } else {
                p.vx += ((p.hx + shX - p.x) * KH - p.vx * CV) * h; p.vy += ((p.hy - p.y) * KH - p.vy * CV) * h
                p.x += p.vx * h; p.y += p.vy * h
              }
            }
            // the pointer is a soft finger: it shoves pillows aside at their edges, and dents the one under it
            if (fingerOn) {
              for (const p of PL) {
                if (p.i === st.grab || p.i === st.flyIdx) continue
                const cx = clamp(fx, p.x - p.li, p.x + p.li), dx = cx - fx, dy = p.y - fy, d = Math.hypot(dx, dy), thr = p.r + FR
                if (d < thr && mf(p, fx, fy) > 0.55) {
                  const pen = thr - d, nx = d > 1e-3 ? dx / d : 0, ny = d > 1e-3 ? dy / d : 1
                  p.x += nx * pen * 0.3 * p.im; p.y += ny * pen * 0.3 * p.im; p.vx += nx * pen * 8 * p.im; p.vy += ny * pen * 8 * p.im
                  sq(p, nx, ny, pen * 0.6)
                }
              }
            }
            // mutual overlap: capsules (a horizontal segment with a radius) push apart; contacts squash both
            for (let a = 0; a < NW; a++) for (let b = a + 1; b < NW; b++) {
              const A = PL[a], B = PL[b], ims = A.im + B.im
              if (ims <= 0) continue
              const a0 = A.x - A.li, a1 = A.x + A.li, b0 = B.x - B.li, b1 = B.x + B.li
              const dxv = Math.max(a0, b0) <= Math.min(a1, b1) ? 0 : a1 < b0 ? b0 - a1 : b1 - a0, dyv = B.y - A.y, dist = Math.hypot(dxv, dyv), rs = A.r + B.r
              if (dist >= rs) continue
              const pen = rs - dist
              let nx = 0, ny = 1
              if (dist > 1e-3) { nx = dxv / dist; ny = dyv / dist } else { const ex = B.x - A.x, ed = Math.hypot(ex, B.y - A.y); if (ed > 1e-3) { nx = ex / ed; ny = (B.y - A.y) / ed } }
              const c = Math.min(pen, rs * 0.5) * 0.8
              A.x -= nx * c * (A.im / ims); A.y -= ny * c * (A.im / ims); B.x += nx * c * (B.im / ims); B.y += ny * c * (B.im / ims)
              const vn = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny
              if (vn < 0) {
                const imp = (-(1.3) * vn) / ims
                A.vx -= nx * imp * A.im; A.vy -= ny * imp * A.im; B.vx += nx * imp * B.im; B.vy += ny * imp * B.im
                const kick = Math.min(-vn / 700, 1.2)
                A.jv += kick * 0.9 * (1 - 0.65 * A.tf) * (a & 1 ? 1 : -1); B.jv += kick * 0.9 * (1 - 0.65 * B.tf) * (b & 1 ? 1 : -1)
                if (-vn > hit) hit = -vn
              }
              sq(A, nx, ny, pen); sq(B, nx, ny, pen)
            }
            // walls at the view edges
            for (const p of PL) {
              const hx = p.W * 0.49, hy = p.H * 0.5
              const x0 = -V.w / 2 + hx + 4, x1 = V.w / 2 - hx - 4, y0 = -V.h / 2 + hy + 4, y1 = V.h / 2 - V.topPad - hy
              if (p.x < x0) { sq(p, 1, 0, (x0 - p.x) * 1.5); if (p.vx < 0) { hit = Math.max(hit, -p.vx); p.vx *= -0.3 } p.x = x0 } else if (p.x > x1) { sq(p, 1, 0, (p.x - x1) * 1.5); if (p.vx > 0) { hit = Math.max(hit, p.vx); p.vx *= -0.3 } p.x = Math.max(x0, x1) }
              if (p.y < y0) { sq(p, 0, 1, (y0 - p.y) * 1.5); if (p.vy < 0) { hit = Math.max(hit, -p.vy); p.vy *= -0.3 } p.y = y0 } else if (p.y > y1) { sq(p, 0, 1, (p.y - y1) * 1.5); if (p.vy > 0) { hit = Math.max(hit, p.vy); p.vy *= -0.3 } p.y = Math.max(y0, y1) }
              const sp = Math.hypot(p.vx, p.vy); if (sp > 3000) { p.vx *= 3000 / sp; p.vy *= 3000 / sp }
            }
          }
        }
        st.hit = Math.max(st.hit * Math.exp(-dt * 5), hit)
        // squash vector per pillow, jelly oscillator, dent
        const ks = 1 - Math.exp(-dt * 16)
        for (const p of PL) {
          const ta = clamp((p.ap / 2 / Math.max(p.r, 1)) * 0.9, 0, 0.42)
          if (p.cxx + p.cyy > 1e-6) {
            const th = 0.5 * Math.atan2(2 * p.cxy, p.cxx - p.cyy); let nx = Math.cos(th), ny = Math.sin(th)
            if (nx * p.sqx + ny * p.sqy < 0) { nx = -nx; ny = -ny }
            const mx = p.sqx + (nx - p.sqx) * ks * 0.9, my = p.sqy + (ny - p.sqy) * ks * 0.9, ml = Math.hypot(mx, my) || 1
            p.sqx = mx / ml; p.sqy = my / ml
          }
          p.sqa += (ta - p.sqa) * ks
          const kJ = 240 * (1 + 2.2 * p.tf), cJ = 6.5 * (1 + 1.2 * p.tf)
          p.jv += (-p.j * kJ - p.jv * cJ) * dt; p.j = clamp(p.j + p.jv * dt, -0.35, 0.35)
          const tg = p.i === st.grab ? 0.55 : p.i === ui ? (Pt.down ? 0.9 : 0.42) : 0
          p.dent += (tg - p.dent) * (1 - Math.exp(-dt * (tg > p.dent ? 16 : 7)))
          if (tg > 0) { p.dpx = clamp((fx - p.x) / (p.W / 2), -1.1, 1.1); p.dpy = clamp((fy - p.y) / (p.H / 2), -1.1, 1.1) }
        }

        // z order: lower pillows in front; the grabbed, hovered and flying ones on top
        for (const p of PL) p.key = -p.y + (p.i === st.grab ? 5000 : 0) + (p.i === st.want ? 3000 : 0) + (p.i === st.flyIdx ? 9000 : 0)
        ord.sort((a, b) => a.key - b.key)
        const flat = sstep(0.5, 0.95, f), puffBase = clamp(1 + st.I * 1.1, 0.6, 1.6)
        for (let k = 0; k < NW; k++) {
          const p = ord[k], m = p.mesh
          let X = p.x, Y = p.y, W = p.W, H = p.H, puff = puffBase * (1 + 0.15 * p.tf)
          if (p.i === st.flyIdx) {
            W = lerp(W, Math.max(V.w, V.h * (16 / 9)) * (1 + 0.22 * (1 - flat)) * 1.004, f); H = (W * 9) / 16; X = lerp(X, 0, f); Y = lerp(Y, 0, f); puff *= 1 - 0.93 * f
          } else if (f > 0) { X *= 1 + 1.3 * f; Y *= 1 + 1.3 * f; W *= 1 - 0.5 * f; H *= 1 - 0.5 * f }
          m.position.set(X, Y, 0); m.rotation.z = clamp(p.vx * 0.00025, -0.12, 0.12) + p.j * 0.2; m.renderOrder = 10 + k * 2 + (p.i === st.flyIdx ? 400 : 0)
          const u = p.mat.uniforms
          u.uSize.value.set(W, H); u.uPuff.value = puff; u.uFlat.value = p.i === st.flyIdx ? flat : 0
          u.uSq.value.set(p.sqx, p.sqy, p.sqa); u.uDim.value.set(p.dpx || 0, p.dpy || 0, p.dent)
        }
        if (!st.popped) {
          const W = Math.max(V.w, V.h * (16 / 9)) * 1.12 * op.rs, u = reelMat.uniforms
          reel.position.set(0, 0, 0); reel.rotation.z = 0.02 * op.sq * Math.sin(t * 16)
          u.uSize.value.set(W, (W * 9) / 16); u.uPuff.value = op.puff; u.uSq.value.set(1, 0, op.sq)
        }

        // the hero sentence: inflated type behind the pile, faded while a Work is shown
        const heroK = 1 + 0.05 * st.I + 0.02 * Math.min(st.hit / 1500, 1)
        hero.scale.set(heroBase.w * heroK, heroBase.h * heroK, 1); hero.position.set(0, heroBase.y + 6 * Math.sin(t * 1.1) + st.I * 10, 0)
        st.lab += (((want >= 0 && !st.busy) ? 1 : 0) - st.lab) * (1 - Math.exp(-dt * 9))
        heroMat.uniforms.uAlpha.value = st.hero * (1 - 0.75 * st.lab) * (1 - f)

        // label beside the swollen pillow, clamped 16 px inside the view and below the header
        if (st.lab > 0.01 && st.flyIdx < 0) {
          const idx = st.labIdx, p = PL[idx]
          let lh = (V.portrait ? 0.07 : 0.095) * V.h, lw = lh * labAsp[idx] * (LW / LR)
          if (lw > V.w - 32) { lh *= (V.w - 32) / lw; lw = V.w - 32 }
          let x0 = p.x + p.W / 2 + 14, y0 = p.y - lh / 2
          if (x0 + lw > V.w / 2 - 16) x0 = p.x - p.W / 2 - 14 - lw
          if (x0 < -V.w / 2 + 16) { x0 = p.x - lw / 2; y0 = p.y - p.H / 2 - 10 - lh; if (y0 < -V.h / 2 + 16) y0 = p.y + p.H / 2 + 10 }
          x0 = clamp(x0, -V.w / 2 + 16, V.w / 2 - 16 - lw); y0 = clamp(y0, -V.h / 2 + 16, Math.max(-V.h / 2 + 16, V.h / 2 - V.topPad - lh))
          labMesh.visible = true; labMesh.scale.set(lw, lh, 1); labMesh.position.set(x0 + lw / 2, y0 + lh / 2, 0)
          labMat.uniforms.uRow.value.set(labAsp[idx], 1 - idx / NW, 1 - (idx + 1) / NW); labMat.uniforms.uAlpha.value = st.lab
        } else labMesh.visible = false

        ctx.crt.push = Math.max(clamp(st.hit / 2200, 0, 0.7), clamp(st.spd / 4000, 0, 0.4), f * (1 - f) * 2.4)
      }

      return {
        scene, camera, update,
        resize(w, h) { layout(w, h) },
        tap() {
          if (!st.opened) { skip(); return }
          if (st.busy) return
          const i = st.grab >= 0 ? st.grab : under(ctx.pointer.nx * V.w * 0.5, ctx.pointer.ny * V.h * 0.5)
          if (i >= 0) go(i)
        },
        focus(i) { st.fo = i },
        activate(i) { if (!st.opened) skip(); if (!st.busy) go(i) },
        back() {
          gsap.to(st, { fly: 0, duration: 0.8, ease: 'power3.out', overwrite: 'auto', onComplete() { st.busy = false; st.flyIdx = -1 } })
        },
        dispose() {
          gsap.killTweensOf(st); gsap.killTweensOf(op); PL.forEach((p) => gsap.killTweensOf(p)); tl.kill()
          ctx.cursor.hover(false); ctx.crt.push = 0
          geo.dispose(); hero.geometry.dispose(); labMesh.geometry.dispose()
          PL.forEach((p) => p.mat.dispose()); reelMat.dispose(); heroMat.dispose(); labMat.dispose()
          heroTex.dispose(); labTex.dispose()
        },
      }
    },
  })
})()
