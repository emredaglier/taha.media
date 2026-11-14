import { describe, expect, it } from 'vitest'

import {
  createBoard,
  createPinboardMoments,
  createTweens,
  EASES,
  HOVER_HOLD_SECONDS,
  type EaseName,
  type MomentSheet,
} from './pinboard-tween'

/** A runner on a hand-driven clock (ms): `at(ms)` moves the clock and steps the runner there. */
function rig() {
  let time = 0
  const tweens = createTweens(() => time)
  const at = (ms: number) => {
    time = ms
    tweens.step(ms)
  }
  return { tweens, at }
}

const samples = Array.from({ length: 201 }, (_, i) => i / 200)

describe('eases (GSAP curves)', () => {
  const names = Object.keys(EASES) as EaseName[]

  it.each(names)('%s starts at 0 and ends at 1', (name) => {
    expect(EASES[name](0)).toBeCloseTo(0, 10)
    expect(EASES[name](1)).toBeCloseTo(1, 10)
  })

  it.each(names.filter((name) => !name.startsWith('back')))('%s never turns back', (name) => {
    for (let i = 1; i < samples.length; i++) {
      expect(EASES[name](samples[i]!)).toBeGreaterThanOrEqual(EASES[name](samples[i - 1]!))
    }
  })

  it.each(['back.out(1.05)', 'back.out(1.15)'] as const)(
    '%s overshoots 1, then settles onto it',
    (name) => {
      const values = samples.map(EASES[name])
      const peak = values.indexOf(Math.max(...values))
      expect(values[peak]).toBeGreaterThan(1)
      for (let i = peak + 1; i < values.length; i++) {
        expect(values[i]).toBeLessThanOrEqual(values[i - 1]!)
      }
    },
  )

  it('matches worked GSAP values', () => {
    expect(EASES['power1.in'](0.5)).toBeCloseTo(0.25)
    expect(EASES['power2.out'](0.5)).toBeCloseTo(0.875)
    expect(EASES['power3.in'](0.5)).toBeCloseTo(0.0625)
    expect(EASES['power3.inOut'](0.25)).toBeCloseTo(0.03125)
    expect(EASES['power3.inOut'](0.75)).toBeCloseTo(0.96875)
    expect(EASES['back.out(1.15)'](0.5)).toBeCloseTo(1.01875)
  })
})

