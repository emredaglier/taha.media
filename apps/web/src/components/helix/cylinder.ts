import { HELIX_SHAPE, SLOT_PITCH } from '../../lib/helix-geometry'
import { float } from './gl'

/**
 * Where a card sits on the Helix's cylinder, as GLSL for a vertex shader: the card pass and the
 * Showreel layer both place their quads with it, so the Showreel lands exactly on its card.
 * `cardPoint(pos, slot, angle)` is the world position of the card at `slot` for the point `pos`
 * (0 to 1 across the card), the card turned `angle` radians round the cylinder (`slot * TWIST`,
 * plus whatever bend the caller adds).
 */
export const CYLINDER_GLSL = `
const vec2 CARD = vec2(${float(HELIX_SHAPE.cardHeight * HELIX_SHAPE.cardRatio)}, ${float(HELIX_SHAPE.cardHeight)});
const float RADIUS = ${float(HELIX_SHAPE.radius)};
const float RADIUS_STEP = ${float(HELIX_SHAPE.radiusStep)};
const float CAMERA_Z = ${float(HELIX_SHAPE.cameraZ)};
const float TWIST = ${float(HELIX_SHAPE.twist)};
const float PITCH = ${float(SLOT_PITCH)};
vec3 cardPoint(vec2 pos, float slot, float angle) {
  vec2 local = (pos - 0.5) * CARD;
  float r = RADIUS + slot * RADIUS_STEP;
  float theta = angle + local.x / r;
  return vec3(sin(theta) * r, local.y - slot * PITCH, cos(theta) * r);
}`
