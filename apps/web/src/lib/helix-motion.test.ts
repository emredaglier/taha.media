import { describe, expect, it } from 'vitest'

import { focalFor } from './helix-geometry'
import {
  cardPresence,
  counter,
  createHelix,
  createOpening,
  frontCard,
  frontWork,
  isResting,
  liveCards,
  liveRegionAfter,
  openingOf,
  playingWorks,
  previewLoops,
  sharpCards,
  showsLoop,
  slotOf,
  startHelix,
  stepHelix,
  visibleCards,
  workOfCard,
  type HelixInput,
  type HelixState,
} from './helix-motion'
import { HELIX_TUNING } from './helix-tuning'

/** Featured Work counts to check properties over: one, a few, around the minimum, many. */
const WORK_COUNTS = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 17]

const range = (length: number) => Array.from({ length }, (_, index) => index)
const mod = (value: number, by: number) => ((value % by) + by) % by

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

/**
 * `input` arrives at `state` as it is, five milliseconds after its last step (a state that is
 * mid-turn, or mid-melt), then frames run until everything has come to rest.
 */
function inputThenRest(state: HelixState, input: HelixInput): HelixState {
  const at = state.time! + 5
  let next = stepHelix(state, input, at)
  for (let time = at + 1000 / 60; time <= at + LATER; time += 1000 / 60) {
    next = stepHelix(next, { kind: 'frame' }, time)
  }
  return next
}

/** Long enough for the zoom to catch up with a scroll that has stopped (to within e^-10). */
const CAUGHT_UP = 10_000 / HELIX_TUNING.zoomRate
const MELT_MS = HELIX_TUNING.meltSeconds * 1000
/** From a scroll to the end of the page to the end of the melt. */
const OPENING_MS = CAUGHT_UP + MELT_MS

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

describe('the sharp band', () => {
  /** Screens from a tall phone to an ultrawide monitor, as their focal lengths. */
  const FOCALS = [390 / 844, 3 / 4, 16 / 9, 21 / 9].map(focalFor)
  /** Bands from none at all to the whole screen height, around the tuned one. */
  const BANDS = [0, HELIX_TUNING.sharpBand / 2, HELIX_TUNING.sharpBand, 0.5, 1].sort(
    (a, b) => a - b,
  )

  /** The Helix turned to `progress` cards, with the opening behind it. */
  const turnedTo = (n: number, progress: number): HelixState => ({
    ...createHelix(n),
    progress,
  })

  /** Every place to check: each card in front, at rest and between cards. */
  const places = (n: number) =>
    range(createHelix(n).cards).flatMap((front) =>
      [0, 0.25, 0.5, 0.75].map((offset) => turnedTo(n, front + offset)),
    )

  it.each(WORK_COUNTS)('with %i Works: the card nearest the middle is always sharp', (n) => {
    for (const helix of places(n)) {
      const middle = mod(Math.round(helix.progress), helix.cards)
      for (const focal of FOCALS) {
        for (const band of BANDS) expect(sharpCards(helix, focal, band)).toContain(middle)
      }
    }
  })

  it.each(WORK_COUNTS)('with %i Works: a wider band never holds fewer cards', (n) => {
    for (const helix of places(n)) {
      for (const focal of FOCALS) {
        for (const [narrow, wide] of BANDS.slice(1).map((band, index) => [BANDS[index]!, band])) {
          const inWide = sharpCards(helix, focal, wide!)
          for (const card of sharpCards(helix, focal, narrow)) expect(inWide).toContain(card)
        }
      }
    }
  })

  it.each(WORK_COUNTS)(
    'with %i Works: a screen whose cards are smaller never holds fewer cards',
    (n) => {
      const shortest = Math.min(...FOCALS)
      for (const helix of places(n)) {
        const onSmall = sharpCards(helix, shortest)
        for (const focal of FOCALS) {
          for (const card of sharpCards(helix, focal)) expect(onSmall).toContain(card)
        }
      }
    },
  )

  it.each(WORK_COUNTS)(
    'with %i Works: sharp cards are visible cards, in one unbroken run around the middle',
    (n) => {
      for (const helix of places(n)) {
        for (const focal of FOCALS) {
          for (const band of BANDS) {
            const sharp = sharpCards(helix, focal, band)
            const visible = visibleCards(helix)
            for (const card of sharp) expect(visible).toContain(card)
            const slots = sharp.map((card) => slotOf(helix, card)).sort((a, b) => a - b)
            for (const [index, slot] of slots.slice(1).entries()) {
              expect(slot - slots[index]!).toBeCloseTo(1, 9)
            }
          }
        }
      }
    },
  )

  it.each(WORK_COUNTS)('with %i Works: turning a whole lap gives the same cards', (n) => {
    for (const helix of places(n)) {
      const lapped = { ...helix, progress: helix.progress + helix.cards }
      const back = { ...helix, progress: helix.progress - 3 * helix.cards }
      for (const focal of FOCALS) {
        expect(sharpCards(lapped, focal)).toEqual(sharpCards(helix, focal))
        expect(sharpCards(back, focal)).toEqual(sharpCards(helix, focal))
      }
    }
  })

  it('at rest, with a band of nothing, only the card in the middle is sharp', () => {
    for (const focal of FOCALS) expect(sharpCards(turnedTo(6, 2), focal, 0)).toEqual([2])
  })

  it('at rest on a wide screen, with a quarter band, the front card and its neighbours are sharp', () => {
    // Worked by hand (focal 3.5): the next card down reaches to 0.22 of the half-height from the
    // middle, the one after it only to 0.60.
    expect(sharpCards(turnedTo(12, 0), 3.5, 0.25).sort((a, b) => a - b)).toEqual([0, 1, 11])
  })

  it.each(WORK_COUNTS)(
    'with %i Works: none while the zoom runs: the Showreel has the middle',
    (n) => {
      for (const focal of FOCALS) expect(sharpCards(createOpening(n), focal)).toEqual([])
    },
  )
})

