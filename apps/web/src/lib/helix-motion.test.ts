import { describe, expect, it } from 'vitest'

import { HELIX_TUNING } from './helix-tuning'
import {
  counter,
  createHelix,
  frontCard,
  frontWork,
  isResting,
  slotOf,
  stepHelix,
  visibleCards,
  workOfCard,
  type HelixInput,
  type HelixState,
} from './helix-motion'

/** Featured Work counts to check properties over: one, a few, around the minimum, many. */
const WORK_COUNTS = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 17]

const range = (length: number) => Array.from({ length }, (_, index) => index)

/** An input at a wall-clock time (ms). */
type Timed = { at: number; input: HelixInput }

/**
 * Runs the Helix like a browser does: a frame `fps` times a second from 0 until `until` (ms), and
 * each input at its own time, between frames.
 */
function simulate(
  start: HelixState,
  timeline: Timed[],
  { until, fps = 60 }: { until: number; fps?: number },
): HelixState {
  const events = [...timeline].sort((a, b) => a.at - b.at)
  let state = stepHelix(start, { kind: 'frame' }, 0)
  for (let frame = 1; frame * (1000 / fps) <= until; frame++) {
    const now = frame * (1000 / fps)
    while (events.length > 0 && events[0]!.at <= now) {
      const { at, input } = events.shift()!
      state = stepHelix(state, input, at)
    }
    state = stepHelix(state, { kind: 'frame' }, now)
  }
  return state
}

/** Long enough for any move in these tests to come to rest. */
const LATER = HELIX_TUNING.tweenMs + 4 * HELIX_TUNING.settleSeconds * 1000

/** `count` presses of one arrow key, `gap` ms apart, from `from` ms. */
const presses = (count: number, step: 1 | -1, from = 0, gap = 60): Timed[] =>
  range(count).map((index) => ({ at: from + index * gap, input: { kind: 'arrow', step } }))

/** What browsers send for one notch of a mouse wheel: pixels in Chromium and Safari, lines in Firefox. */
const NOTCHES = {
  pixels: { deltaY: 100, deltaMode: 0 },
  lines: { deltaY: 3, deltaMode: 1 },
}

/** Wheel ticks of `deltaY` pixels, `gap` ms apart, from 0. */
const wheel = (deltas: number[], gap = 16): Timed[] =>
  deltas.map((deltaY, index) => ({
    at: index * gap,
    input: { kind: 'wheel', deltaY, deltaMode: 0 },
  }))

/** Pixels of vertical drag that turn the Helix by `cards`. */
const dragPx = (cards: number) => cards / HELIX_TUNING.dragScale

/**
 * A drag that turns the Helix by `cards` (negative: back) in ten moves over `ms`, then holds still
 * until `releaseAt` before letting go.
 */
const drag = (cards: number, ms: number, releaseAt = ms): Timed[] => [
  { at: 0, input: { kind: 'dragStart' } },
  ...range(10).map((index) => ({
    at: ((index + 1) * ms) / 10,
    input: { kind: 'dragMove', up: dragPx(cards) / 10 } as const,
  })),
  { at: releaseAt, input: { kind: 'dragEnd' } },
]

/** When the input of a timeline has ended: its last event, plus the idle gap for the wheel. */
const inputEnd = (timeline: Timed[]) => {
  const last = timeline.at(-1)!
  return last.at + (last.input.kind === 'wheel' ? HELIX_TUNING.wheelIdleMs : 0)
}

/** Sample input, from a careful nudge to a fast flick, both ways. */
const SAMPLE_INPUT: [string, Timed[]][] = [
  ['one notch down', wheel([NOTCHES.pixels.deltaY])],
  ['three quick notches up', wheel([-100, -100, -100], 40)],
  ['a trackpad swipe that fades out', wheel([40, 36, 30, 24, 18, 12, 8, 5, 3, 1])],
  ['a long trackpad swipe', wheel(range(40).map(() => 25))],
  ['a slow drag up by half a card', drag(0.5, 400)],
  ['a flick up by two cards', drag(2.3, 120)],
  ['a flick down by one card', drag(-1.1, 100)],
  ['a drag down that lets go mid-way between cards', drag(-0.45, 300)],
]

