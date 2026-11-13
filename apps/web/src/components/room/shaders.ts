// The Edit Room's shaders, ported from the prototype (docs/design/home2/editroom.js). Three.js adds
// `modelMatrix`, `viewMatrix`, `position`, `normal`, `uv` and the projection matrices to a
// ShaderMaterial, so these use them as they are.

/**
 * The one lit shader the furniture, walls and floor share: up to eight fake point/spot lights from
 * uniforms (`uLP`: position and strength, `uLD`: direction and beam tightness), analytic corner
 * darkening and blind stripes, over baked vertex shading (`aCol`).
 */
export const LIT_VS = `
attribute vec3 aCol;
varying vec3 vP; varying vec3 vN; varying vec3 vC;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.);
  vP = w.xyz; vN = mat3(modelMatrix) * normal; vC = aCol;
  gl_Position = projectionMatrix * viewMatrix * w;
}`

export const LIT_FS = `
precision highp float;
uniform vec4 uLP[8]; uniform vec4 uLD[8];
uniform float uRoom, uStripe, uT;
varying vec3 vP; varying vec3 vN; varying vec3 vC;
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  float lit = .15 * uRoom;
  for (int i = 0; i < 8; i++) {
    vec3 d = uLP[i].xyz - vP; float r2 = dot(d, d) + .003; vec3 l = d * inversesqrt(r2);
    float lam = clamp(dot(N, l) * .55 + .45, 0., 1.);
    float f = pow(max(dot(-l, uLD[i].xyz), 0.), uLD[i].w);
    float om = i < 6 ? .18 : .04;
    lit += uLP[i].w * lam * (om + (1. - om) * f) / (1. + r2 * 5.);
  }
  // blinds: faint stripes from the window on the left, drifting slowly
  vec3 sd = normalize(vec3(.8, -.28, .15));
  float sf = max(dot(N, -sd), 0.);
  float ph = vP.y * 8.5 + vP.z * 3. - vP.x * 2.2 + uT * .03;
  float st = smoothstep(.2, .34, abs(fract(ph) - .5));
  lit += uStripe * .11 * sf * st * exp((vP.x + 1.5) * -.3) * uRoom;
  vec3 a3 = abs(N);
  float aox = mix(1., mix(.6, 1., smoothstep(0., .5, 1.5 - abs(vP.x))), 1. - a3.x);
  float aoy = mix(1., mix(.5, 1., smoothstep(0., .55, vP.y)) * mix(.65, 1., smoothstep(0., .5, 2.6 - vP.y)), 1. - a3.y);
  float aoz = mix(1., mix(.55, 1., smoothstep(0., .5, vP.z + 2.)), 1. - a3.z);
  float ud = (1. - smoothstep(.5, .72, vP.y)) * step(abs(vP.x), 1.05) * step(vP.z, -1.25) * (1. - step(vP.z, -2.01));
  gl_FragColor = vec4(vC * lit * aox * aoy * aoz * (1. - .5 * ud), 1.);
}`

/** A screen: its cell of the atlas (`uRect`), at brightness `uB`, darker towards the corners. */
export const SCREEN_VS =
  'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }'

export const SCREEN_FS = `
precision highp float;
uniform sampler2D uMap; uniform vec4 uRect; uniform float uB;
varying vec2 vUv;
void main(){
  vec2 uv = clamp(vUv, .003, .997);
  vec3 c = texture2D(uMap, uRect.xy + uv * uRect.zw).rgb;
  vec2 q = uv - .5;
  gl_FragColor = vec4(c * uB * (1. - .5 * dot(q, q)), 1.);
}`

/** Glow quads, one additive mesh: a monitor's picture mirrored on the desk (kind 0) or a soft patch of light (kind 1). */
export const GLOW_VS = `
attribute vec4 aRect; attribute vec2 aA; attribute float aKind;
varying vec2 vUv; varying vec4 vRect; varying vec2 vA; varying float vKind;
void main(){ vUv = uv; vRect = aRect; vA = aA; vKind = aKind; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`

export const GLOW_FS = `
precision highp float;
uniform sampler2D uMap;
varying vec2 vUv; varying vec4 vRect; varying vec2 vA; varying float vKind;
void main(){
  // kind 0: the monitor's picture mirrored on the desk (bottom row touches the base, fades with distance); kind 1: soft patch
  float s = vUv.y, x = vUv.x * 2. - 1.;
  float fade = exp(-s * (5.2 - 2.6 * vA.y)) * (1. - smoothstep(.72, 1., abs(x))) * (1. - smoothstep(.85, 1., s));
  float v0 = clamp(s * .9, 0., 1.);
  vec3 c = (texture2D(uMap, vRect.xy + vec2(vUv.x, v0) * vRect.zw).rgb
          + texture2D(uMap, vRect.xy + vec2(vUv.x, clamp(v0 + .08, 0., 1.)) * vRect.zw).rgb
          + texture2D(uMap, vRect.xy + vec2(vUv.x, clamp(v0 - .08, 0., 1.)) * vRect.zw).rgb) * .1667;
  vec3 refl = (c + .06) * fade * vA.x * .75;
  vec2 p = vUv * 2. - 1.; float r = clamp(length(p), 0., 1.);
  float h = 1. - smoothstep(0., 1., r); h *= h;
  vec3 halo = vec3(h * .3 * vA.x * (1. + .5 * vA.y));
  gl_FragColor = vec4(mix(refl, halo, step(.5, vKind)), 1.);
}`

/** Soft contact shadows, one transparent mesh. */
export const SHADOW_VS =
  'attribute float aStr; varying vec2 vUv; varying float vS; void main(){ vUv = uv; vS = aStr; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }'

export const SHADOW_FS =
  'precision highp float; varying vec2 vUv; varying float vS; void main(){ float r = clamp(length(vUv*2.-1.),0.,1.); float a = 1.-smoothstep(0.,1.,r); gl_FragColor = vec4(0.,0.,0.,a*a*vS); }'