describe('Preview loops', () => {
  const FOCALS = [390 / 844, 16 / 9].map(focalFor)
  /**
   * A wide screen and a quarter band, worked by hand (see "the sharp band"): at rest the front card
   * and its two neighbours are sharp, the cards two away are not.
   */
  const WIDE = { focal: 3.5, band: 0.25 }

  /** States to check: turned anywhere, at rest, mid-turn, mid-melt. */
  const states = (n: number): HelixState[] => {
    const cards = createHelix(n).cards
    return [0, 0.5, 1.3, cards / 2, cards - 0.25, -2.6].flatMap((progress) => [
      { ...createHelix(n), progress },
      {
        ...createHelix(n),
        progress,
        speed: 9,
        goal: progress + 2,
        phase: { kind: 'melt', startedAt: 0 },
      },
    ])
  }

  /** No card hovered, or each card on screen in turn (the pointer can only rest on those). */
  const hovers = (state: HelixState): (number | null)[] => [null, ...visibleCards(state)]

  /** Cards off screen: a pointer can't rest on one, though the Helix may turn it away. */
  const offScreen = (state: HelixState) =>
    range(state.cards).filter((card) => !visibleCards(state).includes(card))

  it.each(WORK_COUNTS)(
    'with %i Works: the Works that play are those of the sharp cards and the hovered card',
    (n) => {
      for (const state of states(n)) {
        for (const focal of FOCALS) {
          const sharp = sharpCards(state, focal)
          for (const hovered of hovers(state)) {
            const playing = playingWorks(state, focal, hovered)
            const shown = [...sharp, ...(hovered === null ? [] : [hovered])]
            // Every one of those cards plays its Work...
            for (const card of shown) expect(playing.has(workOfCard(state, card))).toBe(true)
            // ...and no other Work plays.
            for (const work of playing) {
              expect(shown.some((card) => workOfCard(state, card) === work)).toBe(true)
            }
          }
        }
      }
    },
  )

  it.each(WORK_COUNTS)('with %i Works: a hovered card turned off screen adds nothing', (n) => {
    for (const state of states(n)) {
      for (const focal of FOCALS) {
        for (const hovered of offScreen(state)) {
          expect(playingWorks(state, focal, hovered)).toEqual(playingWorks(state, focal, null))
        }
      }
    }
  })

  it.each(WORK_COUNTS)(
    'with %i Works: nothing else changes the set (speed, goal, motion, clock, melt)',
    (n) => {
      for (const state of states(n)) {
        const other: HelixState = {
          ...state,
          speed: -state.speed - 4,
          goal: state.goal + 7,
          motion: { kind: 'settle', to: 3 },
          time: 12_345,
          open: 1 % n,
          announced: (state.announced + 1) % n,
          phase: state.phase.kind === 'melt' ? { kind: 'helix' } : { kind: 'melt', startedAt: 9 },
        }
        for (const focal of FOCALS) {
          for (const hovered of hovers(state)) {
            expect(playingWorks(other, focal, hovered)).toEqual(playingWorks(state, focal, hovered))
          }
        }
      }
    },
  )

  it.each(WORK_COUNTS)('with %i Works: never more Works than there are', (n) => {
    for (const state of states(n)) {
      for (const hovered of [...hovers(state), ...offScreen(state)]) {
        // The whole screen as the band: as many cards as can ever count.
        for (const focal of FOCALS) {
          expect(playingWorks(state, focal, hovered, 1).size).toBeLessThanOrEqual(n)
          for (const work of playingWorks(state, focal, hovered, 1)) {
            expect(work).toBeGreaterThanOrEqual(0)
            expect(work).toBeLessThan(n)
          }
        }
      }
    }
  })

  it.each(WORK_COUNTS)('with %i Works: turning a whole lap gives the same set', (n) => {
    for (const state of states(n)) {
      for (const laps of [1, -1, 3]) {
        const lapped = { ...state, progress: state.progress + laps * state.cards }
        for (const focal of FOCALS) {
          for (const hovered of hovers(state)) {
            expect(playingWorks(lapped, focal, hovered)).toEqual(
              playingWorks(state, focal, hovered),
            )
          }
        }
      }
    }
  })

  it.each(WORK_COUNTS.filter((n) => n >= 6))(
    'with %i Works: at rest, a hovered side card adds its own Work',
    (n) => {
      const state = createHelix(n, 0)
      const resting = playingWorks(state, WIDE.focal, null, WIDE.band)
      // Two slots below the front: on screen, and outside the band.
      const side = 2
      expect(resting.has(workOfCard(state, side))).toBe(false)
      expect(playingWorks(state, WIDE.focal, side, WIDE.band)).toEqual(
        new Set([...resting, workOfCard(state, side)]),
      )
    },
  )

  it.each(WORK_COUNTS)(
    'with %i Works: a card plays its loop only in the sharp band or hovered, listed once',
    (n) => {
      for (const state of states(n)) {
        for (const focal of FOCALS) {
          const sharp = sharpCards(state, focal)
          for (const hovered of hovers(state)) {
            const live = liveCards(state, focal, hovered)
            expect(new Set(live).size).toBe(live.length)
            expect(new Set(live)).toEqual(
              new Set([...sharp, ...(hovered === null ? [] : [hovered])]),
            )
          }
        }
      }
    },
  )

  it.each(WORK_COUNTS)('with %i Works: nothing plays while the zoom runs', (n) => {
    const opening = createOpening(n)
    for (const focal of FOCALS) {
      for (const hovered of [null, ...range(opening.cards)]) {
        expect(playingWorks(opening, focal, hovered).size).toBe(0)
      }
    }
  })
})