describe('the tween runner', () => {
  it('starts from the current value, follows its ease and lands on the target at its end', () => {
    const { tweens, at } = rig()
    const box = { x: 2 }
    tweens.to(box, { x: 10 }, { duration: 1, ease: 'power2.out' })
    at(500)
    expect(box.x).toBeCloseTo(2 + 8 * 0.875)
    at(1000)
    expect(box.x).toBe(10)
    at(5000)
    expect(box.x).toBe(10)
  })

  it('eases power1.out when no ease is given (GSAP default)', () => {
    const { tweens, at } = rig()
    const box = { x: 0 }
    tweens.to(box, { x: 1 }, { duration: 1 })
    at(500)
    expect(box.x).toBeCloseTo(0.75)
  })

  it('waits out its delay, and staggers targets in order or from the end', () => {
    const { tweens, at } = rig()
    const rows = [{ v: 0 }, { v: 0 }, { v: 0 }]
    const back = [{ v: 0 }, { v: 0 }, { v: 0 }]
    tweens.to(rows, { v: 1 }, { duration: 0.1, delay: 0.2, stagger: 0.1, ease: 'power1.in' })
    tweens.to(back, { v: 1 }, { duration: 0.05, stagger: { each: 0.1, from: 'end' } })
    at(150)
    expect(rows.map((r) => r.v)).toEqual([0, 0, 0])
    expect(back.map((r) => r.v)).toEqual([0, 1, 1])
    at(300)
    expect(rows.map((r) => r.v)).toEqual([1, 0, 0])
    at(500)
    expect(rows.map((r) => r.v)).toEqual([1, 1, 1])
    expect(back.map((r) => r.v)).toEqual([1, 1, 1])
  })

  it('takes over a running property mid-way from where it is, with no jump', () => {
    const { tweens, at } = rig()
    const box = { x: 0 }
    let firstDone = 0
    tweens.to(box, { x: 100 }, { duration: 1, onComplete: () => firstDone++ })
    at(400)
    const mid = box.x
    tweens.to(box, { x: -50 }, { duration: 0.5, ease: 'power3.inOut' })
    at(400)
    expect(box.x).toBe(mid)
    at(416)
    expect(Math.abs(box.x - mid)).toBeLessThan(1)
    at(900)
    expect(box.x).toBe(-50)
    at(2000)
    expect(box.x).toBe(-50)
    expect(firstDone).toBe(0)
  })

  it('lets a running tween go on until a delayed one on the same property starts', () => {
    const { tweens, at } = rig()
    const box = { x: 0 }
    tweens.to(box, { x: 100 }, { duration: 1, ease: 'power1.in' })
    at(200)
    tweens.to(box, { x: 0 }, { duration: 0.5, delay: 0.3 })
    at(400)
    expect(box.x).toBeCloseTo(100 * 0.4 ** 2) // still the first tween
    at(500)
    const turn = box.x
    expect(turn).toBeCloseTo(100 * 0.5 ** 2)
    at(510)
    expect(box.x).toBeLessThan(turn)
    at(1000)
    expect(box.x).toBe(0)
  })

  it('drops a waiting tween on a property once a newer tween claims it, so the last one asked wins', () => {
    const { tweens, at } = rig()
    const box = { x: 0 }
    tweens.to(box, { x: 100 }, { duration: 0.2, delay: 0.5 })
    tweens.to(box, { x: 30 }, { duration: 0.2 })
    at(2000)
    expect(box.x).toBe(30)
  })

  it('overwrites only the properties it shares, and the rest of the old tween completes', () => {
    const { tweens, at } = rig()
    const box = { x: 0, y: 0 }
    let done = 0
    tweens.to(box, { x: 1, y: 1 }, { duration: 1, onComplete: () => done++ })
    at(100)
    tweens.to(box, { x: -1 }, { duration: 0.2 })
    at(2000)
    expect(box).toEqual({ x: -1, y: 1 })
    expect(done).toBe(1)
  })

  it('calls back once, after the last staggered target lands', () => {
    const { tweens, at } = rig()
    const rows = [{ v: 0 }, { v: 0 }]
    let done = 0
    tweens.to(rows, { v: 1 }, { duration: 0.1, stagger: 0.1, onComplete: () => done++ })
    at(150)
    expect(done).toBe(0)
    at(200)
    at(300)
    expect(done).toBe(1)
  })

  it('kills by target (and by property) with no callback', () => {
    const { tweens, at } = rig()
    const a = { x: 0, y: 0 }
    const b = { x: 0 }
    let done = 0
    tweens.to(a, { x: 1, y: 1 }, { duration: 1, onComplete: () => done++ })
    tweens.to(b, { x: 1 }, { duration: 1 })
    at(500)
    tweens.kill(a, ['x'])
    tweens.kill([b])
    const [ax, bx] = [a.x, b.x]
    at(2000)
    expect(a.x).toBe(ax)
    expect(a.y).toBe(1)
    expect(b.x).toBe(bx)
    expect(done).toBe(1) // y still finished the tween
    tweens.to(a, { x: 5 }, { duration: 1, onComplete: () => done++ })
    tweens.kill(a)
    at(4000)
    expect(done).toBe(1)
  })
})

// The prototype's sheets, page first: kind and rest tilt.
const DEFS = [
  ['page', -2.5],
  ['print', -1.5],
  ['print', 2],
  ['print', -1],
  ['note', -4],
  ['note', 3],
  ['story', 1],
  ['legal', -2],
] as const

const FRAME = 1000 / 60

/** A board and its moments on a hand-driven clock (ms). */
function boardRig() {
  let time = 0
  let rests = 0
  const sheets: MomentSheet[] = DEFS.map(([kind, rest0]) => ({
    kind,
    rest0,
    rest: 0,
    en: 0.5,
    dir: 1,
    hv: 0.5,
    dim: 0.5,
    fl: 0.5,
    landed: true,
  }))
  const board = createBoard(sheets)
  const moments = createPinboardMoments(
    board,
    () => time,
    () => rests++,
  )
  const at = (ms: number) => {
    time = ms
    moments.step(ms)
  }
  /** Steps frame by frame for `ms`. */
  const run = (ms: number) => {
    const end = time + ms
    while (time + FRAME < end) at(time + FRAME)
    at(end)
  }
  const prints = sheets.filter((s) => s.kind === 'print')
  const rest = sheets.filter((s) => s.kind !== 'page')
  return { board, moments, at, run, sheets, prints, rest, rests: () => rests, now: () => time }
}

