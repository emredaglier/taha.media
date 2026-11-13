import { describe, expect, it } from 'vitest'

import { judge, MIN_ROOM_LIT, roomStats, summary, type Observation } from './pixels.ts'

/** RGBA bytes from pixels written as [r, g, b, a]. */
const rgba = (...pixels: [number, number, number, number][]) => new Uint8Array(pixels.flat())

const GOOD: Observation = { glError: 0, room: { total: 4, lit: 3 } }

describe('roomStats', () => {
  it('counts the pixels with any colour, however dim, and not the black ones', () => {
    expect(roomStats(rgba([0, 0, 0, 255], [0, 1, 0, 255], [9, 9, 9, 255]))).toEqual({
      total: 3,
      lit: 2,
    })
  })
})

describe('judge', () => {
  it('passes a clean run', () => {
    expect(judge(GOOD)).toEqual([])
  })

  it('fails on a GL error after the Edit Room, naming the error', () => {
    const failures = judge({ ...GOOD, glError: 0x0502 })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatch(/gl\.getError\(\).*0x502.*Edit Room/i)
  })

  it('fails a room that stays black, as one whose shader did not compile does', () => {
    const failures = judge({ ...GOOD, room: { total: 1000, lit: 0 } })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatch(/Edit Room.*0\.0% of its pixels lit/)
  })

  it('passes a room exactly at the lit floor and fails one pixel below it', () => {
    expect(judge({ ...GOOD, room: { total: 1000, lit: MIN_ROOM_LIT * 1000 } })).toEqual([])
    expect(judge({ ...GOOD, room: { total: 1000, lit: MIN_ROOM_LIT * 1000 - 1 } })).toHaveLength(1)
  })

  it('summarises a pass on one line, with the numbers it saw', () => {
    const line = summary(GOOD)
    expect(line).not.toContain('\n')
    expect(line).toContain('3 of 4')
  })

  it('reports every failure, not only the first', () => {
    expect(judge({ glError: 1, room: { total: 4, lit: 0 } })).toHaveLength(2)
  })
})