describe('held frames', () => {
  const FOCALS = [390 / 844, 16 / 9].map(focalFor)
  const WIDE = { focal: 3.5, band: 0.25 }

  const states = (n: number): HelixState[] => {
    const cards = createHelix(n).cards
    return [0, 0.5, 1.3, cards / 2, cards - 0.25, -2.6].flatMap((progress) => [
      { ...createHelix(n), progress },
      { ...createHelix(n), progress, phase: { kind: 'melt', startedAt: 0 } },
    ])
  }

  /** What was held a frame before: nothing, every Work, or every other one. */
  const before = (n: number): Set<number>[] => [
    new Set(),
    new Set(range(n)),
    new Set(range(n).filter((work) => work % 2 === 0)),
  ]

  /** Every combination to check for `n` Works: state, screen, hovered card, held before. */
  function* cases(n: number) {
    for (const state of states(n)) {
      for (const focal of FOCALS) {
        for (const hovered of [null, ...range(state.cards)]) {
          for (const held of before(n)) yield { state, focal, hovered, held }
        }
      }
    }
  }

  /** The Works with a card on screen. */
  const onScreen = (state: HelixState) =>
    new Set(visibleCards(state).map((card) => workOfCard(state, card)))

  it.each(WORK_COUNTS)('with %i Works: a held Work always has a card on screen', (n) => {
    for (const { state, focal, hovered, held } of cases(n)) {
      const screen = onScreen(state)
      for (const work of previewLoops(state, focal, hovered, held).held) {
        expect(screen.has(work)).toBe(true)
      }
    }
  })

  it.each(WORK_COUNTS)('with %i Works: every Work that plays keeps its frame', (n) => {
    for (const { state, focal, hovered, held } of cases(n)) {
      const loops = previewLoops(state, focal, hovered, held)
      expect(loops.playing).toEqual(playingWorks(state, focal, hovered))
      for (const work of loops.playing) expect(loops.held.has(work)).toBe(true)
    }
  })

  it.each(WORK_COUNTS)(
    'with %i Works: a Work that stops playing keeps its frame while a card of it is on screen',
    (n) => {
      for (const { state, focal, hovered, held } of cases(n)) {
        const screen = onScreen(state)
        const now = previewLoops(state, focal, hovered, held).held
        for (const work of held) if (screen.has(work)) expect(now.has(work)).toBe(true)
      }
    },
  )

  it.each(WORK_COUNTS)('with %i Works: a Work that never played holds no frame', (n) => {
    for (const { state, focal, hovered, held } of cases(n)) {
      const loops = previewLoops(state, focal, hovered, held)
      for (const work of loops.held) {
        expect(held.has(work) || loops.playing.has(work)).toBe(true)
      }
    }
  })

  it.each(WORK_COUNTS)('with %i Works: turning a whole lap gives the same', (n) => {
    for (const { state, focal, hovered, held } of cases(n)) {
      const lapped = { ...state, progress: state.progress + state.cards }
      expect(previewLoops(lapped, focal, hovered, held)).toEqual(
        previewLoops(state, focal, hovered, held),
      )
    }
  })

  it.each(WORK_COUNTS)('with %i Works: nothing is held while the zoom runs', (n) => {
    for (const focal of FOCALS) {
      for (const held of before(n)) {
        expect(previewLoops(createOpening(n), focal, null, held).held.size).toBe(0)
      }
    }
  })

  it('a card turned out of the band freezes, and lets go once its Work is off screen', () => {
    // Six Works make twelve cards, five of them on screen (slots -2 to 2).
    const at = (front: number, held: Set<number>) =>
      previewLoops(createHelix(6, front), WIDE.focal, null, held, WIDE.band)
    const first = at(0, new Set())
    expect(first.playing).toEqual(new Set([5, 0, 1]))
    // One card down: card 11 (Work 5) is two slots up, out of the band, still on screen.
    const second = at(1, first.held)
    expect(second.playing).toEqual(new Set([0, 1, 2]))
    expect(second.held).toEqual(new Set([5, 0, 1, 2]))
    expect(showsLoop(createHelix(6, 1), second, 11)).toBe(true)
    // One more: card 11 has left the screen, and Work 5 lets its frame go.
    const third = at(2, second.held)
    expect(third.held).toEqual(new Set([0, 1, 2, 3]))
  })
})

