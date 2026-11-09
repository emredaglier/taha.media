import { HAND_TUNING } from './hand-tuning'

/*
 * What Hand control keeps in the browser (#58), functional storage only, never anything of the
 * picture:
 * - in `sessionStorage` (this tab only), when the page hid while Hand control was on, so a reload
 *   in this tab moments later brings it back while the camera permission is still granted;
 * - in `localStorage` (this browser), that the coach has been seen, so it shows once.
 * Storage the browser refuses (blocked site data) counts as empty, and writing to it does nothing.
 */

/** The part of `Storage` used here. */
export type FlagStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The part of `navigator.permissions` used here. */
type PermissionsLike = { query(descriptor: { name: 'camera' }): Promise<{ state: string }> }

/** The tab's mark: when the page hid with Hand control on (ms since the epoch). */
export const HAND_ON_KEY = 'taha.hand-control.on'
const COACH_KEY = 'taha.hand-control.coached'

const read = (storage: FlagStorage | null, key: string): string | null => {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

const write = (storage: FlagStorage | null, key: string, value: string | null) => {
  try {
    if (value !== null) storage?.setItem(key, value)
    else storage?.removeItem(key)
  } catch {
    // Refused: nothing is kept.
  }
}

/**
 * Marks this tab: the page hid at `now` (ms since the epoch) with Hand control on. A page hides as
 * it unloads, so a reload passes through here.
 */
export const markHiddenWhileOn = (tab: FlagStorage | null, now: number): void =>
  write(tab, HAND_ON_KEY, String(now))

/** Clears that mark. */
export const forgetOn = (tab: FlagStorage | null): void => write(tab, HAND_ON_KEY, null)

/** How this page was loaded, as the browser tells it. */
export type PageLoad = {
  /** The navigation's type (`PerformanceNavigationTiming.type`), if the browser says. */
  navigation: string | undefined
  /** Whether the browser discarded the tab and this load brought it back (Chrome). */
  wasDiscarded: boolean
  hidden: boolean
  /** The time (ms since the epoch). */
  now: number
}

/**
 * Whether Hand control comes back on by itself on this load: only after a real reload in the same
 * tab, moments after it was on. The tab's mark is consumed first, whatever follows, so nothing
 * else (a duplicated or reopened tab, a restored session, a discarded tab, Back) can use it. It
 * comes back only if all hold:
 * - the mark is from the last `resumeWindowMs` (a bare or old mark is not);
 * - the navigation is a `reload`, the tab wasn't discarded, and the page is shown;
 * - the browser says the camera is `granted`, so asking for it opens no prompt. It never asks for
 *   the camera itself, and where the permission can't be queried (no Permissions API, or a query
 *   that throws or rejects, as in older browsers), it doesn't come back: asking blind could prompt.
 * The caller checks again, after the query, that the page is still shown and Hand control off.
 */
export async function mayResume(
  tab: FlagStorage | null,
  load: PageLoad,
  permissions: PermissionsLike | undefined,
): Promise<boolean> {
  const mark = read(tab, HAND_ON_KEY)
  if (mark === null) return false
  forgetOn(tab)
  const age = load.now - Number(mark)
  if (!(age >= 0 && age <= HAND_TUNING.lifetime.resumeWindowMs)) return false
  if (load.navigation !== 'reload' || load.wasDiscarded || load.hidden) return false
  try {
    return (await permissions?.query({ name: 'camera' }))?.state === 'granted'
  } catch {
    return false
  }
}

/** Whether this browser has seen the coach. */
export const coachSeen = (browser: FlagStorage | null): boolean => read(browser, COACH_KEY) === '1'

/** Marks the coach as seen in this browser. */
export const markCoachSeen = (browser: FlagStorage | null): void => write(browser, COACH_KEY, '1')

/** The page's storage of that kind, or null where reaching it throws (blocked site data). */
export const storageOf = (kind: 'sessionStorage' | 'localStorage'): FlagStorage | null => {
  try {
    return window[kind]
  } catch {
    return null
  }
}