type Rig = ReturnType<typeof boardRig>

const expectOpen = ({ board, rest }: Rig) => {
  expect(board.open).toBe(true)
  expect(board.leaving).toBeNull()
  expect(board.wall.a).toBe(1)
  expect(board.page.t).toBe(1)
  for (const s of rest) expect(s.en).toBe(1)
}

const expectClosed = ({ board, sheets }: Rig) => {
  expect(board.open).toBe(false)
  expect(board.leaving).toBeNull()
  expect(board.fading).toBe(false)
  expect([board.wall.a, board.page.t, board.spot.a, board.strings.o, board.fade.o]).toEqual([
    0, 0, 0, 1, 1,
  ])
  for (const s of sheets) {
    expect([s.en, s.hv, s.dim, s.fl, s.rest]).toEqual([s.kind === 'page' ? 1 : 0, 0, 0, 0, s.rest0])
  }
}

/**
 * Every number the motion hook draws from, plus each sheet's fall offset (`dir * (1 - en)`, the
 * prototype's `fy`) weighted by how much it shows (its opacity is `en * 2.2`, clamped to 1).
 */
const drawn = ({ board, sheets }: Rig) => [
  board.wall.a,
  board.page.t,
  board.spot.x,
  board.spot.y,
  board.spot.a,
  board.strings.o,
  board.fade.o,
  ...sheets.flatMap((s) => [
    s.en,
    s.hv,
    s.dim,
    s.fl,
    Math.min(1, s.en * 2.2) * s.dir * (1 - s.en) || 0,
  ]),
]

/** Nothing drawn has moved since `before` by more than a fraction of a pixel. */
const expectStill = (rig: Rig, before: number[]) =>
  drawn(rig).forEach((value, k) => expect(value).toBeCloseTo(before[k]!, 3))

/** A small seeded random source, so a failing sequence repeats. */
const random = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32
  return seed / 2 ** 32
}

describe('the board', () => {
  it('starts closed and at rest, whatever the sheets held', () => {
    expectClosed(boardRig())
  })
})

describe('open and close', () => {
  it('opens onto the board: wall up, page pinned, every sheet in', () => {
    const rig = boardRig()
    rig.moments.open()
    expect(rig.board.open).toBe(true)
    rig.run(1500)
    expectOpen(rig)
    expect(rig.rests()).toBe(0)
  })

  it('closes back to rest, straightening the page as it comes off its pin, and says so once', () => {
    const rig = boardRig()
    rig.moments.open()
    rig.run(1500)
    rig.moments.close()
    expect(rig.board.open).toBe(false)
    expect(rig.sheets[0]!.rest).toBe(0)
    rig.run(1100)
    expectClosed(rig)
    expect(rig.rests()).toBe(1)
    rig.moments.open()
    expect(rig.sheets[0]!.rest).toBe(rig.sheets[0]!.rest0)
  })

  it('ends in the state of the last call, for any sequence of opens and closes at any times', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rig = boardRig()
      const next = random(seed)
      let last: 'open' | 'close' = 'close'
      const calls = 1 + Math.floor(next() * 8)
      for (let i = 0; i < calls; i++) {
        rig.run(next() * 1300)
        last = next() < 0.5 ? 'open' : 'close'
        rig.moments[last]()
      }
      rig.run(2500)
      if (last === 'open') expectOpen(rig)
      else expectClosed(rig)
    }
  })

  it('reverses from where it is: nothing it draws jumps when an open or close cuts in', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rig = boardRig()
      const next = random(seed)
      for (let i = 0; i < 6; i++) {
        rig.moments[i % 2 ? 'close' : 'open']()
        rig.run(50 + next() * 1000)
        const before = drawn(rig)
        rig.moments[i % 2 ? 'open' : 'close']()
        rig.at(rig.now())
        expectStill(rig, before)
        rig.at(rig.now() + FRAME)
        // A jump moves a whole fall (1 or 2); the fastest real frame (a sheet landing) under 0.3.
        drawn(rig).forEach((value, k) => expect(Math.abs(value - before[k]!)).toBeLessThan(0.5))
      }
    }
  })
})