describe('what a card shows', () => {
  const WIDE = { focal: 3.5, band: 0.25 }

  it.each(WORK_COUNTS)(
    'with %i Works: a live card shows its loop, a card that never played its poster',
    (n) => {
      for (const front of range(createHelix(n).cards)) {
        const state = createHelix(n, front)
        const loops = previewLoops(state, WIDE.focal, null, new Set(), WIDE.band)
        for (const card of visibleCards(state)) {
          expect(showsLoop(state, loops, card)).toBe(loops.live.includes(card))
        }
      }
    },
  )

  it('with few Works, a repeat of a playing Work outside the band shows its poster', () => {
    // Two Works make ten cards; at rest on the first, the second Work plays on the card below it.
    const state = createHelix(2, 0)
    const loops = previewLoops(state, WIDE.focal, null, new Set(), WIDE.band)
    expect(loops.playing.has(1)).toBe(true)
    expect(workOfCard(state, 3)).toBe(1)
    expect(showsLoop(state, loops, 3)).toBe(false)
  })

  it('a card of a Work that stopped playing shows its frozen frame', () => {
    // Work 4 played before; at rest on card 0 its card is two slots up, on screen, out of the band.
    const state = createHelix(6, 0)
    const loops = previewLoops(state, WIDE.focal, null, new Set([4]), WIDE.band)
    expect(loops.playing.has(4)).toBe(false)
    expect(showsLoop(state, loops, 10)).toBe(true)
  })
})

describe('focus', () => {
  const focus = (work: number): Timed[] => [{ at: 0, input: { kind: 'focus', work } }]

  it.each(WORK_COUNTS)(
    'with %i Works: focusing Work k brings it to the front the shortest way and rests there',
    (n) => {
      for (const front of [0, 1, n - 1]) {
        const start = simulate(createHelix(n, front), [], { until: 0 })
        for (const work of range(n)) {
          const after = simulate(start, focus(work), { until: LATER })
          expect(frontWork(after)).toBe(work)
          expect(isResting(after)).toBe(true)
          // Brute force: the nearest card position that shows this Work.
          const shortest = Math.min(
            ...range(start.cards)
              .filter((card) => workOfCard(start, card) === work)
              .flatMap((card) => [-1, 0, 1].map((lap) => card + lap * start.cards))
              .map((place) => Math.abs(place - start.progress)),
          )
          expect(Math.abs(after.progress - start.progress)).toBe(shortest)
        }
      }
    },
  )

  /** Turns that are under way a moment after they start: an arrow, a wheel nudge, a drag held. */
  const MID_TURN: [string, Timed[], number][] = [
    ['an arrow', presses(1, 1), HELIX_TUNING.tweenMs / 3],
    ['a wheel nudge', wheel([300, 300]), HELIX_TUNING.wheelIdleMs / 2],
    ['a held drag', drag(1.4, 100, 10 * LATER), 150],
  ]

  it.each(MID_TURN)(
    'focusing Work k in the middle of %s still ends with it in front, at rest, the short way',
    (_name, turn, until) => {
      for (const n of WORK_COUNTS) {
        const mid = simulate(createHelix(n), turn, { until })
        expect(isResting(mid)).toBe(false)
        for (const work of range(n)) {
          const after = inputThenRest(mid, { kind: 'focus', work })
          expect(frontWork(after)).toBe(work)
          expect(isResting(after)).toBe(true)
          // From where the Helix was heading, never round more than half the Works.
          expect(Math.abs(after.progress - mid.progress)).toBeLessThanOrEqual(n / 2 + 2)
        }
      }
    },
  )

  it('works from far round the endless Helix', () => {
    const start = { ...createHelix(5), progress: 123, goal: 123 }
    const after = simulate(start, focus(2), { until: LATER })
    expect(frontWork(after)).toBe(2)
    expect(Math.abs(after.progress - 123)).toBeLessThanOrEqual(2.5)
  })

  it('leaves the Helix alone when the Work is already in front', () => {
    const start = createHelix(6, 3)
    expect(isResting(stepHelix(start, { kind: 'focus', work: 3 }, 0))).toBe(true)
  })
})

