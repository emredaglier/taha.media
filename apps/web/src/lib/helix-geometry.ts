/**
 * The Helix's shape (#45, "The Helix: rendering"): the 21st.dev dither helix carousel's geometry
 * as the prototype tuned it, flipped so that the next card comes up from below. World units; the
 * renderer draws it and clicks are picked with it. Positions on screen are in normalized device
 * coordinates: -1 to 1 across, y up.
 */
export const HELIX_SHAPE = {
  cardHeight: 1.6,
  cardRatio: 16 / 9,
  /** The cylinder the front card wraps around. */
  radius: 3.8,
  /** Each slot further down sits this much further out (and further up, further in). */
  radiusStep: 0.055,
  cameraZ: 10,
  fovDegrees: 48,
  near: 0.1,
  far: 60,
  /** Radians around the cylinder per slot. */
  twist: 0.8,
  /** Card heights down per slot. */
  rise: 0.79,
  /** How far a fast turn bends the cards, and how quickly the bend follows the speed. */
  bend: 2.7,
  bendEase: 0.12,
  bendMax: 0.07,
  /** On narrow screens the front card fits within this fraction of the width. */
  frontMaxWidth: 0.86,
}

/** Vertical distance between neighbouring cards. */
export const SLOT_PITCH = HELIX_SHAPE.rise * HELIX_SHAPE.cardHeight

const BASE_FOCAL = 1 / Math.tan((HELIX_SHAPE.fovDegrees * Math.PI) / 360)

/**
 * The focal length for a screen of this aspect (width / height): the field of view the prototype
 * used, narrowed on narrow screens until the front card's curved edges fit within the width.
 */
export function focalFor(aspect: number): number {
  const { cardHeight, cardRatio, radius, cameraZ, frontMaxWidth } = HELIX_SHAPE
  const edge = (cardHeight * cardRatio) / 2 / radius
  const halfWidth =
    (Math.sin(edge) * radius * BASE_FOCAL) / aspect / (cameraZ - Math.cos(edge) * radius)
  return BASE_FOCAL * Math.min(1, frontMaxWidth / halfWidth)
}

/** Where the card at `slot` shows, as a box around its centre; null when behind the camera. */
export function cardOnScreen(slot: number, focal: number, aspect: number) {
  const { cardHeight, cardRatio, radius, radiusStep, cameraZ, near, twist } = HELIX_SHAPE
  const angle = slot * twist
  const r = radius + slot * radiusStep
  const distance = cameraZ - Math.cos(angle) * r
  if (distance <= near) return null
  return {
    x: (Math.sin(angle) * r * focal) / aspect / distance,
    y: (-slot * SLOT_PITCH * focal) / distance,
    halfWidth: (cardHeight * cardRatio * focal) / aspect / distance / 2,
    halfHeight: (cardHeight * focal) / distance / 2,
    distance,
  }
}

/**
 * The part of a picture a 16:9 card shows: as much as fits in the card's shape, centred on the
 * focal point (percent of width and height, from the top left) as far as the picture allows.
 * Media that isn't quite 16:9 is cropped, never stretched. In texture coordinates, which run up:
 * `scale` is the fraction of the picture shown on each axis, `offset` where it starts.
 */
export function cropToCard(width: number, height: number, focalPoint: { x: number; y: number }) {
  const aspect = width / height
  const ratio = HELIX_SHAPE.cardRatio
  const scale = aspect > ratio ? { x: ratio / aspect, y: 1 } : { x: 1, y: aspect / ratio }
  return {
    scale,
    offset: {
      x: (focalPoint.x / 100) * (1 - scale.x),
      y: (1 - focalPoint.y / 100) * (1 - scale.y),
    },
  }
}

/** Which of `cards` (each at its slot) is under `point`: the nearest where they overlap, or -1. */
export function cardAt(
  point: { x: number; y: number },
  cards: readonly { card: number; slot: number }[],
  focal: number,
  aspect: number,
): number {
  let best = -1
  let bestDistance = Infinity
  for (const { card, slot } of cards) {
    const box = cardOnScreen(slot, focal, aspect)
    if (!box || box.distance >= bestDistance) continue
    if (Math.abs(point.x - box.x) > box.halfWidth || Math.abs(point.y - box.y) > box.halfHeight)
      continue
    best = card
    bestDistance = box.distance
  }
  return best
}
