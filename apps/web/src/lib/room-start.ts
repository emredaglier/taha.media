import { stopForPlace } from './room-model'
import { ROOM_TUNING } from './room-tuning'

/**
 * Where the Edit Room starts (#131). Only a document loaded on Home, on its first room, plays the
 * opening; client navigation to Home and coming back from a Work page start at rest, the latter at
 * the stop that shows the Work it came from.
 */

export type RoomStartFacts = {
  /** The document was loaded on Home (so the loader showed), not on another page and reached Home by a client navigation. */
  opensOnHome: boolean
  /** No room has run yet in this document. */
  firstRoom: boolean
  /** The place of the Work opened from the room that this history entry remembers, if any. */
  remembered: number | null
  phone: boolean
}

/** Whether the room plays its opening, and where on the path (0 to 1) it starts. */
export function roomStart({ opensOnHome, firstRoom, remembered, phone }: RoomStartFacts) {
  if (remembered !== null)
    return { opening: false, progress: stopForPlace(remembered, phone).progress }
  return { opening: opensOnHome && firstRoom, progress: 0 }
}

// ---- the page: what the facts are read from ----

/** The mark on `<html>` once a room has drawn its first frame: later rooms of this document start at rest. */
const OPENED = 'roomOpened'

/** The room has drawn: no later room in this document plays the opening. */
export const markRoomOpened = (): void => {
  document.documentElement.dataset[OPENED] = ''
}

/** Where on the Home history entry the Work opened from the room is kept (its slug). */
const HISTORY_KEY = 'roomWork'

const historyState = (): Record<string, unknown> =>
  typeof window.history.state === 'object' && window.history.state !== null
    ? (window.history.state as Record<string, unknown>)
    : {}

/**
 * Remembers on the current history entry that the Work `slug` was opened from the room, keeping
 * the rest of the state (Next's own); the URL doesn't change. Call it before navigating to the Work.
 */
export function rememberWork(slug: string): void {
  window.history.replaceState({ ...historyState(), [HISTORY_KEY]: slug }, '')
}

const forgetWork = (): void => {
  const { [HISTORY_KEY]: _forgotten, ...rest } = historyState()
  window.history.replaceState(rest, '')
}

/** Reads the facts from the page and decides (`works`: the Featured Works in the room's order). */
export function readRoomStart(works: readonly { slug: string }[], phone: boolean) {
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
  const firstRoom = document.documentElement.dataset[OPENED] === undefined
  // A browser keeps the history entry's state across a reload, but a reload starts with the opening.
  if (firstRoom && entry?.type === 'reload' && new URL(entry.name).pathname === location.pathname) {
    forgetWork()
  }
  const place = works.findIndex((work) => work.slug === historyState()[HISTORY_KEY])
  return roomStart({
    opensOnHome: entry !== undefined && new URL(entry.name).pathname === '/',
    firstRoom,
    remembered: place >= 0 && place < ROOM_TUNING.places ? place : null,
    phone,
  })
}