describe('the rest signal', () => {
  /** The Works the Helix announced over a run: every frame is stepped, as a browser does. */
  function announcements(start: HelixState, timeline: Timed[], until: number): number[] {
    const events = [...timeline].sort((a, b) => a.at - b.at)
    const heard: number[] = []
    let state = stepHelix(start, { kind: 'frame' }, 0)
    for (let frame = 1; frame * (1000 / 60) <= until; frame++) {
      const now = frame * (1000 / 60)
      while (events.length > 0 && events[0]!.at <= now) {
        const { at, input } = events.shift()!
        state = stepHelix(state, input, at)
        if (state.arrived !== null) heard.push(state.arrived)
      }
      state = stepHelix(state, { kind: 'frame' }, now)
      if (state.arrived !== null) heard.push(state.arrived)
    }
    return heard
  }

  it('fires once, on the new Work, when a turn comes to rest, and not while turning', () => {
    expect(announcements(createHelix(6), presses(1, 1), LATER)).toEqual([1])
    expect(
      announcements(createHelix(6), [{ at: 0, input: { kind: 'focus', work: 4 } }], LATER),
    ).toEqual([4])
  })

  it('fires once for several presses in quick succession', () => {
    expect(announcements(createHelix(6), presses(3, 1), LATER)).toEqual([3])
  })

  it('does not fire when it rests on the Work it last announced', () => {
    const there = [...presses(1, 1), ...presses(1, -1, LATER)]
    // Forward to Work 1 (announced), back to Work 0 (announced), nothing more.
    expect(announcements(createHelix(6), there, 2 * LATER)).toEqual([1, 0])
    // Away and back before it stops: it rests on Work 0 again.
    expect(
      announcements(createHelix(6), [...presses(1, 1), ...presses(1, -1, 200)], LATER),
    ).toEqual([])
  })

  it('does not fire for a Helix at rest, or for a click on the front card', () => {
    expect(announcements(createHelix(6), [], LATER)).toEqual([])
    expect(
      announcements(createHelix(6), [{ at: 0, input: { kind: 'card', card: 0 } }], LATER),
    ).toEqual([])
  })

  it('fires for a Work that repeats on the Helix, once per stop', () => {
    // Two Works: card 2 shows Work 0 again; turning two cards lands on the same Work.
    expect(announcements(createHelix(2), presses(2, 1), LATER)).toEqual([])
    expect(announcements(createHelix(2), presses(1, 1), LATER)).toEqual([1])
  })

  it('does not fire through the opening: the zoom, the melt and the hand-over to turning', () => {
    const toTheEnd: Timed[] = [{ at: 0, input: { kind: 'scroll', fraction: 1 } }]
    expect(announcements(createOpening(6), toTheEnd, LATER + OPENING_MS)).toEqual([])
  })

  it('does not fire for a reset, and speaks again for the next new stop after it', () => {
    const timeline: Timed[] = [
      ...presses(2, 1),
      { at: LATER, input: { kind: 'reset' } },
      { at: LATER + 10, input: { kind: 'scroll', fraction: 1 } },
      // After the opening the first Work is in front again, unannounced: turning to Work 2 speaks.
      ...presses(2, 1, 2 * LATER + OPENING_MS),
    ]
    expect(announcements(createHelix(6), timeline, 3 * LATER + OPENING_MS)).toEqual([2, 2])
  })

  /** What the live region is written with over a run, the stale words cleared (null) included. */
  function regionWrites(start: HelixState, timeline: Timed[], until: number): (number | null)[] {
    const events = [...timeline].sort((a, b) => a.at - b.at)
    const writes: (number | null)[] = []
    let state = stepHelix(start, { kind: 'frame' }, 0)
    const step = (input: HelixInput, now: number) => {
      const before = state
      state = stepHelix(state, input, now)
      const region = liveRegionAfter(before, state)
      if (region === 'clear') writes.push(null)
      else if (region !== 'keep') writes.push(region.speak)
    }
    for (let frame = 1; frame * (1000 / 60) <= until; frame++) {
      const now = frame * (1000 / 60)
      while (events.length > 0 && events[0]!.at <= now) {
        const { at, input } = events.shift()!
        step(input, at)
      }
      step({ kind: 'frame' }, now)
    }
    return writes
  }

  it('clears the live region when the model forgets what it said, so the same stop is heard again', () => {
    // Work 3 is heard; a reset, then a focus that skips the opening onto Work 5; turning back to
    // Work 3 would set the very words already in the region unless they were cleared in between.
    const timeline: Timed[] = [
      { at: 0, input: { kind: 'focus', work: 3 } },
      { at: LATER, input: { kind: 'reset' } },
      { at: LATER + 50, input: { kind: 'focus', work: 5 } },
      ...presses(2, -1, LATER + 100),
    ]
    expect(regionWrites(createHelix(6), timeline, 2 * LATER + 100)).toEqual([3, null, null, 3])
  })

  it('does not fire when focus skips the opening: the focused link speaks for itself', () => {
    const focus: Timed[] = [{ at: 0, input: { kind: 'focus', work: 3 } }]
    expect(announcements(createOpening(6), focus, LATER)).toEqual([])
  })
})

