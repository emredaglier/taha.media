import { describe, expect, it } from 'vitest'

import { cardAt, cardOnScreen, cropToCard, focalFor, HELIX_SHAPE } from './helix-geometry'
import { HELIX_TUNING } from './helix-tuning'

/** Screen shapes (width / height) from tall phones to ultrawide monitors. */
const ASPECTS = [0.4, 0.46, 0.56, 0.75, 1, 1.33, 1.6, 1.78, 2.4, 3.2]

/**
 * Brute force: the widest point of the front card's curved face on screen, as a fraction of the
 * screen width, sampled across the card.
 */
function frontCardWidth(aspect: number): number {
  const { cardHeight, cardRatio, radius, cameraZ } = HELIX_SHAPE
  const focal = focalFor(aspect)
  let widest = 0
  for (let sample = 0; sample <= 200; sample++) {
    const theta = ((sample / 200 - 0.5) * cardHeight * cardRatio) / radius
    const x = (Math.sin(theta) * radius * focal) / aspect / (cameraZ - Math.cos(theta) * radius)
    widest = Math.max(widest, Math.abs(x))
  }
  return widest
}

describe('focalFor', () => {
  it.each(ASPECTS)('fits the front card within the maximum width at aspect %f', (aspect) => {
    expect(frontCardWidth(aspect)).toBeLessThanOrEqual(HELIX_SHAPE.frontMaxWidth + 1e-9)
  })

  it('narrows the view only where the card would not fit, and there fills the maximum width', () => {
    const wide = focalFor(100)
    const narrowed = ASPECTS.filter((aspect) => focalFor(aspect) < wide)
    expect(narrowed.length).toBeGreaterThan(0)
    expect(narrowed.length).toBeLessThan(ASPECTS.length)
    for (const aspect of narrowed) {
      expect(frontCardWidth(aspect)).toBeCloseTo(HELIX_SHAPE.frontMaxWidth, 9)
    }
  })

  it('gives the front card the tuned share of the screen height wherever it fits the width', () => {
    const wide = focalFor(100)
    for (const aspect of ASPECTS.filter((each) => focalFor(each) === wide)) {
      const front = cardOnScreen(0, focalFor(aspect), aspect)!
      expect(front.halfHeight).toBeCloseTo(HELIX_TUNING.frontCardHeight, 9)
    }
  })

  it('never gives a narrower screen a wider view', () => {
    const focals = ASPECTS.map(focalFor)
    focals.slice(1).forEach((focal, index) => expect(focal).toBeGreaterThanOrEqual(focals[index]!))
  })
})

describe('cardAt', () => {
  // Cards 10 to 14 of some Helix: the front card, and the two either side of it.
  const slots = [
    { card: 10, slot: 0 },
    { card: 11, slot: 1 },
    { card: 12, slot: 2 },
    { card: 13, slot: -2 },
    { card: 14, slot: -1 },
  ]

  it.each(ASPECTS)('picks the card whose centre is clicked, at aspect %f', (aspect) => {
    const focal = focalFor(aspect)
    for (const { card, slot } of slots.filter((each) => Math.abs(each.slot) <= 1)) {
      const box = cardOnScreen(slot, focal, aspect)!
      expect(cardAt({ x: box.x, y: box.y }, slots, focal, aspect)).toBe(card)
    }
  })

  it('picks the front card where it overlaps the next one down', () => {
    const aspect = 16 / 9
    const focal = focalFor(aspect)
    const front = cardOnScreen(0, focal, aspect)!
    const next = cardOnScreen(1, focal, aspect)!
    // The middle of where the two boxes overlap.
    const x = (front.x + front.halfWidth + (next.x - next.halfWidth)) / 2
    const y = (front.y - front.halfHeight + (next.y + next.halfHeight)) / 2
    expect(Math.abs(x - next.x)).toBeLessThan(next.halfWidth)
    expect(Math.abs(y - front.y)).toBeLessThan(front.halfHeight)
    expect(cardAt({ x, y }, slots, focal, aspect)).toBe(10)
  })

  it('picks nothing on the empty side of the screen at mid-height', () => {
    const aspect = 16 / 9
    expect(cardAt({ x: -0.95, y: 0 }, slots, focalFor(aspect), aspect)).toBe(-1)
  })
})

describe('cropToCard', () => {
  const SHAPES = [
    [1920, 1080],
    [1280, 720],
    [1920, 1088],
    [1440, 1080],
    [2560, 1080],
    [1080, 1920],
    [1000, 1000],
  ]
  const centre = { x: 50, y: 50 }

  it.each(SHAPES)('fills a 16:9 card from %i×%i, never stretched', (width, height) => {
    const { scale } = cropToCard(width, height, centre)
    // The part of the picture shown has the card's shape...
    expect((scale.x * width) / (scale.y * height)).toBeCloseTo(HELIX_SHAPE.cardRatio, 9)
    // ...and is as big as it can be: one side whole, neither more than whole.
    expect(Math.max(scale.x, scale.y)).toBe(1)
    expect(Math.min(scale.x, scale.y)).toBeGreaterThan(0)
  })

  it.each(SHAPES)('stays inside a %i×%i picture wherever its focal point is', (width, height) => {
    for (const x of [0, 30, 50, 100]) {
      for (const y of [0, 50, 85, 100]) {
        const { scale, offset } = cropToCard(width, height, { x, y })
        for (const axis of ['x', 'y'] as const) {
          expect(offset[axis]).toBeGreaterThanOrEqual(0)
          expect(offset[axis] + scale[axis]).toBeLessThanOrEqual(1 + 1e-12)
        }
      }
    }
  })

  it('keeps the side of a wide picture its focal point is on', () => {
    const left = cropToCard(2560, 1080, { x: 0, y: 50 })
    const right = cropToCard(2560, 1080, { x: 100, y: 50 })
    expect(left.offset.x).toBe(0)
    expect(right.offset.x + right.scale.x).toBeCloseTo(1, 12)
  })

  it('keeps the top of a tall picture when its focal point is at the top (texture v runs up)', () => {
    const top = cropToCard(1080, 1920, { x: 50, y: 0 })
    expect(top.offset.y + top.scale.y).toBeCloseTo(1, 12)
    expect(cropToCard(1080, 1920, { x: 50, y: 100 }).offset.y).toBe(0)
  })
})
