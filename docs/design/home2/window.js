// THROWAWAY prototype: Window. The view from Taha's room at night. Dark, out-of-focus inside edge of his window (frame, sill,
// mug, plant, faint glow of his three monitors in the glass); across a narrow street one apartment block, about 5x6 windows.
// Eight lit windows play the Works behind a cross frame; the rest are plain rooms (curtain, lamp, tv, dark) that switch on and
// off. Rain is a shader on one full-screen glass quad: drops sit, grow, run in crooked trails, each lens flips the view behind
// it; the view is blurred by condensation. The pointer WIPES the glass (CPU fog mask, slowly fogs back); a press lays the hand
// flat (big clear patch, drops run off it). Scroll pans the gaze street -> roof. A gust slants the rain. Hover/focus on a
// Work: glass clears around it, camera leans in (36% of the width, 80% on portrait), the rest dims, title beside it.
// Fly-in: the camera crosses the street into that window. Opening: Showreel fills the view, then it is one lit window.
// Pipeline: block -> render target A, inside edge -> render target B (half size), glass shader composes both.
// FAKE: the invented bits (hero sentence is the shell's; the room details, the street lamp and the monitors are all invented).
;(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const lerp = (a, b, k) => a + (b - a) * k
  const TAN = Math.tan((40 * Math.PI) / 360) // fov 40 deg, half-angle tangent
  const PX = 1.5, PY = 1.2, HW = 0.56, HH = 0.315, Y0 = 0.35 // facade cell pitch, window half size (16:9), plinth height
  const MW = 160, MH = 90 // fog mask cells

  // ---------------------------------------------------------------------------------------------------- shaders
  const GLASS_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy*2., 0., 1.); }'
  const GLASS_FS = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uO, uF, uMask, uHero;
    uniform float uAsp, uT, uFog, uRain, uFg, uFly, uGust, uHeroA, uHovAmt, uMon;
    uniform vec2 uPar, uPx;
    uniform vec4 uHov, uHeroRect, uRun[6];
    float h11(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }

    // a drop that runs: sits, gathers, jerks down in a crooked path, leaves a thin trail and beads. -> (offset.xy, clear, light)
    vec4 runLayer(vec2 uv, float t, float cols, float seed, float K){
      vec2 p = vec2(uv.x*uAsp, uv.y);
      float q = p.x + p.y*uGust*.3;
      float cw = uAsp/cols;
      float c = floor(q/cw);
      float h = h11(c*7.13+seed), h2 = h11(c*3.77+seed+11.);
      float ph = fract(t/mix(6.,15.,h) + h2);
      float u = ph*12.;
      float prog = (floor(u) + smoothstep(0., .3, fract(u)))/12.;
      float yd = 1.2 - prog*1.6;
      float x0 = (c + .5 + (h-.5)*.5)*cw;
      float r = mix(.009, .018, h2)*K*min(1., cw*16.);
      float xd = x0 + sin(yd*16.+h*20.)*cw*.1;
      vec2 d = vec2(q - xd, p.y - yd);
      float dist = length(vec2(d.x, d.y*.8));
      float mask = smoothstep(r, r*.75, dist);
      float ty = (p.y - yd)/((.2 + .5*h)*K);
      float xp = x0 + sin(p.y*16.+h*20.)*cw*.1;
      float tw = r*.4*(1. - min(ty, 1.));
      float trail = step(0., ty)*(1. - smoothstep(0., 1., ty))*smoothstep(tw, tw*.3, abs(q - xp));
      float by = (floor(p.y/.06) + .5)*.06;
      float bx = x0 + sin(by*16.+h*20.)*cw*.1 + (h11(by*17.+c)-.5)*cw*.25;
      float rb = r*.42*step(.55, h11(by*5.+c*3.1+seed));
      float bead = smoothstep(rb, rb*.7, length(vec2(q-bx, (p.y-by)*.8)))*step(yd + r, p.y)*(1. - smoothstep(.9, 1., ph));
      vec2 off = -vec2(d.x/uAsp, d.y)*4.*mask;
      float li = smoothstep(r*.6, r*.95, dist)*mask*.35 + smoothstep(r*.45, 0., length(d - vec2(-.3, .5)*r))*mask*.6;
      return vec4(off, max(max(mask, bead), trail*.75), li + bead*.2);
    }
    // drops that sit and swell (gather), then run off the layer
    vec4 sitLayer(vec2 uv, float t, float gs, float rmax, float seed){
      vec2 p = vec2(uv.x*uAsp, uv.y)/gs;
      vec2 id = floor(p), f = fract(p);
      float h = h12(id+seed);
      if(h > .5) return vec4(0.);
      float h2 = h12(id*1.7+seed+3.), h3 = h12(id+seed*2.1+8.);
      float life = fract(t*(.03+.05*h2) + h3);
      float r = rmax*(.35+.65*h2)*smoothstep(0., .85, life)*(1. - smoothstep(.93, 1., life));
      vec2 d = (f - vec2(.3+.4*h2, .3+.4*h3))*gs;
      float dist = length(d);
      float mask = smoothstep(r, r*.7, dist);
      vec2 off = -vec2(d.x/uAsp, d.y)*3.5*mask;
      float li = smoothstep(r*.6, r*.95, dist)*mask*.35 + smoothstep(r*.45, 0., length(d - vec2(-.3, .5)*r))*mask*.6;
      return vec4(off, mask, li);
    }
    vec4 runDrops(vec2 uv){
      vec4 acc = vec4(0.);
      for(int i=0;i<6;i++){
        vec4 r = uRun[i];
        if(r.w > .5){
          vec2 d = (uv - r.xy)*vec2(uAsp, 1.); d.y *= .8;
          float m = smoothstep(r.z, r.z*.75, length(d));
          acc.xy += -vec2(d.x/uAsp, d.y)*4.*m; acc.z = max(acc.z, m); acc.w += m*.3;
        }
      }
      return acc;
    }
    float streak(vec2 uv, float t, float cols, float sp, float len, float seed){
      vec2 p = vec2(uv.x*uAsp + uv.y*uGust*.35, uv.y);
      float cw = uAsp/cols, c = floor(p.x/cw), h = h11(c+seed);
      float x = (c + .2 + .6*h11(c*3.1+seed))*cw;
      float cy = 1.3 - fract(t*sp*(.7+h*.6) + h*9.)*1.6;
      return smoothstep(.0016, 0., abs(p.x - x))*smoothstep(len, 0., abs(p.y - cy))*step(.35, h);
    }
    vec3 blurO(vec2 uv, float rad){
      vec3 acc = texture2D(uO, uv).rgb;
      float a0 = h12(gl_FragCoord.xy)*6.2832;
      for(int i=0;i<13;i++){
        float fi = float(i);
        float a = fi*2.39996 + a0, rr = sqrt((fi+.5)/13.)*rad;
        acc += texture2D(uO, uv + vec2(cos(a)/uAsp, sin(a))*rr).rgb;
      }
      return acc/14.;
    }
    vec4 blurF(vec2 uv, float rad){
      vec4 acc = texture2D(uF, uv);
      for(int i=0;i<7;i++){
        float fi = float(i);
        float a = fi*2.39996, rr = sqrt((fi+.5)/7.)*rad;
        acc += texture2D(uF, uv + vec2(cos(a)/uAsp, sin(a))*rr);
      }
      return acc/8.;
    }
    float rc(vec2 uv, vec2 c, vec2 hs){
      vec2 d = abs((uv - c)*vec2(uAsp, 1.)) - hs;
      return 1. - smoothstep(0., .03, max(d.x, d.y));
    }
    void main(){
      vec2 uv = vUv;
      vec2 uvp = uv + uPar;
      float rainK = uRain*(1. - uFly);
      float wipe = texture2D(uMask, uv).r;
      // hero: the finger-written sentence is cleared fog plus a bright rim where the water gathered
      float ha = 0., edge = 0.;
      vec2 hu = (uv - uHeroRect.xy)/uHeroRect.zw;
      if(hu.x > 0. && hu.x < 1. && hu.y > 0. && hu.y < 1.){
        vec2 e = 2.*uPx/uHeroRect.zw;
        ha = texture2D(uHero, hu).a;
        edge = abs(texture2D(uHero, hu + e).a - texture2D(uHero, hu - e).a);
      }
      ha *= uHeroA; edge *= uHeroA;
      // drops
      vec4 d1 = runLayer(uvp, uT, 9., 1., 1.);
      vec4 d2 = runLayer(uvp, uT*1.25, 17., 5., .55);
      vec4 d3 = sitLayer(uvp, uT, .09, .016, 3.);
      vec4 d4 = sitLayer(uvp, uT*1.3, .034, .0062, 9.);
      vec4 d5 = runDrops(uv);
      vec2 off = (d1.xy + d2.xy + d3.xy + d4.xy + d5.xy)*rainK;
      float dclr = max(max(max(d1.z, d2.z), max(d3.z, d4.z)), d5.z)*rainK;
      float dli = (d1.w + d2.w + d3.w + d4.w + d5.w)*rainK;
      float hov = uHovAmt*(1. - smoothstep(.7, 1.2, length((uv - uHov.xy)/uHov.zw)));
      float clr = max(max(wipe, ha), max(hov, dclr));
      float F = uFog*(1. - clr)*(1. - uFly);
      off *= 1. - hov*.8;
      vec3 col = blurO(uv + off, F*.017);
      col = mix(col, vec3(.2), F*.5)*(1. - F*.1);
      // the inside edge (frame, sill, mug, plant): out of focus, premultiplied
      vec4 fg = blurF(uv, .006);
      float fk = uFg*(1. - uFly);
      col = col*(1. - fg.a*fk) + fg.rgb*fk;
      // faint glow of his three monitors in the glass
      vec2 mp = uv - uPar*2.5;
      float mon = rc(mp, vec2(.27, .37), vec2(.16, .09))*(.6 + .4*sin(mp.y*40. + uT*.5))
                + rc(mp, vec2(.5, .39), vec2(.19, .11))*(.6 + .4*sin(mp.y*30. - uT*.4 + 2.))
                + rc(mp, vec2(.73, .37), vec2(.16, .09))*(.6 + .4*sin(mp.y*50. + uT*.7 + 4.));
      col += mon*.05*uMon*vec3(1.);
      // streaks in the air, drop light, hero rim
      float st = streak(uv, uT, 22., 1.1, .09, 1.) + streak(uv, uT, 34., 1.5, .06, 7.) + streak(uv, uT, 14., .8, .14, 3.);
      col += st*.16*rainK*(1. - uFly*.5);
      col += dli*.45;
      col += edge*.5;
      gl_FragColor = vec4(col, 1.);
    }`

  const FAC_VS = 'varying vec2 vF; void main(){ vF = position.xy; gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position, 1.); }'
  const FAC_FS = `
    precision highp float;
    varying vec2 vF;
    uniform sampler2D uState, uAtlas, uReel;
    uniform vec2 uGrid, uPitch;
    uniform float uY0, uTime, uBlock, uDim, uFill, uMirror, uLampX;
    const float HW = ${HW}, HH = ${HH};
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
    vec4 st(float c, float r){ return texture2D(uState, vec2((c + r*uGrid.x + .5)/(uGrid.x*uGrid.y), .5)); }
    vec2 cen(float c, float r){ return vec2((c + .5 - uGrid.x*.5)*uPitch.x, uY0 + (r + .5)*uPitch.y); }
    float sbox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
    void main(){
      vec2 F = vF;
      if(uMirror > .5) F.x += sin(F.y*30. + uTime*1.6)*.012;
      float c = floor(F.x/uPitch.x + uGrid.x*.5);
      float r = floor((F.y - uY0)/uPitch.y);
      vec2 p = F - cen(c, r);
      bool inb = c >= 0. && c < uGrid.x && r >= 0. && r < uGrid.y;
      // wall: concrete panels, floor slabs, plinth, a wash from the street lamp
      float fx = fract(F.x/.75), fy = fract((F.y - uY0)/uPitch.y);
      float seam = 1. - smoothstep(0., .012, min(fx, 1. - fx)*.75);
      float slab = 1. - smoothstep(.02, .05, min(fy, 1. - fy)*uPitch.y);
      vec3 col = vec3(.07 + .02*h12(floor(F*30.)) + .012*h12(floor(F*vec2(2., 9.))));
      col *= 1. - .25*seam;
      col += .035*slab;
      if(F.y < uY0) col = vec3(.045 + .02*h12(floor(F*20.)));
      col += exp(-length((F - vec2(uLampX, 3.2))*vec2(.3, .45)))*.09;
      // neighbours' light spills on the wall
      float halo = 0.;
      for(int a=-1;a<=1;a++) for(int b=-1;b<=1;b++){
        float cc = c + float(a), rr = r + float(b);
        if(cc >= 0. && cc < uGrid.x && rr >= 0. && rr < uGrid.y){
          vec4 s = st(cc, rr);
          float dd = max(sbox(F - cen(cc, rr), vec2(HW, HH)), 0.);
          float strong = (s.b > 2.5 && s.b < 3.5) || s.b > 4.5 ? 1.6 : .7;
          halo += s.r*strong*exp(-dd*4.5);
        }
      }
      col += halo*.11;
      col *= uDim;
      float reelMask = 0.;
      if(inb){
        vec4 s = st(c, r);
        float lit = s.r, ty = s.b;
        float dOpen = sbox(p, vec2(HW, HH));
        float seed = h12(vec2(c, r)*3.7);
        if(dOpen < 0.){
          vec3 inside;
          vec2 q = (p + vec2(HW, HH))/vec2(2.*HW, 2.*HH);
          float refl = .03*smoothstep(-.3, .3, p.x*1.1 - p.y*.6) + .02*smoothstep(.15, .0, abs(p.x*.7 + p.y - .1));
          if(ty > 2.5 && ty < 3.5){
            float wi = floor(s.a + .5);
            vec2 base = vec2(mod(wi, 4.)/4., 1. - (floor(wi/4.) + 1.)/2.);
            inside = texture2D(uAtlas, base + clamp(q, .003, .997)*vec2(.25, .5)).rgb*lit;
            float xf = (abs(p.x) < .014 || abs(p.y) < .014) ? 1. : 0.;
            inside = mix(inside, vec3(.13), xf*(1. - uFill));
          } else if(ty > 4.5){
            inside = texture2D(uReel, clamp(q, .003, .997)).rgb*lit;
            reelMask = 1.;
            float xf = (abs(p.x) < .014 || abs(p.y) < .014) ? 1. : 0.;
            inside = mix(inside, vec3(.13), xf*(1. - uFill));
          } else if(ty > 3.5){ // tv: a smooth moving pool of light in a dark room
            float tvv = .25 + .2*sin(uTime*1.7 + c*3.1 + p.x*6.)*sin(uTime*2.3 + r*2.1 + p.y*5.);
            float scr = 1. - smoothstep(0., .03, sbox(p - vec2((seed - .5)*.5, -.1), vec2(.24, .13)));
            inside = vec3(.03 + scr*tvv + .08*exp(-length(p - vec2(0., -.1))*2.))*lit;
          } else if(ty > 1.5){ // lamp
            vec2 lp = vec2((seed - .5)*.7, .02);
            float glow = exp(-length(p - lp)*5.);
            float shade = step(abs(p.x - lp.x), .05 + (lp.y - p.y)*.45)*step(lp.y - .07, p.y)*step(p.y, lp.y + .01);
            float pole = step(abs(p.x - lp.x), .006)*step(p.y, lp.y - .07)*.25;
            inside = vec3(.16 - p.y*.05 + glow*.55 + shade*.7 + pole)*lit;
          } else { // curtain
            float side = seed > .5 ? 1. : -1.;
            float wc = .2 + .18*h12(vec2(c, r)*1.9);
            float cm = smoothstep(-.01, .01, side*p.x - (HW - wc));
            float fold = .5 + .5*sin(p.x*60. + seed*6.);
            inside = mix(vec3(.5 - p.y*.15), vec3(.2 + .14*fold), cm)*lit;
            inside *= 1. - .6*smoothstep(HH - .05, HH, p.y);
          }
          // silhouette that crosses a lit room
          if(s.g > -5.){
            vec2 sp = vec2(s.g*HW*.8, 0.);
            float head = 1. - smoothstep(.045, .06, length(p - sp - vec2(0., -.05)));
            float body = (1. - smoothstep(.06, .075, abs(p.x - sp.x)))*step(p.y, -.11);
            inside = mix(inside, vec3(.02), max(head, body)*clamp(lit*2., 0., 1.));
          }
          // plain windows get one thin mullion
          if(ty < 2.5 || (ty > 3.5 && ty < 4.5)) inside = mix(inside, vec3(.1), step(abs(p.x - .18), .008)*.8);
          col = inside + refl;
        }
        float ring = smoothstep(0., .006, dOpen)*(1. - smoothstep(.05, .056, dOpen));
        col = mix(col, vec3(.2), ring);
        if(p.y < -HH && p.y > -HH - .05 && abs(p.x) < HW + .07) col = vec3(.26);
        if(p.y > HH + .05 && p.y < HH + .09 && abs(p.x) < HW + .06) col *= .6;
      }
      col *= mix(uBlock, 1., reelMask);
      if(uMirror > .5) col *= .3*exp(-F.y*.3);
      gl_FragColor = vec4(col, 1.);
    }`

  const SKY_VS = 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }'
  const SKY_FS = `
    precision highp float; varying vec3 vW; uniform float uT, uBlock;
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
      return mix(mix(h12(i), h12(i + vec2(1., 0.)), f.x), mix(h12(i + vec2(0., 1.)), h12(i + vec2(1.)), f.x), f.y); }
    void main(){
      float y = vW.y;
      float g = mix(.12, .04, smoothstep(2., 24., y));
      float cl = vn(vW.xy*.18 + vec2(uT*.01, 0.))*.6 + vn(vW.xy*.45 - vec2(uT*.02, 0.))*.4;
      gl_FragColor = vec4(vec3(g*(.7 + .6*cl))*uBlock, 1.);
    }`
  const GLOW_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }'
  const GLOW_FS = 'precision highp float; varying vec2 vUv; uniform float uI, uBlock; void main(){ float r = length(vUv*2. - 1.); float a = pow(clamp(1. - r, 0., 1.), 2.2)*uI*uBlock; gl_FragColor = vec4(vec3(a), 1.); }'
  const CONE_FS = `
    precision highp float; varying vec2 vUv; uniform float uI, uT, uBlock;
    float h11(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
    void main(){
      float e = 1. - abs(vUv.x*2. - 1.);
      float c = floor(vUv.x*70.), h = h11(c);
      float yy = fract(vUv.y*.8 + uT*(.5 + h*.6) + h*9.);
      float stk = step(.6, h)*smoothstep(.0, .1, yy)*smoothstep(.25, .1, yy);
      float a = pow(e, .8)*(1. - vUv.y*.5)*(.5 + .9*stk)*uI*uBlock;
      gl_FragColor = vec4(vec3(a), 1.);
    }`

  // ---------------------------------------------------------------------------------------------------- helpers
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

  // merged static geometry: boxes with baked shading in the vertex colours (top lit, bottom dark, dark foot = fake ambient occlusion)
  function Builder() {
    const pos = [], col = []
    const FACES = [ // normal, 4 corners (ccw from outside), shade
      [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], 1],
      [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], 0.6],
      [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], 0.8],
      [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], 0.7],
      [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], 1.4],
      [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], 0.45],
    ]
    return {
      box(x, y, z, w, h, d, g) {
        for (const [, cs, sh] of FACES) {
          for (const k of [0, 1, 2, 0, 2, 3]) {
            const c = cs[k]
            pos.push(x + (c[0] * w) / 2, y + (c[1] * h) / 2, z + (c[2] * d) / 2)
            const v = clamp(g * sh * (c[1] < 0 ? 0.7 : 1), 0, 1)
            col.push(v, v, v)
          }
        }
      },
      geometry() {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
        return geo
      },
    }
  }
  // gives a lathe/cylinder the same baked shading from its normals
  function shade(geo, g) {
    const n = geo.attributes.normal, c = new Float32Array(n.count * 3)
    for (let i = 0; i < n.count; i++) {
      const v = clamp(g * (0.55 + 0.5 * Math.max(n.getY(i), 0) + 0.2 * n.getX(i)), 0, 1)
      c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3))
    return geo
  }

  HOME.register({
    name: 'Window',
    create(ctx) {
      const works = ctx.works, touch = ctx.touch, size = ctx.size, P = ctx.pointer
      const geos = [], mats = [], texs = [], rts = []
      const keep = (list, o) => { list.push(o); return o }

      // main scene: the glass quad (ortho, px) plus the hover tag
      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10)
      // the block (render target A)
      const sceneO = new THREE.Scene(), camO = new THREE.PerspectiveCamera(40, 1, 0.1, 120)
      // the inside edge (render target B)
      const sceneF = new THREE.Scene(), camF = new THREE.PerspectiveCamera(40, 1, 0.1, 30)
      const rtO = keep(rts, new THREE.WebGLRenderTarget(2, 2, { samples: touch ? 0 : 4, depthBuffer: true }))
      const rtF = keep(rts, new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true }))

      // ---- fog mask (CPU): wiped parts are 1 and slowly fall back to 0 -----------------------------------------------
      const maskF = new Float32Array(MW * MH), maskU = new Uint8Array(MW * MH)
      const maskTex = keep(texs, new THREE.DataTexture(maskU, MW, MH, THREE.RedFormat, THREE.UnsignedByteType))
      maskTex.minFilter = maskTex.magFilter = THREE.LinearFilter; maskTex.needsUpdate = true
      const stamp = (ux, uy, rad, amt, asp) => { // ux,uy in 0..1; rad in height units
        const cx = ux * MW, cy = uy * MH, ry = rad * MH, rx = (rad * MW) / asp
        const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(MW - 1, Math.ceil(cx + rx))
        const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(MH - 1, Math.ceil(cy + ry))
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = Math.sqrt(dx * dx + dy * dy)
          if (d < 1) { const m = amt * (d < 0.35 ? 1 : 1 - (d - 0.35) / 0.65), i = y * MW + x; if (m > maskF[i]) maskF[i] = m }
        }
      }

      // ---- state ------------------------------------------------------------------------------------------------------
      const S = { // everything the tweens drive
        h: 0, f: 0, open: 1, rain: 1, fog: 1, fg: 1, block: 1, hot: -1, last: 0, flying: false, opening: false,
      }
      let focusI = -1, dwell = 0, cand = -1, hoverOn = false
      let gust = 0, gustT = 4 + Math.random() * 4, rt = 0, sSm = 0.35, pxS = 0, pyS = 0
      let wasDown = false, lastUx = -1, lastUy = -1
      let tl = null, flyTl = null, backTw = null
      const hand = [] // drops that run off the flat hand
      for (let i = 0; i < 6; i++) hand.push({ on: false, x: 0, y: 0, vy: 0, r: 0 })

      // ---- glass ------------------------------------------------------------------------------------------------------
      const runU = []; for (let i = 0; i < 6; i++) runU.push(new THREE.Vector4())
      const heroTex = { tex: null, aspect: 1, portrait: null }
      const glassMat = keep(mats, new THREE.ShaderMaterial({
        vertexShader: GLASS_VS, fragmentShader: GLASS_FS, depthTest: false, depthWrite: false,
        uniforms: {
          uO: { value: rtO.texture }, uF: { value: rtF.texture }, uMask: { value: maskTex }, uHero: { value: null },
          uAsp: { value: 1 }, uT: { value: 0 }, uFog: { value: 1 }, uRain: { value: 1 }, uFg: { value: 1 }, uFly: { value: 0 },
          uGust: { value: 0 }, uHeroA: { value: 1 }, uHovAmt: { value: 0 }, uMon: { value: 1 },
          uPar: { value: new THREE.Vector2() }, uPx: { value: new THREE.Vector2(1, 1) },
          uHov: { value: new THREE.Vector4(0.5, 0.5, 0.2, 0.2) }, uHeroRect: { value: new THREE.Vector4(0, 0, 0.5, 0.2) }, uRun: { value: runU },
        },
      }))
      const unit = keep(geos, new THREE.PlaneGeometry(1, 1))
      const glass = new THREE.Mesh(unit, glassMat); glass.frustumCulled = false; glass.renderOrder = 0
      scene.add(glass)

      // hero sentence: composed once per orientation into one transparent texture (white letters)
      function buildHero(portrait) {
        if (heroTex.tex && heroTex.portrait === portrait) return
        if (heroTex.tex) { heroTex.tex.dispose(); texs.splice(texs.indexOf(heroTex.tex), 1) }
        const n = portrait ? 4 : 3, words = ctx.hero.split(/\s+/), target = ctx.hero.length / n, lines = []
        let cur = ''
        for (const w of words) {
          const nx = cur ? cur + ' ' + w : w
          if (cur && nx.length > target * 1.1 && lines.length < n - 1) { lines.push(cur); cur = w } else cur = nx
        }
        lines.push(cur)
        const ts = lines.map((s) => ctx.text(s, { size: 160, color: '#ffffff' }))
        const cw = 1536, amax = Math.max(...ts.map((t) => t.aspect)), lh = Math.min((0.96 * cw) / amax, 230), pitch = lh * 0.74
        const ch = Math.round(pitch * lines.length + lh * 0.5)
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
        const g = cv.getContext('2d')
        ts.forEach((t, k) => { const wpx = t.aspect * lh; g.drawImage(t.canvas, 0, lh * 0.25 + pitch * (k + 0.5) - lh / 2, wpx, lh); t.texture.dispose() })
        const tex = keep(texs, new THREE.CanvasTexture(cv)); tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter
        heroTex.tex = tex; heroTex.aspect = cw / ch; heroTex.portrait = portrait
        glassMat.uniforms.uHero.value = tex
      }

      // ---- hover tags (px, children of the ortho scene) ---------------------------------------------------------------
      const hud = new THREE.Group(); scene.add(hud)
      const PAD = 16
      const mkText = (str, opts) => {
        const t = ctx.text(str, opts); texs.push(t.texture)
        const m = keep(mats, new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, depthTest: false, depthWrite: false }))
        const mesh = new THREE.Mesh(unit, m); mesh.renderOrder = 61
        return { mesh, mat: m, canvas: t.canvas }
      }
      const tags = works.map((w) => {
        const title = mkText(w.title, { size: 120 }), meta = mkText(`${w.kind} · ${w.year}`, { caps: true, size: 28, color: '#8f8f8f' })
        const plateMat = keep(mats, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false }))
        const plate = new THREE.Mesh(unit, plateMat); plate.renderOrder = 60
        const group = new THREE.Group(); group.visible = false
        group.add(plate, title.mesh, meta.mesh); hud.add(group)
        return { group, plate, plateMat, title, meta, wpx: 0, hpx: 0 }
      })
      const layoutTags = () => {
        const tfp = clamp(size.w * 0.05, 36, 84), mfp = clamp(size.w * 0.011, 13, 18)
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

      // ---- the block --------------------------------------------------------------------------------------------------
      let B = null // current block build (rebuilt when the orientation flips)
      const stateTex = { tex: null }
      const facMats = []
      const atlasU = { value: ctx.atlas }, reelU = { value: ctx.showreel.texture }
      const sky = new THREE.Mesh(keep(geos, new THREE.PlaneGeometry(160, 70)), keep(mats, new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: { uT: { value: 0 }, uBlock: { value: 1 } }, depthWrite: false })))
      sky.position.set(0, 20, -9); sky.renderOrder = -10; sceneO.add(sky)
      const skyU = sky.material.uniforms
      const glowMat = (i) => keep(mats, new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: GLOW_FS, uniforms: { uI: { value: i }, uBlock: { value: 1 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      const coneMat = keep(mats, new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: CONE_FS, uniforms: { uI: { value: 0.3 }, uT: { value: 0 }, uBlock: { value: 1 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
      const headGlow = glowMat(0.9), poolGlow = glowMat(0.55)
      const lamp = new THREE.Group(); sceneO.add(lamp)
      let blockGroup = null

      function buildBlock(portrait) {
        if (blockGroup) { sceneO.remove(blockGroup); blockGroup.traverse((o) => { if (o.geometry && o.userData.own) o.geometry.dispose() }) }
        if (stateTex.tex) { stateTex.tex.dispose(); texs.splice(texs.indexOf(stateTex.tex), 1) }
        facMats.forEach((m) => { m.dispose(); mats.splice(mats.indexOf(m), 1) }); facMats.length = 0
        while (lamp.children.length) { const o = lamp.children.pop(); if (o.userData.own && o.geometry) o.geometry.dispose() }
        blockGroup = new THREE.Group(); sceneO.add(blockGroup)
        const cols = portrait ? 3 : 6, rows = portrait ? 8 : 5, N = cols * rows
        const fw = cols * PX + 0.3, yRoof = Y0 + rows * PY + 0.25
        const rand = rng(portrait ? 11 : 7)
        const wc = portrait
          ? [[0, 7], [2, 6], [1, 5], [2, 4], [0, 3], [1, 2], [2, 1], [0, 0]]
          : [[1, 4], [4, 4], [2, 3], [5, 3], [0, 2], [3, 2], [1, 1], [4, 0]]
        const reelCell = portrait ? [1, 3] : [3, 3]
        const cells = []
        for (let k = 0; k < N; k++) cells.push({ c: k % cols, r: Math.floor(k / cols), type: 1, work: -1, on: rand() < 0.55, lit: 0, base: 0.6, timer: 3 + rand() * 30, sil: 0 })
        wc.forEach(([c, r], i) => { const e = cells[c + r * cols]; e.type = 3; e.work = i; e.on = true; e.base = 0.92; e.timer = 1e9 })
        { const e = cells[reelCell[0] + reelCell[1] * cols]; e.type = 5; e.on = true; e.base = 0.85; e.timer = 1e9 }
        cells.forEach((e) => {
          if (e.type === 1) { const q = rand(); e.type = q < 0.4 ? 1 : q < 0.72 ? 2 : 4; e.base = e.type === 1 ? 0.62 : e.type === 2 ? 0.55 : 0.5 }
          e.lit = e.on ? e.base : 0
        })
        const data = new Float32Array(N * 4)
        const tex = keep(texs, new THREE.DataTexture(data, N, 1, THREE.RGBAFormat, THREE.FloatType))
        tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true
        stateTex.tex = tex

        const facGeo = new THREE.PlaneGeometry(fw, yRoof); facGeo.translate(0, yRoof / 2, 0)
        const mkFac = (mirror) => {
          const m = new THREE.ShaderMaterial({
            vertexShader: FAC_VS, fragmentShader: FAC_FS, side: THREE.DoubleSide,
            uniforms: {
              uState: { value: tex }, uAtlas: atlasU, uReel: reelU, uGrid: { value: new THREE.Vector2(cols, rows) }, uPitch: { value: new THREE.Vector2(PX, PY) },
              uY0: { value: Y0 }, uTime: { value: 0 }, uBlock: { value: 1 }, uDim: { value: 1 }, uFill: { value: 0 }, uMirror: { value: mirror ? 1 : 0 }, uLampX: { value: 0 },
            },
          })
          mats.push(m); facMats.push(m); return m
        }
        const fac = new THREE.Mesh(facGeo, mkFac(false)), mir = new THREE.Mesh(facGeo, mkFac(true))
        mir.scale.y = -1; mir.renderOrder = -2; fac.renderOrder = -1
        geos.push(facGeo)
        fac.userData.own = true; mir.userData.own = false
        blockGroup.add(fac, mir)

        // balconies, AC units, drainpipes, roof line with antennas
        const b = Builder()
        for (let k = 0; k < N; k++) {
          const e = cells[k]; if (e.type === 3 || e.type === 5) continue
          const cx = (e.c + 0.5 - cols / 2) * PX, wy = Y0 + (e.r + 0.5) * PY, q = rand()
          if (e.r >= 1 && q < 0.2) { b.box(cx, wy - HH - 0.04, 0.22, 1.3, 0.07, 0.44, 0.17); b.box(cx, wy - HH + 0.1, 0.43, 1.3, 0.24, 0.04, 0.1) }
          else if (q > 0.82) { b.box(cx + HW + 0.18, wy - HH - 0.1, 0.15, 0.34, 0.26, 0.28, 0.24); b.box(cx + HW + 0.18, wy - HH - 0.1, 0.3, 0.24, 0.18, 0.02, 0.06) }
        }
        b.box(-fw / 2 + 0.07, yRoof / 2, 0.06, 0.07, yRoof, 0.07, 0.14); b.box(fw / 2 - 0.07, yRoof / 2, 0.06, 0.07, yRoof, 0.07, 0.14)
        b.box(0, yRoof + 0.12, 0.05, fw + 0.3, 0.26, 0.5, 0.12) // roof parapet
        b.box(-fw * 0.3, yRoof + 0.55, -0.05, 0.45, 0.6, 0.4, 0.14); b.box(fw * 0.32, yRoof + 0.45, 0, 0.7, 0.4, 0.5, 0.11)
        for (let a = 0; a < 4; a++) {
          const x = (-0.35 + a * 0.2 + rand() * 0.08) * fw, hg = 0.8 + rand() * 0.9
          b.box(x, yRoof + 0.25 + hg / 2, 0, 0.035, hg, 0.035, 0.2)
          for (let k = 0; k < 3; k++) b.box(x, yRoof + 0.45 + k * (hg / 4), 0, 0.5 - k * 0.13, 0.018, 0.018, 0.2)
        }
        b.box(fw * 0.12, yRoof + 0.5, 0.15, 0.4, 0.4, 0.06, 0.2)
        const sgeo = b.geometry(); geos.push(sgeo)
        const solid = new THREE.Mesh(sgeo, keep(mats, new THREE.MeshBasicMaterial({ vertexColors: true })))
        solid.userData.own = true; solid.renderOrder = 0; blockGroup.add(solid)
        // wet street: dark glass over the mirrored facade
        const gm = new THREE.Mesh(keep(geos, new THREE.PlaneGeometry(80, 40)), keep(mats, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.8, depthWrite: false })))
        gm.rotation.x = -Math.PI / 2; gm.position.set(0, 0, 20); gm.renderOrder = 1; blockGroup.add(gm)

        // street lamp (local to the lamp group; placed in resize)
        const lb = Builder()
        lb.box(0, 2.1, 0, 0.07, 4.2, 0.07, 0.14); lb.box(0.35, 4.2, 0, 0.7, 0.06, 0.06, 0.14); lb.box(0.7, 4.1, 0, 0.5, 0.09, 0.22, 0.6)
        const lgeo = lb.geometry(); geos.push(lgeo)
        const lm = new THREE.Mesh(lgeo, keep(mats, new THREE.MeshBasicMaterial({ vertexColors: true }))); lm.userData.own = true; lamp.add(lm)
        const hg = new THREE.Mesh(unit, headGlow); hg.scale.set(1.7, 1.7, 1); hg.position.set(0.7, 4.05, 0.05); hg.renderOrder = 5
        const cg = new THREE.BufferGeometry(); geos.push(cg)
        cg.setAttribute('position', new THREE.Float32BufferAttribute([0.58, 4.05, 0, 0.82, 4.05, 0, 2.3, 0, 0, -0.9, 0, 0], 3))
        cg.setAttribute('uv', new THREE.Float32BufferAttribute([0.46, 0, 0.54, 0, 1, 1, 0, 1], 2)); cg.setIndex([0, 1, 2, 0, 2, 3])
        const cone = new THREE.Mesh(cg, coneMat); cone.userData.own = true; cone.renderOrder = 5
        const pool = new THREE.Mesh(unit, poolGlow); pool.rotation.x = -Math.PI / 2; pool.scale.set(3.6, 1.8, 1); pool.position.set(0.7, 0.02, 0.1); pool.renderOrder = 5
        lamp.add(hg, cone, pool)

        B = { cols, rows, N, fw, yRoof, cells, data, portrait, wc, reelCell, silT: 0, silCell: -1, silDur: 3.5, silDir: 1, nextSil: 4, nextDip: 5, dip: -1, dipT: 0 }
      }

      // ---- the inside edge (fg) ---------------------------------------------------------------------------------------
      const fgBox = keep(geos, shade(new THREE.BoxGeometry(1, 1, 1), 1))
      const fgMat = keep(mats, new THREE.MeshBasicMaterial({ vertexColors: true }))
      const bar = (g) => { const m = new THREE.Mesh(fgBox, fgMat.clone()); m.material.color.setScalar(g); mats.push(m.material); sceneF.add(m); return m }
      const barL = bar(0.07), barR = bar(0.07), barT = bar(0.06), barB = bar(0.08), sill = bar(0.1)
      const mugGeo = keep(geos, shade(new THREE.CylinderGeometry(0.1, 0.085, 0.22, 20, 1), 1))
      const mug = new THREE.Mesh(mugGeo, fgMat.clone()); mug.material.color.setScalar(0.2); mats.push(mug.material)
      const handle = new THREE.Mesh(keep(geos, shade(new THREE.TorusGeometry(0.055, 0.016, 8, 14, Math.PI * 1.1), 1)), mug.material)
      handle.rotation.z = -Math.PI * 0.55; handle.position.set(0.1, 0, 0); mug.add(handle)
      const potGeo = keep(geos, shade(new THREE.CylinderGeometry(0.1, 0.075, 0.14, 14, 1), 1))
      const pot = new THREE.Mesh(potGeo, fgMat.clone()); pot.material.color.setScalar(0.17); mats.push(pot.material)
      const leaves = new THREE.Group()
      const leafGeo = keep(geos, shade(new THREE.ConeGeometry(0.045, 0.34, 4, 1), 1))
      const leafMat = keep(mats, fgMat.clone()); leafMat.color.setScalar(0.1)
      for (let i = 0; i < 9; i++) {
        const l = new THREE.Mesh(leafGeo, leafMat), a = (i / 9) * Math.PI * 2, tilt = 0.35 + (i % 3) * 0.28
        l.position.set(Math.cos(a) * 0.06 * tilt, 0.07 + tilt * 0.14, Math.sin(a) * 0.04)
        l.rotation.set(Math.sin(a) * tilt * 0.9, 0, -Math.cos(a) * tilt * 0.9); leaves.add(l)
      }
      pot.add(leaves); leaves.position.y = 0.04
      sceneF.add(mug, pot)
      function layoutFg() {
        const asp = size.w / size.h, Z = 3, hfH = Z * TAN, hfW = hfH * asp
        const tL = Math.max(hfW * 0.075, hfH * 0.055), tT = hfH * 0.12, sillTop = -hfH * 0.8
        const place = (m, x, y, z, w, h, d) => { m.position.set(x, y, z); m.scale.set(w, h, d) }
        place(barL, -hfW + tL - hfW, 0, -Z, hfW * 2, hfH * 4, 0.5)
        place(barR, hfW - tL * 1.3 + hfW, 0, -Z, hfW * 2, hfH * 4, 0.5)
        place(barT, 0, hfH - tT + hfH, -Z, hfW * 6, hfH * 2, 0.5)
        place(barB, 0, sillTop - hfH, -Z, hfW * 6, hfH * 2, 0.4)
        place(sill, 0, sillTop - 0.08, -2.4, hfW * 6, 0.16, 1.8)
        const nz = (z) => z * TAN * asp
        mug.position.set(0.55 * nz(2.5), sillTop + 0.11, -2.5)
        pot.position.set(-0.6 * nz(2.8), sillTop + 0.07, -2.8)
        mug.scale.setScalar(1); pot.scale.setScalar(1)
      }

      // ---- poses ------------------------------------------------------------------------------------------------------
      const pBrowse = { x: 0, y: 0, z: 0, rx: 0, ry: 0 }, pHov = { x: 0, y: 0, z: 0, rx: 0, ry: 0 }, pFly = { x: 0, y: 0, z: 0, rx: 0, ry: 0 }, pReel = { x: 0, y: 0, z: 0, rx: 0, ry: 0 }, pOut = { x: 0, y: 0, z: 0, rx: 0, ry: 0 }
      const mix = (o, a, b, k) => { o.x = lerp(a.x, b.x, k); o.y = lerp(a.y, b.y, k); o.z = lerp(a.z, b.z, k); o.rx = lerp(a.rx, b.rx, k); o.ry = lerp(a.ry, b.ry, k); return o }
      const cp = [0, 0]
      const cellPos = (c, r) => { cp[0] = (c + 0.5 - B.cols / 2) * PX; cp[1] = Y0 + (r + 0.5) * PY; return cp }
      const zBrowse = () => (B.fw / 2 + 0.35) / (TAN * (size.w / size.h))
      function setFill(o, c, r, cover) { // camera so the window fills the view (cover) or sits at a screen spot
        const [wx, wy] = cellPos(c, r), asp = size.w / size.h
        const D = Math.min((HW * cover) / (TAN * asp), (HH * cover) / TAN)
        o.x = wx; o.y = wy; o.z = D; o.rx = 0; o.ry = 0
      }
      function setHover(o, i) {
        const [c, r] = B.wc[i], [wx, wy] = cellPos(c, r), asp = size.w / size.h, por = asp < 0.9
        const D = HW / ((por ? 0.8 : 0.36) * TAN * asp), nx = por ? 0 : -0.2, ny = por ? 0.26 : 0.04
        const hH = D * TAN, hW = hH * asp
        o.x = wx - nx * hW; o.y = wy - ny * hH; o.z = D; o.rx = 0; o.ry = 0
      }

      // ---- hit test: pointer ray on the facade plane -------------------------------------------------------------------
      const v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3()
      function hitWork(nx, ny, margin) {
        v3.set(nx, ny, 0.5).unproject(camO); v3.sub(camO.position)
        if (v3.z >= -1e-6) return -1
        const tt = -camO.position.z / v3.z, hx = camO.position.x + v3.x * tt, hy = camO.position.y + v3.y * tt
        const c = Math.floor(hx / PX + B.cols / 2), r = Math.floor((hy - Y0) / PY)
        if (c < 0 || c >= B.cols || r < 0 || r >= B.rows) return -1
        const e = B.cells[c + r * B.cols]; if (e.work < 0) return -1
        const [wx, wy] = cellPos(c, r)
        return Math.abs(hx - wx) < HW * margin && Math.abs(hy - wy) < HH * margin ? e.work : -1
      }

      // ---- moments ----------------------------------------------------------------------------------------------------
      function startOpening() {
        S.opening = true; S.open = 1; S.rain = 0; S.fog = 0; S.fg = 0; S.block = 0
        tl = gsap.timeline({ onComplete: () => { S.opening = false } })
        tl.to(S, { open: 0, duration: 2.6, ease: 'power3.inOut' }, 0.3)
        tl.to(S, { rain: 1, duration: 1.4, ease: 'power1.in' }, 0.4)
        tl.to(S, { block: 1, duration: 1.8, ease: 'power1.inOut' }, 0.9)
        tl.to(S, { fog: 1, duration: 1.6, ease: 'power1.inOut' }, 1.4)
        tl.to(S, { fg: 1, duration: 1.4, ease: 'power1.inOut' }, 1.5)
      }
      function skipOpening() { if (tl) { tl.progress(1); tl = null } S.opening = false; S.open = 0; S.rain = S.fog = S.fg = S.block = 1 }
      function hoverTo(i) {
        if (i === S.hot) return
        S.hot = i
        if (i >= 0) S.last = i
        if (hoverOn !== (i >= 0)) { hoverOn = i >= 0; ctx.cursor.hover(hoverOn) }
        gsap.to(S, { h: i >= 0 ? 1 : 0, duration: i >= 0 ? 0.75 : 0.6, ease: 'power3.out', overwrite: 'auto' })
      }
      function flyTo(i) {
        if (S.flying || S.opening || i < 0) return
        S.flying = true; S.last = i; S.hot = i; hoverOn = false; ctx.cursor.hover(false)
        gsap.killTweensOf(S, 'h'); S.h = 1
        flyTl = gsap.timeline({ onComplete: () => ctx.enter(i) })
        flyTl.to(S, { f: 1, duration: 0.85, ease: 'power3.in' }, 0)
        flyTl.to(ctx.crt, { push: 0.5, duration: 0.3, ease: 'power2.out' }, 0.1)
        flyTl.to(ctx.crt, { push: 0, duration: 0.5 }, 0.45)
        flyTl.to(S, { fg: 0, duration: 0.5, ease: 'power1.in' }, 0)
      }

      // ---- resize -----------------------------------------------------------------------------------------------------
      function resize(w, h) {
        const dpr = size.dpr, asp = w / h, por = asp < 0.9
        camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2; camera.updateProjectionMatrix()
        glass.scale.set(w, h, 1)
        camO.aspect = asp; camO.updateProjectionMatrix(); camF.aspect = asp; camF.updateProjectionMatrix()
        rtO.setSize(Math.max(2, Math.round(w * dpr * 0.85)), Math.max(2, Math.round(h * dpr * 0.85)))
        rtF.setSize(Math.max(2, Math.round(w * dpr * 0.4)), Math.max(2, Math.round(h * dpr * 0.4)))
        glassMat.uniforms.uAsp.value = asp; glassMat.uniforms.uPx.value.set(1 / w, 1 / h)
        if (!B || B.portrait !== por) buildBlock(por)
        buildHero(por)
        const zb = zBrowse(), lz = zb * 0.4, lx = -0.9 * (zb - lz) * TAN * asp
        lamp.position.set(lx, 0, lz); B.cells.length && facMats.forEach((m) => { m.uniforms.uLampX.value = lx })
        // hero rect (uv): top-left, below y = 130 px
        const wpx = por ? w - 32 : Math.min(w * 0.5, 820), hpx = wpx / heroTex.aspect, left = por ? 16 : Math.max(32, w * 0.06), top = por ? 140 : Math.max(150, h * 0.2)
        glassMat.uniforms.uHeroRect.value.set(left / w, 1 - (top + hpx) / h, wpx / w, hpx / h)
        layoutFg(); layoutTags()
      }

      // ---- update -----------------------------------------------------------------------------------------------------
      const tmpCol = new THREE.Color()
      function update(t, dt) {
        dt = clamp(dt, 0.0001, 0.05)
        const w = size.w, h = size.h, asp = w / h, reduced = ctx.reduced, U = glassMat.uniforms
        // weather: a gust slants the rain and races the drops; scroll speed is a gust too
        gustT -= dt
        if (gustT < 0) { gust = 1; gustT = 6 + Math.random() * 7 }
        gust *= Math.exp(-dt * 0.45)
        const gu = reduced ? 0 : Math.max(gust, clamp(Math.abs(ctx.scroll.v) / 900, 0, 1) * 0.8)
        rt += reduced ? 0 : dt * (1 + gu * 1.5)
        // gaze, weighted
        const sT = clamp(0.35 + ctx.scroll.y / 3200, 0, 1)
        sSm += (sT - sSm) * (1 - Math.exp(-dt * 3))
        const nx = P.inside || P.down ? P.nx : 0, ny = P.inside || P.down ? P.ny : 0
        pxS += (nx - pxS) * (1 - Math.exp(-dt * 4)); pyS += (ny - pyS) * (1 - Math.exp(-dt * 4))
        // poses
        const zb = zBrowse()
        const halfH = zb * TAN, yLow = halfH - 1.4, yHigh = B.yRoof - halfH * 0.35
        pBrowse.x = pxS * 0.45; pBrowse.y = lerp(yLow, Math.max(yHigh, yLow), sSm) + pyS * 0.15; pBrowse.z = zb
        pBrowse.rx = (sSm - 0.5) * 0.14 + pyS * 0.02; pBrowse.ry = -pxS * 0.05
        const hot = S.hot >= 0 ? S.hot : S.last
        setHover(pHov, clamp(hot, 0, 7)); setFill(pFly, B.wc[clamp(hot, 0, 7)][0], B.wc[clamp(hot, 0, 7)][1], 0.92)
        setFill(pReel, B.reelCell[0], B.reelCell[1], 0.92)
        mix(pOut, pBrowse, pHov, clamp(S.h, 0, 1)); mix(pOut, pOut, pFly, clamp(S.f, 0, 1)); mix(pOut, pOut, pReel, clamp(S.open, 0, 1))
        camO.position.set(pOut.x, pOut.y, pOut.z); camO.rotation.set(pOut.rx, pOut.ry, 0); camO.updateMatrixWorld()
        // inside edge shifts more than the block (parallax); it follows the gaze tilt a little
        camF.position.set(-pxS * 0.3, -pyS * 0.18, 0); camF.rotation.set(-(sSm - 0.5) * 0.05, pxS * 0.04, 0); camF.updateMatrixWorld()

        // hover pick
        const live = !S.opening && !S.flying && !reduced && P.inside && !(touch && !P.down)
        if (live) {
          const stick = S.hot >= 0 ? hitWork(P.nx, P.ny, 1.3) : -1
          if (stick >= 0 && stick === S.hot) { cand = S.hot; dwell = 1 }
          else {
            const k = hitWork(P.nx, P.ny, 1)
            if (k !== cand) { cand = k; dwell = 0 } else dwell += dt
            if (k >= 0 && dwell > 0.1) hoverTo(k)
            else if (k < 0 && S.hot >= 0 && focusI < 0) hoverTo(-1)
          }
        } else if (!S.flying && !S.opening) {
          if (focusI >= 0) hoverTo(focusI)
          else if (S.hot >= 0 && !(touch)) hoverTo(-1)
        }
        if (focusI >= 0 && !live && !S.flying) hoverTo(focusI)
        const hh = clamp(S.h, 0, 1), flyK = clamp(S.f, 0, 1)

        // windows: switch on and off, one silhouette, a Work flares and dips (the eye goes there)
        const cells = B.cells, data = B.data
        B.nextSil -= dt; B.nextDip -= dt
        if (!reduced && B.nextDip < 0 && S.hot < 0) { B.dip = (Math.random() * 8) | 0; B.dipT = 2.2; B.nextDip = 6 + Math.random() * 4 }
        if (B.dipT > 0) B.dipT -= dt
        if (!reduced && B.nextSil < 0) {
          const k = (Math.random() * B.N) | 0
          if (cells[k].on && cells[k].type !== 3 && cells[k].type !== 5) { B.silCell = k; B.silT = 0; B.silDir = Math.random() < 0.5 ? -1 : 1; B.nextSil = 6 + Math.random() * 8 } else B.nextSil = 0.5
        }
        if (B.silCell >= 0) { B.silT += dt; if (B.silT > B.silDur) B.silCell = -1 }
        const ek = 1 - Math.exp(-dt * 3)
        for (let k = 0; k < B.N; k++) {
          const e = cells[k]
          if (!reduced && e.timer < 1e8) { e.timer -= dt; if (e.timer < 0) { e.on = !e.on; e.timer = 6 + Math.random() * 34 } }
          let target = e.on ? e.base : 0
          if (e.type === 3) {
            if (B.dip === e.work && B.dipT > 0) target = B.dipT > 0.6 ? 0.2 : 1.35 // off, then back on with a flare
            target *= S.hot >= 0 && S.hot !== e.work ? 1 - 0.65 * hh : 1 + 0.12 * (S.hot === e.work ? hh : 0)
          } else if (e.type !== 5) target *= 1 - 0.65 * hh
          e.lit += (target - e.lit) * (e.type === 3 && target > e.lit ? ek * 3 : ek)
          data[k * 4] = e.lit
          data[k * 4 + 1] = B.silCell === k ? B.silDir * (-0.9 + 1.8 * (B.silT / B.silDur)) : -9
          data[k * 4 + 2] = e.type
          data[k * 4 + 3] = Math.max(e.work, 0)
        }
        stateTex.tex.needsUpdate = true
        const blk = S.block
        for (let i = 0; i < facMats.length; i++) {
          const u = facMats[i].uniforms
          u.uTime.value = t; u.uBlock.value = blk; u.uDim.value = 1 - 0.3 * hh
          u.uFill.value = clamp((flyK - 0.55) / 0.45, 0, 1)
        }
        skyU.uT.value = t; skyU.uBlock.value = blk
        headGlow.uniforms.uBlock.value = poolGlow.uniforms.uBlock.value = coneMat.uniforms.uBlock.value = blk
        coneMat.uniforms.uT.value = rt

        // wipe: the pointer clears fog where it moves; a press lays the hand flat
        const ux = clamp(P.nx * 0.5 + 0.5, 0, 1), uy = clamp(P.ny * 0.5 + 0.5, 0, 1)
        const active = (P.inside && !touch) || P.down
        if (active && !S.flying && !reduced) {
          const sp = Math.hypot(P.dx, P.dy)
          const rad = P.down ? 0.11 : 0.04 + clamp(sp / 60, 0, 1) * 0.02
          if (lastUx >= 0 && (sp > 0.5 || P.down)) {
            const n = Math.min(12, Math.ceil(Math.hypot((ux - lastUx) * asp, uy - lastUy) / (rad * 0.4)))
            for (let i = 1; i <= n; i++) stamp(lerp(lastUx, ux, i / n), lerp(lastUy, uy, i / n), rad, 1, asp)
          }
          if (P.down && !wasDown) { // the hand: drops run away from it
            let k = 0
            for (const d of hand) { if (k++ >= 6) break; const a = Math.PI + (k / 7) * Math.PI; d.on = true; d.x = ux + (Math.cos(a) * rad * 0.9) / asp; d.y = uy + Math.sin(a) * rad * 0.9; d.vy = 0.01 + Math.random() * 0.03; d.r = 0.011 + Math.random() * 0.009 }
          }
          lastUx = ux; lastUy = uy
        } else { lastUx = -1; lastUy = -1 }
        wasDown = P.down
        for (let i = 0; i < 6; i++) {
          const d = hand[i], u = runU[i]
          if (d.on) { d.vy = Math.min(d.vy + dt * (0.2 + gu * 0.2), 0.35); d.y -= d.vy * dt; stamp(d.x, d.y, 0.012, 0.85, asp); if (d.y < -0.05) d.on = false }
          u.set(d.x, d.y, d.r, d.on ? 1 : 0)
        }
        const fade = dt * (0.07 + gu * 0.03)
        for (let i = 0; i < maskF.length; i++) { const v = maskF[i]; if (v > 0) maskF[i] = v > fade ? v - fade : 0; maskU[i] = Math.min(255, Math.round(maskF[i] * 255)) }
        maskTex.needsUpdate = true

        // glass uniforms
        U.uT.value = rt; U.uFog.value = S.fog; U.uRain.value = S.rain; U.uFg.value = S.fg; U.uFly.value = clamp((flyK - 0.3) / 0.7, 0, 1)
        U.uGust.value = gu; U.uMon.value = S.fg * (1 - hh)
        U.uPar.value.set(-pxS * 0.012, -pyS * 0.008)
        U.uHeroA.value = (1 - hh) * (1 - flyK) * clamp(S.fog * 2, 0, 1)
        // hover clear region + tag, from the projected window
        if (hh > 0.001 || flyK > 0) {
          const hi = clamp(hot, 0, 7), [c, r] = B.wc[hi], [wx, wy] = cellPos(c, r)
          v3.set(wx, wy, 0).project(camO); v4.set(wx + HW, wy, 0).project(camO); v5.set(wx, wy + HH, 0).project(camO)
          const rx = Math.abs(v4.x - v3.x) * 0.5, ry = Math.abs(v5.y - v3.y) * 0.5
          U.uHov.value.set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5, Math.max(rx * 1.9, 0.01), Math.max(ry * 2.2, 0.01)); U.uHovAmt.value = hh
          const tg = tags[hi]
          for (let k = 0; k < 8; k++) tags[k].group.visible = k === hi && hh > 0.02 && flyK < 0.2
          if (tg.group.visible) {
            const cxp = (v3.x * 0.5 + 0.5) * w, cyp = (0.5 - v3.y * 0.5) * h, hwp = rx * w, hhp = ry * h
            let tx, ty
            if (asp < 0.9) { tx = clamp(cxp, 16 + tg.wpx / 2, w - 16 - tg.wpx / 2); ty = cyp + hhp + 16 + tg.hpx / 2 }
            else { tx = clamp(cxp + hwp + 28 + tg.wpx / 2, 16 + tg.wpx / 2, w - 16 - tg.wpx / 2); ty = cyp }
            tg.group.position.set(tx - w / 2, h / 2 - ty, 0)
            const a = hh * hh
            tg.plateMat.opacity = 0.5 * a; tg.title.mat.opacity = a; tg.meta.mat.opacity = a
          }
        } else { U.uHovAmt.value = 0; for (let k = 0; k < 8; k++) tags[k].group.visible = false }

        // render the two layers the glass shader reads
        const rd = ctx.renderer, ca = rd.getClearAlpha(); rd.getClearColor(tmpCol)
        rd.setRenderTarget(rtO); rd.render(sceneO, camO)
        rd.setClearColor(0x000000, 0); rd.setRenderTarget(rtF); rd.render(sceneF, camF)
        rd.setClearColor(tmpCol, ca); rd.setRenderTarget(null)
      }

      // ---- go ---------------------------------------------------------------------------------------------------------
      resize(Math.max(size.w, 2), Math.max(size.h, 2))
      if (ctx.reduced) { S.open = 0; S.rain = S.fog = S.fg = S.block = 1 } else startOpening()

      return {
        scene, camera, update, resize,
        tap() {
          if (S.opening) { skipOpening(); return }
          if (S.flying) return
          let i = S.hot
          if (i < 0 || touch) i = hitWork(P.nx, P.ny, 1.15)
          if (i >= 0) flyTo(i)
        },
        focus(i) { focusI = i },
        activate(i) { if (S.opening) skipOpening(); if (!S.flying) flyTo(i) },
        back() {
          if (flyTl) flyTl.kill()
          if (backTw) backTw.kill()
          backTw = gsap.timeline({ onComplete: () => { S.flying = false; hoverOn = false; focusI = -1 } })
          backTw.to(S, { f: 0, duration: 0.8, ease: 'power3.inOut' }, 0)
          backTw.to(S, { fg: 1, duration: 0.8 }, 0)
          backTw.to(S, { h: 0, duration: 0.8 }, 0.2)
          S.hot = -1
        },
        dispose() {
          if (tl) tl.kill(); if (flyTl) flyTl.kill(); if (backTw) backTw.kill()
          gsap.killTweensOf(S); gsap.killTweensOf(ctx.crt)
          ctx.cursor.hover(false)
          geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((x) => x.dispose()); rts.forEach((x) => x.dispose())
        },
      }
    },
  })
})()