describe('hover', () => {
  it('lifts the pointed sheet, dims the rest and gathers the light on it; none puts it all back', () => {
    const rig = boardRig()
    const [, picked] = rig.prints
    rig.moments.open()
    rig.run(1500)
    rig.moments.hover({ sheet: picked!, x: 300, y: 200 })
    expect(rig.board.hovered).toBe(picked)
    rig.run(1000)
    for (const s of rig.rest) expect([s.hv, s.dim]).toEqual(s === picked ? [1, 0] : [0, 1])
    expect(rig.board.spot).toEqual({ x: 300, y: 200, a: 1 })
    rig.moments.hover(null)
    rig.run(1000)
    expect(rig.board.hovered).toBeNull()
    for (const s of rig.rest) expect([s.hv, s.dim]).toEqual([0, 0])
    expect(rig.board.spot.a).toBe(0)
  })

  it('changes the hovered sheet at most once per hold; the last ask waits, then wins', () => {
    const rig = boardRig()
    const [a, b, c] = rig.prints
    rig.moments.open()
    rig.run(1500)
    rig.moments.hover({ sheet: a!, x: 0, y: 0 })
    rig.run(50)
    rig.moments.hover({ sheet: b!, x: 0, y: 0 })
    rig.moments.hover({ sheet: c!, x: 0, y: 0 })
    rig.run(100)
    expect(rig.board.hovered).toBe(a)
    rig.run(HOVER_HOLD_SECONDS * 1000)
    expect(rig.board.hovered).toBe(c)
    rig.run(50)
    rig.moments.hover({ sheet: b!, x: 0, y: 0 })
    rig.moments.hover({ sheet: c!, x: 0, y: 0 }) // back to the one it has: nothing waits
    rig.run(1000)
    expect(rig.board.hovered).toBe(c)
  })

  // WCAG 2.3.1: a flash is a pair of opposing changes of 10% or more of relative luminance; no
  // more than 3 in any second. A sheet is light paper on a dark wall, drawn at the prototype's
  // opacity (`en` brings it in, `dim` takes it to 45%). A swing counts once the luminance has moved
  // 10% from the last turning point. (The wall and the spot top out under 10%: they cannot flash.)
  const flashes = (rig: Rig, act: (frame: number) => void, seen = 10) => {
    const luminance = (s: MomentSheet) =>
      ((Math.min(1, Math.max(0, s.en * 2.2)) * (1 - 0.55 * s.dim) * 230) / 255) ** 2.2
    const swings: number[][] = rig.rest.map(() => [])
    const extreme = rig.rest.map(luminance)
    const going = rig.rest.map(() => 0)
    for (let frame = 0; frame < 60 * 20; frame++) {
      act(frame)
      rig.at(rig.now() + FRAME)
      rig.rest.forEach((s, i) => {
        const moved = luminance(s) - extreme[i]!
        if (going[i] !== 0 && Math.sign(moved) === going[i]) extreme[i] = luminance(s)
        else if (Math.abs(moved) >= 0.1) {
          swings[i]!.push(rig.now() / 1000)
          going[i] = Math.sign(moved)
          extreme[i] = luminance(s)
        }
      })
    }
    expect(swings.flat().length).toBeGreaterThanOrEqual(seen) // the test did see swings
    for (const times of swings) {
      for (const start of times) {
        const inWindow = times.filter((time) => time >= start && time <= start + 1).length
        expect(inWindow / 2).toBeLessThanOrEqual(3) // two opposing changes make one flash
      }
    }
  }

  it.each([1, 2, 3, 5, 8])(
    'flashes no sheet more than 3 times a second, however fast the pointer hops (every %i frames)',
    (every) => {
      const rig = boardRig()
      rig.moments.open()
      rig.run(1500)
      const asks = [rig.prints[0]!, null, rig.prints[1]!, rig.sheets[7]!, null, rig.prints[2]!]
      flashes(rig, (frame) => {
        const sheet = asks[Math.floor(frame / every) % asks.length]!
        if (frame % every === 0) rig.moments.hover(sheet && { sheet, x: 0, y: 0 })
      })
    },
  )

  // Faster than every 20 frames the sheets never get far enough in to swing at all.
  it.each([1, 3, 10, 20, 30, 45, 60])(
    'flashes no sheet more than 3 times a second, however fast MENU is pressed (every %i frames)',
    (every) => {
      const rig = boardRig()
      const press = (frame: number) => {
        if (frame % every === 0) rig.moments[(frame / every) % 2 ? 'close' : 'open']()
      }
      flashes(rig, press, every >= 30 ? 10 : 0)
    },
  )
})

