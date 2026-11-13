/**
 * The CRT bend: the picture bulges like a curved TV screen. `crtWarp` is the one
 * mapping, from a point on the screen to the point of the picture it shows (normalized device
 * coordinates), in TS for the pointer and in GLSL (`CRT_WARP_GLSL`, the same maths) for the
 * composite. `aspect` is width / height, so the bend is round; `bend` 0 changes nothing. The
 * corners show the picture's own corners and every other point a point further in, so the picture
 * always fills the screen (no rim) and bulges: the middle is magnified by `1 + bend`.
 */
export function crtWarp(x: number, y: number, aspect: number, bend: number) {
  const r2 = (x * x * aspect * aspect + y * y) / (aspect * aspect + 1)
  const scale = (1 + bend * r2) / (1 + bend)
  return { x: x * scale, y: y * scale }
}

/** `crtWarp` in GLSL: keep in step with the TS function above. */
export const CRT_WARP_GLSL = `
vec2 crtWarp(vec2 ndc, float aspect, float bend) {
  vec2 p = ndc * vec2(aspect, 1.0);
  return ndc * (1.0 + bend * dot(p, p) / (aspect * aspect + 1.0)) / (1.0 + bend);
}`