describe('the opening', () => {
  /** The page scrolled to `fraction` of the zoom's scroll length at `at` ms. */
  const scroll = (fraction: number, at: number): Timed => ({
    at,
    input: { kind: 'scroll', fraction },
  })

  /** A steady scroll from `from` to `to` over `ms`, starting at `start` ms, as twenty events. */
  const scrolling = (from: number, to: number, start: number, ms: number): Timed[] =>
    range(21).map((index) => scroll(from + ((to - from) * index) / 20, start + (ms * index) / 20))

  /** The zoom as the scroll left it (1 once the zoom has landed). */
  const zoomOf = (state: HelixState) => (state.phase.kind === 'hero' ? state.phase.zoom : 1)

  /** Every frame of a run, 60 a second, as a browser steps it. */
  function frames(start: HelixState, timeline: Timed[], until: number): HelixState[] {
    const events = [...timeline].sort((a, b) => a.at - b.at)
    const seen: HelixState[] = []
    let state = stepHelix(start, { kind: 'frame' }, 0)
    for (let frame = 1; frame * (1000 / 60) <= until; frame++) {
      const now = frame * (1000 / 60)
      while (events.length > 0 && events[0]!.at <= now) {
        const { at, input } = events.shift()!
        state = stepHelix(state, input, at)
        seen.push(state)
      }
      state = stepHelix(state, { kind: 'frame' }, now)
      seen.push(state)
    }
    return seen
  }

  /** Scrolls to the end of the zoom and runs on until the melt has started. */
  function melting(n: number): HelixState {
    const run = frames(createOpening(n), [scroll(1, 0)], CAUGHT_UP)
    const state = run.find((each) => each.phase.kind === 'melt')
    expect(state).toBeDefined()
    return state!
  }

  /** When the melt started (ms). */
  const meltStart = (state: HelixState) =>
    state.phase.kind === 'melt' ? state.phase.startedAt : NaN

  it.each(WORK_COUNTS)(
    'with %i Works: starts with the Showreel full-bleed and the page free',
    (n) => {
      for (const start of [createOpening(n), startHelix(n, null)]) {
        expect(start.phase).toEqual({ kind: 'hero', scroll: 0, zoom: 0 })
        expect(openingOf(start)).toEqual({
          zoom: 0,
          melt: 0,
          showreelSlot: 0,
          heroGone: 0,
          frontShown: false,
          locked: false,
        })
        expect(frontWork(start)).toBe(0)
      }
    },
  )

  it('the zoom follows the scroll down, then back up, and settles where the scroll stopped', () => {
    const upAt = 600 + CAUGHT_UP
    const run = frames(
      createOpening(6),
      [...scrolling(0, 0.6, 0, 600), ...scrolling(0.55, 0.2, upAt, 600)],
      upAt + 600 + CAUGHT_UP,
    )
    const down = run.filter((state) => state.time! < upAt)
    const up = run.filter((state) => state.time! > upAt)
    for (const [earlier, later] of down.slice(1).map((state, index) => [down[index]!, state])) {
      expect(zoomOf(later!)).toBeGreaterThanOrEqual(zoomOf(earlier!))
    }
    for (const [earlier, later] of up.slice(1).map((state, index) => [up[index]!, state])) {
      expect(zoomOf(later!)).toBeLessThanOrEqual(zoomOf(earlier!))
    }
    expect(zoomOf(down.at(-1)!)).toBeCloseTo(0.6, 3)
    expect(zoomOf(up.at(-1)!)).toBeCloseTo(0.2, 3)
    expect(run.every((state) => state.phase.kind === 'hero')).toBe(true)
  })

  it('spins the Helix forward into place while zooming, landing on the first Work', () => {
    const run = frames(createOpening(6), scrolling(0, 1, 0, 800), CAUGHT_UP)
    const hero = run.filter((state) => state.phase.kind === 'hero')
    for (const [earlier, later] of hero.slice(1).map((state, index) => [hero[index]!, state])) {
      expect(later!.progress).toBeGreaterThanOrEqual(earlier!.progress)
    }
    expect(hero[0]!.progress).toBeCloseTo(-HELIX_TUNING.zoomSpinCards, 2)
    const landed = run.find((state) => state.phase.kind === 'melt')!
    expect(landed.progress).toBe(0)
    expect(frontWork(landed)).toBe(0)
  })

  it('melts only at the end of the scroll, then hands over to turning after the melt time', () => {
    const short = frames(
      createOpening(6),
      [scroll(HELIX_TUNING.meltStartScroll - 0.01, 0)],
      CAUGHT_UP * 2,
    )
    expect(short.every((state) => state.phase.kind === 'hero')).toBe(true)

    const start = melting(6)
    expect(openingOf(start)).toMatchObject({ zoom: 1, locked: true, heroGone: 1 })
    const at = meltStart(start)
    const during = stepHelix(start, { kind: 'frame' }, at + MELT_MS - 20)
    expect(during.phase.kind).toBe('melt')
    expect(openingOf(during).melt).toBeGreaterThan(0.9)
    expect(openingOf(during).frontShown).toBe(true)
    const after = stepHelix(during, { kind: 'frame' }, at + MELT_MS + 20)
    expect(after.phase.kind).toBe('helix')
    expect(openingOf(after)).toMatchObject({ melt: 1, showreelSlot: null, frontShown: true })
  })

  it('lets the hero overlays leave with the zoom, before the melt', () => {
    const run = frames(createOpening(6), scrolling(0, 1, 0, 800), CAUGHT_UP)
    const gone = run.map((state) => openingOf(state).heroGone)
    for (const [earlier, later] of gone.slice(1).map((value, index) => [gone[index]!, value])) {
      expect(later).toBeGreaterThanOrEqual(earlier!)
    }
    const lastHero = run.filter((state) => state.phase.kind === 'hero').at(-1)!
    expect(openingOf(lastHero).heroGone).toBe(1)
    expect(openingOf(lastHero).frontShown).toBe(false)
  })

  it.each(WORK_COUNTS)(
    'with %i Works: the cards appear during the zoom, the first one leading, staggered',
    (n) => {
      const helix = createOpening(n)
      const at = (zoom: number): HelixState => ({
        ...helix,
        phase: { kind: 'hero', scroll: zoom, zoom },
      })
      const zooms = range(101).map((step) => step / 100)
      const cards = range(helix.cards)
      for (const card of cards) {
        const presence = zooms.map((zoom) => cardPresence(at(zoom), card))
        expect(presence[0]).toBe(0)
        for (const [earlier, later] of presence.slice(1).map((v, i) => [presence[i]!, v])) {
          expect(later).toBeGreaterThanOrEqual(earlier!)
        }
        for (const zoom of zooms) {
          expect(cardPresence(at(zoom), 0)).toBeGreaterThanOrEqual(cardPresence(at(zoom), card))
        }
        expect(cardPresence(createHelix(n), card)).toBe(1)
      }
      // Staggered: the cards come in at different points of the zoom.
      const comeIn = cards.map((card) => zooms.find((zoom) => cardPresence(at(zoom), card) > 0))
      expect(new Set(comeIn).size).toBeGreaterThan(Math.min(2, helix.cards - 1))
    },
  )

  it('ignores turning input while the zoom runs: the page scroll has it', () => {
    const start = frames(createOpening(6), [scroll(0.4, 0)], 500).at(-1)!
    const inputs: HelixInput[] = [
      { kind: 'arrow', step: 1 },
      { kind: 'wheel', deltaY: 100, deltaMode: 0 },
      { kind: 'dragStart' },
      { kind: 'dragMove', up: 300 },
      { kind: 'dragEnd' },
      { kind: 'card', card: 3 },
      { kind: 'enter' },
    ]
    let state = start
    inputs.forEach((input, index) => (state = stepHelix(state, input, 510 + index)))
    const untouched = stepHelix(start, { kind: 'frame' }, 510 + inputs.length - 1)
    expect(state.phase.kind).toBe('hero')
    expect(zoomOf(state)).toBeCloseTo(zoomOf(untouched), 12)
    expect(state.progress).toBeCloseTo(untouched.progress, 12)
    expect(isResting(state)).toBe(true)
    expect(frontWork(state)).toBe(frontWork(untouched))
    expect(state.open).toBeNull()
  })

  it.each(WORK_COUNTS)(
    'with %i Works: once the melt starts, no input brings back hero, only a reset',
    (n) => {
      const start = melting(n)
      const at = meltStart(start)
      const barrage: Timed[] = [
        scroll(0, at + 10),
        scroll(0.3, at + 20),
        { at: at + 30, input: { kind: 'wheel', deltaY: -300, deltaMode: 0 } },
        { at: at + 40, input: { kind: 'arrow', step: -1 } },
        { at: at + 50, input: { kind: 'dragStart' } },
        { at: at + 60, input: { kind: 'dragMove', up: -200 } },
        { at: at + 70, input: { kind: 'dragEnd' } },
        { at: at + 80, input: { kind: 'card', card: 1 } },
        { at: at + 90, input: { kind: 'focus', work: n - 1 } },
        { at: at + 100, input: { kind: 'enter' } },
        scroll(0, at + MELT_MS + 100),
      ]
      let state = start
      for (const { at: time, input } of barrage) {
        state = stepHelix(state, input, time)
        expect(state.phase.kind).not.toBe('hero')
        state = stepHelix(state, { kind: 'frame' }, time + 5)
        expect(state.phase.kind).not.toBe('hero')
      }
      expect(state.phase.kind).toBe('helix')
      const reset = stepHelix(state, { kind: 'reset' }, at + MELT_MS + 200)
      expect(reset.phase).toEqual({ kind: 'hero', scroll: 0, zoom: 0 })
    },
  )

  it('accepts turning from the moment the melt starts, the Showreel riding its card', () => {
    const start = melting(6)
    const at = meltStart(start)
    const turned = simulate(start, [{ at: at + 20, input: { kind: 'arrow', step: 1 } }], {
      until: at + 20 + LATER,
    })
    expect(turned.progress).toBe(1)
    expect(frontWork(turned)).toBe(1)

    const midMelt = stepHelix(
      stepHelix(start, { kind: 'wheel', deltaY: 100, deltaMode: 0 }, at + 20),
      { kind: 'frame' },
      at + MELT_MS / 2,
    )
    expect(midMelt.phase.kind).toBe('melt')
    expect(midMelt.progress).toBeGreaterThan(0)
    // The Showreel stays on the first card, which is turning away from the front.
    expect(openingOf(midMelt).showreelSlot).toBe(slotOf(midMelt, 0))
    expect(openingOf(midMelt).showreelSlot).toBeLessThan(0)
  })

  it.each(WORK_COUNTS)(
    'with %i Works: focusing a Work during the melt brings it to the front and rests there',
    (n) => {
      const start = melting(n)
      const midMelt = stepHelix(start, { kind: 'frame' }, meltStart(start) + MELT_MS / 3)
      expect(midMelt.phase.kind).toBe('melt')
      for (const work of range(n)) {
        const after = inputThenRest(midMelt, { kind: 'focus', work })
        expect(frontWork(after)).toBe(work)
        expect(isResting(after)).toBe(true)
        expect(after.phase.kind).toBe('helix')
      }
    },
  )

  it('gives the same zoom for the same wall-clock scroll at 30, 60 and 120 frames a second', () => {
    const timeline = [
      ...scrolling(0, 0.7, 0, 700),
      ...scrolling(0.7, 0.3, 900, 400),
      scroll(1, 1500),
    ]
    /** The state at exactly `time`: the frames before it, then every input up to it. */
    const at = (time: number, fps: number) => {
      let state = simulate(createOpening(6), timeline, { until: time, fps })
      for (const { at: when, input } of timeline.filter((each) => each.at > state.time!)) {
        if (when <= time) state = stepHelix(state, input, when)
      }
      return stepHelix(state, { kind: 'frame' }, time)
    }
    for (const time of [350, 700, 1000, 1400, 1520]) {
      const zooms = [30, 60, 120].map((fps) => zoomOf(at(time, fps)))
      for (const zoom of zooms) expect(zoom).toBeCloseTo(zooms[0]!, 9)
    }
    // The melt starts at the same moment, give or take one sub-step of the physics.
    const starts = [30, 60, 120].map((fps) =>
      meltStart(simulate(createOpening(6), timeline, { until: 1500 + CAUGHT_UP / 2, fps })),
    )
    for (const at of starts)
      expect(Math.abs(at - starts[0]!)).toBeLessThanOrEqual(1000 / 240 + 1e-6)
  })

  it.each(WORK_COUNTS)(
    'with %i Works: starting with a remembered Work begins in helix with that Work in front',
    (n) => {
      for (const work of range(n)) {
        const start = startHelix(n, work)
        expect(start.phase.kind).toBe('helix')
        expect(frontWork(start)).toBe(work)
        expect(isResting(start)).toBe(true)
        expect(openingOf(start)).toMatchObject({
          showreelSlot: null,
          locked: true,
          frontShown: true,
        })
        // It turns at once.
        const turned = simulate(start, presses(1, 1), { until: LATER })
        expect(frontWork(turned)).toBe((work + 1) % n)
      }
      // A Work that is no longer there gives the opening.
      for (const gone of [n, -1, 0.5]) expect(startHelix(n, gone).phase.kind).toBe('hero')
    },
  )

  it('focusing a Work during the zoom skips the opening, with that Work in front', () => {
    for (const work of range(6)) {
      const zooming = frames(createOpening(6), [scroll(0.5, 0)], 300).at(-1)!
      const focused = stepHelix(zooming, { kind: 'focus', work }, 310)
      expect(focused.phase.kind).toBe('helix')
      expect(frontWork(focused)).toBe(work)
      expect(isResting(focused)).toBe(true)
    }
  })

  it('a reset returns to hero at zoom 0, from the zoom, the melt or after turning', () => {
    const zooming = frames(createOpening(6), [scroll(0.5, 0)], 300).at(-1)!
    const start = melting(6)
    const turned = simulate(start, presses(3, 1, meltStart(start) + 10), {
      until: meltStart(start) + LATER,
    })
    for (const state of [zooming, start, turned]) {
      const reset = stepHelix(state, { kind: 'reset' }, (state.time ?? 0) + 10)
      expect(reset.phase).toEqual({ kind: 'hero', scroll: 0, zoom: 0 })
      expect(openingOf(reset)).toMatchObject({
        zoom: 0,
        showreelSlot: 0,
        heroGone: 0,
        locked: false,
      })
      // A scroll the reset came after doesn't count: the zoom stays at 0 until the page scrolls.
      const later = stepHelix(reset, { kind: 'frame' }, (state.time ?? 0) + 500)
      expect(zoomOf(later)).toBe(0)
      // The opening runs again and lands on the first Work.
      const again = simulate(later, [scroll(1, (state.time ?? 0) + 510)], {
        until: (state.time ?? 0) + 510 + CAUGHT_UP + MELT_MS,
      })
      expect(again.phase.kind).toBe('helix')
      expect(frontWork(again)).toBe(0)
    }
  })
})
