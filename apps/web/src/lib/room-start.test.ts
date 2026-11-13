// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { stopForPlace } from './room-model'
import {
  markRoomOpened,
  readRoomStart,
  rememberWork,
  roomStart,
  type RoomStartFacts,
} from './room-start'

const works = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }]
const fresh: RoomStartFacts = { opensOnHome: true, firstRoom: true, remembered: null, phone: false }

describe('where the room starts (pure)', () => {
  it('opens when the document was loaded on Home and no room has run yet', () => {
    expect(roomStart(fresh)).toEqual({ opening: true, progress: 0 })
  })

  it('client navigation to Home starts at rest: no opening, at the doorway', () => {
    expect(roomStart({ ...fresh, opensOnHome: false })).toEqual({ opening: false, progress: 0 })
    expect(roomStart({ ...fresh, firstRoom: false })).toEqual({ opening: false, progress: 0 })
  })

  it("coming back from a Work page rests at that Work's stop with no opening", () => {
    for (const phone of [false, true]) {
      for (const place of [0, 1, 4, 7]) {
        const start = roomStart({ ...fresh, firstRoom: false, remembered: place, phone })
        expect(start.opening).toBe(false)
        expect(start.progress).toBe(stopForPlace(place, phone).progress)
      }
    }
  })

  it('a document restored from history on a remembered Work rests there too, whatever the loader did', () => {
    expect(roomStart({ ...fresh, remembered: 3 })).toEqual({
      opening: false,
      progress: stopForPlace(3, false).progress,
    })
  })
})

describe('what the room reads from the page', () => {
  afterEach(() => {
    delete document.documentElement.dataset.roomOpened
    window.history.replaceState(null, '')
    vi.restoreAllMocks()
  })

  const loadedAs = (type: string, path: string) =>
    vi
      .spyOn(performance, 'getEntriesByType')
      .mockReturnValue([{ type, name: `https://taha.media${path}` }] as never)

  it('opens on a first room of a document loaded on Home, and not on the next one', () => {
    loadedAs('navigate', '/')
    expect(readRoomStart(works, false).opening).toBe(true)
    markRoomOpened()
    expect(readRoomStart(works, false).opening).toBe(false)
  })

  it('does not open when the document was loaded on another page', () => {
    loadedAs('navigate', '/isler/a')
    expect(readRoomStart(works, false).opening).toBe(false)
  })

  it('remembers the Work opened from the room and rests at its stop on the way back', () => {
    loadedAs('navigate', '/')
    markRoomOpened()
    rememberWork('c')
    expect(readRoomStart(works, false)).toEqual({
      opening: false,
      progress: stopForPlace(2, false).progress,
    })
  })

  it('keeps the rest of the history state when it remembers', () => {
    window.history.replaceState({ next: 1 }, '')
    rememberWork('b')
    expect(window.history.state).toEqual({ next: 1, roomWork: 'b' })
  })

  it('forgets a Work that is no longer in the room, and one past the eighth', () => {
    loadedAs('navigate', '/')
    markRoomOpened()
    rememberWork('gone')
    expect(readRoomStart(works, false).progress).toBe(0)
    rememberWork('c')
    expect(readRoomStart([{ slug: 'a' }, { slug: 'b' }], false).progress).toBe(0)
  })

  it('a reload of Home starts with the opening again, forgetting the remembered Work', () => {
    loadedAs('reload', '/')
    rememberWork('b')
    expect(readRoomStart(works, false)).toEqual({ opening: true, progress: 0 })
    expect(window.history.state).not.toHaveProperty('roomWork')
  })
})
