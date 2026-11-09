import { describe, expect, it } from 'vitest'

import { PALM, pose } from './hand-fixtures'
import { palmSize } from './hand-gesture'
import {
  HINT_TEXT,
  initialHints,
  meanLuma,
  readHints,
  type HandHint,
  type HintEvent,
  type HintReading,
  type HintsState,
} from './hand-hints'
import { HAND_TUNING } from './hand-tuning'

const { farPalm, nearPalm, lowScore, goodScore, darkLuma, brightLuma, showAfterMs, clearAfterMs } =
  HAND_TUNING.hints
const CAMERA_MS = 1000 / 30

/** A clear reading: a hand at a good distance, tracked surely, in a well-lit picture. */
const GOOD: HintReading = { hand: pose(0.5, 0.5, 0.9), score: 0.95, luma: 128 }

/** Feeds `reading(i)` for `ms` of camera frames from `from`; the hints' changes and last state. */
const feed = (state: HintsState, from: number, ms: number, reading: (i: number) => HintReading) => {
  const events: { at: number; event: HintEvent }[] = []
  let now = from
  for (let i = 0; now <= from + ms; i++, now += CAMERA_MS) {
    const step = readHints(state, reading(i), now)
    state = step.state
    for (const event of step.events) events.push({ at: now, event })
  }
  return { state, events, now }
}
const changes = (events: { event: HintEvent }[], hint: HandHint) =>
  events.filter(({ event }) => event.hint === hint).map(({ event }) => event.on)

describe('the palm size the reader measures', () => {
  it('is the wrist to index knuckle, in camera-frame heights', () => {
    expect(palmSize(pose(0.5, 0.5, 0.9))).toBeCloseTo(PALM, 9)
    expect(palmSize(pose(0.5, 0.5, 0.9, PALM / 2))).toBeCloseTo(PALM / 2, 9)
  })
})

describe('"Biraz yaklaş": the hand is too far', () => {
  const at = (palm: number): HintReading => ({ ...GOOD, hand: pose(0.5, 0.5, 0.9, palm) })
  const far = at(farPalm * 0.8)
  const near = at(nearPalm * 1.2)

  it('says so in Turkish', () => {
    expect(HINT_TEXT.far).toBe('Biraz yaklaş')
  })

  it(`shows for a small hand once it has stayed small ${showAfterMs} ms, and clears when it comes closer`, () => {
    const small = feed(initialHints, 0, showAfterMs * 2, () => far)
    expect(changes(small.events, 'far')).toEqual([true])
    const shownAt = small.events[0]!.at
    expect(shownAt).toBeGreaterThanOrEqual(showAfterMs)
    expect(shownAt).toBeLessThanOrEqual(showAfterMs + CAMERA_MS)
    const closer = feed(small.state, small.now, clearAfterMs * 2, () => near)
    expect(changes(closer.events, 'far')).toEqual([false])
    expect(closer.events[0]!.at - small.now).toBeGreaterThanOrEqual(clearAfterMs - CAMERA_MS)
  })

  it('a hand that is small only briefly shows nothing', () => {
    const brief = feed(initialHints, 0, showAfterMs * 4, (i) =>
      i % 20 < (showAfterMs / CAMERA_MS) * 0.5 ? far : near,
    )
    expect(brief.events).toEqual([])
  })

  it('does not flicker for a hand hovering about the line', () => {
    // Jitter across the line it shows at, never beyond the line it clears at.
    const hovering = feed(initialHints, 0, 10_000, (i) =>
      at(farPalm + (nearPalm - farPalm) * (i % 2 === 0 ? -0.5 : 0.9)),
    )
    expect(changes(hovering.events, 'far')).toEqual([true])
  })

  it('a moment closer while shown does not clear it', () => {
    const shown = feed(initialHints, 0, showAfterMs * 2, () => far)
    const blip = feed(shown.state, shown.now, clearAfterMs * 3, (i) => (i % 10 === 0 ? near : far))
    expect(blip.events).toEqual([])
  })

  it('clears when the hand leaves the picture', () => {
    const shown = feed(initialHints, 0, showAfterMs * 2, () => far)
    const gone = feed(shown.state, shown.now, clearAfterMs * 2, () => ({ ...GOOD, hand: null }))
    expect(changes(gone.events, 'far')).toEqual([false])
  })
})

describe('"Daha çok ışık": tracking is poor in low light', () => {
  it('says so in Turkish', () => {
    expect(HINT_TEXT.dark).toBe('Daha çok ışık')
  })

  it.each<[string, Partial<HintReading>]>([
    ['a dark picture', { luma: darkLuma * 0.5 }],
    ['a dark picture with no hand found', { luma: darkLuma * 0.5, hand: null, score: null }],
    ['a hand tracked unsurely', { score: lowScore * 0.9 }],
  ])('shows for %s, and clears when it is light again', (_, poor) => {
    const dim = feed(initialHints, 0, showAfterMs * 2, () => ({ ...GOOD, ...poor }))
    expect(changes(dim.events, 'dark')).toEqual([true])
    expect(changes(dim.events, 'far')).toEqual([])
    const lit = feed(dim.state, dim.now, clearAfterMs * 2, () => GOOD)
    expect(changes(lit.events, 'dark')).toEqual([false])
  })

  it('does not flicker for a picture hovering about the line', () => {
    const between = (darkLuma + brightLuma) / 2
    const hovering = feed(initialHints, 0, 10_000, (i) => ({
      ...GOOD,
      luma: i % 2 === 0 ? darkLuma * 0.9 : between,
      score: i % 3 === 0 ? lowScore * 0.95 : (lowScore + goodScore) / 2,
    }))
    expect(changes(hovering.events, 'dark')).toEqual([true])
  })

  it('a good picture never shows a hint', () => {
    expect(feed(initialHints, 0, 10_000, () => GOOD).events).toEqual([])
  })
})

describe('the picture’s mean luma', () => {
  const pixels = (...rgba: number[][]) => new Uint8ClampedArray(rgba.flat())

  it('is 0 for black and 255 for white, whatever the alpha', () => {
    expect(meanLuma(pixels([0, 0, 0, 255], [0, 0, 0, 0]))).toBe(0)
    expect(meanLuma(pixels([255, 255, 255, 255], [255, 255, 255, 0]))).toBeCloseTo(255, 9)
  })

  it('weighs green over red over blue, as the eye does (Rec. 601)', () => {
    const red = meanLuma(pixels([255, 0, 0, 255]))
    const green = meanLuma(pixels([0, 255, 0, 255]))
    const blue = meanLuma(pixels([0, 0, 255, 255]))
    expect(green).toBeGreaterThan(red)
    expect(red).toBeGreaterThan(blue)
    expect(red + green + blue).toBeCloseTo(255, 9)
  })

  it('averages the pixels', () => {
    expect(meanLuma(pixels([0, 0, 0, 255], [200, 200, 200, 255]))).toBeCloseTo(100, 9)
  })
})
