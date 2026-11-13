import { describe, expect, it } from 'vitest'

import {
  createHeat,
  pickMargin,
  pickScreen,
  pushBlend,
  pushPose,
  stepHeat,
  tagPlace,
  type ScreenPlane,
} from './room-pointing'
import { ROOM_TUNING } from './room-tuning'

// Screens standing on a wall at z = -2, facing the eye at the origin, 1 m apart.
const plane = (x: number, width = 0.6): ScreenPlane => ({
  centre: { x, y: 1, z: -2 },
  right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  width,
  height: (width * 9) / 16,
})
const wall = [plane(-1), plane(0), plane(1)]
const eye = { x: 0, y: 1, z: 0 }
const toward = (x: number, y = 1) => {
  const length = Math.hypot(x, y - 1, 2)
  return { x: x / length, y: (y - 1) / length, z: -2 / length }
}
const lit = [true, true, true]

describe('pickScreen', () => {
  it('picks the screen a ray through its centre meets', () => {
    wall.forEach((screen, place) =>
      expect(pickScreen(eye, toward(screen.centre.x), wall, lit, 1)).toBe(place),
    )
  })

  it('picks none for a ray through a gap, above or past the screens', () => {
    expect(pickScreen(eye, toward(0.5), wall, lit, 1)).toBe(-1)
    expect(pickScreen(eye, toward(0, 1.6), wall, lit, 1)).toBe(-1)
    expect(pickScreen(eye, toward(3), wall, lit, 1)).toBe(-1)
  })

  it('is blunter with a bigger margin: a near miss counts for a finger', () => {
    const near = toward(0.4) // 0.4 m right of the middle one's centre: its half width is 0.3
    expect(pickScreen(eye, near, wall, lit, 1)).toBe(-1)
    expect(pickScreen(eye, near, wall, lit, ROOM_TUNING.pick.touchMargin)).toBe(1)
  })

  it('uses the wider hit area on touch only', () => {
    expect(pickMargin(false)).toBe(ROOM_TUNING.pick.margin)
    expect(pickMargin(true)).toBe(ROOM_TUNING.pick.touchMargin)
    expect(pickMargin(true)).toBeGreaterThan(pickMargin(false))
  })

  it('never picks a place with no Work, nor a screen seen from behind or behind the eye', () => {
    expect(pickScreen(eye, toward(0), wall, [true, false, true], 1)).toBe(-1)
    expect(pickScreen(eye, { x: 0, y: 0, z: 1 }, wall, lit, 1)).toBe(-1) // looking away
    const behind = { ...eye, z: -3 } // past the wall, looking at its back
    expect(pickScreen(behind, { x: 0, y: 0, z: 1 }, wall, lit, 1)).toBe(-1)
  })

  it('picks the nearest of two screens on the same ray', () => {
    const front = { ...plane(0), centre: { x: 0, y: 1, z: -1 } }
    expect(pickScreen(eye, { x: 0, y: 0, z: -1 }, [plane(0), front], [true, true], 1)).toBe(1)
  })
})

describe('the hot screen', () => {
  const works = Array<boolean>(ROOM_TUNING.places).fill(true)
  const rest = (place: number) => ROOM_TUNING.screens[place]!.base
  const settle = (heat: ReturnType<typeof createHeat>, hot: number, seconds = 2) => {
    for (let t = 0; t < seconds * 60; t++) stepHeat(heat, hot, works, 1 / 60)
  }

  it('starts every screen at its rest brightness, a dark place at none', () => {
    const heat = createHeat([true, false, ...works.slice(2)])
    expect(heat.bright[0]).toBe(rest(0))
    expect(heat.bright[1]).toBe(0)
    expect(heat.hot).toBe(-1)
  })

  it('takes the hot screen past full and the others to about half, with its glow grown', () => {
    const heat = createHeat(works)
    settle(heat, 3)
    expect(heat.bright[3]).toBeGreaterThan(1)
    expect(heat.grow[3]).toBeCloseTo(1, 2)
    for (const place of [0, 1, 2, 4, 5, 6, 7]) {
      expect(heat.bright[place]).toBeCloseTo(rest(place) * ROOM_TUNING.hot.others, 2)
      expect(heat.grow[place]).toBeCloseTo(0, 2)
    }
  })

  it('goes back to rest when nothing is hot', () => {
    const heat = createHeat(works)
    settle(heat, 3)
    settle(heat, -1)
    works.forEach((_, place) => expect(heat.bright[place]).toBeCloseTo(rest(place), 2))
  })

  it('keeps a place with no Work dark', () => {
    const some = works.map((_, place) => place !== 2)
    const heat = createHeat(some)
    for (let t = 0; t < 120; t++) stepHeat(heat, 2, some, 1 / 60)
    expect(heat.bright[2]).toBe(0)
  })

  it('follows with time-based easing: the same at any frame rate', () => {
    const run = (fps: number) => {
      const heat = createHeat(works)
      for (let i = 0; i < fps / 4; i++) stepHeat(heat, 0, works, 1 / fps)
      return heat.bright[0]!
    }
    expect(run(30)).toBeCloseTo(run(144), 1)
  })

  it('never goes NaN on a bad frame time', () => {
    const heat = createHeat(works)
    stepHeat(heat, 0, works, NaN)
    stepHeat(heat, 1, works, -1)
    expect(heat.bright.every(Number.isFinite)).toBe(true)
  })

  // WCAG 2.3.1: a flash is a pair of opposing changes of 10% or more of relative luminance; no
  // more than 3 in any second. A pointer that asks for another hot screen on every frame is the
  // worst case. A swing counts once the luminance has moved 10% from the last turning point.
  it('flashes at most 3 times in any second, whatever the pointer does', () => {
    const luminance = (brightness: number) => Math.min(1, brightness) ** 2.2
    const fps = 60
    const heat = createHeat(works)
    const asked = [0, 1, -1, 2, 3, 3, -1]
    const swingTimes: number[][] = works.map(() => [])
    const extreme = works.map((_, place) => luminance(heat.bright[place]!))
    const going = works.map(() => 0)
    for (let frame = 0; frame < fps * 20; frame++) {
      stepHeat(heat, asked[frame % asked.length]!, works, 1 / fps)
      works.forEach((_, place) => {
        const now = luminance(heat.bright[place]!)
        const moved = now - extreme[place]!
        if (going[place] !== 0 && Math.sign(moved) === going[place]) extreme[place] = now
        else if (Math.abs(moved) >= 0.1) {
          swingTimes[place]!.push(frame / fps)
          going[place] = Math.sign(moved)
          extreme[place] = now
        }
      })
    }
    expect(swingTimes.flat().length).toBeGreaterThan(10) // the test did see swings
    for (const times of swingTimes) {
      for (const start of times) {
        const inWindow = times.filter((time) => time >= start && time <= start + 1).length
        expect(inWindow / 2).toBeLessThanOrEqual(3) // two opposing changes make one flash
      }
    }
  })

  it('changes the hot screen at most once per hold', () => {
    const heat = createHeat(works)
    stepHeat(heat, 0, works, 1 / 60)
    expect(heat.hot).toBe(0)
    stepHeat(heat, 1, works, 1 / 60)
    expect(heat.hot).toBe(0)
    for (let t = 0; t < ROOM_TUNING.hot.holdSeconds * 60; t++) stepHeat(heat, 1, works, 1 / 60)
    expect(heat.hot).toBe(1)
  })
})