describe('the cards', () => {
  it.each(WORK_COUNTS)('with %i Works: at least the minimum, every Work equally often', (n) => {
    const helix = createHelix(n)
    expect(helix.cards).toBeGreaterThanOrEqual(HELIX_TUNING.minCards)
    const shown = range(helix.cards).map((card) => workOfCard(helix, card))
    for (const work of range(n)) {
      expect(shown.filter((each) => each === work)).toHaveLength(helix.cards / n)
    }
  })

  it.each(WORK_COUNTS)('with %i Works: card i shows Work i mod n, keeping the order', (n) => {
    const helix = createHelix(n)
    for (const card of range(helix.cards)) {
      expect(workOfCard(helix, card)).toBe(card % n)
    }
  })

  it.each(WORK_COUNTS)('with %i Works: repeats no more than needed', (n) => {
    // One lap of the Works fewer would drop below the minimum.
    expect(createHelix(n).cards - n).toBeLessThan(HELIX_TUNING.minCards)
  })

  it.each(WORK_COUNTS)('with %i Works: the counter counts real Works', (n) => {
    expect(counter(createHelix(n))).toEqual({ current: 1, total: n })
  })

  it.each(WORK_COUNTS.filter((n) => n >= 6))(
    'with %i Works: no two cards in the visible band show the same Work',
    (n) => {
      // Between whole cards too, where the band holds the most cards.
      for (const front of range(createHelix(n).cards)) {
        for (const offset of [0, 0.25, 0.5, 0.75]) {
          const helix = { ...createHelix(n, front), progress: front + offset }
          const works = visibleCards(helix).map((card) => workOfCard(helix, card))
          expect(new Set(works).size).toBe(works.length)
        }
      }
    },
  )

  it.each(WORK_COUNTS)(
    'with %i Works: the visible band holds the front card and two either side',
    (n) => {
      const helix = createHelix(n)
      const slots = visibleCards(helix).map((card) => slotOf(helix, card))
      for (const slot of [-2, -1, 0, 1, 2]) expect(slots).toContain(slot)
    },
  )

  it('widens the visible band with more Works, so a big set fills the screen', () => {
    expect(visibleCards(createHelix(12)).length).toBeGreaterThan(
      visibleCards(createHelix(6)).length,
    )
  })
})

describe('arrow keys', () => {
  it.each(WORK_COUNTS)('with %i Works: one press moves exactly one card either way', (n) => {
    for (const front of [0, 1, n - 1]) {
      for (const step of [1, -1] as const) {
        const after = simulate(createHelix(n, front), presses(1, step), { until: LATER })
        expect(isResting(after)).toBe(true)
        expect(after.progress).toBe(front + step)
        expect(frontCard(after)).toBe((front + step + after.cards) % after.cards)
      }
    }
  })

  it('counts every press, even before the last one has finished turning', () => {
    const after = simulate(createHelix(6), presses(3, 1), { until: LATER })
    expect(after.progress).toBe(3)
    expect(isResting(after)).toBe(true)
  })
})

describe('the wheel', () => {
  it.each(Object.entries(NOTCHES))('advances exactly one card per notch in %s', (_, notch) => {
    for (const sign of [1, -1]) {
      const input: HelixInput = { kind: 'wheel', ...notch, deltaY: sign * notch.deltaY }
      const after = simulate(createHelix(6, 2), [{ at: 0, input }], { until: LATER })
      expect(isResting(after)).toBe(true)
      expect(after.progress).toBe(2 + sign)
    }
  })

  it('springs back from a tiny accidental nudge', () => {
    for (const sign of [1, -1]) {
      const after = simulate(createHelix(6, 2), wheel([sign * 3]), { until: LATER })
      expect(after.progress).toBe(2)
    }
  })

  it('waits for the wheel to stop before settling', () => {
    // Ticks closer together than the idle gap keep the Helix following.
    const ticks = wheel(
      range(8).map(() => 20),
      HELIX_TUNING.wheelIdleMs / 2,
    )
    const during = simulate(createHelix(6), ticks, { until: ticks.at(-1)!.at + 1 })
    expect(isResting(during)).toBe(false)
  })
})

describe('settling', () => {
  // "About twice": a fast flick's speed at release adds to the spring's tail.
  const aboutTwiceTheSettleTime = 2.5 * HELIX_TUNING.settleSeconds * 1000

  it.each(SAMPLE_INPUT)(
    'after %s, rests on a whole card within about twice the settle time',
    (_, timeline) => {
      const after = simulate(createHelix(6, 3), timeline, {
        until: inputEnd(timeline) + aboutTwiceTheSettleTime,
      })
      expect(isResting(after)).toBe(true)
      expect(Number.isInteger(after.progress)).toBe(true)
    },
  )

  it.each(SAMPLE_INPUT)('after %s, rests on a card in the direction of travel', (_, timeline) => {
    const travel = timeline.reduce(
      (sum, { input }) =>
        sum + (input.kind === 'wheel' ? input.deltaY : input.kind === 'dragMove' ? input.up : 0),
      0,
    )
    const after = simulate(createHelix(6, 3), timeline, { until: LATER })
    expect(Math.sign(after.progress - 3)).toBe(Math.sign(travel))
  })

  const { settleThreshold: threshold } = HELIX_TUNING
  it.each([
    ['forward, less than the threshold off the card: springs back', threshold / 2, 3],
    ['forward, past the threshold: the next card', threshold * 1.5, 4],
    ['forward, nearly a card', 0.9, 4],
    ['forward, a card and a bit under the threshold: that card', 1 + threshold / 2, 4],
    ['forward, a card and past the threshold: the one after', 1 + threshold * 1.5, 5],
    ['back, less than the threshold off the card: springs back', -threshold / 2, 3],
    ['back, past the threshold: the card before', -threshold * 1.5, 2],
    ['back, a card and past the threshold: the one before that', -1 - threshold * 1.5, 1],
  ])('a slow drag %s', (_, cards, expected) => {
    // Held still before letting go, so no speed carries the target on.
    const timeline = drag(cards, 300, 1600)
    const after = simulate(createHelix(6, 3), timeline, { until: 1600 + LATER })
    expect(after.progress).toBe(expected)
  })

  it.each(SAMPLE_INPUT)(
    'after %s, rests on the same card at 30, 60 and 120 frames a second',
    (_, timeline) => {
      const resting = [30, 60, 120].map(
        (fps) => simulate(createHelix(6, 3), timeline, { until: LATER, fps }).progress,
      )
      expect(new Set(resting).size).toBe(1)
    },
  )
})

