// THROWAWAY prototype: Pinboard. The wall above Taha's desk: a felt board in a thin frame, lit by a desk lamp from below.
// The eight Works are 16:9 prints (live loops) pinned among storyboard strips, sticky notes, tape, a clip, a calendar and
// threads of string. Every sheet hangs from its pin(s) on a CPU hinge model (lift angle + curl + twist + pendulum, drawn by
// the vertex shader); a soft shadow quad per sheet shifts up and spreads as the sheet lifts. The pointer is a draught
// (a fast sweep sends a wave of lifting paper across the wall), press and drag pulls a sheet off the board and it slaps back.
// Scroll pans the camera along the board (portrait: down it) and blows a gust. Hover: the print goes taut, flat and rises to
// 36% of the view width (80% portrait), the lamp concentrates on it, a label card sits beside it. Fly-in: it leaves its pins and
// fills the view. Opening: the Showreel fills the view, is pinned up (drops, swings), the camera pulls back, the rest falls in.
// FAKE: every note text, date, storyboard scribble, name on the calendar. Nothing here is real content.
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const lerp = (a, b, t) => a + (b - a) * t
  const FOV = 40, TN = Math.tan((FOV * Math.PI) / 360)
  const IW = 3.9, IH = (IW * 9) / 16, BD = 0.17, PW = IW + 2 * BD, PH = IH + 2 * BD // a print: image, border, outer
  const RW = 5.7, RH = (RW * 9) / 16, RPW = RW + 0.4, RPH = RH + 0.4 // the Showreel print
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

  // ---------------------------------------------------------------------------------------------------- shaders
  const LAMP = `
    uniform vec4 uLamp, uSpot;
    float lampAt(vec2 p){
      vec2 q = (p - uLamp.xy) / vec2(15., 10.5);
      float l = .3 + .8 * exp(-dot(q, q));
      vec2 d = (p - uSpot.xy) / uSpot.z;
      l += uSpot.w * exp(-dot(d, d));
      return l * (1. - uLamp.z * .5);
    }`
  const PVS = `
    uniform float uTheta, uCurl, uTwist, uFlut, uPh, uTime, uK;
    uniform vec2 uSize; uniform vec4 uT;
    varying vec2 vUv; varying vec3 vW, vN; varying float vR;
    void main(){
      vUv = uv;
      float s = -position.y;
      float x = position.x;
      float h = uSize.y;
      float r = s / h;
      float th = uTheta;
      float c = uCurl;
      float py;
      float pz;
      if (abs(c) < .002) { py = -s * cos(th); pz = s * sin(th); }
      else { py = -(sin(th + c * s) - sin(th)) / c; pz = (cos(th) - cos(th + c * s)) / c; }
      float ph = th + c * s;
      float wv = x * 2.2 + s * 1.6 + uTime * 7. + uPh;
      pz += x * uTwist * r + sin(wv) * uFlut * r * r;
      float dz = uTwist * r + cos(wv) * 2.2 * uFlut * r * r;
      vec3 n = normalize(vec3(-dz * cos(ph), sin(ph), cos(ph)));
      vec3 wp = (modelMatrix * vec4(x, py, pz, 1.)).xyz;
      vec3 wn = normalize(mat3(modelMatrix) * n);
      float xs = clamp(uK * 1.5 - r * .5, 0., 1.), wg = xs * xs * (3. - 2. * xs);
      if (wg > 0.) {
        float sc = uT.w / uSize.x;
        vec3 tp = vec3(uT.x + x * sc, uT.y + (position.y + h * .5) * sc, uT.z + sin(r * 8. - uTime * 26.) * .12 * wg * (1. - wg) * 4.);
        wp = mix(wp, tp, wg); wn = normalize(mix(wn, vec3(0., 0., 1.), wg));
      }
      vR = r; vW = wp; vN = wn;
      gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
    }`
  const PFS = `
    precision highp float;
    uniform sampler2D uMap; uniform vec4 uRect; uniform vec2 uBorder; uniform float uType, uMine;
    varying vec2 vUv; varying vec3 vW, vN; varying float vR;
    ${LAMP}
    void main(){
      vec3 n = normalize(vN); bool fr = gl_FrontFacing; if (!fr) n = -n;
      float d = dot(n, normalize(vec3(-.25, -.55, .8)));
      float li = mix(lampAt(vW.xy), 1., uMine);
      float shade = mix(.6, 1.06, smoothstep(-.3, .85, d));
      float fold = mix(.8, 1., smoothstep(0., .04, vR));
      vec2 uv = vUv; vec3 col;
      if (uType > .5) {
        if (fr) {
          vec2 iu = (uv - uBorder) / (1. - 2. * uBorder);
          bool inside = iu.x > 0. && iu.x < 1. && iu.y > 0. && iu.y < 1.;
          if (inside) {
            vec3 img = texture2D(uMap, uRect.xy + clamp(iu, .002, .998) * uRect.zw).rgb;
            float e = min(min(iu.x, 1. - iu.x), min(iu.y, 1. - iu.y));
            col = img * (.84 + .22 * li) * mix(.9, 1.06, smoothstep(-.3, .85, d)) * (1. + .14 * uMine) * mix(.72, 1., smoothstep(0., .02, e));
          } else col = vec3(.93) * li * shade * fold;
        } else col = vec3(.82) * li * shade;
      } else {
        vec2 u2 = fr ? uv : vec2(1. - uv.x, uv.y);
        vec4 t = texture2D(uMap, uRect.xy + clamp(u2, .003, .997) * uRect.zw);
        if (t.a < .5) discard;
        col = (fr ? t.rgb : vec3(.8)) * li * shade * fold;
      }
      gl_FragColor = vec4(min(col, vec3(1.)), 1.);
    }`
  const SVS = `
    attribute float aA; varying vec2 vUv; varying float vA;
    void main(){ vUv = uv; vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`
  const SFS = `
    precision highp float; uniform sampler2D uMap; varying vec2 vUv; varying float vA;
    void main(){ gl_FragColor = vec4(0., 0., 0., texture2D(uMap, vUv).a * vA); }`
  const BVS = `
    varying vec3 vW, vN;
    void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`
  const BFS = `
    precision highp float; varying vec3 vW, vN; uniform vec3 uBase; uniform float uKind;
    ${LAMP}
    float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hs(i), hs(i + vec2(1., 0.)), f.x), mix(hs(i + vec2(0., 1.)), hs(i + vec2(1., 1.)), f.x), f.y); }
    void main(){
      float li = lampAt(vW.xy);
      vec3 col;
      if (uKind < .5) { // felt board: grain and a few light flecks
        float g = vn(vW.xy * 13.) * .5 + vn(vW.xy * 41.) * .35 + hs(floor(vW.xy * 70.)) * .25;
        col = uBase * (.7 + .6 * g) + step(.965, hs(floor(vW.xy * 34.))) * .07;
      } else if (uKind < 1.5) { // wall behind
        col = uBase * (.8 + .4 * vn(vW.xy * .6)); li *= .55;
      } else { // frame
        vec3 n = normalize(vN); col = uBase * (.6 + .7 * max(dot(n, normalize(vec3(0., -.6, .8))), 0.));
      }
      gl_FragColor = vec4(min(col * li, vec3(1.)), 1.);
    }`
  const TVS = `
    attribute float aT, aSide, aSag; attribute vec2 aN; uniform float uGust, uTime;
    void main(){
      vec3 p = position; float sn = sin(aT * 3.14159);
      float sg = aSag * (1. + .25 * sin(uTime * 1.3 + aSag * 9.)) + uGust * .5;
      p.y -= sn * sg; p.z += sn * .12 * uGust; p.xy += aN * aSide * .022;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
    }`
  const TFS = `precision highp float; uniform vec4 uLamp; void main(){ gl_FragColor = vec4(vec3(.74) * (1. - uLamp.z * .5), 1.); }`

  // ---------------------------------------------------------------------------------------------------- paper art (one atlas)
  function wob(g, r, x1, y1, x2, y2) {
    const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 14))
    g.moveTo(x1, y1)
    for (let k = 1; k <= n; k++) { const t = k / n; g.lineTo(x1 + (x2 - x1) * t + (r() - 0.5) * 1.6, y1 + (y2 - y1) * t + (r() - 0.5) * 1.6) }
  }
  function box(g, r, x, y, w, h) { g.beginPath(); wob(g, r, x, y, x + w, y); wob(g, r, x + w, y, x + w, y + h); wob(g, r, x + w, y + h, x, y + h); wob(g, r, x, y + h, x, y); g.stroke() }
  function scrib(g, r, x, y, w, h, n) { // fake handwriting: wavy lines
    g.beginPath()
    for (let k = 0; k < n; k++) {
      const yy = y + (k + 0.5) * (h / n); let xx = x; g.moveTo(xx, yy)
      const len = w * (0.55 + r() * 0.45)
      while (xx < x + len) { xx += 4 + r() * 5; g.lineTo(xx, yy + (r() - 0.5) * 4) }
    }
    g.stroke()
  }
  function figure(g, r, cx, cy, s) { // a loose stick figure or a blob, to read as a drawn frame
    g.beginPath()
    if (r() < 0.5) { g.arc(cx, cy - s * 0.5, s * 0.22, 0, 6.3); g.moveTo(cx, cy - s * 0.28); g.lineTo(cx, cy + s * 0.2); g.moveTo(cx - s * 0.3, cy - s * 0.1); g.lineTo(cx + s * 0.3, cy - s * 0.15); g.moveTo(cx, cy + s * 0.2); g.lineTo(cx - s * 0.2, cy + s * 0.55); g.moveTo(cx, cy + s * 0.2); g.lineTo(cx + s * 0.22, cy + s * 0.55) }
    else { g.ellipse(cx, cy, s * 0.5, s * 0.3, r() - 0.5, 0, 6.3); g.moveTo(cx - s * 0.6, cy + s * 0.5); g.lineTo(cx + s * 0.6, cy + s * 0.45) }
    g.stroke()
  }
  function arrow(g, r, x1, y, x2) { g.beginPath(); wob(g, r, x1, y, x2, y); g.moveTo(x2 - 9, y - 6); g.lineTo(x2, y); g.lineTo(x2 - 9, y + 6); g.stroke() }
  const PEN = '#1a1a1a'

  function drawStrip(g, w, h, seed) {
    const r = rng(seed); g.fillStyle = '#ededed'; g.fillRect(0, 0, w, h)
    g.strokeStyle = PEN; g.fillStyle = PEN; g.lineWidth = 2.2; g.lineCap = 'round'
    const pw = (w - 40) / 3
    for (let k = 0; k < 3; k++) {
      const x = 14 + k * (pw + 6), y = 26, bh = h - 78
      box(g, r, x, y, pw - 10, bh); figure(g, r, x + (pw - 10) / 2, y + bh / 2, bh * 0.55)
      g.lineWidth = 1.4; scrib(g, r, x, y + bh + 8, pw - 10, 26, 2); g.lineWidth = 2.2
      g.font = "400 20px 'Instrument Serif', serif"; g.fillText(String(k + 1 + ((seed * 3) % 7)), x + 4, 20)
      if (k < 2) arrow(g, r, x + pw - 8, y + bh / 2, x + pw + 4)
    }
  }
  function drawNote(g, w, h, txt, seed) {
    const r = rng(seed), gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#d6d6d6'); gr.addColorStop(1, '#c4c4c4')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
    g.fillStyle = 'rgba(26,26,26,.1)'; g.fillRect(0, 0, w, 14)
    g.fillStyle = PEN; g.save(); g.translate(w / 2, h * 0.58); g.rotate((r() - 0.5) * 0.14)
    g.font = "400 56px 'Instrument Serif', Georgia, serif"; g.textAlign = 'center'
    const parts = txt.split(' '); parts.forEach((p, k) => g.fillText(p, 0, (k - (parts.length - 1) / 2) * 52 + 14)); g.restore()
  }
  function drawTape(g, w, h, txt) {
    g.fillStyle = '#b9b9b9'; g.beginPath(); g.moveTo(0, 0)
    for (let x = 0; x <= w; x += 12) g.lineTo(x, 0)
    g.lineTo(w, 0); g.lineTo(w - 9, h * 0.25); g.lineTo(w, h * 0.5); g.lineTo(w - 9, h * 0.75); g.lineTo(w, h)
    g.lineTo(0, h); g.lineTo(9, h * 0.75); g.lineTo(0, h * 0.5); g.lineTo(9, h * 0.25); g.closePath(); g.fill()
    g.fillStyle = PEN; g.font = "400 44px 'Instrument Serif', Georgia, serif"; g.textAlign = 'center'; g.fillText(txt, w / 2, h * 0.7)
  }
  function drawClip(g, w, h) {
    g.strokeStyle = '#8f8f8f'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round'
    g.beginPath(); g.moveTo(w * 0.25, h * 0.62); g.lineTo(w * 0.25, h * 0.14); g.arc(w * 0.5, h * 0.14, w * 0.25, Math.PI, 0); g.lineTo(w * 0.75, h * 0.86); g.arc(w * 0.5, h * 0.86, w * 0.25, 0, Math.PI)
    g.lineTo(w * 0.07, h * 0.24); g.arc(w * 0.5, h * 0.24, w * 0.43, Math.PI, 0.1 * Math.PI, false); g.stroke()
  }
  function drawCalendar(g, w, h) {
    g.fillStyle = '#ededed'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, w, 78)
    g.fillStyle = '#ededed'; g.font = "400 54px 'Instrument Serif', Georgia, serif"; g.textAlign = 'center'; g.fillText('Kasım', w / 2, 56) // fake month
    g.fillStyle = PEN; g.font = "400 28px 'Instrument Serif', Georgia, serif"
    const cw = w / 7, rh = (h - 100) / 5
    for (let d = 0; d < 30; d++) {
      const c = d % 7, rr = Math.floor(d / 7), x = c * cw + cw / 2, y = 96 + rr * rh + rh * 0.65
      g.fillText(String(d + 1), x, y)
      if (d < 12) { g.strokeStyle = 'rgba(26,26,26,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 13, y - 22); g.lineTo(x + 13, y + 2); g.stroke() }
      if (d === 19) { g.strokeStyle = PEN; g.lineWidth = 2.6; g.beginPath(); g.ellipse(x, y - 9, 21, 19, 0.3, 0, 6.3); g.stroke() }
    }
  }

  const NOTES = ['Revize 3', 'renk?', 'cuma!', 'müzik bekle', 'kesim 04', 'teslim'] // fake
  const DATES = ['12.11', '04.10', '28.09'] // fake

  // ---------------------------------------------------------------------------------------------------- the world
  HOME.register({
    name: 'Pinboard',
    create(ctx) {
      const size = ctx.size, works = ctx.works, P = ctx.pointer, touch = ctx.touch
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(FOV, size.w / size.h, 0.1, 400)
      scene.add(camera)
      const U = { uLamp: { value: new THREE.Vector4(0, -7, 0, 0) }, uSpot: { value: new THREE.Vector4(0, 0, 3, 0) }, uTime: { value: 0 }, uGust: { value: 0 } }
      const keep = { tex: [], geo: [], mat: [] } // for the life of the example
      const textures = keep.tex
      const hud = new THREE.Group(); camera.add(hud)
      const unit = new THREE.PlaneGeometry(1, 1); keep.geo.push(unit)
      const rects = []; for (let i = 0; i < 8; i++) rects.push(ctx.loopRect(i))

      // shared soft-shadow texture: a rounded box falling off to zero
      const sdf = (() => {
        const N = 64, d = new Uint8Array(N * N * 4)
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const x = Math.abs((i + 0.5) / N * 2 - 1), y = Math.abs((j + 0.5) / N * 2 - 1), e = Math.max(x, y) < 0.78 ? Math.max(x, y) - 0.78 : Math.hypot(Math.max(x - 0.78, 0), Math.max(y - 0.78, 0))
          const a = 1 - clamp(e / 0.22, 0, 1), s = a * a * (3 - 2 * a)
          d.set([0, 0, 0, Math.round(s * 255)], (j * N + i) * 4)
        }
        const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true
        textures.push(t); return t
      })()

      // ---- tags beside the hovered print (HUD children of the camera, in px) ------------------------------------------
      const mkText = (str, opts) => {
        const t = ctx.text(str, opts); textures.push(t.texture)
        const m = new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false }); keep.mat.push(m)
        const mesh = new THREE.Mesh(unit, m); mesh.renderOrder = 61
        return { mesh, mat: m, canvas: t.canvas }
      }
      const PAD = 16
      const tags = works.map((w) => {
        const title = mkText(w.title, { size: 120 }), meta = mkText(`${w.kind} · ${w.year}`, { caps: true, size: 28, color: '#8f8f8f' })
        const plateMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false }); keep.mat.push(plateMat)
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

      // ---- state ---------------------------------------------------------------------------------------------------------
      const O = { zoom: 1, reelMove: 1, reelK: 0 } // opening
      const fly = { k: 0 }
      const E = { slap: 0 } // slap impulse for the glass
      let W = null // the built wall
      let portrait = size.w < size.h
      let Dcam = 14.6, VH = 10.6, VW = 18, camX = 0, camY = 0
      let pan = 0, panS = 0, lastScroll = ctx.scroll.y, lookX = 0, lookY = 0, lampX = 0
      let opening = false, flying = false, flyIdx = -1, hot = -1, hoverOn = false, focusCell = -1
      let cand = -1, dwell = 0, tagCell = 0, tagA = 0, focusA = 0
      let tl = null, flyTl = null, backTw = null, grab = null, wasDown = false, waveT = -9
      const waves = [{ x: 0, y: 0, t0: -99, a: 0 }, { x: 0, y: 0, t0: -99, a: 0 }, { x: 0, y: 0, t0: -99, a: 0 }]
      const F = { vx: 0, vy: 0, sp: 0 }, env = { x: 0, y: 0, sp: 0, on: false, gust: 0 }
      const pose = [], home = []
      for (let i = 0; i < 8; i++) { pose.push({ x: 0, y: 0, w: 0, l: 0, t: 0, init: false }); home.push({ x: 0, y: 0 }) }
      const M4 = new THREE.Matrix4(), V3 = new THREE.Vector3(), Q = new THREE.Quaternion(), SC = new THREE.Vector3(), COL = new THREE.Color()

      // ---- build the wall for the current orientation -------------------------------------------------------------------
      function build() {
        if (W) destroy()
        portrait = size.w < size.h
        const objs = [], sheets = [], pinPts = [], R = rng(7)
        const own = (o) => { objs.push(o); return o }

        // paper atlas
        const arts = []
        const addArt = (key, w, h, draw) => arts.push({ key, w, h, draw })
        const heroLines = portrait ? (() => { const wd = ctx.hero.split(/\s+/), n = 3, tgt = ctx.hero.length / n, out = []; let c = ''; for (const x of wd) { const nx = c ? c + ' ' + x : x; if (c && nx.length > tgt * 1.1 && out.length < n - 1) { out.push(c); c = x } else c = nx } out.push(c); return out })() : [ctx.hero]
        const hts = heroLines.map((l) => ctx.text(l, { size: 200, color: '#1a1a1a' }))
        const heroW = portrait ? 6.7 : 15.4, ta = Math.max(...hts.map((t) => t.aspect))
        const lineH = Math.min((heroW * 0.92) / ta, portrait ? 1.3 : 1.2)
        const heroH = portrait ? lineH * heroLines.length * 0.86 + 0.9 : lineH / 0.62
        const heroArtW = portrait ? 1024 : 1920, heroArtH = Math.round((heroArtW * heroH) / heroW)
        addArt('hero', heroArtW, heroArtH, (g, w, h) => {
          g.fillStyle = '#ededed'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(26,26,26,.07)'; g.fillRect(0, h - 6, w, 6)
          const lh = (lineH / heroH) * h, pitch = portrait ? lh * 0.86 : 0, y0 = h / 2 - (pitch * (heroLines.length - 1)) / 2
          hts.forEach((t, k) => { const wpx = t.aspect * lh; g.drawImage(t.canvas, (w - wpx) / 2, y0 + pitch * k - lh / 2, wpx, lh); t.texture.dispose() })
        })
        for (let k = 0; k < 3; k++) addArt('strip' + k, 920, 300, (g, w, h) => drawStrip(g, w, h, 11 + k * 5))
        for (let k = 0; k < NOTES.length; k++) addArt('note' + k, 256, 256, (g, w, h) => drawNote(g, w, h, NOTES[k], 30 + k))
        for (let k = 0; k < 3; k++) addArt('tape' + k, 256, 90, (g, w, h) => drawTape(g, w, h, DATES[k]))
        addArt('clip', 64, 160, drawClip)
        addArt('cal', 400, 480, drawCalendar)
        let ax = 0, ay = 0, rowH = 0; const AW = 2048
        arts.forEach((a) => { if (ax + a.w > AW) { ax = 0; ay += rowH + 4; rowH = 0 } a.x = ax; a.y = ay; ax += a.w + 4; rowH = Math.max(rowH, a.h) })
        const AH = ay + rowH
        const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH
        const g = cv.getContext('2d'); const art = {}
        arts.forEach((a) => { g.save(); g.translate(a.x, a.y); g.beginPath(); g.rect(0, 0, a.w, a.h); g.clip(); a.draw(g, a.w, a.h); g.restore(); art[a.key] = [a.x / AW, 1 - (a.y + a.h) / AH, a.w / AW, a.h / AH] })
        const atlasTex = new THREE.CanvasTexture(cv); atlasTex.generateMipmaps = false; atlasTex.minFilter = atlasTex.magFilter = THREE.LinearFilter; atlasTex.anisotropy = 4
        own(atlasTex)

        // layout: sheets in z order
        const specs = []; let zc = 0.12
        const add = (sp) => { sp.z = zc; zc += 0.016; sp.pins = sp.pins === undefined ? 1 : sp.pins; specs.push(sp); return sp }
        const print = (i, x, y, tilt) => add({ kind: 'print', work: i, w: PW, h: PH, x, y, tilt, pins: 2, kT: 'print', tex: ctx.atlas, rect: rects[i], bx: BD / PW, by: BD / PH })
        let BW, BH, prints = [], reel, threads
        const strip = (k, x, y, tilt, w, h) => add({ kind: 'art', art: 'strip' + k, w, h: h || (w * 300) / 920, x, y, tilt, pins: 2, kT: 'strip' })
        const note = (k, x, y, tilt) => add({ kind: 'art', art: 'note' + k, w: 1.45, h: 1.45, x, y, tilt, pins: 1, kT: 'note' })
        const tape = (k, x, y, tilt) => add({ kind: 'art', art: 'tape' + k, w: 1.5, h: 0.53, x, y, tilt, pins: 0, kT: 'tape' })
        if (!portrait) {
          BW = 32.8; BH = 9.8
          reel = add({ kind: 'print', work: -1, w: RPW, h: RPH, x: -12.3, y: 2.6, tilt: 0, pins: 2, kT: 'print', tex: ctx.showreel.texture, rect: [0, 0, 1, 1], bx: 0.2 / RPW, by: 0.2 / RPH })
          const pp = [[-6, 2.75, 0.02], [-1.7, 2.45, -0.025], [2.6, 2.8, 0.015], [6.9, 2.5, -0.03], [-8.2, -0.85, -0.02], [-3.6, -1.15, 0.03], [0.9, -0.8, -0.015], [5.4, -1.2, 0.025]]
          prints = pp.map((p, i) => print(i, p[0], p[1], p[2]))
          strip(0, -12.4, -1.5, 0.03, 4.6); strip(1, 10.6, -0.9, -0.025, 4.6); strip(2, 10.4, 3.7, 0.02, 4.4)
          add({ kind: 'art', art: 'cal', w: 2.6, h: 3.12, x: 13.9, y: 3.9, tilt: -0.03, pins: 1, kT: 'cal' })
          ;[[1.3, 4.0, 0.05, 3], [5.2, 4.2, -0.06, 4], [-3.6, 0.6, -0.07, 1], [4.7, 0.75, 0.05, 0], [-9.3, 0.5, 0.06, 5], [-11.2, -2.9, -0.04, 2], [-5.4, -3, 0.05, 3], [2.4, -3, -0.05, 4], [7.9, -3, 0.04, 5], [13, -2.9, -0.06, 0]].forEach((n) => note(n[3], n[0], n[1], n[2]))
          add({ kind: 'art', art: 'hero', w: heroW, h: heroH, x: -8, y: 4.45, tilt: 0, pins: 2, kT: 'strip' })
          tape(0, -7.8, 3.15, 0.6); tape(1, 4.5, 2.95, -0.5); tape(2, -5.3, -2.95, 0.55)
          add({ kind: 'art', art: 'clip', w: 0.42, h: 1.05, x: 2.1, y: -0.55, tilt: 0.1, pins: 0, kT: 'clip' })
          threads = [[0, 1, 0.5], [1, 2, 0.5], [2, 3, 0.45], [4, 5, 0.6], [5, 6, 0.5], [6, 7, 0.55], [1, 5, 0.5], [3, 7, 0.5], [0, 4, 0.5]]
        } else {
          BW = 7.6
          let cy = -0.9
          add({ kind: 'art', art: 'hero', w: heroW, h: heroH, x: 0, y: cy, tilt: 0, pins: 2, kT: 'strip' })
          cy -= heroH + 0.2
          reel = add({ kind: 'print', work: -1, w: RPW, h: RPH, x: 0.3, y: cy, tilt: 0, pins: 2, kT: 'print', tex: ctx.showreel.texture, rect: [0, 0, 1, 1], bx: 0.2 / RPW, by: 0.2 / RPH })
          cy -= RPH - 0.3
          for (let i = 0; i < 8; i++) {
            const side = i % 2 ? 1 : -1
            prints.push(print(i, side * 0.8, cy, side * -0.03))
            note(i % 6, -side * 2.3, cy - 2.3, side * 0.06)
            if (i === 1 || i === 4 || i === 6) strip(i % 3, 0, cy - 3.3, side * 0.02, 4.6)
            if (i === 2 || i === 5) tape(i % 3, side * 1.2 + 1, cy - 0.05, 0.5)
            if (i === 3) add({ kind: 'art', art: 'cal', w: 2.4, h: 2.88, x: side * 1.9, y: cy - 3.0, tilt: 0.04, pins: 1, kT: 'cal' })
            if (i === 6) add({ kind: 'art', art: 'clip', w: 0.42, h: 1.05, x: 0.2, y: cy - 0.1, tilt: 0.1, pins: 0, kT: 'clip' })
            cy -= 4.2
          }
          BH = -cy + 1.8
          const top = BH / 2; specs.forEach((s) => { s.y += top })
          threads = []; for (let i = 0; i < 7; i++) threads.push([i, i + 1, 0.55])
        }

        // sheet meshes
        specs.forEach((sp) => {
          const gx = clamp(Math.ceil(sp.w / 0.45), 2, 12), gy = clamp(Math.ceil(sp.h / 0.3), 3, 12)
          const geo = own(new THREE.PlaneGeometry(sp.w, sp.h, gx, gy)); geo.translate(0, -sp.h / 2, 0)
          const rect = sp.rect || art[sp.art]
          const mat = own(new THREE.ShaderMaterial({
            side: THREE.DoubleSide, vertexShader: PVS, fragmentShader: PFS,
            uniforms: {
              uMap: { value: sp.tex || atlasTex }, uRect: { value: new THREE.Vector4(rect[0], rect[1], rect[2], rect[3]) },
              uBorder: { value: new THREE.Vector2(sp.bx || 0, sp.by || 0) }, uType: { value: sp.kind === 'print' ? 1 : 0 }, uMine: { value: 0 },
              uSize: { value: new THREE.Vector2(sp.w, sp.h) }, uTheta: { value: 0 }, uCurl: { value: 0 }, uTwist: { value: 0 }, uFlut: { value: 0 }, uPh: { value: R() * 6.28 },
              uK: { value: 0 }, uT: { value: new THREE.Vector4() }, uTime: U.uTime, uLamp: U.uLamp, uSpot: U.uSpot,
            },
          }))
          const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; scene.add(mesh); objs.push(mesh)
          const kT = sp.kT, soft = kT === 'cal' ? 0.9 : kT === 'print' ? 1.25 : 1
          const s = Object.assign(sp, {
            mesh, mat, th: 0, om: 0, cu: 0, cv: 0, tw: 0, twv: 0, ps: 0, pv: 0, fl: 0, hAmt: 0, drop: 0, landed: true, c0: (R() - 0.5) * 0.06,
            kth: kT === 'print' ? 15 : kT === 'tape' || kT === 'clip' ? 500 : 10, kps: sp.pins === 2 ? 150 : sp.pins === 1 ? 11 : 600, stiff: soft, pinIdx: [], rest: 0,
          })
          s.T = { x: 0, y: 0, z: 0, w: 1 }; s.pts = []
          sheets.push(s)
          if (sp.pins) {
            const ox = sp.pins === 2 ? sp.w / 2 - Math.min(0.38, sp.w * 0.2) : 0
            for (let q = 0; q < sp.pins; q++) { const lx = sp.pins === 2 ? (q ? ox : -ox) : 0; s.pts.push([sp.x + lx * Math.cos(sp.tilt), sp.y + lx * Math.sin(sp.tilt), sp.z + 0.05]) }
          }
        })
        const byWork = (i) => sheets.find((s) => s.work === i)
        const reelS = sheets.find((s) => s.kind === 'print' && s.work === -1)

        // pins (instanced) and shadows
        const nPins = sheets.reduce((n, s) => n + s.pts.length, 0)
        const pg = new THREE.SphereGeometry(0.11, 8, 6), pc = new Float32Array(pg.attributes.position.count * 3), pn = pg.attributes.normal
        for (let k = 0; k < pn.count; k++) { const l = 0.5 + 0.5 * Math.max(0, pn.getX(k) * -0.4 + pn.getY(k) * 0.5 + pn.getZ(k) * 0.7); pc[k * 3] = pc[k * 3 + 1] = pc[k * 3 + 2] = l }
        pg.setAttribute('color', new THREE.BufferAttribute(pc, 3))
        const pins = own(new THREE.InstancedMesh(pg, own(new THREE.MeshBasicMaterial({ vertexColors: true })), Math.max(1, nPins))); own(pg)
        pins.frustumCulled = false; scene.add(pins)
        let pi = 0; sheets.forEach((s) => { s.pts.forEach((p) => { s.pinIdx.push(pi); pins.setColorAt(pi, COL.setHex(pi % 3 ? 0xededed : 0x8f8f8f)); M4.makeScale(0, 0, 0); pins.setMatrixAt(pi, M4); pi++ }) })
        if (nPins) { pins.instanceColor.needsUpdate = true }
        const setPins = (s, on) => { s.pinIdx.forEach((k, q) => { const p = s.pts[q]; M4.compose(V3.set(p[0], p[1], p[2]), Q.identity(), on ? SC.set(1, 1, 1) : SC.set(0, 0, 0)); pins.setMatrixAt(k, M4) }); pins.instanceMatrix.needsUpdate = true }

        const nS = sheets.length + 1 // + the board's shadow on the wall
        const sgeo = own(new THREE.BufferGeometry())
        const spos = new Float32Array(nS * 12), sa = new Float32Array(nS * 4), suv = new Float32Array(nS * 8), sidx = new Uint16Array(nS * 6)
        for (let k = 0; k < nS; k++) { suv.set([0, 1, 1, 1, 1, 0, 0, 0], k * 8); sidx.set([k * 4, k * 4 + 2, k * 4 + 1, k * 4, k * 4 + 3, k * 4 + 2], k * 6) }
        sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3).setUsage(THREE.DynamicDrawUsage)); sgeo.setAttribute('aA', new THREE.BufferAttribute(sa, 1).setUsage(THREE.DynamicDrawUsage))
        sgeo.setAttribute('uv', new THREE.BufferAttribute(suv, 2)); sgeo.setIndex(new THREE.BufferAttribute(sidx, 1))
        const shadow = new THREE.Mesh(sgeo, own(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: SVS, fragmentShader: SFS, uniforms: { uMap: { value: sdf } } })))
        shadow.frustumCulled = false; shadow.renderOrder = 5; scene.add(shadow); objs.push(shadow)

        // board, frame, wall
        const bw = BW - 0.7, bh = BH - 0.7
        const mkB = (geo, base, kind, z) => { const m = new THREE.Mesh(own(geo), own(new THREE.ShaderMaterial({ vertexShader: BVS, fragmentShader: BFS, uniforms: { uBase: { value: new THREE.Color(base) }, uKind: { value: kind }, uLamp: U.uLamp, uSpot: U.uSpot } }))); m.position.z = z; scene.add(m); objs.push(m); return m }
        mkB(new THREE.PlaneGeometry(bw, bh), 0x262626, 0, 0)
        mkB(new THREE.PlaneGeometry(BW + 140, BH + 140), 0x151515, 1, -2)
        const sh = new THREE.Shape(); sh.moveTo(-BW / 2, -BH / 2); sh.lineTo(BW / 2, -BH / 2); sh.lineTo(BW / 2, BH / 2); sh.lineTo(-BW / 2, BH / 2); sh.closePath()
        const hole = new THREE.Path(); hole.moveTo(-bw / 2, -bh / 2); hole.lineTo(-bw / 2, bh / 2); hole.lineTo(bw / 2, bh / 2); hole.lineTo(bw / 2, -bh / 2); hole.closePath(); sh.holes.push(hole)
        mkB(new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false }), 0x8f8f8f, 2, -0.05)

        // threads
        const tpos = [], tT = [], tSide = [], tN = [], tSag = [], tIdx = []
        threads.forEach(([a, b, sg]) => {
          const A = prints[a].pts[1], B = prints[b].pts[0], len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
          const nx = -(B[1] - A[1]) / len, ny = (B[0] - A[0]) / len, base = tpos.length / 3
          for (let k = 0; k <= 14; k++) {
            const t = k / 14
            for (const sd of [-1, 1]) { tpos.push(lerp(A[0], B[0], t), lerp(A[1], B[1], t), 0.5); tT.push(t); tSide.push(sd); tN.push(nx, ny); tSag.push(sg * Math.min(1.4, len * 0.12)) }
            if (k < 14) { const i0 = base + k * 2; tIdx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2) }
          }
        })
        const tg = own(new THREE.BufferGeometry())
        tg.setAttribute('position', new THREE.Float32BufferAttribute(tpos, 3)); tg.setAttribute('aT', new THREE.Float32BufferAttribute(tT, 1)); tg.setAttribute('aSide', new THREE.Float32BufferAttribute(tSide, 1))
        tg.setAttribute('aN', new THREE.Float32BufferAttribute(tN, 2)); tg.setAttribute('aSag', new THREE.Float32BufferAttribute(tSag, 1)); tg.setIndex(tIdx)
        const thr = new THREE.Mesh(tg, own(new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: TVS, fragmentShader: TFS, uniforms: { uGust: U.uGust, uTime: U.uTime, uLamp: U.uLamp } })))
        thr.frustumCulled = false; scene.add(thr); objs.push(thr)

        W = { objs, sheets, prints, reelS, byWork, BW, BH, pins, setPins, shadow, spos, sa, sgeo, nS, ArtTex: atlasTex }
        fitCamera()
        sheets.forEach((s) => { s.mesh.position.set(s.x, s.y, s.z); s.mesh.rotation.z = s.tilt; setPins(s, true) })
        pose.forEach((p) => { p.init = false })
        grab = null
      }
      function destroy() {
        for (const o of W.objs) { scene.remove(o); if (o.dispose) o.dispose(); else { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose() } }
        W = null
      }
      function fitCamera() {
        const asp = size.w / size.h
        if (portrait) { VW = 7.8; VH = VW / asp } else { VH = 10.6; VW = VH * asp }
        Dcam = VH / 2 / TN
        camera.aspect = asp; camera.updateProjectionMatrix()
      }

      // ---- picking -------------------------------------------------------------------------------------------------------
      const PA = [0, 0]
      const planeAt = (z) => { const t = camera.position.z - z, asp = size.w / size.h; PA[0] = camera.position.x + P.nx * TN * asp * t; PA[1] = camera.position.y + P.ny * TN * t; return PA } // shared result: read it at once
      function hitSheet(onlyWorks) { // the front-most sheet under the pointer, null if none
        let best = null, bz = -1e9
        for (const s of W.sheets) {
          if (s.kT === 'tape' || s.kT === 'clip' || !s.mesh.visible || s.drop > 0.5) continue
          if (onlyWorks && (s.work < 0 || !s.landed)) continue
          const [px, py] = planeAt(s.z), dx = px - s.mesh.position.x, dy = py - s.mesh.position.y, c = Math.cos(-s.mesh.rotation.z), sn = Math.sin(-s.mesh.rotation.z)
          const lx = dx * c - dy * sn, ly = dx * sn + dy * c
          if (Math.abs(lx) <= s.w / 2 && ly <= 0.05 && ly >= -s.h * Math.cos(Math.min(s.th, 1.2)) - 0.05 && s.z > bz) { bz = s.z; best = s }
        }
        return best
      }

      // ---- hover pose (px), then world ------------------------------------------------------------------------------------
      function frameOf(i, dt) {
        const w = size.w, h = size.h, asp = w / h, tg = tags[i], ps = pose[i], hm = home[i]
        const fwp = (asp < 1 ? 0.8 : 0.36) * w, fhp = (fwp * 9) / 16, M = 24, TOP = w < 768 ? 96 : 104, BOT = h - 24
        let fcx, fcy, tl_, tt
        if (asp >= 1 && fwp + 22 + tg.wpx + 2 * M <= w) {
          const right = hm.x <= w / 2, gw = fwp + 22 + tg.wpx, gl = clamp(right ? hm.x - fwp / 2 : hm.x + fwp / 2 - gw, M, w - M - gw)
          fcx = right ? gl + fwp / 2 : gl + tg.wpx + 22 + fwp / 2; tl_ = right ? gl + fwp + 22 : gl
          fcy = clamp(h * 0.55, TOP + fhp / 2, Math.max(TOP + fhp / 2, BOT - fhp / 2)); tt = fcy - tg.hpx / 2
        } else {
          const gt = clamp(h * 0.5 - fhp / 2, TOP, Math.max(TOP, BOT - (fhp + 16 + tg.hpx)))
          fcx = w / 2; fcy = gt + fhp / 2
          tl_ = clamp(fcx - fwp / 2, M, Math.max(M, w - M - tg.wpx)); tt = gt + fhp + 16
        }
        tt = clamp(tt, TOP, Math.max(TOP, BOT - tg.hpx))
        const k = ps.init ? 1 - Math.exp(-dt * 14) : 1
        ps.init = true; ps.x += (fcx - ps.x) * k; ps.y += (fcy - ps.y) * k; ps.w += (fwp - ps.w) * k; ps.l += (tl_ - ps.l) * k; ps.t += (tt - ps.t) * k
      }
      const dT = () => Dcam * O.zoom * 0.5
      function setT(s, cx, cy, wpx) { // flat pose: centre and width in px -> world, at half the camera distance
        const w = size.w, h = size.h, asp = w / h, d = dT(), visH = 2 * TN * d, visW = visH * asp
        s.T.w = (wpx / w) * visW; s.T.x = camera.position.x + ((cx / w) * 2 - 1) * (visW / 2); s.T.y = camera.position.y + (1 - (cy / h) * 2) * (visH / 2); s.T.z = camera.position.z - d
      }

      // ---- physics -------------------------------------------------------------------------------------------------------------
      function slap(s, v) {
        E.slap = Math.max(E.slap, clamp(v / 6, 0, 1))
        const cx = s.mesh.position.x, cy = s.mesh.position.y - s.h / 2
        for (const o of W.sheets) { if (o === s || o.kT === 'tape' || o.kT === 'clip') continue; const r2 = (o.mesh.position.x - cx) ** 2 + (o.mesh.position.y - o.h / 2 - cy) ** 2; o.om += 0.3 * v * Math.exp(-r2 / 7) / o.stiff }
      }
      function land(s, a) { s.landed = true; W.setPins(s, true); s.om += a; s.pv += (Math.random() - 0.5) * a * 0.9; s.fl = 0.25 }
      function stepSheet(s, dt, t, env) {
        const m = s.mesh, ph = s.mat.uniforms.uPh.value
        const cx = m.position.x, cy = m.position.y - s.h * 0.5
        const lite = s.kT === 'tape' || s.kT === 'clip' ? 0.05 : 1
        let aT = 0.9 * Math.sin(t * 0.9 + ph), aC = 0, aW = 0, aP = 0, air = 0 // a gentle breath from the lamp's heat
        if (env.on) {
          const rx = cx - env.x, ry = cy - env.y, sg = 1.5 + 0.25 * Math.max(s.w, s.h), g = Math.exp(-(rx * rx + ry * ry) / (2 * sg * sg)) * lite
          if (g > 0.01) { aT += Math.min(45, 1.5 * env.sp * g) / s.stiff; aC += 0.04 * F.vx * g; aW += 0.06 * F.vy * g; aP += 0.05 * F.vx * g; air += env.sp * g * 0.02 }
        }
        for (const wv of waves) {
          const age = t - wv.t0; if (age < 0 || age > 3) continue
          const r = Math.hypot(cx - wv.x, cy - wv.y), d = (r - age * 15) / 2
          const e = Math.exp(-d * d) * wv.a * Math.exp(-r * 0.07) * lite
          if (e > 0.01) { aT += 55 * e / s.stiff; aC += 3 * e * (((cx * 7) | 0) % 2 ? 1 : -1); air += e * 0.3 }
        }
        const gv = env.gust * lite
        if (Math.abs(gv) > 0.02) {
          const along = portrait ? cy : cx, sgn = Math.sign(gv)
          aT += (Math.abs(gv) * (9 + 10 * Math.sin(along * 0.55 - t * 6 * sgn))) / s.stiff
          aC += gv * 0.5 * Math.sin(along * 0.4 - t * 5 * sgn); aP += gv * 0.35; air += Math.abs(gv) * 0.08
        }
        let kth = s.kth, cth = 2 * Math.sqrt(kth) * 0.28, tTh = 0
        if (grab && grab.s === s) { tTh = grab.th; kth = 90; cth = 2 * Math.sqrt(90) * 0.9; aP += (grab.ps - s.ps) * 40; aC += (grab.th * 0.18 - s.cu) * 30 }
        s.om += (aT - kth * (s.th - tTh) - cth * s.om) * dt
        s.th += s.om * dt
        if (s.th < 0) { if (s.om < -2) slap(s, -s.om); s.th = 0; s.om = -s.om * 0.25 }
        if (s.th > 1.45) { s.th = 1.45; s.om *= -0.3 }
        s.cv += (aC - 40 * (s.cu - s.c0) - 4.5 * s.cv) * dt; s.cu = clamp(s.cu + s.cv * dt, -0.7, 0.7)
        s.twv += (aW - 30 * s.tw - 4 * s.twv) * dt; s.tw = clamp(s.tw + s.twv * dt, -0.6, 0.6)
        const lim = s.pins === 2 ? 0.05 : s.pins === 1 ? 0.55 : 0.01
        s.pv += (aP - s.kps * s.ps - (s.pins === 2 ? 11 : 0.9) * s.pv) * dt; s.ps = clamp(s.ps + s.pv * dt, -lim, lim)
        s.fl += (clamp(air + (env.on ? 0 : 0), 0, 0.35) + 0.015 * lite - s.fl) * Math.min(1, dt * 5)
      }

      // ---- the opening, the fly-in -----------------------------------------------------------------------------------------------
      function startOpening() {
        opening = true
        const reel = W.reelS
        W.sheets.forEach((s) => { if (s !== reel) { s.drop = 14; s.mesh.visible = false; s.landed = false; W.setPins(s, false) } })
        reel.landed = false; W.setPins(reel, false)
        O.zoom = 0.5; O.reelMove = 0; O.reelK = 1
        tl = gsap.timeline({ onComplete: () => { opening = false } })
        tl.to(O, { reelMove: 1, duration: 0.85, ease: 'power3.inOut' }, 0.4)
        tl.to(O, { zoom: 1, duration: 1.05, ease: 'power2.inOut' }, 0.45)
        tl.call(() => { reel.drop = 0.5; reel.landed = true; W.setPins(reel, true); O.reelK = 0 }, null, 1.3)
        tl.to(reel, { drop: 0, duration: 0.24, ease: 'power2.in', onComplete: () => land(reel, 1.6) }, 1.3)
        const order = W.sheets.filter((s) => s !== reel).sort((a, b) => a.x - b.x)
        order.forEach((s, k) => {
          const at = 1.1 + k * 0.042
          tl.call(() => { s.mesh.visible = true }, null, at)
          tl.to(s, { drop: 0, duration: 0.4, ease: 'power2.in', onComplete: () => land(s, 1.2 + Math.random()) }, at)
        })
      }
      function finishOpening() { if (tl) tl.progress(1, true); opening = false; O.zoom = 1; O.reelK = 0; O.reelMove = 1; W.sheets.forEach((s) => { s.drop = 0; s.mesh.visible = true; s.landed = true; W.setPins(s, true) }) }
      function flyTo(i) {
        if (flying || opening || i < 0) return
        flying = true; flyIdx = i; hot = i; ctx.cursor.hover(false); hoverOn = false
        grab = null
        frameOf(i, 0.016)
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        flyTl.to(fly, { k: 1, duration: 0.72, ease: 'power3.in' }, 0.14)
      }

      function putQuad(n, cx, cy, hw, hh, ang, z, a) { // one shadow quad of the merged shadow mesh
        const sp = W.spos, sa = W.sa, c = Math.cos(ang), sn = Math.sin(ang)
        for (let q = 0; q < 4; q++) { const lx = q === 0 || q === 3 ? -hw : hw, ly = q < 2 ? hh : -hh; sp[(n * 4 + q) * 3] = cx + lx * c - ly * sn; sp[(n * 4 + q) * 3 + 1] = cy + lx * sn + ly * c; sp[(n * 4 + q) * 3 + 2] = z; sa[n * 4 + q] = a }
      }

      // ---- the frame ---------------------------------------------------------------------------------------------------------------
      function update(t, dt) {
        dt = clamp(dt, 0.0001, 0.033)
        if (!W || (size.w < size.h) !== portrait) { const first = !W; build(); layoutTags(); if (first) { if (ctx.reduced) finishOpening(); else startOpening() } }
        const w = size.w, h = size.h, asp = w / h, sc = ctx.scroll
        U.uTime.value = t

        // camera: scroll pans along the board, the pointer leans the view a little
        pan = clamp(pan + (sc.y - lastScroll) / (portrait ? 3400 : 2600), 0, 1); lastScroll = sc.y
        panS += (pan - panS) * (1 - Math.exp(-dt * 4.5))
        const kl = 1 - Math.exp(-dt * 3), live0 = P.inside && !touch
        lookX += ((live0 ? P.nx : 0) * 0.45 - lookX) * kl; lookY += ((live0 ? P.ny : 0) * 0.3 - lookY) * kl
        if (portrait) { const top = W.BH / 2 - VH / 2 + 0.8, bot = -W.BH / 2 + VH / 2 - 0.8; camX = lookX * 0.4; camY = W.BH <= VH ? 0 : lerp(top, bot, panS) + lookY }
        else { const rg = Math.max(0, W.BW / 2 + 0.8 - VW / 2); camX = lerp(-rg, rg, panS) + lookX; camY = lookY }
        camera.position.set(camX, camY, Dcam * O.zoom)
        lampX += (camX * 0.85 - lampX) * Math.min(1, dt * 2)
        U.uLamp.value.x = lampX; U.uLamp.value.y = portrait ? camY - VH * 0.55 : -7

        // the draught
        const pwv = planeAt(0.3), pwx = pwv[0], pwy = pwv[1], visWp = 2 * TN * asp * (camera.position.z - 0.3), upx = visWp / w
        let vx = 0, vy = 0
        if (P.inside && !(touch && !P.down) && !opening) { vx = (P.dx * upx) / dt; vy = (-P.dy * upx) / dt }
        const sp0 = Math.hypot(vx, vy), cl = sp0 > 45 ? 45 / sp0 : 1, kk = Math.min(1, dt * 18)
        F.vx += (vx * cl - F.vx) * kk; F.vy += (vy * cl - F.vy) * kk; F.sp = Math.hypot(F.vx, F.vy)
        if (F.sp > 30 && t - waveT > 0.4 && !opening) { waveT = t; const wv = waves.reduce((a, b) => (a.t0 < b.t0 ? a : b)); wv.x = pwx; wv.y = pwy; wv.t0 = t; wv.a = clamp(F.sp / 45, 0, 1) }
        const gv = clamp(sc.v / 700, -1.5, 1.5); U.uGust.value += (gv - U.uGust.value) * Math.min(1, dt * 6)
        env.x = pwx; env.y = pwy; env.sp = F.sp; env.on = P.inside && !grab && !opening && !(touch && !P.down); env.gust = gv

        // press and drag pulls a sheet off the board
        const down = P.down && !opening && !flying && !touch
        if (down && !wasDown) { const s = hitSheet(false); if (s) grab = { s, x0: P.x, y0: P.y, th: 0, ps: 0 } }
        if (!down && grab) grab = null
        wasDown = down
        if (grab) { const d = Math.hypot(P.x - grab.x0, P.y - grab.y0) / (h * 0.3); grab.th = clamp(d * 1.2, 0, 1.35); grab.ps = clamp(((P.x - grab.x0) / w) * 1.5, -0.5, 0.5) }

        // hover: dwell on a print (a sweeping pointer is wind, not a choice); a flat print keeps the hover while the pointer is on it
        let hit = -1
        const live = !opening && !flying && !touch && P.inside && !grab
        if (live) {
          const px = ((P.nx + 1) / 2) * w, py = ((1 - P.ny) / 2) * h
          let kp = false
          if (hot >= 0) { const ps = pose[hot], s = W.byWork(hot); kp = s.hAmt > 0.5 && Math.abs(px - ps.x) < (ps.w / 2) * 1.06 && Math.abs(py - ps.y) < ((ps.w * 9) / 32) * 1.06 }
          if (kp) { hit = hot; dwell = 1; cand = hot } else {
            const hs = hitSheet(true), c2 = hs ? hs.work : -1
            if (c2 !== cand) { dwell = 0; cand = c2 } else if (c2 >= 0 && F.sp < 7) dwell += dt
            hit = c2 >= 0 && dwell > 0.14 && F.sp < 10 ? c2 : -1
          }
        } else { dwell = 0; cand = -1 }
        if ((hit >= 0) !== hoverOn) { hoverOn = hit >= 0; ctx.cursor.hover(hoverOn) }
        hot = flying ? flyIdx : hit >= 0 ? hit : !opening && focusCell >= 0 ? focusCell : -1
        focusA += ((hot >= 0 ? 1 : 0) - focusA) * Math.min(1, dt * 6)

        // physics, the pose of every sheet
        const cam = camera.position
        for (const s of W.sheets) {
          const tgt = s.work >= 0 && s.work === hot ? 1 : 0
          s.hAmt += (tgt - s.hAmt) * Math.min(1, dt * (tgt ? 9 : 6)); if (s.hAmt < 0.003 && !tgt) s.hAmt = 0
          stepSheet(s, dt, t, env)
          const m = s.mesh, u = s.mat.uniforms
          m.position.set(s.x, s.y + s.drop, s.z); m.rotation.z = s.tilt + s.ps
          u.uTheta.value = s.th; u.uCurl.value = s.cu; u.uTwist.value = s.tw; u.uFlut.value = s.fl
          const isReel = s === W.reelS
          let k = s.hAmt
          if (s.work >= 0) {
            const wx = s.x + Math.sin(-s.tilt) * -s.h / 2, wy = s.y - s.h / 2, d = cam.z - s.z
            home[s.work].x = (0.5 + (wx - cam.x) / d / (2 * TN * asp)) * w; home[s.work].y = (0.5 - (wy - cam.y) / d / (2 * TN)) * h
            if (s.hAmt > 0 || tgt) {
              frameOf(s.work, dt); const ps = pose[s.work], fk = s.work === flyIdx ? fly.k : 0, outer = PW / IW
              const fill = Math.max(w, (h * 16) / 9) * 1.03 * outer
              setT(s, lerp(ps.x, w / 2, fk), lerp(ps.y, h / 2, fk), lerp(ps.w * outer, fill, fk))
              u.uT.value.set(s.T.x, s.T.y, s.T.z, s.T.w)
            } else pose[s.work].init = false
            u.uMine.value = s.hAmt
          } else if (isReel) {
            // fill the view, then fly to its place on the wall (its pose follows the camera until it hangs)
            const outer = RPW / RW, fill = Math.max(w, (h * 16) / 9) * 1.03 * outer
            setT(s, w / 2, h / 2, fill)
            const a = s.T, wpx = s.w
            const bx = s.x, by = s.y + s.drop - s.h / 2, bz = s.z, e = O.reelMove, ee = e * e * (3 - 2 * e)
            u.uT.value.set(lerp(a.x, bx, ee), lerp(a.y, by, ee), lerp(a.z, bz, ee), lerp(a.w, wpx, ee))
            k = O.reelK
          }
          u.uK.value = k
        }

        // shadows: one quad per sheet, shifted up and spread by how far it lifts; the board's own on the wall
        W.sheets.forEach((s, n) => {
          const m = s.mesh, lift = s.h * Math.sin(Math.min(1.45, Math.abs(s.th + s.cu * s.h * 0.5))) + Math.abs(s.fl) * 0.4
          let cxw, cyw, hw, hh, a, ang = m.rotation.z, z = s.z - 0.006
          const vis = m.visible ? clamp(1 - s.drop / 1.5, 0, 1) : 0
          if (s.kT === 'tape' || s.kT === 'clip') { a = 0.12 * vis; hw = s.w / 2 + 0.05; hh = s.h / 2 + 0.05; cxw = m.position.x - Math.sin(ang) * -s.h / 2; cyw = m.position.y - Math.cos(ang) * s.h / 2 - 0.02 }
          else {
            const sc2 = 1 + lift * 0.16, off = 0.07 + lift * 0.85
            hw = ((s.w / 2) * sc2) / 0.78; hh = (((s.h * (0.82 + 0.18 * Math.cos(Math.min(1.2, s.th)))) / 2) * sc2) / 0.78
            cxw = m.position.x + Math.sin(ang) * (s.h / 2); cyw = m.position.y - Math.cos(ang) * (s.h / 2) + off
            a = (0.5 / (1 + lift * 0.9)) * vis
            if (s.work >= 0 && s.hAmt > 0.002) { // the lifted print throws its shadow straight behind itself on the board
              const f = cam.z - 0.1, g = f / (cam.z - s.T.z), ex = cam.x + (s.T.x - cam.x) * g, ey = cam.y + (s.T.y - cam.y) * g, e = s.hAmt
              cxw = lerp(cxw, ex, e); cyw = lerp(cyw, ey + 0.5, e); hw = lerp(hw, ((s.T.w * g) / 2 * 1.12) / 0.78, e); hh = lerp(hh, ((s.T.w * g * (PH / PW)) / 2 * 1.12) / 0.78, e); a = lerp(a, 0.55, e); z = lerp(z, 0.1, e)
            }
          }
          putQuad(n, cxw, cyw, hw, hh, ang, z, a)
        })
        { // the board's shadow on the wall
          putQuad(W.nS - 1, 0, 0.7, (W.BW / 2 + 1.6) / 0.78, (W.BH / 2 + 1.6) / 0.78, 0, -1.98, 0.55)
        }
        W.sgeo.attributes.position.needsUpdate = true; W.sgeo.attributes.aA.needsUpdate = true

        // the lamp gathers on the hovered print
        U.uLamp.value.z = focusA
        const hs = hot >= 0 ? W.byWork(hot) : null
        if (hs) { const g = (cam.z - 0.1) / (cam.z - hs.T.z); U.uSpot.value.set(cam.x + (hs.T.x - cam.x) * g, cam.y + (hs.T.y - cam.y) * g, hs.T.w * g * 0.9, 0.7 * focusA) } else U.uSpot.value.w *= 0.9

        E.slap *= Math.exp(-dt * 5)
        ctx.crt.glow = 0.45
        ctx.crt.push = clamp(Math.abs(sc.v) / 3200 + E.slap * 0.35 + fly.k * 0.5 + (opening ? 0.12 : 0) + F.sp / 260, 0, 1)

        // the tag beside the flat print
        const want = hot >= 0 && hs && hs.hAmt > 0.25 && !flying && !opening
        if (want && hot !== tagCell) { tags[tagCell].group.visible = false; tagCell = hot; tagA = 0 }
        tagA += ((want ? 1 : 0) - tagA) * Math.min(1, dt * 12)
        const tg = tags[tagCell], ps = pose[tagCell]
        tg.group.visible = tagA > 0.01
        if (tg.group.visible) {
          const upp = (2 * TN * 3) / h
          const l = clamp(ps.l, 16, w - 16 - tg.wpx), tt = clamp(ps.t, 16, h - 16 - tg.hpx)
          tg.group.position.set((l + tg.wpx / 2 - w / 2 - (1 - tagA) * 14) * upp, -(tt + tg.hpx / 2 - h / 2) * upp, -3)
          tg.group.scale.setScalar(upp)
          tg.plateMat.opacity = 0.86 * tagA; tg.title.mat.opacity = tagA; tg.meta.mat.opacity = tagA
        }
      }

      layoutTags()
      return {
        scene, camera, update,
        resize(w, h) { fitCamera(); layoutTags() },
        tap() {
          if (!W) return
          if (opening) { finishOpening(); return }
          if (flying) return
          let i = hot
          if (i < 0 || touch) { const s = hitSheet(true); i = s ? s.work : -1 }
          if (i >= 0) flyTo(i)
        },
        focus(i) { focusCell = i },
        activate(i) { if (!W) return; if (opening) finishOpening(); if (flying) return; flyTo(i) },
        back() {
          if (flyTl) flyTl.kill()
          if (backTw) backTw.kill()
          backTw = gsap.to(fly, { k: 0, duration: 0.8, ease: 'power3.inOut', onComplete: () => { flying = false; flyIdx = -1; focusCell = -1 } })
        },
        dispose() {
          if (tl) tl.kill(); if (flyTl) flyTl.kill(); if (backTw) backTw.kill()
          gsap.killTweensOf(O); gsap.killTweensOf(fly)
          if (W) { W.sheets.forEach((s) => gsap.killTweensOf(s)); destroy() }
          ctx.cursor.hover(false)
          keep.geo.forEach((x) => x.dispose()); keep.mat.forEach((x) => x.dispose()); keep.tex.forEach((x) => x.dispose())
          scene.remove(camera)
        },
      }
    },
  })
})()
