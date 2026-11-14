// THROWAWAY prototype: Sketchbook. A sketchbook lies open on the desk, seen from 55 degrees, lamp-lit, with a pencil, an eraser and loose
// sheets. Four spreads, two Works each (left page, right page). Each page holds hand-drawn storyboard marks and one large panel in which the
// Work's loop plays as pencil hatching (a shader thresholds the loop into hatch lines on paper); on hover the panel lifts off as a floating
// sheet with the true bright loop. The star is the page turn: every leaf is a subdivided plane bent in the vertex shader around a moving,
// tilted fold line (cone / cylinder curl), lit with a highlight, and the curl throws a moving shadow on the pages below (one overlay shader).
// Scroll turns pages with weight (a fast scroll riffles several leaves at once), dragging an outer page corner curls exactly that corner and
// lets go in either direction (released before halfway it falls back with a soft slap that rolls the pencil). The pointer nudges the lamp
// and leans the view. Opening: the Showreel is the label on the closed cover filling the view; the camera pulls back, the cover opens with a
// heavy turn, the first spread draws itself in. Fly-in: the camera dives into the floating panel.
// FAKE: every handwritten note, caption scribble, date and the cover title. The Work titles come from ctx.works (also fake).
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const lerp = (a, b, t) => a + (b - a) * t
  const FOV = 40, TN = Math.tan((FOV * Math.PI) / 360), PI = Math.PI
  const PWd = 4.4, PHt = (PWd * 588) / 448 // a page in world units
  const CW = 448, CH = 588 // a page cell in the paper atlas, px
  const Y0 = 0.14, TL = 0.07, K = 4 // cover board top, leaf thickness, turnable leaves
  const IWr = 1.087 // print outer / image width of the floating sheet
  const PANEL = [36 / CW, 1 - 275.5 / CH, 412 / CW, 1 - 64 / CH] // panel on a normal page: x0, y0, x1, y1 (uv, y up)
  const PANEL_LO = [36 / CW, 1 - 523.5 / CH, 412 / CW, 1 - 312 / CH] // panel on the title page (below the hero text)
  const LABEL = [30 / CW, 1 - 270.25 / CH, 418 / CW, 1 - 52 / CH] // the Showreel label on the cover
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
  const PEN = '#1a1a1a'

  // ---------------------------------------------------------------------------------------------------- hand drawing
  function wob(g, r, x1, y1, x2, y2) {
    const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 12))
    g.moveTo(x1, y1)
    for (let k = 1; k <= n; k++) { const t = k / n; g.lineTo(x1 + (x2 - x1) * t + (r() - 0.5) * 1.5, y1 + (y2 - y1) * t + (r() - 0.5) * 1.5) }
  }
  function box(g, r, x, y, w, h) { g.beginPath(); wob(g, r, x, y, x + w, y); wob(g, r, x + w, y, x + w, y + h); wob(g, r, x + w, y + h, x, y + h); wob(g, r, x, y + h, x, y); g.stroke() }
  function scrib(g, r, x, y, w, h, n) { // fake handwriting: wavy lines
    g.beginPath()
    for (let k = 0; k < n; k++) {
      const yy = y + (k + 0.5) * (h / n); let xx = x; g.moveTo(xx, yy)
      const len = w * (0.5 + r() * 0.5)
      while (xx < x + len) { xx += 3 + r() * 5; g.lineTo(xx, yy + (r() - 0.5) * 4) }
    }
    g.stroke()
  }
  function figure(g, r, cx, cy, s) {
    g.beginPath()
    if (r() < 0.5) { g.arc(cx, cy - s * 0.5, s * 0.2, 0, 6.3); g.moveTo(cx, cy - s * 0.3); g.lineTo(cx, cy + s * 0.2); g.moveTo(cx - s * 0.3, cy - s * 0.1); g.lineTo(cx + s * 0.3, cy - s * 0.15); g.moveTo(cx, cy + s * 0.2); g.lineTo(cx - s * 0.2, cy + s * 0.55); g.moveTo(cx, cy + s * 0.2); g.lineTo(cx + s * 0.22, cy + s * 0.55) }
    else { g.ellipse(cx, cy, s * 0.5, s * 0.3, r() - 0.5, 0, 6.3); g.moveTo(cx - s * 0.6, cy + s * 0.5); g.lineTo(cx + s * 0.6, cy + s * 0.45) }
    g.stroke()
  }
  function arrow(g, r, x1, y, x2) { g.beginPath(); wob(g, r, x1, y, x2, y); g.moveTo(x2 - 8, y - 5); g.lineTo(x2, y); g.lineTo(x2 - 8, y + 5); g.stroke() }
  const NOTES = ['ritim 4/4, 92 bpm', 'kesme: 3 sn', 'renk sıcak olmasın', 'müzik bekleniyor', 'logo en sonda', 'ses: tok, kuru', 'geçiş: sert', 'revize 2'] // fake

  function drawPage(g, i, left, o) {
    const r = rng(100 + i * 17), w = CW, h = CH
    g.fillStyle = '#ededed'; g.fillRect(0, 0, w, h)
    g.strokeStyle = PEN; g.fillStyle = PEN; g.lineCap = 'round'; g.lineJoin = 'round'
    const py = o.low ? 312 : 64, ph = 211.5
    g.lineWidth = 2.2; box(g, r, 36, py, 376, ph); g.lineWidth = 1.2; box(g, r, 32, py - 4, 384, ph + 8)
    g.lineWidth = 1.4; for (const [x, y, dx, dy] of [[28, py - 10, 10, 0], [28, py - 10, 0, 10], [420, py + ph + 10, -10, 0], [420, py + ph + 10, 0, -10]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y + dy); g.stroke() }
    g.font = "400 22px 'Instrument Serif', Georgia, serif"; g.textAlign = left ? 'left' : 'right'
    g.fillText(`sahne ${String(o.n).padStart(2, '0')}`, left ? 36 : 412, py - 16) // fake scene number
    // caption under the panel: the Work's name, then a scribbled note
    g.textAlign = 'left'
    if (o.low) {
      g.font = "400 30px 'Instrument Serif', Georgia, serif"; g.fillText(o.title, 38, 562)
      g.font = "400 18px 'Instrument Serif', Georgia, serif"; g.globalAlpha = 0.7; g.textAlign = 'right'; g.fillText(o.meta, 412, 562); g.globalAlpha = 1; g.textAlign = 'left'
    } else {
      const cy = py + ph + 46
      g.font = "400 34px 'Instrument Serif', Georgia, serif"; g.fillText(o.title, 38, cy)
      g.font = "400 18px 'Instrument Serif', Georgia, serif"; g.globalAlpha = 0.7; g.fillText(o.meta, 40, cy + 22); g.globalAlpha = 1
      g.save(); g.translate(300, cy - 6); g.rotate(-0.04); g.font = "400 22px 'Instrument Serif', Georgia, serif"; g.fillText(o.note, 0, 0); g.restore()
      g.lineWidth = 1.5; g.beginPath(); wob(g, r, 296, cy + 6, 408, cy + 4); g.stroke()
      const bw = 112, bh = 64, y = cy + 62 // the storyboard row
      for (let k = 0; k < 3; k++) {
        const x = 36 + k * (bw + 20); g.lineWidth = 2; box(g, r, x, y, bw, bh); g.lineWidth = 1.5; figure(g, r, x + bw / 2, y + bh / 2, bh * 0.55)
        g.font = "400 16px 'Instrument Serif', serif"; g.fillText(String(k + 1), x + 4, y + bh + 15)
        if (k < 2) arrow(g, r, x + bw + 2, y + bh / 2, x + bw + 18)
      }
      g.lineWidth = 1.3; scrib(g, r, 36, y + bh + 26, 376, 36, 3); scrib(g, r, 36, y + bh + 70, 300, 24, 2)
    }
    if (o.hero) { // the title page: the hero sentence, big, slightly rotated
      g.save(); g.translate(w / 2 + 6, 104); g.rotate(-0.045); g.textAlign = 'center'; g.font = "400 66px 'Instrument Serif', Georgia, serif"
      const words = o.hero.split(' '), lines = []; let cur = ''
      for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (g.measureText(t).width > 380 && cur) { lines.push(cur); cur = wd } else cur = t }
      lines.push(cur); lines.forEach((l, k) => g.fillText(l, 0, k * 64)); g.restore()
      g.lineWidth = 1.6; g.beginPath(); wob(g, r, 60, 300, 300, 296); g.stroke()
    }
    g.font = "400 18px 'Instrument Serif', serif"; g.textAlign = 'center'; g.globalAlpha = 0.6; g.fillText(String(i + 1), w / 2, h - 10); g.globalAlpha = 1
  }
  function drawCover(g) {
    const w = CW, h = CH, r = rng(5)
    g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, w, h)
    g.strokeStyle = 'rgba(237,237,237,.05)'; g.lineWidth = 1; for (let y = 0; y < h; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (r() - 0.5) * 2); g.stroke() }
    g.strokeStyle = '#2a2a2a'; g.lineWidth = 3; g.strokeRect(14, 14, w - 28, h - 28)
    g.fillStyle = '#ededed'; g.fillRect(30, 52, 388, 218.25) // a pasted frame; the Showreel plays in it
    g.fillStyle = '#8f8f8f'; g.font = "400 30px 'Instrument Serif', Georgia, serif"; g.textAlign = 'center'; g.fillText('çizim defteri', w / 2, 360) // fake
    g.font = "400 20px 'Instrument Serif', serif"; g.fillText('2024 – 2026', w / 2, 392) // fake
  }
  function drawLoose(g, k) {
    const r = rng(300 + k * 9), w = CW, h = CH
    g.fillStyle = '#ededed'; g.fillRect(0, 0, w, h); g.strokeStyle = PEN; g.lineCap = 'round'
    if (k === 0) { g.strokeStyle = 'rgba(26,26,26,.25)'; g.lineWidth = 1; for (let x = 20; x < w; x += 28) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke() } for (let y = 20; y < h; y += 28) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke() }
      g.strokeStyle = PEN; g.lineWidth = 2; for (let n = 0; n < 4; n++) figure(g, r, 100 + (n % 2) * 220, 140 + Math.floor(n / 2) * 200, 90) }
    else if (k === 1) { g.lineWidth = 1.5; for (let n = 0; n < 5; n++) scrib(g, r, 40, 60 + n * 90, 360, 60, 4); g.font = "400 30px 'Instrument Serif', serif"; g.fillStyle = PEN; g.fillText('kesim listesi', 40, 44) } // fake
    else { g.lineWidth = 2; for (let n = 0; n < 6; n++) { box(g, r, 30 + (n % 2) * 205, 40 + Math.floor(n / 2) * 170, 185, 104); figure(g, r, 122 + (n % 2) * 205, 92 + Math.floor(n / 2) * 170, 60) } }
  }

  // ---------------------------------------------------------------------------------------------------- shaders
  const POOL = `
    uniform vec3 uLampP;
    float pool(vec2 p, float rx, float rz){ vec2 q = (p - uLampP.xz) / vec2(rx, rz); return exp(-dot(q, q)); }`
  const HASH = `
    float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hs(i), hs(i + vec2(1., 0.)), f.x), mix(hs(i + vec2(0., 1.)), hs(i + vec2(1., 1.)), f.x), f.y); }`
  const WVS = `varying vec3 vW, vN; varying vec2 vUv;
    void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`
  const DESK_FS = `
    precision highp float; varying vec3 vW, vN; varying vec2 vUv;
    ${POOL}${HASH}
    void main(){
      float p = pool(vW.xz, 9., 7.5);
      float g = vn(vW.xz * vec2(1.3, 9.)) * .5 + vn(vW.xz * 22.) * .3 + hs(floor(vW.xz * 90.)) * .2; // wood grain, grey
      vec3 col = vec3(.06 + .15 * p) * (.7 + .6 * g);
      gl_FragColor = vec4(col, 1.);
    }`
  const LIT_VS = `
    attribute vec3 color; varying vec3 vW, vN, vC;
    void main(){ vC = color; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`
  const LIT_FS = `
    precision highp float; varying vec3 vW, vN, vC;
    ${POOL}
    void main(){
      vec3 n = normalize(vN), L = normalize(vec3(uLampP.x, 7., uLampP.z) - vW);
      float nd = max(dot(n, L), 0.), p = pool(vW.xz, 8., 7.);
      gl_FragColor = vec4(min(vC * (.3 + .75 * nd) * (.45 + .65 * p), vec3(1.)), 1.);
    }`
  const STACK_FS = `
    precision highp float; varying vec3 vW, vN; varying vec2 vUv;
    ${POOL}
    void main(){
      if (vN.y > .5) discard;
      float st = fract(vW.y / .0245);
      float line = smoothstep(0., .35, st) * (1. - smoothstep(.65, 1., st));
      float p = pool(vW.xz, 8., 7.);
      vec3 col = vec3(.82) * (.7 + .3 * line) * (.4 + .7 * p) * (abs(vN.x) > .5 ? .78 : 1.);
      col *= mix(.55, 1., smoothstep(Y0A, Y0A + .12, vW.y));
      gl_FragColor = vec4(col, 1.);
    }`.replace(/Y0A/g, (Y0 + 0.02).toFixed(3))
  const LEAF_VS = `
    uniform float uF, uXf, uCg, uSg, uR, uCone, uYR, uYL, uPh;
    varying vec3 vW, vN; varying vec2 vUv;
    const float PI = 3.14159265;
    vec3 pmap(vec2 uw){
      float d = (uw.x - uXf) * uCg + uw.y * uSg;
      float R = max(uR * (1. + uCone * uw.y / (uPh * .5)), .0001);
      vec2 n = vec2(uCg, uSg), p = uw;
      float y = uYR, lift = 0.;
      if (d > 0.) {
        float b = d / R, s;
        if (b < PI) { s = R * sin(b); lift = R * (1. - cos(b)); } else { s = -(d - PI * R); lift = 2. * R; }
        p = uw - n * d + n * s;
        y = mix(uYR, uYL, clamp(d / (PI * R + .02), 0., 1.));
      }
      y += lift - .1 * (1. - smoothstep(0., .9, abs(p.x))); // the page sinks into the gutter
      return vec3(p.x, y, p.y);
    }
    void main(){
      vUv = uv;
      vec2 uw = vec2(position.x, -position.y);
      vec3 P = pmap(uw), Pu = pmap(uw + vec2(.03, 0.)), Pv = pmap(uw + vec2(0., .03));
      vN = normalize(cross(Pv - P, Pu - P)); vW = P;
      gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.);
    }`
  const LEAF_FS = `
    precision highp float;
    uniform sampler2D uPaper, uLoops, uShow;
    uniform vec4 uFP, uFPanel, uFLoop, uBP, uBPanel, uBLoop;
    uniform float uFKind, uFHot, uBHot, uFDraw, uBDraw, uTime, uLines, uPW, uPH;
    uniform vec3 uCam;
    varying vec3 vW, vN; varying vec2 vUv;
    ${POOL}${HASH}
    float tri(float x){ return abs(fract(x) - .5) * 2.; }
    float hatch(vec2 p, float ang, float freq, float cov){
      float x = (p.x * cos(ang) + p.y * sin(ang)) * freq;
      float aa = fwidth(x) * 1.5 + .02;
      return (1. - smoothstep(cov - aa, cov + aa, tri(x))) * smoothstep(0., .08, cov);
    }
    vec3 face(vec2 uv, vec4 pr, vec4 pn, vec4 lp, float kind, float hot, float draw, float li){
      vec3 col = texture2D(uPaper, pr.xy + clamp(uv, .002, .998) * pr.zw).rgb * li;
      if (uv.x > pn.x && uv.x < pn.z && uv.y > pn.y && uv.y < pn.w) {
        vec2 q = (uv - pn.xy) / (pn.zw - pn.xy);
        if (kind > .5) col = texture2D(uShow, q).rgb * mix(.88, 1., li);
        else {
          vec3 t = texture2D(uLoops, lp.xy + q * lp.zw).rgb;
          float rv = smoothstep(0., .3, draw * 1.5 - (q.x * .6 + (1. - q.y) * .9) - hs(floor(q * 36.)) * .15);
          float L = mix(1., clamp(dot(t, vec3(.3, .59, .11)) * 1.1, 0., 1.), rv);
          float tb = floor(uTime * 6.);
          vec2 pp = uv * vec2(uPW, uPH) + .004 * vec2(sin(tb * 1.7 + uv.y * 50.), cos(tb * 2.3 + uv.x * 50.)); // the pencil boils a little
          float cv1 = clamp((.9 - L) * 1.1, 0., .8), cv2 = clamp((.6 - L) * 1.4, 0., .8), cv3 = clamp((.32 - L) * 2., 0., .85);
          float ink = max(hatch(pp, .7, uLines, cv1), max(hatch(pp, -.6, uLines * 1.05, cv2), hatch(pp, 1.45, uLines * 1.1, cv3)));
          ink *= .82 + .18 * vn(pp * 30.);
          col = mix(vec3(.93) * li, vec3(.102), ink * .9) * (1. - .3 * hot);
        }
      }
      return col;
    }
    void main(){
      bool fr = gl_FrontFacing;
      vec3 n = normalize(vN); if (!fr) n = -n;
      vec3 lp3 = vec3(uLampP.x, 7., uLampP.z), L = normalize(lp3 - vW), V = normalize(uCam - vW);
      float li = .42 + .62 * pool(vW.xz, 7.5, 6.);
      float diff = max(dot(n, L), 0.);
      float shade = mix(.55, 1., diff);
      float spec = pow(max(dot(n, normalize(L + V)), 0.), 36.) * .3 * smoothstep(.02, .35, 1. - n.y);
      vec3 col = fr ? face(vUv, uFP, uFPanel, uFLoop, uFKind, uFHot, uFDraw, li) : face(vec2(1. - vUv.x, vUv.y), uBP, uBPanel, uBLoop, 0., uBHot, uBDraw, li);
      col *= shade * mix(.55, 1., smoothstep(0., 1.1, abs(vW.x)));
      gl_FragColor = vec4(min(col + spec, vec3(1.)), 1.);
    }`
  const SHADOW_FS = `
    precision highp float; varying vec3 vW, vN; varying vec2 vUv;
    uniform vec4 uSh[4]; uniform vec4 uSh2[4]; uniform float uPH;
    void main(){
      float a = 0.;
      for (int i = 0; i < 4; i++) {
        vec4 A = uSh[i], B = uSh2[i];
        if (B.y > .001) {
          float d = (vW.x - A.x) * A.y + vW.z * A.z, R = A.w;
          float cyl = smoothstep(-.12, .1, d) * (1. - smoothstep(R * .6, R * 1.7 + .25, d));
          float fl = B.x - 3.14159 * R, s = R * .9 + .18;
          float flat_ = fl > .01 ? smoothstep(-fl - s, -fl + s, d) * (1. - smoothstep(-s, s, d)) : 0.;
          a = max(a, B.y * max(cyl * .85, flat_ * .55));
        }
      }
      gl_FragColor = vec4(0., 0., 0., a);
    }`
  const FLAT_FS = `
    precision highp float; varying vec3 vW, vN; varying vec2 vUv;
    uniform sampler2D uPaper; uniform vec4 uRect;
    ${POOL}
    void main(){ vec3 t = texture2D(uPaper, uRect.xy + clamp(vUv, .002, .998) * uRect.zw).rgb; gl_FragColor = vec4(t * (.4 + .65 * pool(vW.xz, 8., 7.)) * .95, 1.); }`
  const FLOAT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`
  const FLOAT_FS = `
    precision highp float; varying vec2 vUv; uniform sampler2D uMap; uniform vec4 uRect; uniform vec2 uBorder; uniform float uA;
    void main(){
      vec2 iu = (vUv - uBorder) / (1. - 2. * uBorder);
      bool inside = iu.x > 0. && iu.x < 1. && iu.y > 0. && iu.y < 1.;
      vec3 col = vec3(.93);
      if (inside) { float e = min(min(iu.x, 1. - iu.x), min(iu.y, 1. - iu.y)); col = texture2D(uMap, uRect.xy + clamp(iu, .002, .998) * uRect.zw).rgb * mix(.7, 1., smoothstep(0., .02, e)); }
      gl_FragColor = vec4(col * (.9 + .1 * uA), 1.);
    }`
  const QS_VS = `attribute float aA; varying vec2 vUv; varying float vA;
    void main(){ vUv = uv; vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`
  const QS_FS = `precision highp float; uniform sampler2D uMap; varying vec2 vUv; varying float vA;
    void main(){ gl_FragColor = vec4(0., 0., 0., texture2D(uMap, vUv).a * vA); }`

  function merge(parts) { // tiny geometry merge with vertex colours
    let np = 0, ni = 0
    parts.forEach((p) => { np += p.geo.attributes.position.count; ni += p.geo.index.count })
    const pos = new Float32Array(np * 3), nor = new Float32Array(np * 3), col = new Float32Array(np * 3), idx = new Uint16Array(ni)
    let o = 0, io = 0
    const c = new THREE.Color()
    parts.forEach((p) => {
      p.geo.translate(p.at[0], p.at[1], p.at[2]); c.setHex(p.color)
      const a = p.geo.attributes.position, b = p.geo.attributes.normal
      for (let k = 0; k < a.count; k++) { pos.set([a.getX(k), a.getY(k), a.getZ(k)], (o + k) * 3); nor.set([b.getX(k), b.getY(k), b.getZ(k)], (o + k) * 3); col.set([c.r, c.g, c.b], (o + k) * 3) }
      for (let k = 0; k < p.geo.index.count; k++) idx[io + k] = p.geo.index.getX(k) + o
      o += a.count; io += p.geo.index.count; p.geo.dispose()
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1))
    return g
  }

  // ---------------------------------------------------------------------------------------------------- the world
  HOME.register({
    name: 'Sketchbook',
    create(ctx) {
      const size = ctx.size, works = ctx.works, P = ctx.pointer, touch = ctx.touch
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(FOV, size.w / size.h, 0.1, 200)
      camera.up.set(0, 0, -1) // the top of a page is away from us
      scene.add(camera)
      const keep = { tex: [], geo: [], mat: [] }
      const hud = new THREE.Group(); camera.add(hud)
      const unit = new THREE.PlaneGeometry(1, 1); keep.geo.push(unit)
      const U = { uLampP: { value: new THREE.Vector3(-2.5, 7, -2.5) }, uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } }

      // soft-shadow texture (rounded box falling to zero)
      const sdf = (() => {
        const N = 64, d = new Uint8Array(N * N * 4)
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const x = Math.abs(((i + 0.5) / N) * 2 - 1), y = Math.abs(((j + 0.5) / N) * 2 - 1), e = Math.max(x, y) < 0.78 ? Math.max(x, y) - 0.78 : Math.hypot(Math.max(x - 0.78, 0), Math.max(y - 0.78, 0))
          const a = 1 - clamp(e / 0.22, 0, 1), s = a * a * (3 - 2 * a); d.set([0, 0, 0, Math.round(s * 255)], (j * N + i) * 4)
        }
        const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true
        keep.tex.push(t); return t
      })()

      // ---- paper atlas: 8 pages, the cover, 3 loose sheets (4 x 3 cells) ----------------------------------------------------
      const cv = document.createElement('canvas'); cv.width = CW * 4; cv.height = CH * 3
      const g2 = cv.getContext('2d')
      const cells = []
      const cell = (n, draw) => { const cx = (n % 4) * CW, cy = Math.floor(n / 4) * CH; g2.save(); g2.translate(cx, cy); g2.beginPath(); g2.rect(0, 0, CW, CH); g2.clip(); draw(g2); g2.restore(); cells[n] = [cx / (CW * 4), 1 - (cy + CH) / (CH * 3), 1 / 4, 1 / 3] }
      for (let s = 0; s < 4; s++) {
        cell(s, (g) => drawPage(g, s * 2, true, { n: s * 2 + 1, title: works[s * 2].title, meta: `${works[s * 2].kind} · ${works[s * 2].year}`, note: NOTES[s * 2], low: s === 0, hero: s === 0 ? ctx.hero : null }))
        cell(4 + s, (g) => drawPage(g, s * 2 + 1, false, { n: s * 2 + 2, title: works[s * 2 + 1].title, meta: `${works[s * 2 + 1].kind} · ${works[s * 2 + 1].year}`, note: NOTES[s * 2 + 1] }))
      }
      cell(8, drawCover); for (let k = 0; k < 3; k++) cell(9 + k, (g) => drawLoose(g, k))
      const paper = new THREE.CanvasTexture(cv); paper.generateMipmaps = false; paper.minFilter = paper.magFilter = THREE.LinearFilter; paper.anisotropy = 4; keep.tex.push(paper)
      const rects = []; for (let i = 0; i < 8; i++) rects.push(ctx.loopRect(i))

      // ---- the desk, the book ------------------------------------------------------------------------------------------------
      const deskMat = new THREE.ShaderMaterial({ vertexShader: WVS, fragmentShader: DESK_FS, uniforms: { uLampP: U.uLampP } }); keep.mat.push(deskMat)
      const deskGeo = new THREE.PlaneGeometry(80, 80); deskGeo.rotateX(-PI / 2); keep.geo.push(deskGeo)
      scene.add(new THREE.Mesh(deskGeo, deskMat))
      const litMat = new THREE.ShaderMaterial({ vertexShader: LIT_VS, fragmentShader: LIT_FS, uniforms: { uLampP: U.uLampP } }); keep.mat.push(litMat)
      const colorBox = (w, h, d, hex, at) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(at[0], at[1], at[2]); const n = b.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3); for (let k = 0; k < n; k++) a.set([c.r, c.g, c.b], k * 3); b.setAttribute('color', new THREE.BufferAttribute(a, 3)); keep.geo.push(b); return b }
      const boardR = new THREE.Mesh(colorBox(PWd + 0.25, Y0, PHt + 0.3, 0x2a2a2a, [(PWd + 0.25) / 2 - 0.02, Y0 / 2, 0]), litMat); scene.add(boardR)
      const boardL = new THREE.Mesh(colorBox(PWd + 0.25, Y0, PHt + 0.3, 0x2a2a2a, [-(PWd + 0.25) / 2 + 0.02, Y0 / 2, 0]), litMat); scene.add(boardL)
      const stackMat = new THREE.ShaderMaterial({ vertexShader: WVS, fragmentShader: STACK_FS, uniforms: { uLampP: U.uLampP } }); keep.mat.push(stackMat)
      const sgR = new THREE.BoxGeometry(1, 1, 1); sgR.translate(0.5, 0.5, 0); const sgL = new THREE.BoxGeometry(1, 1, 1); sgL.translate(-0.5, 0.5, 0); keep.geo.push(sgR, sgL)
      const stackR = new THREE.Mesh(sgR, stackMat), stackL = new THREE.Mesh(sgL, stackMat); scene.add(stackR, stackL)

      // leaves: 0 the cover, 1-3 the turning pages, 4 the last right page (never turns)
      const leafGeo = new THREE.PlaneGeometry(PWd, PHt, 56, 14); leafGeo.translate(PWd / 2, 0, 0); keep.geo.push(leafGeo)
      const V4 = (a) => new THREE.Vector4(a[0], a[1], a[2], a[3])
      const mkLeaf = (m, front, back, fPanel, bPanel, fKind) => {
        const mat = new THREE.ShaderMaterial({
          side: THREE.DoubleSide, vertexShader: LEAF_VS, fragmentShader: LEAF_FS, extensions: { derivatives: true },
          uniforms: {
            uF: { value: 0 }, uXf: { value: PWd }, uCg: { value: 1 }, uSg: { value: 0 }, uR: { value: 0 }, uCone: { value: 0.4 }, uYR: { value: Y0 + TL * (K - m) + (m === 4 ? 0.002 : 0) }, uYL: { value: Y0 + TL * (m + 1) }, uPh: { value: PHt },
            uPaper: { value: paper }, uLoops: { value: ctx.atlas }, uShow: { value: ctx.showreel.texture },
            uFP: { value: V4(front.page) }, uFPanel: { value: V4(fPanel) }, uFLoop: { value: V4(front.loop) }, uBP: { value: V4(back ? back.page : [0, 0, 0, 0]) }, uBPanel: { value: V4(bPanel || [0, 0, 0, 0]) }, uBLoop: { value: V4(back ? back.loop : [0, 0, 0, 0]) },
            uFKind: { value: fKind || 0 }, uFHot: { value: 0 }, uBHot: { value: 0 }, uFDraw: { value: 0 }, uBDraw: { value: 0 },
            uTime: U.uTime, uLines: { value: 22 }, uPW: { value: PWd }, uPH: { value: PHt }, uLampP: U.uLampP, uCam: U.uCam,
          },
        })
        keep.mat.push(mat)
        const mesh = new THREE.Mesh(leafGeo, mat); mesh.frustumCulled = false; scene.add(mesh)
        return { mesh, mat, u: mat.uniforms }
      }
      const pg = (n) => cells[n], lp = (i) => rects[i]
      // faces: left pages 0-3 (Works 0,2,4,6), right pages 4-7 (Works 1,3,5,7)
      const leaves = [
        mkLeaf(0, { page: pg(8), loop: [0, 0, 0, 0] }, { page: pg(0), loop: lp(0) }, LABEL, PANEL_LO, 1),
        mkLeaf(1, { page: pg(4), loop: lp(1) }, { page: pg(1), loop: lp(2) }, PANEL, PANEL),
        mkLeaf(2, { page: pg(5), loop: lp(3) }, { page: pg(2), loop: lp(4) }, PANEL, PANEL),
        mkLeaf(3, { page: pg(6), loop: lp(5) }, { page: pg(3), loop: lp(6) }, PANEL, PANEL),
        mkLeaf(4, { page: pg(7), loop: lp(7) }, null, PANEL, null),
      ]
      // face ids: 0..3 the left pages (leaf m's back), 4..7 the right pages (leaf m+1's front)

      // shadow overlays on the pages (one shader, two planes)
      const shMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: WVS, fragmentShader: SHADOW_FS, uniforms: { uSh: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(PWd, 1, 0, 0)) }, uSh2: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) }, uPH: { value: PHt } } }); keep.mat.push(shMat)
      const shGeoR = new THREE.PlaneGeometry(PWd, PHt); shGeoR.rotateX(-PI / 2); shGeoR.translate(PWd / 2, 0, 0)
      const shGeoL = new THREE.PlaneGeometry(PWd, PHt); shGeoL.rotateX(-PI / 2); shGeoL.translate(-PWd / 2, 0, 0); keep.geo.push(shGeoR, shGeoL)
      const shR = new THREE.Mesh(shGeoR, shMat), shL = new THREE.Mesh(shGeoL, shMat); shR.renderOrder = shL.renderOrder = 4; scene.add(shR, shL)

      // ---- props: pencil, eraser, loose sheets, shadows -------------------------------------------------------------------------
      const pencilGeo = merge([
        { geo: new THREE.CylinderGeometry(0.085, 0.085, 2.7, 6).rotateZ(PI / 2), color: 0x8f8f8f, at: [-0.1, 0, 0] },
        { geo: new THREE.CylinderGeometry(0.087, 0.087, 0.24, 6).rotateZ(PI / 2), color: 0xededed, at: [-1.57, 0, 0] },
        { geo: new THREE.CylinderGeometry(0.083, 0.083, 0.18, 8).rotateZ(PI / 2), color: 0x2a2a2a, at: [-1.78, 0, 0] },
        { geo: new THREE.ConeGeometry(0.085, 0.5, 6).rotateZ(-PI / 2), color: 0xc4c4c4, at: [1.5, 0, 0] },
        { geo: new THREE.ConeGeometry(0.022, 0.15, 6).rotateZ(-PI / 2), color: 0x1a1a1a, at: [1.82, 0, 0] },
      ]); keep.geo.push(pencilGeo)
      const eraserGeo = merge([
        { geo: new THREE.BoxGeometry(0.9, 0.3, 0.5), color: 0xededed, at: [0.18, 0.15, 0] },
        { geo: new THREE.BoxGeometry(0.42, 0.31, 0.51), color: 0x2a2a2a, at: [-0.4, 0.155, 0] },
      ]); keep.geo.push(eraserGeo)
      const pencil = new THREE.Mesh(pencilGeo, litMat); pencil.rotation.order = 'YXZ'; scene.add(pencil)
      const eraser = new THREE.Mesh(eraserGeo, litMat); scene.add(eraser)
      const looseMeshes = [0, 1, 2].map((k) => {
        const gg = new THREE.PlaneGeometry(2.7, 2.7 * (CH / CW)); gg.rotateX(-PI / 2); keep.geo.push(gg)
        const mt = new THREE.ShaderMaterial({ vertexShader: WVS, fragmentShader: FLAT_FS, uniforms: { uPaper: { value: paper }, uRect: { value: V4(cells[9 + k]) }, uLampP: U.uLampP } }); keep.mat.push(mt)
        const m = new THREE.Mesh(gg, mt); scene.add(m); return m
      })
      // shadow quads: 0 book, 1-3 loose sheets, 4 pencil, 5 eraser, 6 the floating panel
      const NQ = 7, qpos = new Float32Array(NQ * 12), qa = new Float32Array(NQ * 4), quv = new Float32Array(NQ * 8), qidx = new Uint16Array(NQ * 6)
      for (let k = 0; k < NQ; k++) { quv.set([0, 1, 1, 1, 1, 0, 0, 0], k * 8); qidx.set([k * 4, k * 4 + 2, k * 4 + 1, k * 4, k * 4 + 3, k * 4 + 2], k * 6) }
      const qgeo = new THREE.BufferGeometry()
      qgeo.setAttribute('position', new THREE.BufferAttribute(qpos, 3).setUsage(THREE.DynamicDrawUsage)); qgeo.setAttribute('aA', new THREE.BufferAttribute(qa, 1).setUsage(THREE.DynamicDrawUsage))
      qgeo.setAttribute('uv', new THREE.BufferAttribute(quv, 2)); qgeo.setIndex(new THREE.BufferAttribute(qidx, 1)); keep.geo.push(qgeo)
      const qMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: QS_VS, fragmentShader: QS_FS, uniforms: { uMap: { value: sdf } } }); keep.mat.push(qMat)
      const quads = new THREE.Mesh(qgeo, qMat); quads.frustumCulled = false; quads.renderOrder = 3; scene.add(quads)
      const setQuad = (k, cx, y, cz, hw, hh, ang, a) => { // a flat shadow quad on the desk (hw, hh are paper half sizes; the soft rim is added)
        const c = Math.cos(ang), s = Math.sin(ang), ex = hw / 0.78, ez = hh / 0.78
        for (let q = 0; q < 4; q++) {
          const lx = q === 0 || q === 3 ? -ex : ex, lz = q < 2 ? -ez : ez
          qpos[(k * 4 + q) * 3] = cx + lx * c - lz * s; qpos[(k * 4 + q) * 3 + 1] = y; qpos[(k * 4 + q) * 3 + 2] = cz + lx * s + lz * c; qa[k * 4 + q] = a
        }
      }

      // ---- the floating panel and the tags ------------------------------------------------------------------------------------------
      const fMat = new THREE.ShaderMaterial({ vertexShader: FLOAT_VS, fragmentShader: FLOAT_FS, uniforms: { uMap: { value: ctx.atlas }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uBorder: { value: new THREE.Vector2(0.17 / 4.24, 0.17 / 2.53) }, uA: { value: 0 } } }); keep.mat.push(fMat)
      const fGeo = new THREE.PlaneGeometry(1, 1); keep.geo.push(fGeo)
      const flo = new THREE.Mesh(fGeo, fMat); flo.visible = false; flo.frustumCulled = false; scene.add(flo)
      const mkText = (str, opts) => {
        const t = ctx.text(str, opts); keep.tex.push(t.texture)
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

      // ---- state --------------------------------------------------------------------------------------------------------------------------
      let portrait = size.w < size.h, Drest = 10, visWc = 12.5, visHc = 7
      let q = 0, qv = 0, qT = 1, lastScroll = ctx.scroll.y, idle = 0, rs = 0, kSp = 38, gam = 0.16, Rm = 0.42
      const O = { dive: 0 }, fly = { k: 0 }
      let opening = false, flying = false, flyIdx = -1, hot = -1, hoverOn = false, focusCell = -1, cand = -1, dwell = 0
      let fw = -1, fa = 0, tagCell = 0, tagA = 0
      let drag = null, wasDown = false, lookX = 0, lookY = 0
      let tl = null, flyTl = null, backTw = null
      const drawA = new Float32Array(8), hotA = new Float32Array(8)
      const pose = { x: 0, y: 0, w: 0, l: 0, t: 0, init: false }
      const hm = { x: 0, y: 0 }
      const roll = { a: 0, v: 0, z0: 0 }
      let slapT = 0, slapAmt = 0, prevQ = 0
      const HP = [0, 0]
      const V3 = new THREE.Vector3(), V3b = new THREE.Vector3(), V3c = new THREE.Vector3(), Qa = new THREE.Quaternion(), Qb = new THREE.Quaternion(), EUL = new THREE.Euler(-PI / 2, 0, 0)
      const Qflat = new THREE.Quaternion().setFromEuler(EUL)
      const top = { R: Y0, L: Y0 }
      function hitAt(y) { // the pointer's ray meets the horizontal plane at height y: HP = [x, z]
        V3.set(P.nx, P.ny, 0.5).unproject(camera); V3.sub(camera.position).normalize()
        const tt = (y - camera.position.y) / V3.y
        if (!(tt > 0)) return false
        HP[0] = camera.position.x + V3.x * tt; HP[1] = camera.position.z + V3.z * tt; return true
      }
      const fr = new Array(4).fill(0) // leaf fractions

      // pencil, eraser, loose sheets: a different arrangement for a tall phone
      function placeProps() {
        const p = portrait
        const sheets = p ? [[-3.0, -6.2, 0.35], [3.1, -7.6, -0.3], [-1.2, 6.9, 0.5]] : [[-6.4, -1.0, 0.4], [6.6, 1.3, -0.3], [-5.0, 3.1, 0.55]]
        looseMeshes.forEach((m, k) => { m.position.set(sheets[k][0], 0.012 + k * 0.002, sheets[k][1]); m.rotation.y = sheets[k][2] })
        pencil.position.set(p ? 1.2 : 3.4, 0.085, p ? 5.6 : 3.9); pencil.rotation.y = 0.14; roll.z0 = pencil.position.z
        eraser.position.set(p ? -2.2 : -2.1, 0, p ? 6.4 : 3.8); eraser.rotation.y = -0.35
      }
      function fitCamera() {
        portrait = size.w < size.h
        const asp = size.w / size.h
        if (portrait) { visWc = 9.6; visHc = visWc / asp } else { visHc = 7; visWc = visHc * asp; if (visWc < 9.8) { visWc = 9.8; visHc = visWc / asp } }
        Drest = visHc / 2 / TN
        camera.aspect = asp; camera.updateProjectionMatrix()
        placeProps()
        leaves.forEach((l) => { l.u.uLines.value = clamp(size.w / visWc / 4.6, 7, 26) }) // hatch pitch follows the pixels per unit
      }

      // the floating panel's pose in screen px (same layout as the other prototypes)
      function frameOf(i, dt) {
        const w = size.w, h = size.h, asp = w / h, tg = tags[i], ps = pose
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

      // where a Work's panel is on the desk now: world centre and size (null when its page is not on top)
      const faceOfWork = (i) => (i % 2 ? 4 + (i - 1) / 2 : i / 2)
      function panelWorld(face, out) {
        const pn = face === 0 ? PANEL_LO : PANEL, left = face < 4
        const x0 = left ? -PWd + pn[0] * PWd : pn[0] * PWd, x1 = left ? -PWd + pn[2] * PWd : pn[2] * PWd
        const z0 = -PHt / 2 + (1 - pn[3]) * PHt, z1 = -PHt / 2 + (1 - pn[1]) * PHt
        out.cx = (x0 + x1) / 2; out.cz = (z0 + z1) / 2; out.w = x1 - x0; out.h = z1 - z0; out.left = left
        return out
      }
      const PW_ = { cx: 0, cz: 0, w: 1, h: 1, left: false }

      // ---- the opening, the fly-in ---------------------------------------------------------------------------------------------------------
      function startOpening() {
        opening = true; q = 0; qv = 0; qT = 1; O.dive = 1
        tl = gsap.timeline({ onComplete: () => { opening = false } })
        tl.to(O, { dive: 0, duration: 1.2, ease: 'power2.inOut' }, 0.45)
        tl.to(S, { q: 1, duration: 1.45, ease: 'power3.inOut' }, 1.2)
      }
      const S = { get q() { return q }, set q(v) { q = v } } // gsap drives the book's progress during the opening
      function finishOpening() { if (tl) tl.progress(1, true); opening = false; O.dive = 0; q = 1; qv = 0; qT = 1; drawA[0] = drawA[4] = 1 }
      function flyTo(i) {
        if (flying || opening || i < 0) return
        flying = true; flyIdx = i; hot = i; ctx.cursor.hover(false); hoverOn = false; drag = null
        frameOf(i, 0.016)
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        flyTl.to(fly, { k: 1, duration: 0.72, ease: 'power3.in' }, 0.12)
      }
      function goTo(i) { const s = Math.floor(i / 2); qT = s + 1; q = qT; qv = 0 } // keyboard: no waiting for pages

      // ---- the frame ------------------------------------------------------------------------------------------------------------------------
      function update(t, dt) {
        dt = clamp(dt, 0.0001, 0.033)
        if ((size.w < size.h) !== portrait) fitCamera()
        const w = size.w, h = size.h, asp = w / h, sc = ctx.scroll
        U.uTime.value = t
        const live = !opening && !flying

        // ---- scroll turns pages, with weight; idle scroll snaps to a spread
        const dy = sc.y - lastScroll; lastScroll = sc.y
        if (live && !drag) {
          qT = clamp(qT + dy / clamp(h * 0.6, 320, 560), 1, 4)
          if (Math.abs(sc.v) > 25 || Math.abs(dy) > 0.5) idle = 0; else idle += dt
          if (idle > 0.28) qT = Math.round(qT)
        }
        // ---- the corner drag: press near an outer corner, curl that corner by hand
        const down = P.down && live && !touch
        if (live) {
          const k = Math.round(q)
          if (down && !wasDown && Math.abs(q - k) < 0.06) {
            for (let a = 0; a < 2 && !drag; a++) {
              const side = a ? -1 : 1, m = side > 0 ? k : k - 1
              if (side > 0 ? k >= 4 : k <= 1) continue
              if (!hitAt(side > 0 ? top.R : top.L)) continue
              const cz = HP[1] > 0 ? PHt / 2 : -PHt / 2
              if (Math.hypot(HP[0] - side * PWd, HP[1] - cz) < 1.7) drag = { m, sgn: HP[1] > 0 ? 1 : -1 }
            }
          }
          if (drag) {
            if (!down) { qT = q - drag.m >= 0.5 ? drag.m + 1 : drag.m; kSp = 70; drag = null }
            else { if (hitAt((top.R + top.L) * 0.5 + 0.05)) { const nq = drag.m + clamp((PWd - HP[0]) / (2 * PWd), 0, 1); qv = ((nq - q) / dt) * 0.2; q += (nq - q) * Math.min(1, dt * 22) } qT = q }
          }
        }
        wasDown = down
        if (!opening) {
          kSp = lerp(kSp, 38, Math.min(1, dt * 1.5))
          if (!drag) { qv += (kSp * (qT - q) - 9.5 * qv) * dt; q += qv * dt }
          if (q < 1) { q = 1; qv = Math.max(qv, 0) } else if (q > 4) { q = 4; qv = Math.min(qv, 0) }
          const near = Math.round(qT)
          if (!drag && (prevQ - near) * (q - near) <= 0 && Math.abs(qv) > 1 && t - slapT > 0.3) { slapT = t; slapAmt = Math.min(1, Math.abs(qv) / 4); roll.v += (Math.random() < 0.5 ? -1 : 1) * (1 + slapAmt * 4) } // a leaf lands: soft slap
        }
        prevQ = q
        const rT = drag || opening ? 0 : clamp(Math.abs(qv) / 3, 0, 1)
        rs += (rT - rs) * (1 - Math.exp(-dt * (rT > rs ? 6 : 3)))
        gam += ((drag ? 0.34 * drag.sgn : 0.16) - gam) * Math.min(1, dt * 8)
        Rm += ((drag ? 0.55 : 0.42 + 0.5 * rs) - Rm) * Math.min(1, dt * 8)

        // ---- leaf fractions, fold parameters, stack heights
        let nL = 0, nR = 0
        for (let m = 0; m < K; m++) {
          const f = clamp(q - m * (1 - 0.7 * rs), 0, 1), sn = Math.sin(PI * f), gg = gam * sn, Lh = (PHt / 2) * Math.abs(Math.sin(gg))
          const xf = (PWd + Lh) * (1 - f) - (Lh + 0.02) * f, R = Rm * (m === 0 && opening ? 1.5 : 1) * Math.pow(sn, 0.7), cg = Math.cos(gg), sg = Math.sin(gg)
          fr[m] = f; nL += f; nR += 1 - f
          const u = leaves[m].u
          u.uF.value = f; u.uXf.value = xf; u.uCg.value = cg; u.uSg.value = sg; u.uR.value = R; u.uCone.value = gg >= 0 ? 0.45 : -0.45
          shMat.uniforms.uSh.value[m].set(xf, cg, sg, Math.max(R, 0.02))
          shMat.uniforms.uSh2.value[m].set((PWd - xf) * cg + (PHt / 2) * Math.abs(sg), f > 0.004 && f < 0.996 ? sn * 0.85 : 0, 0, 0)
        }
        top.R = Y0 + TL * nR; top.L = Y0 + TL * nL
        stackR.scale.set(PWd - 0.02, Math.max(0.001, top.R - Y0), PHt - 0.04); stackR.position.set(0.01, Y0, 0)
        stackL.scale.set(PWd - 0.02, Math.max(0.001, top.L - Y0), PHt - 0.04); stackL.position.set(-0.01, Y0, 0)
        stackL.visible = nL > 0.02
        shR.position.y = top.R + 0.003; shL.position.y = top.L + 0.003
        boardL.visible = fr[0] > 0.2; boardL.scale.x = clamp((fr[0] - 0.2) / 0.7, 0.01, 1)

        // ---- camera: the pointer leans the view; the opening and the fly-in are camera dives
        const kl = 1 - Math.exp(-dt * 3), lv = P.inside && !touch && !opening
        lookX += ((lv ? P.nx : 0) * 0.16 - lookX) * kl; lookY += ((lv ? P.ny : 0) * 0.1 - lookY) * kl
        const f0 = fr[0], openA = f0 * f0 * (3 - 2 * f0)
        const bookX = (PWd / 2) * (1 - openA)
        const labelW = (388 / CW) * PWd, labelH = (labelW * 9) / 16
        const Dfill = Math.min(labelW / (2 * TN * asp), labelH / (2 * TN)) * 0.985
        const lblX = ((30 + 388 / 2) / CW) * PWd, lblZ = -PHt / 2 + ((52 + 218.25 / 2) / CH) * PHt
        const dv = O.dive * O.dive * (3 - 2 * O.dive)
        let tx = lerp(bookX, lblX, dv), tz = lerp(0, lblZ, dv), ty = lerp(0.2, Y0 + TL * K + 0.01, dv)
        let ee = lerp(55 * (PI / 180) + lookY, 89 * (PI / 180), dv), Dc = lerp(Drest, Dfill, dv)
        if (fly.k > 0 && flyIdx >= 0) { // dive into the floating panel
          const c = fly.k * fly.k * (3 - 2 * fly.k); panelWorld(faceOfWork(flyIdx), PW_)
          tx = lerp(tx, PW_.cx, c * 0.8); tz = lerp(tz, PW_.cz, c * 0.8); ee = lerp(ee, 78 * (PI / 180), c); Dc = lerp(Dc, Dc * 0.5, c)
        }
        camera.position.set(tx + Dc * Math.cos(ee) * Math.sin(lookX), ty + Dc * Math.sin(ee), tz + Dc * Math.cos(ee) * Math.cos(lookX))
        camera.lookAt(tx, ty, tz); camera.updateMatrixWorld()
        U.uCam.value.copy(camera.position)
        U.uLampP.value.set(-2.5 + (lv ? P.nx * 1.3 : 0), 7, -2.5 - (lv ? P.ny * 0.9 : 0))

        // ---- draw-in per face: the settled spread draws itself, the others fade
        const sNow = Math.round(q) - 1, settled = Math.abs(q - Math.round(q)) < 0.05 || (opening && q > 0.8)
        for (let f = 0; f < 8; f++) drawA[f] = clamp(drawA[f] + (settled && (f < 4 ? f : f - 4) === sNow ? dt * 0.75 : -dt * 3), 0, 1)

        // ---- hover: a dwell on the settled spread's panels; a floating sheet keeps it while the pointer is on it
        const spreadOk = !opening && !flying && !touch && P.inside && !drag && Math.abs(q - Math.round(q)) < 0.08
        let pick = -1
        if (spreadOk) {
          const px = ((P.nx + 1) / 2) * w, py = ((1 - P.ny) / 2) * h
          if (hot >= 0 && fa > 0.5 && Math.abs(px - pose.x) < (pose.w / 2) * 1.06 && Math.abs(py - pose.y) < ((pose.w * 9) / 32) * 1.06) { pick = hot; dwell = 1; cand = hot } else {
            let c2 = -1
            for (let a = 0; a < 2; a++) {
              const wk = sNow * 2 + a; panelWorld(faceOfWork(wk), PW_)
              if (hitAt(PW_.left ? top.L : top.R) && Math.abs(HP[0] - PW_.cx) < PW_.w / 2 + 0.05 && Math.abs(HP[1] - PW_.cz) < PW_.h / 2 + 0.05) c2 = wk
            }
            if (c2 !== cand) { dwell = 0; cand = c2 } else if (c2 >= 0 && Math.abs(P.dx) + Math.abs(P.dy) < 14) dwell += dt
            pick = c2 >= 0 && dwell > 0.12 ? c2 : -1
          }
        } else { dwell = 0; cand = -1 }
        if ((pick >= 0) !== hoverOn) { hoverOn = pick >= 0; ctx.cursor.hover(hoverOn) }
        if (focusCell >= 0 && live && Math.floor(focusCell / 2) !== sNow) goTo(focusCell)
        hot = flying ? flyIdx : pick >= 0 ? pick : !opening && focusCell >= 0 && Math.abs(q - Math.round(q)) < 0.08 ? focusCell : -1

        // ---- the floating panel: lifts from its page to a view-facing sheet; one at a time
        if (hot >= 0 && hot !== fw) {
          if (fa > 0.02) fa += (0 - fa) * Math.min(1, dt * 12)
          else { fw = hot; fMat.uniforms.uRect.value.set(rects[hot][0], rects[hot][1], rects[hot][2], rects[hot][3]); pose.init = false }
        } else fa += ((hot >= 0 ? 1 : 0) - fa) * Math.min(1, dt * (hot >= 0 ? 8 : 6))
        if (fa < 0.003 && hot < 0) { fa = 0; pose.init = false }
        hotA.fill(0); if (fw >= 0) hotA[faceOfWork(fw)] = fa
        flo.visible = fa > 0.01 && fw >= 0
        if (fw >= 0) {
          panelWorld(faceOfWork(fw), PW_)
          const topY = (PW_.left ? top.L : top.R) + 0.012
          V3.set(PW_.cx, topY, PW_.cz).project(camera); hm.x = (V3.x * 0.5 + 0.5) * w; hm.y = (0.5 - V3.y * 0.5) * h
          if (fa > 0.002) {
            frameOf(fw, dt)
            const fk = fw === flyIdx ? fly.k : 0
            const cx = lerp(pose.x, w / 2, fk), cy = lerp(pose.y, h / 2, fk), fill = Math.max(w, (h * 16) / 9) * 1.03 * IWr, wpx = lerp(pose.w * IWr, fill, fk)
            const dT = Dc * 0.45, visH = 2 * TN * dT, visW = visH * asp
            V3b.set(((cx / w) * 2 - 1) * (visW / 2), (1 - (cy / h) * 2) * (visH / 2), -dT).applyMatrix4(camera.matrixWorld) // target centre
            const e = fa * fa * (3 - 2 * fa)
            V3c.set(PW_.cx, topY + Math.sin(PI * e) * 0.5, PW_.cz)
            flo.position.lerpVectors(V3c, V3b, e)
            flo.quaternion.copy(Qflat).slerp(camera.quaternion, e)
            const sw = lerp(PW_.w * IWr, (wpx / w) * visW, e); flo.scale.set(sw, (sw * 2.53) / 4.24, 1)
            fMat.uniforms.uA.value = e
          }
        }

        // ---- the pencil rolls on hexagonal detents with a little friction; a slap sets it going
        roll.v += (-6.3 * Math.sin(6 * roll.a) - 2.4 * roll.v) * dt; roll.a = clamp(roll.a + roll.v * dt, -1.2, 1.2)
        pencil.rotation.x = roll.a; pencil.position.z = roll.z0 + roll.a * 0.085

        // ---- shadow quads: book, loose sheets, pencil, eraser, the floating panel
        qa.fill(0)
        setQuad(0, lerp(PWd * 0.5, 0, openA) + 0.55, 0.004, -0.5, PWd * (0.5 + 0.5 * openA) + 0.1, PHt / 2 + 0.2, 0, 0.5)
        for (let k = 0; k < 3; k++) { const m = looseMeshes[k]; setQuad(1 + k, m.position.x + 0.25, 0.003, m.position.z - 0.2, 1.35, 1.78, m.rotation.y, 0.4) }
        setQuad(4, pencil.position.x + 0.15, 0.003, pencil.position.z - 0.12, 1.85, 0.12, -pencil.rotation.y, 0.45)
        setQuad(5, eraser.position.x + 0.1, 0.003, eraser.position.z - 0.1, 0.6, 0.35, -eraser.rotation.y, 0.4)
        if (flo.visible) { const e = fa * fa * (3 - 2 * fa), lift = e * 2; setQuad(6, PW_.cx + lift * 0.45, (PW_.left ? top.L : top.R) + 0.006, PW_.cz - lift * 0.3, (PW_.w / 2) * (1 + lift * 0.12), (PW_.h / 2) * (1 + lift * 0.12), 0, (0.5 / (1 + lift * 0.5)) * e) }
        qgeo.attributes.position.needsUpdate = true; qgeo.attributes.aA.needsUpdate = true

        // ---- per-leaf face state (leaf m: back = face m, front = face m + 3; the cover's front is the Showreel)
        for (let m = 0; m < 5; m++) {
          const u = leaves[m].u
          if (m < 4) { u.uBHot.value = hotA[m]; u.uBDraw.value = drawA[m] }
          if (m >= 1) { u.uFHot.value = hotA[m + 3]; u.uFDraw.value = drawA[m + 3] }
        }
        ctx.crt.glow = 0.5
        ctx.crt.push = clamp(Math.abs(sc.v) / 3600 + Math.abs(qv) * 0.04 + slapAmt * Math.exp(-(t - slapT) * 6) * 0.3 + fly.k * 0.5 + (opening ? 0.1 : 0), 0, 1)

        // ---- the tag beside the floating panel
        const want = hot >= 0 && fa > 0.25 && !flying && !opening
        if (want && hot !== tagCell) { tags[tagCell].group.visible = false; tagCell = hot; tagA = 0 }
        tagA += ((want ? 1 : 0) - tagA) * Math.min(1, dt * 12)
        const tg = tags[tagCell]
        tg.group.visible = tagA > 0.01
        if (tg.group.visible) {
          const upp = (2 * TN * 3) / h
          const l = clamp(pose.l, 16, w - 16 - tg.wpx), tt = clamp(pose.t, 16, h - 16 - tg.hpx)
          tg.group.position.set((l + tg.wpx / 2 - w / 2 - (1 - tagA) * 14) * upp, -(tt + tg.hpx / 2 - h / 2) * upp, -3)
          tg.group.scale.setScalar(upp)
          tg.plateMat.opacity = 0.86 * tagA; tg.title.mat.opacity = tagA; tg.meta.mat.opacity = tagA
        }
      }

      fitCamera(); layoutTags()
      if (ctx.reduced) { q = 1; qT = 1; O.dive = 0; drawA[0] = drawA[4] = 1 } else startOpening()
      return {
        scene, camera, update,
        resize(w, h) { fitCamera(); layoutTags() },
        tap() {
          if (opening) { finishOpening(); return }
          if (flying) return
          let i = hot
          if (i < 0 || touch) {
            const s = Math.round(q) - 1
            if (Math.abs(q - Math.round(q)) < 0.1) {
              for (let a = 0; a < 2; a++) {
                const wk = s * 2 + a; panelWorld(faceOfWork(wk), PW_)
                if (hitAt(PW_.left ? top.L : top.R) && Math.abs(HP[0] - PW_.cx) < PW_.w / 2 + 0.1 && Math.abs(HP[1] - PW_.cz) < PW_.h / 2 + 0.1) i = wk
              }
            }
          }
          if (i >= 0) flyTo(i)
        },
        focus(i) { focusCell = i },
        activate(i) { if (opening) finishOpening(); if (flying) return; goTo(i); flyTo(i) },
        back() {
          if (flyTl) flyTl.kill()
          if (backTw) backTw.kill()
          backTw = gsap.to(fly, { k: 0, duration: 0.8, ease: 'power3.inOut', onComplete: () => { flying = false; flyIdx = -1; focusCell = -1 } })
        },
        dispose() {
          if (tl) tl.kill(); if (flyTl) flyTl.kill(); if (backTw) backTw.kill()
          gsap.killTweensOf(O); gsap.killTweensOf(fly); gsap.killTweensOf(S)
          ctx.cursor.hover(false)
          keep.geo.forEach((x) => x.dispose()); keep.mat.forEach((x) => x.dispose()); keep.tex.forEach((x) => x.dispose())
          scene.remove(camera)
        },
      }
    },
  })
})()
