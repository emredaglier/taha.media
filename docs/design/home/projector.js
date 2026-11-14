/* THROWAWAY prototype 'Projector': a dark screening room and one film projector whose beam the visitor holds.
   Projective texturing in a ShaderMaterial on every room mesh; the wall of Works is sampled from ctx.atlas in the shader.
   FAKE: everything comes from ctx (titles, loops, hero). Contract: docs/design/home/CONTRACT.md. */
;(function () {
  'use strict'
  HOME.register({
    name: 'Projector',
    create: function (ctx) {
      const NW = 8
      const clamp = (x, a, b) => (x < a ? a : x > b ? b : x)
      const lerp = (a, b, t) => a + (b - a) * t
      const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
      const works = ctx.works
      const FLOOR = -3.6, PZ = 8.5, PY = 0.4
      const CAM_POS = new THREE.Vector3(0, 1.6, 13), LOOK = new THREE.Vector3(0, -0.2, 0)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(40, ctx.size.w / ctx.size.h, 0.1, 80)
      camera.position.copy(CAM_POS); camera.lookAt(LOOK); camera.updateMatrixWorld()
      scene.add(camera)
      const projCam = new THREE.PerspectiveCamera(30, 1, 0.5, 60)
      const P = new THREE.Vector3(2.0, PY, PZ)

      const st = { lamp: 0, reel: 0, zoomI: 0, room: 0, hero: 0, focus: 0, fi: -1, lab: 0, labIdx: 0, fly: 0, flyIdx: -1, opened: false, busy: false, hov: -1, fo: -1, want: -1, dust: 0, spd: 0, blur: 0, since: 0, cool: 0 }
      const app = [0, 0, 0, 0, 0, 0, 0, 0]
      const aim = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 }
      const zm = { v: 0, vv: 0 }

      // --- layout (picture space "q": x 0..PA, y 0..1, y up) -----------------------------
      const L = { portrait: false, PA: 2.6, Wp: 12, Hp: 4.6, restY: 0, halfW: 8, midY: 0, topY: 4, botY: -4, kx: 0.38, ky: 0.32, cells: [], hero: [0, 0, 1, 1], box: [0, 0, 1, 1], reel: [0, 0, 1, 1], bh: 0.6, bw: 1.0, lh: 0.17 }
      for (let i = 0; i < NW; i++) L.cells.push([0, 0, 1, 1])

      // --- textures: hero sentence + one label atlas -----------------------------------
      let heroTex = null, heroAsp = 4
      function buildHero() {
        const px = 180
        let lines
        if (L.portrait) {
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
        heroAsp = W / H
        if (U) U.tHero.value = heroTex
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

      // --- the room material: projective texturing -------------------------------------
      const cellV = [], rectV = []
      for (let i = 0; i < NW; i++) { cellV.push(new THREE.Vector4(0, 0, 1, 1)); const r = ctx.loopRect(i); rectV.push(new THREE.Vector4(r[0], r[1], r[2], r[3])) }
      let U = null
      buildHero()
      U = {
        uProjVP: { value: new THREE.Matrix4() }, uProjPos: { value: P }, uPA: { value: 2.6 }, uFilm: { value: 0 }, uBlur: { value: 0 }, uTime: { value: 0 },
        uBeam: { value: 0 }, uAmb: { value: 0 }, uReel: { value: 0 }, uFocus: { value: 0 }, uFocusIdx: { value: -1 }, uLab: { value: 0 }, uHero: { value: 0 }, uWeave: { value: 0.4 },
        uCell: { value: cellV }, uRect: { value: rectV }, uAppear: { value: app },
        uBox: { value: new THREE.Vector4() }, uReelBox: { value: new THREE.Vector4() }, uHeroRect: { value: new THREE.Vector4() }, uLabRect: { value: new THREE.Vector4(-9, -9, -8, -8) },
        uLabUV: { value: new THREE.Vector3(1, 1, 0.875) }, uIris: { value: new THREE.Vector3(1.3, 0.5, 1.4) },
        tAtlas: { value: ctx.atlas }, tReel: { value: ctx.showreel.texture }, tHero: { value: heroTex }, tLabel: { value: labTex },
      }
      const ROOM_VS = `
varying vec3 vW; varying vec3 vN;
uniform float uRipple; uniform float uTime;
void main(){
  vec3 pos=position; vec3 n=normal;
  if(uRipple>0.){ float ph=pos.x*1.9+pos.y*.35+uTime*.9; pos.z+=uRipple*sin(ph); n.x-=uRipple*1.9*cos(ph); n.y-=uRipple*.35*cos(ph); n=normalize(n); }
  vec4 w=modelMatrix*vec4(pos,1.);
  vW=w.xyz; vN=normalize(mat3(modelMatrix)*n);
  gl_Position=projectionMatrix*viewMatrix*w;
}`
      const ROOM_FS = `
precision highp float;
varying vec3 vW; varying vec3 vN;
uniform mat4 uProjVP; uniform vec3 uProjPos;
uniform float uPA,uFilm,uBlur,uTime,uBeam,uAmb,uReel,uFocus,uFocusIdx,uLab,uHero,uWeave;
uniform vec4 uCell[8]; uniform vec4 uRect[8]; uniform float uAppear[8];
uniform vec4 uBox,uReelBox,uHeroRect,uLabRect; uniform vec3 uLabUV; uniform vec3 uIris;
uniform sampler2D tAtlas,tReel,tHero,tLabel;
uniform vec3 uAlbedo;
float inR(vec2 l){return step(0.,l.x)*step(l.x,1.)*step(0.,l.y)*step(l.y,1.);}
vec3 tap(vec2 uv,vec4 rc){return texture2D(tAtlas,rc.xy+clamp(uv,.004,.996)*rc.zw).rgb;}
void main(){
  vec4 pc=uProjVP*vec4(vW,1.);
  float front=step(.001,pc.w);
  vec2 p=pc.xy/max(pc.w,.001)*.5+.5;
  float e=min(min(p.x,1.-p.x),min(p.y,1.-p.y));
  float inside=front*smoothstep(0.,.005,e);
  vec3 Lv=uProjPos-vW; float d=length(Lv); Lv/=max(d,.001);
  vec3 N=normalize(vN);
  float ndl=max(dot(N,Lv),0.);
  float facing=pow(ndl,.6);
  float att=min(2.6/(1.+.015*d*d),1.35);
  // film gate: the wall slides sideways inside the frame, with a little weave
  vec2 pw=p+vec2(sin(uTime*23.)*.0007+sin(uTime*7.1)*.0009,sin(uTime*17.+1.)*.0011)*uWeave;
  pw.x=fract(pw.x+uFilm);
  vec2 q=vec2(pw.x*uPA,pw.y);
  // which cell (focus cell wins and grows from its own rect into the focus box)
  vec4 selR=vec4(0.,0.,1.,1.); vec4 selRect=vec4(0.,0.,.25,.5); float selA=0.; float selPri=0.;
  for(int i=0;i<8;i++){
    float fi=float(i);
    float isF=step(abs(fi-uFocusIdx),.5);
    vec4 r=mix(uCell[i],uBox,isF*uFocus);
    vec2 lc=(q-r.xy)/(r.zw-r.xy);
    float inn=inR(lc);
    float a=mix(1.-uFocus,1.,isF)*uAppear[i];
    float pri=inn*(1.+isF);
    float t=step(selPri+.001,pri);
    selR=mix(selR,r,t); selRect=mix(selRect,uRect[i],t); selA=mix(selA,a,t); selPri=mix(selPri,pri,t);
  }
  vec2 lc=(q-selR.xy)/(selR.zw-selR.xy);
  vec2 uvl=clamp(lc,0.,1.);
  vec3 lp=tap(uvl,selRect);
  if(uBlur>.0004){
    vec2 o=vec2(uBlur,uBlur*.8);
    lp=lp*.36+.16*(tap(uvl+o,selRect)+tap(uvl-o,selRect)+tap(uvl+vec2(o.x,-o.y),selRect)+tap(uvl+vec2(-o.x,o.y),selRect));
  }
  vec3 wall=lp*step(.5,selPri)*selA;
  // hero sentence between the rows
  vec2 hl=(q-uHeroRect.xy)/(uHeroRect.zw-uHeroRect.xy);
  vec2 hc=clamp(hl,0.,1.); vec2 hb=vec2(uBlur*3.,0.);
  vec4 ht=texture2D(tHero,hc);
  if(uBlur>.0004) ht=ht*.5+.25*(texture2D(tHero,clamp(hc+hb,0.,1.))+texture2D(tHero,clamp(hc-hb,0.,1.)));
  wall+=ht.rgb*ht.a*inR(hl)*uHero;
  // title + kind/year projected beside the enlarged Work
  vec2 ll=(q-uLabRect.xy)/(uLabRect.zw-uLabRect.xy);
  vec2 lcl=clamp(ll,0.,1.);
  vec4 lt=texture2D(tLabel,vec2(lcl.x*uLabUV.x,mix(uLabUV.z,uLabUV.y,lcl.y)));
  wall+=lt.rgb*lt.a*inR(ll)*clamp((uLab*1.35-ll.x)/.35,0.,1.)*step(.001,uLab);
  // the Showreel thrown full
  vec2 rl=(q-uReelBox.xy)/(uReelBox.zw-uReelBox.xy);
  vec3 rc=texture2D(tReel,clamp(rl,0.,1.)).rgb*inR(rl);
  vec3 pic=mix(wall,rc,uReel);
  // soft round falloff; the iris closes in on the Work when focused
  float dn=length((q-uIris.xy)/uIris.z);
  float in0=mix(.55,.95,uFocus); float strength=mix(.22,.95,uFocus);
  float fall=1.-strength*smoothstep(in0,in0+.65,dn);
  vec3 lit=pic*(fall*inside*att*facing*uBeam);
  float amb=uAmb*(.55+.45*clamp(dot(N,normalize(vec3(.3,.6,1.))),0.,1.));
  gl_FragColor=vec4(clamp((lit+amb)*uAlbedo,0.,1.),1.);
}`
      const mats = []
      function makeMat(albedo, ripple) {
        const m = new THREE.ShaderMaterial({
          uniforms: Object.assign({ uAlbedo: { value: new THREE.Color(albedo) }, uRipple: { value: ripple || 0 } }, U),
          vertexShader: ROOM_VS, fragmentShader: ROOM_FS,
        })
        mats.push(m)
        return m
      }

      // --- the room: big simple shapes -------------------------------------------------
      const roomMeshes = [], placed = [], geos = []
      function addFixed(geo, mat, x, y, z, ry) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; scene.add(m); roomMeshes.push(m); geos.push(geo); return m }
      function addSide(geo, mat, side, off, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(0, y, z); scene.add(m); roomMeshes.push(m); geos.push(geo); placed.push([m, side, off]); return m }
      addFixed(new THREE.PlaneGeometry(70, 24), makeMat(0xe8e8e8), 0, 3, 0)
      {
        const f = addFixed(new THREE.PlaneGeometry(70, 44), makeMat(0xcfcfcf), 0, FLOOR, 12)
        f.rotation.x = -Math.PI / 2
      }
      for (let k = 0; k < 3; k++) {
        const front = 0.6 + 0.9 * k
        for (const s of [-1, 1]) addSide(new THREE.BoxGeometry(3, 12, 4), makeMat(0xdedede), s, 1.5 + k * 3, FLOOR + 6, front - 2)
      }
      addSide(new THREE.CylinderGeometry(0.5, 0.5, 10, 28, 1), makeMat(0xf0f0f0), -1, 0.55, FLOOR + 5, 1.5)
      addSide(new THREE.CylinderGeometry(0.4, 0.4, 10, 28, 1), makeMat(0xf0f0f0), -1, 1.9, FLOOR + 5, 2.4)
      {
        const cg = new THREE.PlaneGeometry(3.6, 10.6, 44, 30), cp = cg.attributes.position
        for (let i = 0; i < cp.count; i++) { const x = cp.getX(i); cp.setZ(i, 0.3 * Math.sin(x * 3.0 + 0.6) + 0.12 * Math.sin(x * 7.1)) }
        cg.computeVertexNormals()
        addSide(cg, makeMat(0xf2f2f2, 0.07), 1, 1.9, FLOOR + 5.3, 1.3)
      }
      addFixed(new THREE.BoxGeometry(1.5, 1, 1.1), makeMat(0xe6e6e6), -2.6, FLOOR + 0.5, 2.4, 0.35)
      addFixed(new THREE.BoxGeometry(1.1, 0.8, 1.1), makeMat(0xe6e6e6), 3.0, FLOOR + 0.4, 1.7, -0.5)
      addFixed(new THREE.SphereGeometry(0.6, 48, 32), makeMat(0xf4f4f4), 0.4, FLOOR + 0.6, 1.4)

      // --- the projector body, lamp glow ------------------------------------------------
      const body = new THREE.Group()
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0x000000 }), lensMat = new THREE.MeshBasicMaterial({ color: 0x000000 })
      {
        const bx = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 1.3), bodyMat); bx.position.set(0, 0, 0.45); body.add(bx)
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.4, 24, 1), lensMat); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0, -0.4); body.add(lens)
        for (const z of [0.15, 0.8]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.08, 32, 1), bodyMat); r.rotation.z = Math.PI / 2; r.position.set(0, 0.62, z); r.userData.reel = true; body.add(r) }
        geos.push(bx.geometry, lens.geometry, body.children[2].geometry, body.children[3].geometry)
      }
      const gd = new Uint8Array(64 * 64 * 4)
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const r2 = ((x - 31.5) * (x - 31.5) + (y - 31.5) * (y - 31.5)) / 1000; const v = Math.exp(-r2 * 6) * 255; const o = (y * 64 + x) * 4; gd[o] = gd[o + 1] = gd[o + 2] = gd[o + 3] = v }
      const glowTex = new THREE.DataTexture(gd, 64, 64, THREE.RGBAFormat); glowTex.needsUpdate = true
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0d8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }))
      glow.position.set(0, 0, -0.65); body.add(glow)
      body.position.copy(P)
      scene.add(body)

      // --- the light cone: additive, soft, dusty ---------------------------------------
      const SEG = 40, cpos = [], cnor = [], cidx = []
      for (let k = 0; k <= SEG; k++) { const a = (k / SEG) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); cpos.push(0, 0, 0, c, s, -1); cnor.push(c * 0.7071, s * 0.7071, 0.7071, c * 0.7071, s * 0.7071, 0.7071) }
      for (let k = 0; k < SEG; k++) { const a = 2 * k; cidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
      const coneGeo = new THREE.BufferGeometry()
      coneGeo.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3)); coneGeo.setAttribute('normal', new THREE.Float32BufferAttribute(cnor, 3)); coneGeo.setIndex(cidx)
      const CU = { uTime: { value: 0 }, uAlpha: { value: 0 }, uDust: { value: 0.3 } }
      const coneMat = new THREE.ShaderMaterial({
        uniforms: CU, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        vertexShader: `
varying vec3 vW; varying vec3 vNV; varying vec3 vVD; varying float vT;
void main(){
  vec4 w=modelMatrix*vec4(position,1.); vec4 mv=viewMatrix*w;
  vW=w.xyz; vT=-position.z; vNV=normalize(normalMatrix*normal); vVD=normalize(-mv.xyz);
  gl_Position=projectionMatrix*mv;
}`,
        fragmentShader: `
precision highp float;
varying vec3 vW; varying vec3 vNV; varying vec3 vVD; varying float vT;
uniform float uTime,uAlpha,uDust;
float h31(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1.,0.,0.)),f.x),mix(h31(i+vec3(0.,1.,0.)),h31(i+vec3(1.,1.,0.)),f.x),f.y),
             mix(mix(h31(i+vec3(0.,0.,1.)),h31(i+vec3(1.,0.,1.)),f.x),mix(h31(i+vec3(0.,1.,1.)),h31(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}
void main(){
  float ndv=abs(dot(normalize(vNV),normalize(vVD)));
  float edge=pow(ndv,1.5);
  float haze=.4+.6*vn(vW*.5+vec3(0.,uTime*.06,uTime*.08));
  float sp=vn(vW*6.+vec3(uTime*.3,uTime*.18,-uTime*.22));
  float motes=smoothstep(.7,.92,sp)*(.45+uDust*1.4);
  float along=smoothstep(0.,.06,vT)*(1.-.5*vT);
  float a=edge*along*(haze*.075+motes*.16)*uAlpha;
  gl_FragColor=vec4(.93,.94,1.,a);
}`,
      })
      const cone = new THREE.Mesh(coneGeo, coneMat)
      cone.matrixAutoUpdate = false; cone.frustumCulled = false; cone.renderOrder = 2
      scene.add(cone)

      // --- fly-in overlay: the loop fills the view -----------------------------------------
      const OU = { tAtlas: { value: ctx.atlas }, uRect: { value: new THREE.Vector4(0, 0, 0.25, 0.5) }, uAlpha: { value: 0 }, uAsp: { value: 1.78 } }
      const overlayMat = new THREE.ShaderMaterial({
        uniforms: OU, transparent: true, depthTest: false, depthWrite: false,
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `
precision highp float; varying vec2 vUv; uniform sampler2D tAtlas; uniform vec4 uRect; uniform float uAlpha,uAsp;
void main(){
  vec2 c=vUv-.5; float va=uAsp/(16./9.);
  c*=va>1.?vec2(1.,1./va):vec2(va,1.);
  vec2 uv=clamp(c+.5,0.,1.);
  gl_FragColor=vec4(texture2D(tAtlas,uRect.xy+uv*uRect.zw).rgb,uAlpha);
}`,
      })
      const overlay = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), overlayMat)
      overlay.position.set(0, 0, -1); overlay.frustumCulled = false; overlay.renderOrder = 10; overlay.visible = false
      camera.add(overlay)

      // --- layout --------------------------------------------------------------------------
      const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), tv = new THREE.Vector3()
      const wallX = (nx) => { ray.setFromCamera({ x: nx, y: 0 }, camera); ray.ray.intersectPlane(plane, tv); return tv.x }
      const wallY = (ny) => { ray.setFromCamera({ x: 0, y: ny }, camera); ray.ray.intersectPlane(plane, tv); return tv.y }
      let inited = false, heroPortrait = false
      function layout(w, h) {
        camera.aspect = w / h; camera.position.copy(CAM_POS); camera.lookAt(LOOK); camera.updateProjectionMatrix(); camera.updateMatrixWorld()
        L.portrait = w / h < 1
        L.halfW = wallX(1); L.midY = wallY(0); L.topY = wallY(1); L.botY = wallY(-1)
        const visH = L.topY - L.botY
        if (!L.portrait) {
          L.PA = 2.6; L.Wp = Math.min(2 * L.halfW * 0.8, visH * 0.62 * L.PA); L.Hp = L.Wp / L.PA; L.restY = L.midY - 0.1; L.kx = 0.38; L.ky = 0.32; L.lh = 0.17; P.x = 2.0
        } else {
          L.PA = 0.62
          const top = wallY(1 - (2 * 140) / h), bot = L.botY + visH * 0.03
          L.Wp = 2 * L.halfW * 0.88; L.Hp = L.Wp / L.PA
          if (L.Hp > top - bot) { L.Hp = top - bot; L.Wp = L.Hp * L.PA }
          L.restY = top - L.Hp / 2; L.kx = 0.08; L.ky = 0.3; L.lh = 0.1; P.x = Math.min(0.6, L.halfW * 0.3)
        }
        const PA = L.PA
        if (!L.portrait) {
          const rh = 0.34, cw = (rh * 16) / 9, mx = 0.05, my = 0.06, gut = (PA - 2 * mx - 4 * cw) / 3
          for (let i = 0; i < NW; i++) { const c = i % 4, r = Math.floor(i / 4), x0 = mx + c * (cw + gut), y0 = r === 0 ? 1 - my - rh : my; L.cells[i] = [x0, y0, x0 + cw, y0 + rh] }
          L.hero = [mx, my + rh, PA - mx, 1 - my - rh]
        } else {
          const gx = 0.03, g = 0.02, cw = (PA - 2 * gx - g) / 2, rh = (cw * 9) / 16, y00 = 0.03
          for (let i = 0; i < NW; i++) { const c = i % 2, r = Math.floor(i / 2), x0 = gx + c * (cw + g), y0 = y00 + (3 - r) * (rh + g); L.cells[i] = [x0, y0, x0 + cw, y0 + rh] }
          L.hero = [gx, y00 + 4 * rh + 3 * g + 0.02, PA - gx, 0.97]
        }
        for (let i = 0; i < NW; i++) cellV[i].set(L.cells[i][0], L.cells[i][1], L.cells[i][2], L.cells[i][3])
        {
          const hb = L.hero, bw = hb[2] - hb[0], bh = hb[3] - hb[1]
          if (L.portrait !== heroPortrait) { heroPortrait = L.portrait; buildHero() }
          const hh = Math.min(bh * 0.9, (bw * (L.portrait ? 0.96 : 0.9)) / heroAsp), hw = hh * heroAsp, cx = (hb[0] + hb[2]) / 2, cy = (hb[1] + hb[3]) / 2
          U.uHeroRect.value.set(cx - hw / 2, cy - hh / 2, cx + hw / 2, cy + hh / 2)
        }
        L.bh = Math.min(0.62, (PA * 0.9 * 9) / 16); L.bw = (L.bh * 16) / 9
        L.box = [PA / 2 - L.bw / 2, 0.5 - L.bh / 2, PA / 2 + L.bw / 2, 0.5 + L.bh / 2]
        U.uBox.value.set(L.box[0], L.box[1], L.box[2], L.box[3])
        const rh2 = Math.min(1, (PA * 9) / 16), rw2 = (rh2 * 16) / 9
        U.uReelBox.value.set(PA / 2 - rw2 / 2, 0.5 - rh2 / 2, PA / 2 + rw2 / 2, 0.5 + rh2 / 2)
        U.uPA.value = PA
        const edge = L.Wp / 2 + 0.25
        placed.forEach((p) => { p[0].position.x = p[1] * (edge + p[2]) })
        const th = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
        overlay.scale.set(th * camera.aspect, th, 1); OU.uAsp.value = camera.aspect
        if (!inited) { inited = true; aim.x = 0; aim.y = L.restY }
        scene.updateMatrixWorld(true)
      }

      // --- picking on the CPU, from the same projected UV the shader uses ---------------
      const pu = { u: 0, v: 0 }, pq = { x: 0, y: 0 }, v4 = new THREE.Vector4(), tmpDir = new THREE.Vector3(), tmpM = new THREE.Matrix4(), hc = new THREE.Vector3()
      function pointerP() {
        ray.setFromCamera({ x: ctx.pointer.nx, y: ctx.pointer.ny }, camera)
        const hits = ray.intersectObjects(roomMeshes, false)
        if (!hits.length) return false
        const p = hits[0].point
        v4.set(p.x, p.y, p.z, 1).applyMatrix4(U.uProjVP.value)
        if (v4.w <= 0.001) return false
        pu.u = (v4.x / v4.w) * 0.5 + 0.5; pu.v = (v4.y / v4.w) * 0.5 + 0.5
        return pu.u >= 0 && pu.u <= 1 && pu.v >= 0 && pu.v <= 1
      }
      function qOf(film) { let x = (pu.u + film) % 1; if (x < 0) x += 1; pq.x = x * L.PA; pq.y = pu.v }
      function cellAt(x, y, m) {
        let best = -1, bd = 1e9
        for (let i = 0; i < NW; i++) {
          const c = L.cells[i], dx = Math.max(c[0] - x, 0, x - c[2]), dy = Math.max(c[1] - y, 0, y - c[3]), d = Math.hypot(dx, dy)
          if (d <= m && d < bd) { bd = d; best = i }
        }
        return best
      }
      const lab = [0, 0, 1, 1]
      function labelRect(i) {
        const lh = L.lh, lw = Math.min(lh * labAsp[i] * (LW / LR), L.PA - 0.1)
        let x0, y0
        if (!L.portrait) { x0 = st.labSide > 0 ? L.box[2] + 0.06 : L.box[0] - 0.06 - lw; y0 = 0.5 - lh / 2 } else { x0 = L.PA / 2 - lw / 2; y0 = L.box[1] - 0.035 - lh }
        lab[0] = x0; lab[1] = y0; lab[2] = x0 + lw; lab[3] = y0 + lh
      }

      // --- focus: the iris closes onto one Work, which grows to a full frame ------------------
      function setFocus(i) {
        gsap.killTweensOf(st, 'focus,lab')
        if (i < 0) { gsap.to(st, { focus: 0, duration: 0.45, ease: 'power2.inOut' }); gsap.to(st, { lab: 0, duration: 0.2, ease: 'power2.in' }); st.cool = 0.3; return }
        st.labSide = aim.x <= 0 ? 1 : -1; st.since = 0
        const up = () => { gsap.to(st, { focus: 1, duration: 0.55, ease: 'power3.out' }); gsap.to(st, { lab: 1, duration: 0.45, delay: 0.25, ease: 'power2.out' }) }
        if (st.focus > 0.05 && st.fi !== i) gsap.to(st, { focus: 0, lab: 0, duration: 0.18, ease: 'power2.in', onComplete() { st.fi = i; st.labIdx = i; up() } })
        else { st.fi = i; st.labIdx = i; up() }
      }
      function go(i) {
        if (st.busy) return
        st.busy = true; st.flyIdx = i; st.hov = i
        if (st.want !== i) { st.want = i; setFocus(i) }
        ctx.cursor.hover(false)
        OU.uRect.value.copy(rectV[i])
        gsap.to(st, { fly: 1, duration: 0.85, ease: 'power2.inOut', overwrite: 'auto', onComplete() { ctx.enter(i) } })
      }

      // --- opening: lamp strikes, Showreel thrown full, frame pulls back into the wall of Works ----
      const apO = []
      for (let i = 0; i < NW; i++) apO.push({ v: 0 })
      st.reel = 1; st.zoomI = -0.5
      const tl = gsap.timeline({ onComplete() { st.opened = true } })
      tl.to(st, { lamp: 1, duration: 0.5, ease: 'sine.inOut' }, 0.35)
        .to(st, { room: 1, duration: 1.3, ease: 'power2.inOut' }, 1.5)
        .to(st, { zoomI: 0, duration: 1.1, ease: 'power3.inOut' }, 1.5)
        .to(st, { reel: 0, duration: 0.8, ease: 'power2.inOut' }, 1.65)
        .to(st, { hero: 1, duration: 0.7, ease: 'power2.out' }, 2.4)
      for (let i = 0; i < NW; i++) tl.to(apO[i], { v: 1, duration: 0.6, ease: 'power2.out' }, 1.9 + i * 0.07)
      function skip() { tl.progress(1, false); st.opened = true; st.lamp = 1; st.reel = 0; st.zoomI = 0; st.room = 1; st.hero = 1; apO.forEach((o) => { o.v = 1 }) }
      layout(ctx.size.w, ctx.size.h)
      if (ctx.reduced) skip()

      // --- frame -----------------------------------------------------------------------------
      let reelSpin = 0
      function update(t, dt) {
        const Pt = ctx.pointer, S = ctx.scroll
        const live = st.opened && !st.busy, mouse = !ctx.touch && Pt.inside
        st.since += dt; st.cool -= dt
        st.spd += (Math.abs(S.v) - st.spd) * (1 - Math.exp(-dt * 6))
        const film = ((((S.y * 0.00045) * (1 - st.focus)) % 1) + 1) % 1
        st.film = film
        // aim: the pointer holds the beam, with weight, lag and overshoot
        if (!st.busy) {
          const boxHalf = (L.bw / 2) * L.Hp
          const cX = Math.max(0, L.halfW - boxHalf - 0.5) * (L.portrait ? 0.9 : 1), cY = (L.topY - L.botY) * 0.3
          let tx = 0, ty = L.restY
          if (live && mouse) {
            const gx = lerp(L.kx, 1, st.focus), gy = lerp(L.ky, 1, st.focus)
            const wx = Pt.nx * L.halfW, wy = L.midY + Pt.ny * (L.topY - L.midY)
            tx = clamp(wx * gx, -cX, cX)
            ty = clamp(L.restY + (wy - L.restY) * gy, L.restY - cY, L.restY + (L.portrait ? 0 : cY))
          }
          aim.tx = tx; aim.ty = ty
        }
        aim.vx += ((aim.tx - aim.x) * 38 - aim.vx * 7) * dt; aim.x += aim.vx * dt
        aim.vy += ((aim.ty - aim.y) * 38 - aim.vy * 7) * dt; aim.y += aim.vy * dt
        // press zooms the lens in, release zooms back
        const zt = live && mouse && Pt.down ? 1 : 0
        zm.vv += ((zt - zm.v) * 70 - zm.vv * 10) * dt; zm.v += zm.vv * dt
        const zEff = clamp(st.zoomI + zm.v, -0.6, 2), s = 1 / (1 + 0.7 * zEff)
        // the projector frustum: lens-shifted so the picture is a true rectangle on the flat wall at rest
        const D = P.z, l = (-L.Wp / 2 - P.x) / D, r = (L.Wp / 2 - P.x) / D, b = (L.restY - L.Hp / 2 - P.y) / D, tp = (L.restY + L.Hp / 2 - P.y) / D
        const cx = (l + r) / 2, cy = (b + tp) / 2, rx = ((r - l) / 2) * s, ry = ((tp - b) / 2) * s, nr = 0.5
        projCam.projectionMatrix.makePerspective((cx - rx) * nr, (cx + rx) * nr, (cy + ry) * nr, (cy - ry) * nr, nr, 60)
        projCam.projectionMatrixInverse.copy(projCam.projectionMatrix).invert()
        const yaw = Math.atan2(aim.x - P.x, D) - Math.atan2(-P.x, D), pitch = Math.atan((aim.y - P.y) / D) - Math.atan((L.restY - P.y) / D)
        projCam.position.copy(P); projCam.rotation.set(pitch, -yaw, 0, 'YXZ'); projCam.updateMatrixWorld()
        projCam.matrixWorldInverse.copy(projCam.matrixWorld).invert()
        U.uProjVP.value.multiplyMatrices(projCam.projectionMatrix, projCam.matrixWorldInverse)
        body.quaternion.copy(projCam.quaternion)
        // the light cone follows the frustum
        tmpDir.set(0, 0, -1).applyQuaternion(projCam.quaternion)
        const len = (P.z / Math.max(0.4, -tmpDir.z)) * 1.04
        tmpM.set(len * rx, 0, -len * cx, 0, 0, len * ry, -len * cy, 0, 0, 0, len, 0, 0, 0, 0, 1)
        cone.matrix.multiplyMatrices(projCam.matrixWorld, tmpM); cone.matrixWorldNeedsUpdate = true

        // hover: decide the Work under the pointer from the same projected UV
        const scrolling = st.spd > 420
        let want = -1
        const hasP = live && mouse && !scrolling && pointerP()
        if (hasP) {
          qOf(film)
          if (st.hov >= 0 && st.focus > 0.02) {
            const bx = L.box, mx = (bx[2] - bx[0]) * 0.125, my = (bx[3] - bx[1]) * 0.125, c = L.cells[st.hov]
            if (st.since < 0.6 || (pq.x >= bx[0] - mx && pq.x <= bx[2] + mx && pq.y >= bx[1] - my && pq.y <= bx[3] + my) || (pq.x >= c[0] - 0.02 && pq.x <= c[2] + 0.02 && pq.y >= c[1] - 0.02 && pq.y <= c[3] + 0.02)) want = st.hov
          }
          if (want < 0 && st.cool <= 0) want = cellAt(pq.x, pq.y, 0.01)
        } else if (live && mouse && st.hov >= 0 && st.since < 0.6 && !scrolling) want = st.hov
        st.hov = want
        const desired = want >= 0 ? want : live ? st.fo : -1
        if (desired !== st.want) { st.want = desired; setFocus(desired); ctx.cursor.hover(desired >= 0) }

        // the focused Work: label beside it, iris around both
        let ix = L.PA / 2, iy = 0.5, ir = 0.5 * Math.hypot(L.PA, 1)
        if (st.fi >= 0 && st.focus > 0.001) {
          labelRect(st.labIdx)
          const x0 = Math.min(L.box[0], lab[0]), y0 = Math.min(L.box[1], lab[1]), x1 = Math.max(L.box[2], lab[2]), y1 = Math.max(L.box[3], lab[3])
          ix = lerp(ix, (x0 + x1) / 2, st.focus); iy = lerp(iy, (y0 + y1) / 2, st.focus); ir = lerp(ir, 0.54 * Math.hypot(x1 - x0, y1 - y0), st.focus)
          U.uLabRect.value.set(lab[0], lab[1], lab[2], lab[3]); U.uLabUV.value.set(labAsp[st.labIdx], 1 - st.labIdx / NW, 1 - (st.labIdx + 1) / NW)
        } else U.uLabRect.value.set(-9, -9, -8, -8)
        U.uIris.value.set(ix, iy, ir)

        // fly down the beam into the picture
        const f = st.fly
        if (st.flyIdx >= 0) {
          tmpDir.set(cx, cy, -1).normalize().applyQuaternion(projCam.quaternion)
          const k = P.z / -tmpDir.z
          hc.set(P.x + tmpDir.x * k, P.y + tmpDir.y * k, 0)
          const qx = P.x + (hc.x - P.x) * 0.52, qy = P.y + (hc.y - P.y) * 0.52, qz = P.z + (hc.z - P.z) * 0.52, a = (1 - f) * (1 - f), bb = 2 * (1 - f) * f, c2 = f * f
          camera.position.set(a * CAM_POS.x + bb * P.x + c2 * qx, a * CAM_POS.y + bb * P.y + c2 * qy, a * CAM_POS.z + bb * P.z + c2 * qz)
          const lk = sstep(0, 0.7, f)
          camera.lookAt(lerp(LOOK.x, hc.x, lk), lerp(LOOK.y, hc.y, lk), lerp(LOOK.z, hc.z, lk)); camera.updateMatrixWorld()
        }
        const oa = sstep(0.55, 0.95, f)
        OU.uAlpha.value = oa; overlay.visible = oa > 0.001

        // dust: pointer speed and scroll speed kick it up
        const sp = live && mouse ? Math.hypot(Pt.dx, Pt.dy) / Math.max(dt * 60, 0.5) : 0, dtgt = clamp(Math.max(sp / 25, st.spd / 1500), 0, 1)
        st.dust += (dtgt - st.dust) * (1 - Math.exp(-dt * (dtgt > st.dust ? 12 : 2)))
        st.blur += (Math.min(st.spd / 1200, 1) * 0.018 - st.blur) * (1 - Math.exp(-dt * 8)) // scroll racks focus

        for (let i = 0; i < NW; i++) app[i] = apO[i].v
        U.uTime.value = t; U.uFilm.value = film; U.uBlur.value = st.blur; U.uWeave.value = 0.35 + Math.min(st.spd / 900, 1.4)
        U.uBeam.value = st.lamp * (1 + 0.3 * Math.max(zm.v, 0)); U.uAmb.value = 0.06 * st.room; U.uReel.value = st.reel
        U.uFocus.value = st.focus; U.uFocusIdx.value = st.fi; U.uLab.value = st.lab; U.uHero.value = st.hero * (1 - 0.75 * st.focus)
        CU.uTime.value = t; CU.uAlpha.value = st.lamp * (1 - sstep(0.2, 0.6, f)) * (0.9 + 0.5 * Math.max(zm.v, 0)); CU.uDust.value = 0.25 + 0.75 * st.dust
        reelSpin += dt * 2.2
        body.children.forEach((c) => { if (c.userData.reel) c.rotation.x = reelSpin })
        bodyMat.color.setScalar(0.05 + 0.2 * st.room); lensMat.color.setScalar(0.05 + 0.95 * st.lamp)
        glow.material.opacity = st.lamp * (1 - oa); glow.scale.setScalar(1.2 + 1.6 * st.lamp + 0.8 * Math.max(zm.v, 0))
        ctx.crt.push = Math.max(Math.min(st.spd / 3000, 0.7), f * (1 - f) * 2.4)
      }

      return {
        scene, camera, update,
        resize(w, h) { layout(w, h) },
        tap() {
          if (!st.opened) { skip(); return }
          if (st.busy) return
          let i = -1
          if (st.hov >= 0 && st.focus > 0.5) i = st.hov
          else if (pointerP()) { qOf(st.film || 0); i = cellAt(pq.x, pq.y, ctx.touch ? 0.1 : 0.02) }
          if (i >= 0) go(i)
        },
        focus(i) { st.fo = i },
        activate(i) { if (!st.opened) skip(); if (!st.busy) go(i) },
        back() {
          gsap.to(st, { fly: 0, duration: 0.8, ease: 'power3.out', overwrite: 'auto', onComplete() { st.busy = false; st.flyIdx = -1; st.cool = 0.5 } })
          st.want = -1; st.hov = -1; setFocus(-1)
        },
        dispose() {
          gsap.killTweensOf(st); apO.forEach((o) => gsap.killTweensOf(o)); tl.kill()
          ctx.cursor.hover(false); ctx.crt.push = 0
          geos.forEach((g) => g.dispose()); coneGeo.dispose(); overlay.geometry.dispose()
          mats.forEach((m) => m.dispose()); coneMat.dispose(); overlayMat.dispose(); bodyMat.dispose(); lensMat.dispose(); glow.material.dispose()
          heroTex.dispose(); labTex.dispose(); glowTex.dispose()
        },
      }
    },
  })
})()