describe('clicks and keys', () => {
  const click = (card: number): Timed[] => [{ at: 0, input: { kind: 'card', card } }]

  it.each(WORK_COUNTS)(
    'with %i Works: a click on a side card brings it to the front the shortest way',
    (n) => {
      for (const front of [0, n - 1]) {
        const start = simulate(createHelix(n, front), [], { until: 0 })
        for (const card of range(start.cards).filter((each) => each !== frontCard(start))) {
          const after = simulate(start, click(card), { until: LATER })
          expect(frontCard(after)).toBe(card)
          expect(isResting(after)).toBe(true)
          // Brute force: the nearest place on the endless Helix where this card is in front.
          const shortest = Math.min(
            ...[-2, -1, 0, 1, 2].map((lap) => Math.abs(card + lap * start.cards - start.progress)),
          )
          expect(Math.abs(after.progress - start.progress)).toBe(shortest)
          expect(after.open).toBeNull()
        }
      }
    },
  )

  it.each(WORK_COUNTS)(
    'with %i Works: a click on the front card and Enter both open the front Work',
    (n) => {
      for (const work of range(n)) {
        const start = createHelix(n, work)
        for (const input of [
          { kind: 'card', card: frontCard(start) },
          { kind: 'enter' },
        ] as const) {
          const after = stepHelix(start, input, 0)
          expect(after.open).toBe(work)
          expect(after.progress).toBe(start.progress)
        }
      }
    },
  )

  it('while turning, opens the card in front on screen, and turns to one not there yet', () => {
    // An arrow key has just started the turn to card 1: card 0 is still in front on screen.
    const turning = simulate(createHelix(6), presses(1, 1), { until: 100 })
    expect(stepHelix(turning, { kind: 'card', card: 0 }, 110).open).toBe(0)
    const toNext = stepHelix(turning, { kind: 'card', card: 1 }, 110)
    expect(toNext.open).toBeNull()
    expect(simulate(toNext, [], { until: 110 + LATER }).progress).toBe(1)
  })

  it('opens the Work in front after turning, and only for the input that asked', () => {
    const turned = simulate(createHelix(4, 1), presses(2, 1), { until: LATER })
    expect(frontWork(turned)).toBe(3)
    const opened = stepHelix(turned, { kind: 'enter' }, LATER + 10)
    expect(opened.open).toBe(3)
    expect(stepHelix(opened, { kind: 'frame' }, LATER + 20).open).toBeNull()
  })

  it('names the Work on a repeated card by its real place among the Works', () => {
    // Five Works make ten cards: card 7 shows the third Work.
    const after = simulate(createHelix(5), click(7), { until: LATER })
    expect(counter(after)).toEqual({ current: 3, total: 5 })
    expect(stepHelix(after, { kind: 'enter' }, LATER + 10).open).toBe(2)
  })
})

describe('endless', () => {
  it.each(WORK_COUNTS)('with %i Works: a whole lap brings back the same front Work', (n) => {
    const start = createHelix(n, 1 % n)
    for (const step of [1, -1] as const) {
      const after = simulate(start, presses(start.cards, step), { until: LATER * 2 })
      expect(after.progress).toBe(start.progress + step * start.cards)
      expect(frontCard(after)).toBe(frontCard(start))
      expect(counter(after)).toEqual(counter(start))
    }
  })

  it.each([1, 2, 5, 13])('forward then back by %i cards returns to the same card', (k) => {
    const start = createHelix(4, 2)
    const turnBackAt = 2 * LATER
    const forward = simulate(start, presses(k, 1), { until: turnBackAt - 1 })
    expect(forward.progress).toBe(start.progress + k)
    const back = simulate(start, [...presses(k, 1), ...presses(k, -1, turnBackAt)], {
      until: turnBackAt + 2 * LATER,
    })
    expect(frontCard(back)).toBe(frontCard(start))
    expect(back.progress).toBe(start.progress)
  })
})
