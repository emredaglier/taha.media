// THROWAWAY prototype 'Pinscreen' v2. Contract: docs/design/home/CONTRACT.md.
// A pin-art wall of ~58k pins (one InstancedMesh). Two passes:
//  1. FIELD pass: one full-screen quad renders a cell-resolution texture (colour + height per pin) from the pictures, the hero
//     type, the hand (dent / dome / groove / waves from a CPU state texture), scroll, breathing, swaps, the level meter.
//  2. DISPLAY pass: the instanced pins read that texture in the vertex shader (their own height + 6 neighbours), light themselves
//     from a light that follows the pointer, and draw only the sides the camera can see and that are not hidden by a neighbour.
;(function () {
  'use strict'
  const FOV = 36
  const TAN = Math.tan((FOV * Math.PI) / 360)
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))
  const PPP = 2 // canvas pixels per pin for the hero and label type

  // halve a canvas until it is about the target size, so thin strokes keep their weight
  function shrink(src, dw, dh) {
    let c = src
    while (c.width / 2 >= dw && c.height / 2 >= dh) {
      const n = document.createElement('canvas'); n.width = c.width >> 1; n.height = c.height >> 1
      const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, n.width, n.height); c = n
    }
    return c
  }
  // draw type five times a hair apart: bolder strokes survive the pin grid
  function blit(g, src, x, y, w, h) {
    const s = shrink(src, w, h); g.imageSmoothingQuality = 'high'
    const o = [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]
    for (let i = 0; i < 5; i++) g.drawImage(s, x + o[i][0], y + o[i][1], w, h)
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // FIELD pass: out = (pin top colour, pin height in cells)
  const FIELD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }'
  const FIELD_FS = `
    precision highp float; precision highp sampler2D;
    uniform vec2 uGrid, uReelS, uSwapW;
    uniform vec3 uSwap;
    uniform vec4 uTile[8]; uniform vec4 uRect[8]; uniform float uHov[8]; uniform float uPerm[8];
    uniform vec4 uHeroR, uStrip;
    uniform sampler2D tAtlas, tHero, tLabel, tState, tReel;
    uniform float uHS, uHeroK, uHeroH, uLabelA, uLabelH, uRelief, uPunch, uSink, uFly, uScrollA, uScrollP, uTime, uWipe, uStyleA, uStyleB;
    varying vec2 vUv;

    vec4 rectOf(float k){ vec4 r = uRect[0]; for (int j = 1; j < 8; j++) { if (abs(float(j) - k) < .5) r = uRect[j]; } return r; }
    vec3 atl(vec4 r, vec2 loc){ return texture2D(tAtlas, r.xy + clamp(loc, vec2(.004), vec2(.996)) * r.zw).rgb; }
    float lum(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
    float openX(vec2 p){ float d = length((p - uGrid * .5) / (uGrid * .5)); return clamp((uPunch - d) / .34, 0., 1.); }
    float openK(float x){ float e = 1. - pow(1. - x, 3.); return e + .28 * sin(x * 3.14159); }
    float kOf(float s){ return abs(s - 2.) < .5 ? .35 : 1.; }
    float eqLevel(float bi){
      vec4 r = rectOf(bi); float s = 0.;
      for (int a = 0; a < 4; a++) { for (int b = 0; b < 4; b++) { s += lum(atl(r, (vec2(float(a), float(b)) + .5) * .25)); } }
      return clamp((s / 16. - .08) * 1.6, 0., 1.);
    }
    void main(){
      vec2 p = vUv * uGrid;
      float x = openX(p);
      float kc = smoothstep(.08, .65, x);
      float m = smoothstep(0., .12, uWipe * 1.3 - p.x / uGrid.x);
      float sk = mix(kOf(uStyleA), kOf(uStyleB), m);
      float sk2 = mix(1., sk, .5);
      float e = 0., lift = 0., hv = 0., tf = 0., swp = 0., fl = 0.;
      vec3 col = vec3(.165);
      for (int i = 0; i < 8; i++) {
        vec4 t = uTile[i];
        if (p.x >= t.x && p.x < t.z && p.y >= t.y && p.y < t.w) {
          float fi = float(i);
          vec2 sz = t.zw - t.xy; vec2 loc = (p - t.xy) / sz; vec2 ee = vec2(.3) / sz;
          float base = uPerm[i]; float alt = base; float tt = 0.;
          if (abs(fi - uSwap.x) < .5) { alt = uSwapW.y; tt = 1.; }
          else if (abs(fi - uSwap.y) < .5) { alt = uSwapW.x; tt = 1.; }
          float ph = clamp(uSwap.z * 1.7 - (loc.x * .5 + (1. - loc.y) * .5) * .7, 0., 1.) * tt;
          float dp = sin(ph * 3.14159);
          vec4 r = rectOf(ph > .5 ? alt : base);
          vec3 c = (atl(r, loc + vec2(-ee.x, -ee.y)) + atl(r, loc + vec2(ee.x, -ee.y)) + atl(r, loc + vec2(-ee.x, ee.y)) + atl(r, loc + ee)) * .25;
          hv = uHov[i]; fl = uFly * hv; swp = dp;
          e = lum(c) * uRelief * (1. + .6 * hv) * (1. - .9 * fl) * sk;
          lift = hv * 14. + fl * 36.;
          col = pow(c, vec3(.7)) * 1.15 * (1. - .5 * dp);
          tf = 1.;
        }
      }
      if (tf < .5) {
        vec4 hr = uHeroR;
        if (p.x > hr.x && p.x < hr.z && p.y > hr.y && p.y < hr.w) {
          float a = smoothstep(.4, .6, texture2D(tHero, (p - hr.xy) / (hr.zw - hr.xy)).a);
          e += a * uHeroH * uHeroK * sk2;
          col = mix(col, vec3(.93), a * uHeroK);
        }
        float la = smoothstep(.35, .65, texture2D(tLabel, vUv).a) * uLabelA;
        e += la * uLabelH * sk2;
        col = mix(col, vec3(.93), clamp(la, 0., 1.));
        vec4 sr = uStrip;
        if (p.x > sr.x && p.x < sr.z && p.y > sr.y && p.y < sr.w) { // the level meter: eight bars, one per Work
          float u = (p.x - sr.x) / (sr.z - sr.x) * 8.; float bi = floor(u); float f = fract(u);
          float inBar = step(f, .87) * step(.13, f);
          float sub = floor(f * 5.);
          float lvl = eqLevel(clamp(bi, 0., 7.)) * (.72 + .28 * sin(uTime * 7. + bi * 1.9 + sub * 1.3));
          float lit = step((p.y - sr.y) / (sr.w - sr.y), lvl) * inBar;
          e += lit * 5.;
          col = mix(col, vec3(.93), lit);
        }
      }
      // the hand and the waves: state = (dent(+)/dome(-), wave, groove)
      vec4 st = texture2D(tState, vUv);
      vec2 ox = vec2(2. / uGrid.x, 0.), oy = vec2(0., 2. / uGrid.y);
      float rim = clamp((max(texture2D(tState, vUv + ox).r, 0.) + max(texture2D(tState, vUv - ox).r, 0.) + max(texture2D(tState, vUv + oy).r, 0.) + max(texture2D(tState, vUv - oy).r, 0.)) * .25 - max(st.r, 0.), 0., 1.);
      float dent = clamp(st.r, 0., 1.15), dome = clamp(-st.r, 0., 1.), gv = smoothstep(0., .35, st.b);
      float h = 4. + e + lift;
      h = mix(h, -3., dent) + rim * 6. + dome * 18.;
      col *= 1. + .3 * dome;
      h = mix(h, -3.5, gv); col *= 1. - .45 * gv;
      h = mix(h, -2., swp * .9);
      h += st.g * 10. * sk2;
      float hs1 = max(uHS, .2);
      h += uScrollA * (sin(p.y * .2 / hs1 + uScrollP) + .4 * sin(p.y * .47 / hs1 + uScrollP * 1.6 + p.x * .03 / hs1));
      h += 2.2 * sin(p.x * .02 / hs1 + uTime * .45) * sin(p.y * .025 / hs1 - uTime * .37); // slow breathing
      h += 8. * sk2 * exp(-pow((p.x / uGrid.x - (uWipe * 1.3 - .06)) / .035, 2.)) * step(.001, uWipe) * step(uWipe, .999);
      h -= (1. - hv) * (uSink * 6. + uFly * 16.);
      col *= 1. - .5 * uSink * (1. - hv) - .55 * uFly * (1. - hv);
      col = mix(texture2D(tReel, (vUv - .5) * uReelS + .5).rgb * 1.05, col, kc);
      gl_FragColor = vec4(col, h * uHS * openK(x));
    }`

  // ---------------------------------------------------------------------------------------------------------------------
  // DISPLAY pass: instanced pins
  const PIN_VS = `
    precision highp sampler2D;
    uniform sampler2D tField;
    uniform vec2 uGrid;
    uniform vec3 uLight;
    uniform vec4 uFlyRect;
    uniform float uHS, uPunch, uWipe, uStyleA, uStyleB, uFly;
    attribute vec2 aCell;
    varying vec3 vCol; varying vec3 vLd; varying vec3 vN; varying vec3 vW;
    varying vec2 vOff; varying vec2 vSide;
    varying float vDepth, vTopF, vHalf, vShadow, vRound, vLed;

    vec4 F(vec2 p){ return texture2D(tField, clamp(p, vec2(.5), uGrid - .5) / uGrid); }
    void main(){
      vec2 p = aCell + .5;
      vec4 f0 = F(p);
      float h = f0.a;
      float hxp = F(p + vec2(1., 0.)).a, hxm = F(p - vec2(1., 0.)).a, hyp = F(p + vec2(0., 1.)).a, hym = F(p - vec2(0., 1.)).a;
      vec2 cxy = p - uGrid * .5;
      vec3 Ld = normalize(vec3(uLight.xy - cxy, uLight.z));
      float sx = Ld.x >= 0. ? 1. : -1., sy = Ld.y >= 0. ? 1. : -1.;
      float h1x = Ld.x >= 0. ? hxp : hxm, h1y = Ld.y >= 0. ? hyp : hym;
      float h2x = F(p + vec2(2. * sx, 0.)).a, h2y = F(p + vec2(0., 2. * sy)).a;
      float lz = max(Ld.z, .08);
      float tx = max((h1x - h) * abs(Ld.x) / lz, (h2x - h) * abs(Ld.x) / (2. * lz));
      float ty = max((h1y - h) * abs(Ld.y) / lz, (h2y - h) * abs(Ld.y) / (2. * lz));
      float x = clamp((uPunch - length((p - uGrid * .5) / (uGrid * .5))) / .34, 0., 1.);
      float kc = smoothstep(.08, .65, x);
      float m = smoothstep(0., .12, uWipe * 1.3 - p.x / uGrid.x);
      float rnd = mix(abs(uStyleA - 1.) < .5 ? 1. : 0., abs(uStyleB - 1.) < .5 ? 1. : 0., m);
      float led = mix(abs(uStyleA - 2.) < .5 ? 1. : 0., abs(uStyleB - 2.) < .5 ? 1. : 0., m);
      float inFly = uFly * step(uFlyRect.x, p.x) * step(p.x, uFlyRect.z) * step(uFlyRect.y, p.y) * step(p.y, uFlyRect.w);
      float pw = mix(1., mix(mix(.82, .66, led), 1., inFly), kc);
      bool top = normal.z > .5;
      vec2 nn = normal.xy;
      float zb = h;
      if (!top) {
        float hn = F(p + nn).a;
        if (!(hn < h - .02 && dot(nn, cameraPosition.xy - (cxy + nn * .5)) > 0.)) { gl_Position = vec4(2., 2., 2., 1.); return; }
        zb = hn;
      }
      vec3 q;
      q.xy = cxy + position.xy * pw;
      q.z = top ? h : mix(zb, h, position.z + .5);
      vCol = f0.rgb; vLd = Ld;
      vN = normalize(vec3(-vec2(hxp - hxm, hyp - hym) * .3 / max(uHS, .3), 1.));
      vW = q; vOff = position.xy * pw; vHalf = pw * .5; vSide = nn;
      vDepth = (h - q.z) / max(uHS, .3); vTopF = top ? 1. : 0.;
      vShadow = smoothstep(.5, 1.3, max(tx, ty)); vRound = rnd; vLed = led;
      gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.);
    }`
  const PIN_FS = `
    precision highp sampler2D;
    varying vec3 vCol; varying vec3 vLd; varying vec3 vN; varying vec3 vW;
    varying vec2 vOff; varying vec2 vSide;
    varying float vDepth, vTopF, vHalf, vShadow, vRound, vLed;
    void main(){
      vec3 Ld = normalize(vLd);
      vec3 V = normalize(cameraPosition - vW);
      vec3 c;
      if (vTopF > .5) {
        vec2 o = vOff / max(vHalf, .01);
        float r = length(o);
        vec3 Nc = normalize(vec3(normalize(vN).xy + o * .9 * vRound, normalize(vN).z));
        float rel = dot(Nc, Ld) / max(Ld.z, .2);
        float sh = (.45 + .55 * clamp(rel, 0., 1.9)) * (1. - .55 * vShadow);
        c = vCol * sh;
        c += vec3(pow(max(dot(Nc, normalize(Ld + V)), 0.), 36.) * .55 * vRound);   // glossy cap
        c *= 1. - vRound * smoothstep(.95, 1.15, r) * .7;                          // round shoulder
        c = mix(c, vCol * (1.3 - .5 * r * r), vLed);                               // LED: the top glows
      } else {
        float sl = max(dot(normalize(vec3(vSide, 0.)), Ld), 0.);
        c = vCol * (.06 + .6 * sl) * (.15 + .85 * exp(-vDepth * .12));
        float tg = abs(vSide.x) > .5 ? vOff.y : vOff.x;
        c *= 1. - vRound * .5 * pow(abs(tg) / max(vHalf, .01), 2.);
        c *= 1. - .8 * vLed;
      }
      gl_FragColor = vec4(min(c, vec3(.93)), 1.);
    }`

  HOME.register({
    name: 'Pinscreen',
    create(ctx) {
      const P = ctx.pointer, scroll = ctx.scroll, crt = ctx.crt, touch = ctx.touch, renderer = ctx.renderer
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(FOV, 1.6, 0.3, 3000)
      scene.add(camera)
      const tls = []
      const S = { punch: 0, swing: 0, fly: 0, pulse: 0, wipe: 0, swapT: 0 }
      let COLS = 0, ROWS = 0, portrait = false, aspect = 1.6, pw = 1280, ph = 800, hs = 1, US = 1
      let dent = null, dentV = null, wave = null, waveV = null, groove = null, data = null, sTex = null
      let fieldRT = null, geo = null, mesh = null
      let heroTex = null, labelTex = null, labelCv = null, labelG = null
      let zRest = 100, zFront = 100, disposed = false, opened = false, busy = false, forced = -1, focusSlot = -1, sel = -1, lastSel = -1
      let sx = 0, sy = 0, sA = 0, clock = 0, curR = 8, wasDown = false, havePrev = false, prevX = 0, prevY = 0, prevGX = 0, prevGY = 0
      let lastPx = 0, lastPy = 0, lastHit = false, flyD = 60, labelFor = -2, labelAmp = 0, lx = 0, ly = 0
      let waveT = 0, waveLive = false, grooveLive = false, wipeOn = false, wipeR = 0, wipeX = 0, wipeY = 0
      let orbY = 0, orbP = 0, orbYt = 0, orbPt = 0, dragging = false, qs = 0, tpx = 0, tpy = 0
      let swapA = -1, swapB = -1, swapTimer = 6, styleA = 0, styleB = 0, tapT = 0, tapX = 0, tapY = 0
      const hv = new Float32Array(8), perm = new Float32Array(8)
      for (let i = 0; i < 8; i++) perm[i] = i
      const tiles = []
      for (let i = 0; i < 8; i++) tiles.push([0, 0, 1, 1])
      const uTile = [], uRect = []
      for (let i = 0; i < 8; i++) { uTile.push(new THREE.Vector4()); uRect.push(new THREE.Vector4().fromArray(ctx.loopRect(i))) }
      const band = { x0: 0, y0: 0, x1: 1, y1: 1 }
      const flyT = new THREE.Vector3(), tgt = new THREE.Vector3(), pos = new THREE.Vector3(), pf = new THREE.Vector3()
      const ray = new THREE.Raycaster(), v2 = new THREE.Vector2(), va = new THREE.Vector3()
      const textCache = {}

      const UF = {
        uGrid: { value: new THREE.Vector2(100, 60) }, uReelS: { value: new THREE.Vector2(1, 1) }, uSwapW: { value: new THREE.Vector2() }, uSwap: { value: new THREE.Vector3(-1, -1, 0) },
        uTile: { value: uTile }, uRect: { value: uRect }, uHov: { value: hv }, uPerm: { value: perm }, uHeroR: { value: new THREE.Vector4() }, uStrip: { value: new THREE.Vector4() },
        tAtlas: { value: ctx.atlas }, tReel: { value: ctx.showreel.texture }, tHero: { value: null }, tLabel: { value: null }, tState: { value: null },
        uHS: { value: 1 }, uHeroK: { value: 1 }, uHeroH: { value: 22 }, uLabelA: { value: 0 }, uLabelH: { value: 22 }, uRelief: { value: 13 }, uPunch: { value: 0 },
        uSink: { value: 0 }, uFly: { value: 0 }, uScrollA: { value: 0 }, uScrollP: { value: 0 }, uTime: { value: 0 }, uWipe: { value: 0 }, uStyleA: { value: 0 }, uStyleB: { value: 0 },
      }
      const UD = {
        tField: { value: null }, uGrid: UF.uGrid, uLight: { value: new THREE.Vector3(-100, 50, 40) }, uFlyRect: { value: new THREE.Vector4() },
        uHS: UF.uHS, uPunch: UF.uPunch, uWipe: UF.uWipe, uStyleA: UF.uStyleA, uStyleB: UF.uStyleB, uFly: UF.uFly,
      }
      const fieldMat = new THREE.ShaderMaterial({ uniforms: UF, vertexShader: FIELD_VS, fragmentShader: FIELD_FS, depthTest: false, depthWrite: false })
      const pinMat = new THREE.ShaderMaterial({ uniforms: UD, vertexShader: PIN_VS, fragmentShader: PIN_FS })
      const fieldScene = new THREE.Scene(), fieldCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
      const fieldGeo = new THREE.PlaneGeometry(2, 2), fieldQuad = new THREE.Mesh(fieldGeo, fieldMat)
      fieldQuad.frustumCulled = false; fieldScene.add(fieldQuad)

      const wrap = (str, max) => { const out = []; let cur = ''; for (const w of str.split(/\s+/)) { if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w } else cur = (cur ? cur + ' ' : '') + w } if (cur) out.push(cur); return out }
      let wideLines = ctx.hero.replace(/\.\s+/g, '.\n').split('\n').filter(Boolean)
      if (wideLines.length < 2) wideLines = wrap(ctx.hero, 28)
      const tallLines = wrap(ctx.hero, 15)

      const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; return t }
      const typeImg = (str, key) => {
        if (!textCache[key]) { const t = ctx.text(str, { size: 200 }); t.texture.dispose(); textCache[key] = { canvas: t.canvas, aspect: t.aspect } }
        return textCache[key]
      }

      // ---- opening: the Showreel is a flat picture, the pins punch through it from the centre ------------------
      const open = gsap.timeline(); tls.push(open)
      open.to(S, { swing: 1, duration: 2.3, ease: 'power2.inOut' }, 0.2)
        .to(S, { punch: 1.8, duration: 1.8, ease: 'power1.inOut' }, 0.45)
        .to(S, { pulse: 0.8, duration: 0.3, ease: 'power2.out' }, 0.6)
        .to(S, { pulse: 0, duration: 1.0, ease: 'power2.inOut' }, 0.9)
      const finish = () => { open.kill(); S.punch = 2; S.swing = 1; S.pulse = 0; opened = true }
      if (ctx.reduced) finish()

      // ---- grid rebuild: only when the pin count changes ------------------------------------------------------
      function build(nc, nr) {
        COLS = nc; ROWS = nr; hs = COLS / 170
        const N = COLS * ROWS, cells = new Float32Array(N * 2)
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { cells[(r * COLS + c) * 2] = c; cells[(r * COLS + c) * 2 + 1] = r }
        const box = new THREE.BoxGeometry(1, 1, 1)
        const g = new THREE.InstancedBufferGeometry()
        g.setAttribute('position', box.attributes.position); g.setAttribute('normal', box.attributes.normal)
        g.setIndex(new THREE.BufferAttribute(new Uint16Array(box.index.array.slice(0, 30)), 1)) // top + 4 sides, no bottom
        g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2))
        g.instanceCount = N
        box.dispose()
        if (mesh) { scene.remove(mesh); geo.dispose() }
        geo = g; mesh = new THREE.Mesh(g, pinMat); mesh.frustumCulled = false; scene.add(mesh)
        dent = new Float32Array(N); dentV = new Float32Array(N); wave = new Float32Array(N); waveV = new Float32Array(N); groove = new Float32Array(N)
        data = new Float32Array(N * 4)
        if (sTex) sTex.dispose()
        sTex = new THREE.DataTexture(data, COLS, ROWS, THREE.RGBAFormat, THREE.FloatType)
        sTex.minFilter = sTex.magFilter = THREE.NearestFilter; sTex.generateMipmaps = false; sTex.needsUpdate = true
        UF.tState.value = sTex; UF.uGrid.value.set(COLS, ROWS); UF.uHS.value = hs
        if (fieldRT) fieldRT.dispose()
        fieldRT = new THREE.WebGLRenderTarget(COLS, ROWS, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false })
        UD.tField.value = fieldRT.texture
        if (labelTex) labelTex.dispose()
        labelCv = document.createElement('canvas'); labelCv.width = COLS * PPP; labelCv.height = ROWS * PPP
        labelG = labelCv.getContext('2d'); labelTex = tex(labelCv); UF.tLabel.value = labelTex
        waveLive = grooveLive = false; waveT = 0
      }

      // ---- layout in pin units: 4x2 mosaic (2x4 on a portrait phone), hero in the band, level meter along the bottom ------
      function layout() {
        US = portrait ? COLS / 57 : ROWS / 100
        const g = 1.4 * US
        const lines = portrait ? tallLines : wideLines, n = lines.length
        const imgs = lines.map((l, k) => typeImg(l, 'h' + k + (portrait ? 't' : 'w')))
        const maxA = Math.max.apply(null, imgs.map((m) => m.aspect)), vf = 0.55 * (n - 1) + 0.5, kk = 0.55 * (n - 1) + 1
        const stripH = Math.max(5, ROWS * (portrait ? 0.045 : 0.055)), stripY = 1.5 * US
        const botM = stripY + stripH + 3 * US
        let tw, th, topM
        if (!portrait) {
          const mx = Math.max(5 * US, COLS * 0.04)
          topM = Math.max(6 * US, (ROWS * (ctx.touch ? 70 : 90)) / ph)
          const need = ((COLS - 2 * mx) / maxA) * vf + 2 * US
          tw = (COLS - 2 * mx - 3 * g) / 4
          th = (ROWS - topM - botM - need - 2 * g) / 2
          if ((th * 16) / 9 < tw) tw = (th * 16) / 9
          th = (tw * 9) / 16
          const xs = (COLS - (4 * tw + 3 * g)) / 2
          for (let i = 0; i < 8; i++) {
            const c = i % 4, r = i >> 2, x0 = xs + c * (tw + g)
            const y1 = r === 0 ? ROWS - topM : botM + th
            tiles[i] = [x0, y1 - th, x0 + tw, y1]
          }
          band.x0 = mx; band.x1 = COLS - mx; band.y0 = botM + th + g; band.y1 = ROWS - topM - th - g
        } else {
          const mx = 3 * US
          topM = (ROWS * 132) / ph
          tw = (COLS - 2 * mx - g) / 2; th = (tw * 9) / 16
          const bandMin = 26 * US
          if (4 * th + 4 * g + bandMin > ROWS - topM - botM) { th = (ROWS - topM - botM - 4 * g - bandMin) / 4; tw = (th * 16) / 9 }
          const xs = (COLS - (2 * tw + g)) / 2
          const ys = [ROWS - topM - th, ROWS - topM - 2 * th - g, botM + th + g, botM]
          for (let i = 0; i < 8; i++) { const c = i % 2, r = i >> 1, x0 = xs + c * (tw + g); tiles[i] = [x0, ys[r], x0 + tw, ys[r] + th] }
          band.x0 = mx; band.x1 = COLS - mx; band.y0 = ys[2] + th + g; band.y1 = ys[1] - g
        }
        for (let i = 0; i < 8; i++) uTile[i].set(tiles[i][0], tiles[i][1], tiles[i][2], tiles[i][3])
        UF.uStrip.value.set(band.x0, stripY, band.x1, stripY + stripH)
        // hero: serif, raised type, drawn once into a canvas at 2 px per pin and thresholded in the shader
        const bw = band.x1 - band.x0, bh = band.y1 - band.y0
        const Lh = Math.min(bw / maxA, (bh - 1) / vf), rw = Lh * maxA, rh = Lh * kk
        const cw = Math.max(8, Math.round(rw * PPP)), chh = Math.max(8, Math.round(rh * PPP))
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = chh
        const cg = cv.getContext('2d')
        imgs.forEach((m, k) => { const w = Lh * m.aspect * PPP, h = Lh * PPP; blit(cg, m.canvas, (cw - w) / 2, k * 0.55 * Lh * PPP, w, h) })
        if (heroTex) heroTex.dispose()
        heroTex = tex(cv); UF.tHero.value = heroTex
        const cy = (band.y0 + band.y1) / 2
        UF.uHeroR.value.set((COLS - rw) / 2, cy - rh / 2, (COLS + rw) / 2, cy + rh / 2)
        const a = COLS / ROWS, rs = a >= 16 / 9 ? [1, 16 / 9 / a] : [a / (16 / 9), 1]
        UF.uReelS.value.set(rs[0], rs[1])
      }

      // wall fit: frontal for the opening, slightly from the side (~12 deg) for rest, inside what the glass shows
      const YAW0 = 0.21, PITCH0 = 0.06
      const poseAt = (out, yaw, pitch, Z, t) => out.set(t.x + Z * Math.sin(yaw) * Math.cos(pitch), t.y + Z * Math.sin(pitch), t.z + Z * Math.cos(yaw) * Math.cos(pitch))
      function fit() {
        camera.aspect = aspect; camera.updateProjectionMatrix()
        const run = (yaw, pitch, lxm, lym) => {
          let Z = Math.max(COLS / (2 * TAN * aspect), ROWS / (2 * TAN))
          for (let it = 0; it < 90; it++) {
            poseAt(camera.position, yaw, pitch, Z, tgt.set(0, 0, 0)); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true)
            let ok = true
            for (let c = 0; c < 4; c++) { va.set(c & 1 ? COLS / 2 : -COLS / 2, c & 2 ? ROWS / 2 : -ROWS / 2, 0).project(camera); if (Math.abs(va.x) > lxm || Math.abs(va.y) > lym) ok = false }
            if (ok) break
            Z *= 1.015
          }
          return Z
        }
        zFront = run(0, 0, 0.985, 0.985); zRest = run(YAW0, PITCH0, 0.95, 0.86)
      }

      function pickTile(px, py) {
        for (let i = 0; i < 8; i++) {
          const t = tiles[i], e = i === sel ? 2 * US : 0
          if (px >= t[0] - e && px < t[2] + e && py >= t[1] - e && py < t[3] + e) return i
        }
        return -1
      }
      const inHero = (px, py) => { const r = UF.uHeroR.value; return px > r.x - US && px < r.z + US && py > r.y - US && py < r.w + US }

      // ---- the state field (CPU): dent / dome spring, wave equation with reflecting edges, groove that heals ---------------
      function stampHard(cx, cy, R, D) {
        const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(COLS - 1, Math.ceil(cx + R)), y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(ROWS - 1, Math.ceil(cy + R)), R2 = R * R
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy
          if (d2 >= R2) continue
          let f = 1 - d2 / R2; f *= f
          const i = y * COLS + x, val = D * f
          if (dent[i] < val) dent[i] += (val - dent[i]) * 0.6
        }
      }
      function simDent(dt, active, px, py, D, R) {
        const n = dent.length, kr = 13, c = 4.4 // ~1.5 s to settle
        for (let i = 0; i < n; i++) {
          const a = dent[i], v0 = dentV[i]
          if (a < 1e-4 && a > -1e-4 && v0 < 1e-4 && v0 > -1e-4) { dent[i] = 0; dentV[i] = 0; continue }
          const v = v0 + (-kr * a - c * v0) * dt; dentV[i] = v; dent[i] = a + v * dt
        }
        if (!active) { havePrev = false; return }
        if (havePrev && D > 0) {
          const dist = Math.hypot(px - prevX, py - prevY), steps = Math.min(80, Math.ceil(dist / 2))
          for (let s = 0; s < steps; s++) { const k = s / steps; stampHard(prevX + (px - prevX) * k, prevY + (py - prevY) * k, R, D * 0.85) }
        }
        const x0 = Math.max(0, Math.floor(px - R)), x1 = Math.min(COLS - 1, Math.ceil(px + R)), y0 = Math.max(0, Math.floor(py - R)), y1 = Math.min(ROWS - 1, Math.ceil(py + R)), R2 = R * R
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - px, dy = y + 0.5 - py, d2 = dx * dx + dy * dy
          if (d2 >= R2) continue
          let f = 1 - d2 / R2; f *= f
          const i = y * COLS + x
          dentV[i] += (130 * f * (D - dent[i]) - 12 * f * dentV[i]) * dt
        }
        prevX = px; prevY = py; havePrev = true
      }
      function ring(cx, cy, amp) { // drop a bump: it spreads as a ring, reflects off the edges and interferes with other rings
        const s = 2.5 * US, R = s * 3, x0 = Math.max(1, Math.floor(cx - R)), x1 = Math.min(COLS - 2, Math.ceil(cx + R)), y0 = Math.max(1, Math.floor(cy - R)), y1 = Math.min(ROWS - 2, Math.ceil(cy + R))
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy
          wave[y * COLS + x] += amp * Math.exp(-(dx * dx + dy * dy) / (2 * s * s))
        }
        waveT = 5; waveLive = true
      }
      function stepWaves(dt) {
        if (!waveLive) return
        waveT -= dt
        if (waveT <= 0) { wave.fill(0); waveV.fill(0); waveLive = false; return }
        const C = COLS, R = ROWS, c = COLS * 0.3, c2 = c * c, gam = 0.55
        const n = Math.max(1, Math.ceil((dt * c) / 0.55)), h = dt / n
        for (let s = 0; s < n; s++) {
          for (let y = 1; y < R - 1; y++) {
            const row = y * C
            for (let x = 1; x < C - 1; x++) {
              const i = row + x
              waveV[i] += (c2 * (wave[i - 1] + wave[i + 1] + wave[i - C] + wave[i + C] - 4 * wave[i]) - gam * waveV[i]) * h
            }
          }
          for (let i = C; i < wave.length - C; i++) wave[i] += waveV[i] * h
          for (let x = 0; x < C; x++) { wave[x] = wave[C + x]; wave[(R - 1) * C + x] = wave[(R - 2) * C + x] }
          for (let y = 0; y < R; y++) { wave[y * C] = wave[y * C + 1]; wave[y * C + C - 1] = wave[y * C + C - 2] }
        }
      }
      function stampGroove(cx, cy, r) {
        const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(COLS - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(ROWS - 1, Math.ceil(cy + r)), r2 = r * r
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy
          if (d2 < r2) groove[y * COLS + x] = 1
        }
        grooveLive = true
      }
      function decayGroove(dt) { // an engraving stays about 6 s, then heals
        if (!grooveLive) return
        let any = false
        const k = dt / 6
        for (let i = 0; i < groove.length; i++) { const g = groove[i]; if (g > 0) { const v = g - k; groove[i] = v > 0 ? v : 0; if (v > 0) any = true } }
        grooveLive = any
      }
      function wipeStep(dt) {
        wipeR += dt * COLS * 0.7
        const r = wipeR, x0 = Math.max(0, Math.floor(wipeX - r)), x1 = Math.min(COLS - 1, Math.ceil(wipeX + r)), y0 = Math.max(0, Math.floor(wipeY - r)), y1 = Math.min(ROWS - 1, Math.ceil(wipeY + r)), r2 = r * r
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - wipeX, dy = y + 0.5 - wipeY
          if (dx * dx + dy * dy < r2) groove[y * COLS + x] = 0
        }
        if (wipeR > Math.hypot(COLS, ROWS)) wipeOn = false
      }

      // ---- title + kind/year, raised in the band next to the hovered block ----------------------------------------------
      function drawLabel(slot) {
        labelG.clearRect(0, 0, labelCv.width, labelCv.height)
        if (slot < 0) return
        const w = perm[slot]
        const ti = typeImg(ctx.works[w].title, 't' + w), mi = typeImg(ctx.works[w].kind + '  ·  ' + ctx.works[w].year, 'm' + w)
        const bw = band.x1 - band.x0, bh = band.y1 - band.y0
        let Lt = Math.min(bh * 0.5, 34 * US)
        if (Lt * ti.aspect > bw) Lt = bw / ti.aspect
        let Lm = Lt * 0.5
        if (Lm * mi.aspect > bw) Lm = bw / mi.aspect
        const wT = Lt * ti.aspect, wM = Lm * mi.aspect, wmax = Math.max(wT, wM), tl = tiles[slot], dm = Lm * 0.85
        let xl
        if (portrait) xl = (COLS - wmax) / 2
        else xl = slot % 4 < 2 ? Math.max(band.x0, Math.min(tl[0], band.x1 - wmax)) : Math.min(band.x1 - wmax, Math.max(band.x0, tl[2] - wmax))
        const total = Lt + dm
        let yTop
        if (portrait) yTop = (band.y0 + band.y1) / 2 + total / 2
        else if (slot < 4) yTop = band.y1
        else yTop = band.y0 + total
        const toY = (y) => (ROWS - y) * PPP
        blit(labelG, ti.canvas, (xl + (wmax - wT) / 2) * PPP, toY(yTop), wT * PPP, Lt * PPP)
        blit(labelG, mi.canvas, (xl + (wmax - wM) / 2) * PPP, toY(yTop - Lt * 0.9), wM * PPP, Lm * PPP)
        labelTex.needsUpdate = true
      }

      function dive(slot) {
        if (busy || slot < 0) return
        busy = true; forced = slot
        const t = tiles[slot], th = t[3] - t[1], tw = t[2] - t[0]
        flyT.set((t[0] + t[2]) / 2 - COLS / 2, (t[1] + t[3]) / 2 - ROWS / 2, 57 * hs)
        flyD = Math.max(th * 1.03, (tw * 1.03) / aspect) / (2 * TAN)
        UD.uFlyRect.value.set(t[0], t[1], t[2], t[3])
        const w = perm[slot]
        const tl = gsap.timeline({ onComplete: () => ctx.enter(w) }); tls.push(tl)
        tl.to(S, { fly: 1, duration: 0.85, ease: 'power2.in' }, 0)
          .to(S, { pulse: 0.9, duration: 0.4, ease: 'power2.out' }, 0)
          .to(S, { pulse: 0, duration: 0.45, ease: 'power1.in' }, 0.4)
        ring((t[0] + t[2]) / 2, (t[1] + t[3]) / 2, 1.6)
      }
      const skip = () => { if (opened) return false; finish(); return true }
      function cycleStyle() { // tapping the hero cycles the pin material with a wave wipe
        if (S.wipe > 0) return
        styleB = (styleB + 1) % 3
        const tl = gsap.timeline({ onComplete: () => { styleA = styleB; S.wipe = 0 } }); tls.push(tl)
        tl.to(S, { wipe: 1, duration: 1.1, ease: 'power1.inOut' }, 0)
      }
      function startSwap() { // two Works trade places: pins sink in a diagonal wave and rise with the other picture
        let a = Math.floor(Math.random() * 8), b = Math.floor(Math.random() * 7); if (b >= a) b++
        swapA = a; swapB = b; S.swapT = 0
        const tl = gsap.timeline({ onComplete: () => { const t = perm[swapA]; perm[swapA] = perm[swapB]; perm[swapB] = t; swapA = swapB = -1; S.swapT = 0; swapTimer = 5 + Math.random() * 3; labelFor = -2 } }); tls.push(tl)
        tl.to(S, { swapT: 1, duration: 1.6, ease: 'power1.inOut' }, 0)
      }

      return {
        scene, camera,
        update(t, dt) {
          if (disposed || !mesh) return
          dt = Math.min(dt, 0.05); clock += dt
          if (!opened && open.progress() >= 1) opened = true
          const inside = P.inside || P.down

          // pointer -> wall coordinates (previous frame's camera is close enough)
          ray.setFromCamera(v2.set(P.nx, P.ny), camera)
          const d = ray.ray.direction, o = ray.ray.origin, pz = hs * 10
          let hit = false, px = 0, py = 0
          if (d.z < -0.01) { const k = (pz - o.z) / d.z; px = o.x + d.x * k + COLS / 2; py = o.y + d.y * k + ROWS / 2; hit = px > -2 && px < COLS + 2 && py > -2 && py < ROWS + 2 }
          lastPx = px; lastPy = py; lastHit = hit

          // scroll dollies toward the pointer (whole wall -> single pins)
          const q = clamp(scroll.y * 0.00055, 0, 1)
          qs = damp(qs, q, 4, dt)
          const qe = qs * qs * (3 - 2 * qs)

          // hover / focus
          const ready = S.punch > 1.6
          const hovIdx = !touch && inside && hit && ready && !busy && qe < 0.5 ? pickTile(px, py) : -1
          sel = busy ? forced : hovIdx >= 0 ? hovIdx : focusSlot
          if ((sel >= 0) !== (lastSel >= 0)) ctx.cursor.hover(sel >= 0)
          lastSel = sel
          let hvMax = 0
          for (let i = 0; i < 8; i++) { hv[i] = damp(hv[i], sel === i ? 1 : 0, sel === i ? 7 : 5, dt); if (hv[i] > hvMax) hvMax = hv[i] }
          if (labelFor !== sel && labelAmp < 0.05) { drawLabel(sel); labelFor = sel }
          labelAmp = damp(labelAmp, labelFor === sel && sel >= 0 ? 1 : 0, labelFor === sel ? 7 : 16, dt)

          // the hand: hover pulls a soft dome, pressing pushes a deep dent, a pressed path stays engraved
          const down = P.down && inside
          const active = hit && ready && !busy && (touch ? down : inside)
          const R0 = Math.max(5, COLS * 0.045)
          curR = damp(curR, down ? R0 : R0 * 1.5, 9, dt)
          if (down && !wasDown) {
            if (hit && ready && !busy) {
              ring(px, py, 1.4)
              dragging = pickTile(px, py) < 0 // a drag that starts on empty wall orbits the camera
              prevGX = px; prevGY = py
            }
          }
          if (!down) dragging = false
          wasDown = down
          simDent(dt, active, px, py, down ? 1.05 : -0.9, curR)
          if (down && active) {
            const r = Math.max(1.6, COLS * 0.007), dist = Math.hypot(px - prevGX, py - prevGY), steps = Math.min(120, Math.max(1, Math.ceil(dist / (r * 0.8))))
            for (let s = 1; s <= steps; s++) { const k = s / steps; stampGroove(prevGX + (px - prevGX) * k, prevGY + (py - prevGY) * k, r) }
            prevGX = px; prevGY = py
          }
          decayGroove(dt)
          if (wipeOn) wipeStep(dt)
          stepWaves(dt)
          for (let i = 0, n = dent.length; i < n; i++) { const j = i * 4; data[j] = dent[i]; data[j + 1] = wave[i]; data[j + 2] = groove[i] }
          sTex.needsUpdate = true

          // life at rest: two Works trade places every few seconds
          swapTimer -= dt
          if (opened && !busy && swapA < 0 && swapTimer <= 0 && hvMax < 0.05 && qe < 0.2 && !down && S.wipe === 0) startSwap()
          if (swapA >= 0) UF.uSwapW.value.set(perm[swapA], perm[swapB])
          UF.uSwap.value.set(swapA, swapB, S.swapT)

          // scroll: rolling rows of pins, glass push
          const sT = Math.min(1, Math.abs(scroll.v) / 1400) * 8
          sA = damp(sA, sT, sT > sA ? 5 : 1.5, dt)
          crt.push = Math.min(1, (sA / 8) * 0.8 + (down ? 0.25 : 0) + S.pulse * 0.6 + S.fly * 0.4)

          // light follows the pointer (a raking light from its side), eased; drifts when idle
          const lt = inside && hit ? [px - COLS / 2, py - ROWS / 2] : [COLS * (-0.35 + 0.1 * Math.sin(clock * 0.3)), ROWS * (0.3 + 0.1 * Math.cos(clock * 0.25))]
          lx = damp(lx, lt[0], 4, dt); ly = damp(ly, lt[1], 4, dt)
          UD.uLight.value.set(lx, ly, COLS * 0.11)

          // camera: tilt, pointer parallax, drag orbit (up to ~40 deg, eases back), scroll dolly, dive onto a block
          if (dragging && down) {
            orbYt = clamp(orbYt + P.dx * 0.0045, -0.7, 0.7)
            if (!touch) orbPt = clamp(orbPt + P.dy * 0.0045, -0.7, 0.7)
          } else { orbYt = damp(orbYt, 0, 2.2, dt); orbPt = damp(orbPt, 0, 2.2, dt) }
          orbY = damp(orbY, orbYt, 10, dt); orbP = damp(orbP, orbPt, 10, dt)
          sx = damp(sx, inside ? P.nx : 0, 3, dt); sy = damp(sy, inside ? P.ny : 0, 3, dt)
          if (hit) { tpx = damp(tpx, px - COLS / 2, 5, dt); tpy = damp(tpy, py - ROWS / 2, 5, dt) }
          const sw = S.swing, fl = S.fly
          const yaw = (YAW0 + sx * 0.17) * sw * (1 - fl) + orbY * sw * (1 - fl), pitch = (PITCH0 + sy * 0.1) * sw * (1 - fl) + orbP * sw * (1 - fl)
          const zMac = hs * 40 + 18, zr = zFront * 0.985 + (zRest - zFront * 0.985) * sw
          const Z = zr * Math.pow(Math.max(zMac / zr, 0.01), qe)
          tgt.set(tpx * 0.9 * qe, tpy * 0.9 * qe, 0)
          poseAt(pos, yaw, pitch, Z, tgt)
          if (fl > 0) { pf.set(flyT.x, flyT.y, flyT.z + flyD); pos.lerp(pf, fl); tgt.lerp(flyT, fl) }
          camera.position.copy(pos); camera.lookAt(tgt); camera.updateMatrixWorld(true)

          // uniforms, then the field pass into its render target
          UF.uPunch.value = S.punch; UF.uFly.value = S.fly; UF.uTime.value = clock
          UF.uSink.value = hvMax * hvMax * (3 - 2 * hvMax)
          UF.uHeroK.value = 1 - 0.75 * hvMax
          UF.uLabelA.value = labelAmp
          UF.uScrollA.value = sA; UF.uScrollP.value = scroll.y * 0.012
          UF.uWipe.value = S.wipe; UF.uStyleA.value = styleA; UF.uStyleB.value = styleB
          const prev = renderer.getRenderTarget()
          renderer.setRenderTarget(fieldRT); renderer.render(fieldScene, fieldCam); renderer.setRenderTarget(prev)
        },
        resize(w, h) {
          pw = w; ph = h; aspect = w / h
          const por = aspect < 0.95
          let nc, nr
          if (por) { nc = touch ? 100 : 130; nr = clamp(Math.round(nc / aspect), 150, 300) }
          else { nr = touch ? 100 : 180; nc = clamp(Math.round(nr * aspect), touch ? 150 : 220, touch ? 230 : 400) }
          if (nc !== COLS || nr !== ROWS || por !== portrait) { portrait = por; build(nc, nr) }
          portrait = por
          layout(); fit()
          labelFor = -2
        },
        tap() {
          if (skip() || busy) return
          const now = performance.now()
          if (lastHit) {
            const i = pickTile(lastPx, lastPy)
            if (i >= 0) { dive(i); return }
            if (inHero(lastPx, lastPy)) { cycleStyle(); tapT = 0; return }
            if (now - tapT < 450 && Math.hypot(lastPx - tapX, lastPy - tapY) < COLS * 0.08) { // double tap on empty wall wipes the engraving with a wave
              wipeOn = true; wipeR = 0; wipeX = lastPx; wipeY = lastPy; ring(lastPx, lastPy, 2.4); tapT = 0; return
            }
            tapT = now; tapX = lastPx; tapY = lastPy
          }
        },
        focus(i) { focusSlot = i < 0 ? -1 : perm.indexOf(i) },
        activate(i) { skip(); dive(perm.indexOf(i)) },
        back() {
          const tl = gsap.timeline({ onComplete: () => { busy = false; forced = -1 } }); tls.push(tl)
          tl.to(S, { fly: 0, duration: 0.9, ease: 'power2.inOut' }, 0).to(S, { pulse: 0.5, duration: 0.3 }, 0).to(S, { pulse: 0, duration: 0.6 }, 0.3)
        },
        dispose() {
          disposed = true
          tls.forEach((x) => x.kill()); gsap.killTweensOf(S)
          if (geo) geo.dispose()
          pinMat.dispose(); fieldMat.dispose(); fieldGeo.dispose()
          if (fieldRT) fieldRT.dispose()
          if (sTex) sTex.dispose(); if (heroTex) heroTex.dispose(); if (labelTex) labelTex.dispose()
        },
      }
    },
  })
})()