describe('the push-in', () => {
  it('runs from 0 to 1 in the tuned time, steadily, and stays there', () => {
    expect(pushBlend(0)).toBe(0)
    expect(pushBlend(ROOM_TUNING.push.seconds)).toBe(1)
    expect(pushBlend(ROOM_TUNING.push.seconds * 4)).toBe(1)
    expect(ROOM_TUNING.push.seconds).toBeLessThanOrEqual(0.8)
    let before = 0
    for (let t = 0; t <= 0.8; t += 0.01) {
      const now = pushBlend(t)
      expect(now).toBeGreaterThanOrEqual(before)
      before = now
    }
  })

  it('counts a bad time as the start', () => {
    expect(pushBlend(NaN)).toBe(0)
    expect(pushBlend(-1)).toBe(0)
  })

  it('ends straight in front of the chosen screen, which then fills the view', () => {
    const screen = plane(1)
    const aspect = 16 / 9
    const fov = 58
    const end = pushPose(screen, fov, aspect)
    expect(end.lookAt).toEqual([screen.centre.x, screen.centre.y, screen.centre.z])
    // On the screen's normal through its centre, on its front.
    expect(end.position[0]).toBeCloseTo(screen.centre.x, 9)
    expect(end.position[1]).toBeCloseTo(screen.centre.y, 9)
    const d = end.position[2] - screen.centre.z
    expect(d).toBeGreaterThan(0)
    // The view at that distance is the screen's limiting side, a little under-filled at most 10%.
    const viewHeight = 2 * d * Math.tan((fov * Math.PI) / 360)
    const limit = Math.min(screen.width / aspect, screen.height)
    expect(viewHeight / limit).toBeGreaterThan(0.9)
    expect(viewHeight / limit).toBeLessThanOrEqual(1)
  })
})

describe('tagPlace', () => {
  const view = { width: 1200, height: 800 }
  const tag = { width: 200, height: 60 }
  const out = { left: 0, top: 0 }
  const { gap, edge, below, top } = ROOM_TUNING.tag

  it('sits to the right of the screen, centred on it', () => {
    tagPlace({ x0: 300, x1: 500, y0: 300, y1: 400 }, tag, view, false, out)
    expect(out.left).toBe(500 + gap)
    expect(out.top).toBe(350 - 30)
  })

  it('goes to the left when the right has no room', () => {
    tagPlace({ x0: 800, x1: 1100, y0: 300, y1: 400 }, tag, view, false, out)
    expect(out.left).toBe(800 - gap - tag.width)
  })

  it('goes below the screen when neither side has room, or on a phone', () => {
    tagPlace({ x0: 100, x1: 1100, y0: 300, y1: 400 }, tag, view, false, out)
    expect(out.top).toBe(400 + below)
    tagPlace({ x0: 300, x1: 500, y0: 300, y1: 400 }, tag, view, true, out)
    expect(out.left).toBe(400 - 100)
    expect(out.top).toBe(400 + below)
  })

  it('goes above when there is no room below, and always stays inside the view', () => {
    tagPlace({ x0: 100, x1: 1100, y0: 500, y1: 790 }, tag, view, false, out)
    expect(out.top).toBe(500 - below - tag.height)
    tagPlace({ x0: -900, x1: -700, y0: -50, y1: 0 }, tag, view, false, out)
    expect(out.left).toBeGreaterThanOrEqual(edge)
    expect(out.top).toBeGreaterThanOrEqual(top)
    tagPlace({ x0: 5000, x1: 5200, y0: 9000, y1: 9100 }, tag, view, false, out)
    expect(out.left).toBeLessThanOrEqual(view.width - edge - tag.width)
    expect(out.top).toBeLessThanOrEqual(view.height - edge - tag.height)
  })
})