describe('leave', () => {
  const opened = (ms = 1500) => {
    const rig = boardRig()
    rig.moments.open()
    rig.run(ms)
    return rig
  }

  it.each([300, 600, 1500])(
    'flies the picked sheet and calls back once within 900 ms (left %i ms after open)',
    (ms) => {
      const rig = opened(ms)
      const picked = rig.prints[2]!
      let arrived = 0
      rig.moments.leave(picked, () => {
        arrived++
      })
      expect(rig.board.leaving).toBe(picked)
      rig.run(900)
      expect(arrived).toBe(1)
      expect(picked.fl).toBe(1)
      for (const s of rig.sheets) if (s !== picked) expect(s.en).toBe(0)
      expect(rig.board.strings.o).toBe(0)
      expect(rig.board.page.t).toBe(0)
      rig.run(2000)
      expect(arrived).toBe(1)
    },
  )

  it('ignores close and hover meanwhile, open does nothing, a second leave is ignored', () => {
    const rig = opened()
    const [first, second] = rig.prints
    let arrived = 0
    rig.moments.leave(first!, () => {
      arrived++
    })
    rig.run(200)
    const before = drawn(rig)
    rig.moments.close()
    rig.moments.hover({ sheet: second!, x: 0, y: 0 })
    rig.moments.open()
    rig.moments.leave(second!, () => {
      arrived += 10
    })
    rig.at(rig.now())
    expectStill(rig, before)
    expect(rig.board.open).toBe(true)
    expect(rig.board.leaving).toBe(first)
    rig.run(700)
    expect(arrived).toBe(1)
  })

  it('fades the board out after the call back, then rests closed', () => {
    const rig = opened()
    rig.moments.leave(rig.prints[0]!, () => {})
    rig.run(900)
    expect(rig.board.fading).toBe(true)
    expect(rig.board.fade.o).toBeLessThan(1)
    expect(rig.rests()).toBe(0)
    rig.run(300)
    expectClosed(rig)
    expect(rig.rests()).toBe(1)
  })

  it('holds the flown sheet over the view until release when the call back asks', () => {
    const rig = opened()
    rig.moments.leave(rig.prints[0]!, () => true)
    rig.run(3000)
    expect(rig.board.fade.o).toBe(1)
    expect(rig.prints[0]!.fl).toBe(1)
    expect(rig.rests()).toBe(0)
    rig.moments.release()
    rig.run(300)
    expectClosed(rig)
    expect(rig.rests()).toBe(1)
  })

  it('release does nothing when nothing is held', () => {
    const rig = opened()
    rig.moments.release()
    rig.moments.leave(rig.prints[0]!, () => {})
    rig.run(900)
    rig.moments.release()
    rig.run(300)
    expect(rig.rests()).toBe(1)
  })

  it('an open during the fade cuts it short and opens', () => {
    const rig = opened()
    rig.moments.leave(rig.prints[0]!, () => {})
    rig.run(900)
    rig.moments.open()
    expect(rig.rests()).toBe(1)
    expect(rig.board.fade.o).toBe(1)
    rig.run(1500)
    expectOpen(rig)
  })

  it('does nothing on a closed board', () => {
    const rig = boardRig()
    let arrived = 0
    rig.moments.leave(rig.prints[0]!, () => {
      arrived++
    })
    rig.run(1500)
    expect(arrived).toBe(0)
    expectClosed(rig)
  })

  it('takes over from a hover mid-way with no jump', () => {
    const rig = opened()
    rig.moments.hover({ sheet: rig.prints[1]!, x: 0, y: 0 })
    rig.run(120)
    const before = drawn(rig)
    rig.moments.leave(rig.prints[1]!, () => {})
    rig.at(rig.now())
    expectStill(rig, before)
  })
})
