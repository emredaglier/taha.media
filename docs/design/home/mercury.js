/* THROWAWAY prototype 'Mercury': eight Works as drops of liquid metal (one raymarched metaball quad).
   FAKE: everything comes from ctx (titles, loops, hero). Contract: docs/design/home/CONTRACT.md. */
;(function () {
  'use strict'
  HOME.register({
    name: 'Mercury',
    create: function (ctx) {
      const NW = 8, NB = 10, CAM = 4
      const clamp = (x, a, b) => (x < a ? a : x > b ? b : x)
      const lerp = (a, b, t) => a + (b - a) * t
      const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
      const works = ctx.works

      const st = { fly: 0, flyIdx: -1, lab: 0, labIdx: 0, sweep: 0, text: 0, dim: 0, str: 0, hov: -1, focus: -1, opened: false, busy: false }
      const SV = [0.9, 1.2, 0.8, 1.1, 1.0, 0.7, 1.3, 0.95]
      const bl = []
      for (let i = 0; i < NW; i++) {
        bl.push({ o: 0, pn: 0, calm: 0, ox: 0, oy: 0, vx: 0, vy: 0, x: 0, y: 0, z: 0, r: 0.3, ph: i * 1.9 + 0.7, sp: 0.22 + 0.035 * ((i * 5) % 8), amp: 0.16, sv: SV[i], sg: i % 2 ? 1 : -1 })
      }
      const HOST = [1, 6]

      // --- layout (view units: half height 1, half width = aspect) ---------------------
      const L = { asp: ctx.size.w / ctx.size.h, portrait: false, r: 0.3, rPool: 0.8, home: [], pool: [] }
      for (let i = 0; i < NW; i++) { L.home.push([0, 0]); L.pool.push([0, 0]) }
      function layout() {
        const a = L.asp
        let cols, rows
        if (a >= 1) {
          L.portrait = false
          // two arched rows above and below the hero band, every drop well inside the view
          const xs = [-0.78, -0.27, 0.27, 0.78], ys = [0.52, 0.66, 0.66, 0.52]
          for (let i = 0; i < 4; i++) {
            L.home[i][0] = xs[i] * a * 0.92; L.home[i][1] = ys[i]
            L.home[i + 4][0] = xs[i] * a * 0.92; L.home[i + 4][1] = -ys[i]
          }
          L.r = Math.min(0.2, 0.12 * a)
          cols = 4; rows = 2
        } else {
          L.portrait = true
          // four above, four below the hero: two staggered rows of two each
          const xs = [-0.58, 0.22, -0.22, 0.58, -0.58, 0.22, -0.22, 0.58], ys = [0.74, 0.74, 0.45, 0.45, -0.45, -0.45, -0.74, -0.74]
          for (let i = 0; i < NW; i++) { L.home[i][0] = xs[i] * a; L.home[i][1] = ys[i] }
          L.r = a * 0.28
          cols = 2; rows = 4
        }
        for (let i = 0; i < NW; i++) {
          const c = i % cols, r = Math.floor(i / cols)
          L.pool[i][0] = ((c + 0.5) / cols * 2 - 1) * a
          L.pool[i][1] = 1 - (r + 0.5) * (2 / rows)
        }
        L.rPool = Math.hypot((2 * a) / cols, 2 / rows) * 0.5 * 1.2
        for (let i = 0; i < NW; i++) bl[i].amp = L.r * (L.portrait ? 0.4 : 0.55)
      }
      layout()

      // --- textures: hero sentence + one label atlas ------------------------------------
      let heroTex = null, heroCa = 4
      function buildHero() {
        const px = 180
        let lines
        if (L.portrait) {
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
        heroTex.minFilter = heroTex.magFilter = THREE.LinearFilter
        heroTex.generateMipmaps = false
        heroCa = W / H
        if (U) U.tText.value = heroTex
      }

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

      // --- material -----------------------------------------------------------------------
      const uBall = [], uAux = [], uRect = []
      for (let i = 0; i < NB; i++) { uBall.push(new THREE.Vector4(0, 0, 50, 0.01)); uAux.push(new THREE.Vector4(0, 1, 1, 0)) }
      for (let i = 0; i < NW; i++) { const r = ctx.loopRect(i); uRect.push(new THREE.Vector4(r[0], r[1], r[2], r[3])) }
      let U = null
      buildHero()
      U = {
        uBall: { value: uBall }, uAux: { value: uAux }, uRect: { value: uRect },
        tAtlas: { value: ctx.atlas }, tReel: { value: ctx.showreel.texture }, tText: { value: heroTex }, tLabel: { value: labTex },
        uAspect: { value: L.asp }, uTime: { value: 0 }, uPx: { value: 0.003 }, uK: { value: 0.16 }, uSteps: { value: ctx.touch ? 24 : 40 }, uStepK: { value: ctx.touch ? 0.97 : 0.92 }, uEps: { value: ctx.touch ? 0.003 : 0.0012 }, uChrome: { value: 1 }, uGain: { value: 1.2 },
        uFly: { value: 0 }, uFlyIdx: { value: -1 }, uTextAmt: { value: 0 }, uDim: { value: 0 }, uLab: { value: 0 }, uSweep: { value: 0 },
        uReelScale: { value: new THREE.Vector2(0.28, 0.5) }, uTextHalf: { value: new THREE.Vector2(1, 0.25) },
        uLabBox: { value: new THREE.Vector4(-9, -9, -8, -8) }, uLabUV: { value: new THREE.Vector3(1, 1, 0.875) },
      }
      const material = new THREE.ShaderMaterial({
        uniforms: U, depthTest: false, depthWrite: false,
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
        fragmentShader: `
precision highp float;
varying vec2 vUv;
#define NB 10
#define NW 8
uniform vec4 uBall[NB];
uniform vec4 uAux[NB];
uniform vec4 uRect[NW];
uniform sampler2D tAtlas;
uniform sampler2D tReel;
uniform sampler2D tText;
uniform sampler2D tLabel;
uniform float uAspect;
uniform float uTime;
uniform float uPx;
uniform float uK;
uniform float uSteps;
uniform float uStepK;
uniform float uEps;
uniform float uChrome;
uniform float uGain;
uniform float uFly;
uniform float uFlyIdx;
uniform float uTextAmt;
uniform float uDim;
uniform float uLab;
uniform float uSweep;
uniform vec2 uReelScale;
uniform vec2 uTextHalf;
uniform vec4 uLabBox;
uniform vec3 uLabUV;

float gm[NB];
float smin(float a,float b,float k){float h=max(k-abs(a-b),0.)/k;return min(a,b)-h*h*k*.25;}
float map(vec3 p){
  float d=1000.;
  for(int i=0;i<NB;i++){
    if(gm[i]<.5) continue;
    vec4 b=uBall[i];
    vec4 x=uAux[i];
    vec3 q=p-b.xyz;
    float di=(length(vec3(q.x,q.y*x.y,q.z*x.z))-b.w)/x.z;
    d=smin(d,di,uK);
  }
  return d;
}
vec3 calcN(vec3 p){
  vec2 e=vec2(1.,-1.)*.004;
  return normalize(e.xyy*map(p+e.xyy)+e.yyx*map(p+e.yyx)+e.yxy*map(p+e.yxy)+e.xxx*map(p+e.xxx));
}
vec3 env(vec3 r){
  float a=uTime*.15;
  float ca=cos(a);
  float sa=sin(a);
  vec3 q=vec3(ca*r.x-sa*r.z,r.y,sa*r.x+ca*r.z);
  float up=q.y*.5+.5;
  vec3 c=vec3(.03+.16*up*up);
  c+=vec3(.9)*smoothstep(.62,.92,dot(q,normalize(vec3(-.45,.75,-.5))));
  c+=vec3(.6)*smoothstep(.8,.96,dot(q,normalize(vec3(.9,.15,-.35))));
  c+=vec3(.45)*smoothstep(.93,.99,dot(q,normalize(vec3(-.1,-.55,-.8))));
  return c;
}
vec2 dropUV(vec4 b,vec4 x,vec3 P,vec3 rf,float f,vec2 p){
  vec2 l=(P.xy-b.xy)/b.w;
  l.y*=x.y;
  l=l*.88+rf.xy*.5;
  vec2 uv=vec2(.5+l.x*.5*.5625,.5+l.y*.5);
  return mix(uv,p*uReelScale+.5,f);
}
void main(){
  vec2 p=(vUv*2.-1.)*vec2(uAspect,1.);
  vec3 ro=vec3(0.,0.,-4.);
  vec3 rd=normalize(vec3(p,4.));
  float t=1./rd.z;
  float dmin=1000.;
  vec3 pm=ro+rd*t;
  float anyOn=0.;
  for(int i=0;i<NB;i++){
    vec4 b=uBall[i];
    vec4 x=uAux[i];
    vec3 w=b.xyz-ro;
    float tp=dot(w,rd);
    float perp2=dot(w,w)-tp*tp;
    float rb=b.w/max(x.y,.25)+.5;
    float on=(b.w>.02&&perp2<rb*rb)?1.:0.;
    gm[i]=on;
    anyOn=max(anyOn,on);
  }
  if(anyOn>.5){
    for(int i=0;i<40;i++){
      if(float(i)>=uSteps) break;
      vec3 q=ro+rd*t;
      float d=map(q);
      if(d<dmin){dmin=d;pm=q;}
      if(d<uEps) break;
      t+=d*uStepK;
      if(t*rd.z>7.) break;
    }
  }
  float cov=1.-smoothstep(uEps,uEps+uPx*1.5,dmin);
  vec3 N=vec3(0.,0.,-1.);
  vec4 b1=vec4(0.,0.,0.,1.);
  vec4 b2=vec4(0.,0.,0.,1.);
  vec4 x1=vec4(0.,1.,1.,0.);
  vec4 x2=vec4(0.,1.,1.,0.);
  vec4 r1=vec4(0.,0.,.25,.5);
  vec4 r2=vec4(0.,0.,.25,.5);
  float d1=1000.;
  float d2=1000.;
  float id1=-1.;
  float id2=-1.;
  if(dmin<.3){
    N=calcN(pm);
    for(int i=0;i<NW;i++){
      vec4 b=uBall[i];
      float di=length(pm-b.xyz)-b.w;
      if(di<d1){
        d2=d1;b2=b1;x2=x1;r2=r1;id2=id1;
        d1=di;b1=b;x1=uAux[i];r1=uRect[i];id1=float(i);
      } else if(di<d2){
        d2=di;b2=b;x2=uAux[i];r2=uRect[i];id2=float(i);
      }
    }
  }
  float w1=.5+.5*smoothstep(0.,.2,d2-d1);
  float f1=abs(id1-uFlyIdx)<.5?uFly:0.;
  float f2=abs(id2-uFlyIdx)<.5?uFly:0.;
  float f=mix(f2,f1,w1);
  float calm=mix(x2.x,x1.x,w1);
  float pool=mix(x2.w,x1.w,w1);
  float fl=clamp(pool*.92+f*.9,0.,1.);
  N=normalize(mix(N,vec3(0.,0.,-1.),fl));
  float ndv=clamp(dot(N,-rd),0.,1.);
  vec3 rf=refract(rd,N,.8);
  vec2 disp=mix(-N.xy*(1.-smoothstep(0.,.45,dmin))*.2,rf.xy*.6,cov);

  vec2 tc=vec2(1.)/(2.*uTextHalf);
  vec4 tR=texture2D(tText,(p+disp)*tc+.5);
  vec4 tG=texture2D(tText,(p+disp*1.08)*tc+.5);
  vec4 tB=texture2D(tText,(p+disp*1.16)*tc+.5);
  vec3 txt=vec3(tR.r*tR.a,tG.g*tG.a,tB.b*tB.a)*uTextAmt*(1.-.75*uDim);

  vec2 uvA=clamp(dropUV(b1,x1,pm,rf,f1,p),.012,.988);
  vec2 uvB=clamp(dropUV(b2,x2,pm,rf,f2,p),.012,.988);
  vec3 LA=texture2D(tAtlas,r1.xy+uvA*r1.zw).rgb;
  vec3 LB=texture2D(tAtlas,r2.xy+uvB*r2.zw).rgb;
  vec3 reel=texture2D(tReel,clamp(p*uReelScale+.5,0.,1.)).rgb;

  vec3 inside=mix(mix(LB,LA,w1),reel,pool);
  inside=inside*mix(1.,uGain,1.-pool)+.012;
  float surf=(1.-pool)*(1.-f);
  float fr=pow(1.-ndv,3.);
  vec3 refl=env(reflect(rd,N));
  float mr=(.06+.8*fr)*(1.-.6*calm)*surf*uChrome;
  vec3 col=mix(inside,refl,mr);
  float see=smoothstep(.55,.1,ndv)*.5*surf*uChrome;
  col=mix(col,txt*1.15+refl*.35,see);
  col+=vec3(pow(1.-ndv,4.)*.55*(1.-.5*calm)*surf*uChrome);
  float band=1.-smoothstep(0.,.35,abs(p.x*.8+p.y*.45-mix(-3.5,3.5,uSweep)));
  col+=vec3(pool*band*.16*step(.001,uSweep)*step(uSweep,.999));

  vec3 bg=txt+vec3(.05)*exp(-max(dmin,0.)*14.)*(1.-pool)*(1.-f);
  vec3 outc=mix(bg,col,cov);

  vec2 lb=(p-uLabBox.xy)/(uLabBox.zw-uLabBox.xy);
  float li=step(0.,lb.x)*step(lb.x,1.)*step(0.,lb.y)*step(lb.y,1.);
  vec2 lc=clamp(lb,0.,1.);
  vec4 lt=texture2D(tLabel,vec2(lc.x*uLabUV.x,mix(uLabUV.z,uLabUV.y,lc.y)));
  float lw=clamp((uLab*1.35-lc.x)/.35,0.,1.);
  outc=mix(outc,lt.rgb,lt.a*li*lw);
  gl_FragColor=vec4(clamp(outc,0.,1.),1.);
}`,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
      mesh.frustumCulled = false
      const scene = new THREE.Scene()
      scene.add(mesh)
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

      // --- opening: the Showreel as one flat pool that beads up into the eight drops --------
      const tl = gsap.timeline({ onComplete() { st.opened = true } })
      {
        const ord = []
        for (let i = 0; i < NW; i++) ord.push(i)
        ord.sort((a, b) => Math.hypot(L.pool[a][0], L.pool[a][1]) - Math.hypot(L.pool[b][0], L.pool[b][1]))
        ord.forEach((i, k) => tl.to(bl[i], { o: 1, duration: 1.5, ease: 'power3.inOut' }, 0.35 + k * 0.09))
        tl.fromTo(st, { sweep: 0 }, { sweep: 1, duration: 1.2, ease: 'power2.inOut' }, 0)
        tl.fromTo(st, { text: 0 }, { text: 1, duration: 1, ease: 'power2.out' }, 1.7)
      }
      function skip() { tl.progress(1, false); st.opened = true; st.text = 1; st.sweep = 1 }
      if (ctx.reduced) skip()

      // --- hover, fly-in ---------------------------------------------------------------------
      function setHover(h) {
        st.hov = h
        ctx.cursor.hover(h >= 0)
        if (h >= 0) {
          st.labIdx = h
          gsap.fromTo(st, { lab: 0 }, { lab: 1, duration: 0.7, ease: 'power3.out', overwrite: 'auto' })
          gsap.fromTo(bl[h], { pn: 0.16 }, { pn: 0, duration: 1.2, ease: 'elastic.out(1,0.35)', overwrite: 'auto' })
        } else gsap.to(st, { lab: 0, duration: 0.22, ease: 'power2.in', overwrite: 'auto' })
      }
      function go(i) {
        st.busy = true; st.flyIdx = i
        setHover(-1)
        gsap.to(st, { fly: 1, duration: 0.8, ease: 'power3.in', overwrite: 'auto', onComplete() { ctx.enter(i) } })
      }
      // distance of the pointer ray to ball i, in ball radii
      let rdx = 0, rdy = 0, rdz = 1
      function rayScore(i) {
        const b = bl[i], wx = b.x, wy = b.y, wz = b.z + CAM
        const tp = wx * rdx + wy * rdy + wz * rdz
        if (tp <= 0) return 1e9
        return Math.sqrt(Math.max(wx * wx + wy * wy + wz * wz - tp * tp, 0)) / b.r
      }
      function setRay() {
        const px = ctx.pointer.nx * L.asp, py = ctx.pointer.ny, len = Math.hypot(px, py, CAM)
        rdx = px / len; rdy = py / len; rdz = CAM / len
      }
      function pickAt(tol) {
        setRay()
        let best = -1, bs = 1e9
        for (let i = 0; i < NW; i++) { const s = rayScore(i); if (s < bs) { bs = s; best = i } }
        return bs < tol ? best : -1
      }

      // label placement (view units); writes into out
      const out = [0, 0]
      function place(cx, cy, hw, hh, bw, bh, mx, my, vert, top) {
        const g = 0.05
        const fitR = cx + hw + g + bw <= mx, fitL = cx - hw - g - bw >= -mx
        let x0, y0 = cy - bh * 0.5
        if (!vert && fitR && (cx >= 0 || !fitL)) x0 = cx + hw + g
        else if (!vert && fitL) x0 = cx - hw - g - bw
        else {
          // above or below, clear of the hero block in the middle
          x0 = cx - bw * 0.5
          let down = (cy > 0) === (Math.abs(cy) > 0.6)
          if (!down && cy + hh + g + bh > top) down = true
          else if (down && cy - hh - g - bh < -my) down = false
          y0 = down ? cy - hh - g - bh : cy + hh + g
        }
        out[0] = clamp(x0, -mx, mx - bw); out[1] = clamp(y0, -my, top - bh)
      }

      // --- frame ---------------------------------------------------------------------------------
      function update(t, dt) {
        const P = ctx.pointer, S = ctx.scroll, asp = L.asp
        st.str += (Math.min(Math.abs(S.v) / 1400, 1.4) - st.str) * (1 - Math.exp(-dt * 6))
        st.dim += ((st.hov >= 0 ? 1 : 0) - st.dim) * (1 - Math.exp(-dt * 5))
        const roll = 0.35 * Math.sin(S.y * 0.0006), yaw = 0.55 * Math.sin(S.y * 0.00045)
        const cr = Math.cos(roll), sr = Math.sin(roll), cy = Math.cos(yaw), sy = Math.sin(yaw)
        const adv = S.y * 0.0011
        const px = P.nx * asp, py = P.ny
        const active = !ctx.touch && P.inside && st.opened && !st.busy

        let near = -1, ns = 1e9
        if (active) {
          setRay()
          for (let i = 0; i < NW; i++) { const s = rayScore(i); if (s < ns) { ns = s; near = i } }
        }
        let hv = active && ns < 1.1 ? near : -1
        if (hv < 0 && st.focus >= 0 && st.opened && !st.busy) hv = st.focus
        if (hv !== st.hov) setHover(hv)

        const kc = 1 - Math.exp(-dt * 7), ks = 1 - Math.exp(-dt * 6)
        const rFill = Math.hypot(asp, 1) * 1.12 + 0.1
        for (let i = 0; i < NW; i++) {
          const b = bl[i], o = b.o
          b.calm += ((i === st.hov ? 1 : 0) - b.calm) * kc
          const ph = b.ph + t * b.sp + adv * b.sg * (0.7 + 0.08 * i)
          let x0 = lerp(L.pool[i][0], L.home[i][0] + b.amp * Math.cos(ph), o)
          let y0 = lerp(L.pool[i][1], L.home[i][1] + b.amp * 0.8 * Math.sin(ph * 1.31 + i), o)
          let z0 = 0.25 * Math.sin(ph * 0.7 + i) * o
          const rx = x0 * cr - y0 * sr, ry = x0 * sr + y0 * cr
          x0 = rx * cy + z0 * sy; z0 = -rx * sy + z0 * cy; y0 = ry
          const pj = CAM / (CAM + z0)
          let tx = 0, ty = clamp(-S.v * 0.00004 * b.sg * (0.6 + 0.1 * i), -0.25, 0.25)
          if (active) {
            const vx = x0 * pj, vy = y0 * pj
            if (i === near && ns < 3.4) {
              const gn = 0.55 * sstep(3.4, 1, ns) * (i === st.hov ? 0.22 : 1)
              tx += ((px - vx) / pj) * gn; ty += ((py - vy) / pj) * gn
            } else {
              const ddx = vx - px, ddy = vy - py, d = Math.hypot(ddx, ddy) + 1e-3
              const rp = 0.17 * Math.pow(Math.max(0, 1 - d / 0.9), 2)
              tx += (ddx / d) * rp / pj; ty += (ddy / d) * rp / pj
            }
          }
          if (st.hov >= 0 && i !== st.hov) {
            const h = bl[st.hov], ddx = x0 - h.x, ddy = y0 - h.y, d = Math.hypot(ddx, ddy) + 1e-3, sep = h.r + L.r + 0.3
            if (d < sep) { const pu = (sep - d) * 0.9 * h.calm; tx += (ddx / d) * pu; ty += (ddy / d) * pu }
          }
          b.vx += ((tx - b.ox) * 60 - b.vx * 9) * dt; b.ox += b.vx * dt
          b.vy += ((ty - b.oy) * 60 - b.vy * 9) * dt; b.oy += b.vy * dt
          let x = x0 + b.ox, y = y0 + b.oy, z = z0
          let r = lerp(L.rPool, L.r * (1 + 0.045 * Math.sin(t * 1.3 + i * 2.1)), o)
          r *= (1 + 0.2 * b.calm + b.pn) * (1 + 0.18 * Math.sin(Math.PI * o) * Math.sin(i * 1.7 + 1))
          let f = 0
          if (st.flyIdx >= 0) {
            if (i === st.flyIdx) { f = st.fly; x = lerp(x, 0, f); y = lerp(y, 0, f); z = lerp(z, 0, f); r = lerp(r, rFill, f) }
            else { x *= 1 + 1.4 * st.fly; y *= 1 + 1.4 * st.fly; r *= 1 - 0.45 * st.fly }
          }
          if (st.flyIdx < 0 && o > 0.99) {
            const pv = CAM / (CAM + z), lx = asp * 0.93 - r * pv, ly = 0.9 - r * pv
            x = clamp(x * pv, -lx, lx) / pv; y = clamp(y * pv, -ly, ly) / pv
          }
          b.x = x; b.y = y; b.z = z; b.r = r
          const calm = Math.max(b.calm, f)
          uBall[i].set(x, y, z, r)
          uAux[i].set(calm, 1 / (1 + st.str * (1 - calm) * b.sv), lerp(3.2, 1, o), 1 - sstep(0.06, 0.7, o))
        }
        for (let s = 0; s < 2; s++) {
          const h = bl[HOST[s]], vis = sstep(0.7, 1, h.o) * (1 - st.fly)
          if (vis < 0.01) { uBall[8 + s].set(0, 0, 50, 0.01); continue }
          const a = t * (1.5 + 0.5 * s) + s * 3.1 + S.y * 0.0022, orad = h.r * (1.55 + st.str * 0.5)
          uBall[8 + s].set(h.x + Math.cos(a) * orad, h.y + Math.sin(a) * orad * 0.8, h.z + 0.3 * Math.sin(a * 0.7), (0.06 + 0.03 * Math.sin(t * 2 + s)) * vis)
          uAux[8 + s].set(0, 1, 1, 0)
        }

        // label next to the hovered drop
        if (st.lab > 0.001 && st.flyIdx < 0) {
          const b = bl[st.labIdx], pj = CAM / (CAM + b.z), rv = b.r * pj, mx = asp - 32 / ctx.size.h, my = 0.9
          let k = L.portrait ? 0.0011 : 0.0016, bw = rowFrac[st.labIdx] * LW * k
          if (bw > mx * 1.96) { k *= (mx * 1.96) / bw; bw = mx * 1.96 }
          const bh = LR * k
          place(b.x * pj, b.y * pj, rv, rv, bw, bh, mx, my, L.portrait, L.portrait ? 1 - 260 / ctx.size.h : my)
          U.uLabBox.value.set(out[0], out[1], out[0] + bw, out[1] + bh)
          U.uLabUV.value.set(rowFrac[st.labIdx], 1 - st.labIdx / NW, 1 - (st.labIdx + 1) / NW)
        } else U.uLabBox.value.set(-9, -9, -8, -8)

        U.uK.value = L.r * 0.8; U.uTime.value = t; U.uFly.value = st.fly; U.uFlyIdx.value = st.flyIdx
        U.uTextAmt.value = st.text; U.uDim.value = Math.max(st.dim, st.fly); U.uLab.value = st.lab; U.uSweep.value = st.sweep
        material.uniformsNeedUpdate = true
        ctx.crt.push = Math.max(Math.min(Math.abs(S.v) / 3000, 0.7), st.fly * (1 - st.fly) * 2.4)
      }

      return {
        scene, camera, update,
        resize(w, h) {
          const wasPortrait = L.portrait
          L.asp = w / h
          layout()
          if (L.portrait !== wasPortrait) buildHero()
          const s = Math.max(L.asp, 16 / 9)
          U.uAspect.value = L.asp
          U.uChrome.value = 1; U.uGain.value = 1.2
          U.uPx.value = 2 / (h * ctx.size.dpr)
          U.uReelScale.value.set(1 / (2 * s), 16 / 9 / (2 * s))
          const hw = L.portrait ? Math.min(L.asp * 0.9, 0.34 * heroCa) : Math.min(L.asp * 0.9, 1.45, 0.27 * heroCa)
          U.uTextHalf.value.set(hw, hw / heroCa)
        },
        tap() {
          if (!st.opened) { skip(); return }
          if (st.busy) return
          const i = pickAt(ctx.touch ? 1.6 : 1.15)
          if (i >= 0) go(i)
        },
        focus(i) { st.focus = i },
        activate(i) { if (!st.opened) skip(); if (!st.busy) go(i) },
        back(i) {
          gsap.to(st, { fly: 0, duration: 0.9, ease: 'power3.out', overwrite: 'auto', onComplete() { st.busy = false; st.flyIdx = -1 } })
        },
        dispose() {
          gsap.killTweensOf(st); bl.forEach((b) => gsap.killTweensOf(b)); tl.kill()
          ctx.cursor.hover(false); ctx.crt.push = 0
          mesh.geometry.dispose(); material.dispose(); heroTex.dispose(); labTex.dispose()
        },
      }
    },
  })
})()
