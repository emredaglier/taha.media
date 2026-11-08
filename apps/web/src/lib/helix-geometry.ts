import { HELIX_TUNING } from './helix-tuning'

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

/**
 * The focal length for a screen of this aspect (width / height): the front card takes the tuned
 * share of the screen height, unless its curved edges would then pass the maximum width (narrow
 * screens); there it fits the width.
 */
export function focalFor(aspect: number): number {
  const { cardHeight, cardRatio, radius, cameraZ, frontMaxWidth } = HELIX_SHAPE
  const byHeight = (HELIX_TUNING.frontCardHeight * (cameraZ - radius)) / (cardHeight / 2)
  const edge = (cardHeight * cardRatio) / 2 / radius
  const byWidth =
    (frontMaxWidth * aspect * (cameraZ - Math.cos(edge) * radius)) / (Math.sin(edge) * radius)
  return Math.min(byHeight, byWidth)
}

/** A screen of `width` by `height` (any unit): its shape (width / height) and its focal length. */
export function lensFor(width: number, height: number) {
  const aspect = width / Math.max(1, height)
  return { aspect, focal: focalFor(aspect) }
}

/**
 * How far turning the Helix by `turn` cards moves the front of it up the screen, in screen
 * heights: one slot's height where the front card sits. The liquid glass's haze rides with it.
 */
export const turnOnScreen = (turn: number, focal: number): number =>
  (turn * SLOT_PITCH * focal) / (HELIX_SHAPE.cameraZ - HELIX_SHAPE.radius) / 2

/**
 * Where the opening's camera starts (#54): how much the Helix is scaled up so that the front card
 * covers the whole screen, with a little to spare. The zoom pulls back from here to 1.
 */
export function coverScale(focal: number, aspect: number): number {
  const { cardHeight, cardRatio, radius, cameraZ } = HELIX_SHAPE
  const edge = (cardHeight * cardRatio) / 2 / radius
  // The curved card bulges towards the camera, so its side edges are the farthest from it, and
  // the card is shortest on screen there.
  const sideDepth = cameraZ - Math.cos(edge) * radius
  const halfWidth = (Math.sin(edge) * radius * focal) / aspect / sideDepth
  const halfHeight = ((cardHeight / 2) * focal) / sideDepth
  return Math.max(1 / halfWidth, 1 / halfHeight) * HELIX_TUNING.coverSpare
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
export const cropToCard = (width: number, height: number, focalPoint: { x: number; y: number }) =>
  cropToFill(width, height, HELIX_SHAPE.cardRatio, focalPoint)

/** The part of a picture a card or the screen shows (`cropToCard`, `cropToFill`). */
export type PictureCrop = ReturnType<typeof cropToFill>

/**
 * The part of a picture a box of aspect `ratio` (width / height) shows when the picture fills it,
 * as CSS `object-fit: cover` with `object-position` at the focal point does. Same shape as
 * `cropToCard`.
 */
export function cropToFill(
  width: number,
  height: number,
  ratio: number,
  focalPoint: { x: number; y: number },
) {
  const aspect = width / height
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
