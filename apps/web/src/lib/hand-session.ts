/*
 * What Hand control keeps in the browser (#58), functional storage only, never anything of the
 * picture:
 * - in `sessionStorage` (this tab only), that Hand control is on, so a full reload in this tab
 *   brings it back while the camera permission is still granted; a new tab starts off;
 * - in `localStorage` (this browser), that the coach has been seen, so it shows once.
 * Storage the browser refuses (blocked site data) counts as empty, and writing to it does nothing.
 */

/** The part of `Storage` used here. */
export type FlagStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The part of `navigator.permissions` used here. */
type PermissionsLike = { query(descriptor: { name: 'camera' }): Promise<{ state: string }> }

const ON_KEY = 'taha.hand-control.on'
const COACH_KEY = 'taha.hand-control.coached'

const read = (storage: FlagStorage | null, key: string): boolean => {
  try {
    return storage?.getItem(key) === '1'
  } catch {
    return false
  }
}

const write = (storage: FlagStorage | null, key: string, on: boolean) => {
  try {
    if (on) storage?.setItem(key, '1')
    else storage?.removeItem(key)
  } catch {
    // Refused: nothing is kept.
  }
}

/** Marks this tab as having Hand control on. */
export const rememberOn = (tab: FlagStorage | null): void => write(tab, ON_KEY, true)

/** Clears that mark. */
export const forgetOn = (tab: FlagStorage | null): void => write(tab, ON_KEY, false)

/**
 * Whether Hand control comes back on by itself after a reload: this tab had it on, and the browser
 * says the camera is `granted`, so asking for it opens no prompt. It never asks for the camera
 * itself. Where the camera's permission can't be queried (no Permissions API, or a browser that
 * doesn't know the name, as Firefox throws), it doesn't come back: asking blind could prompt.
 * Unless it comes back, the tab forgets it was on.
 */
export async function mayResume(
  tab: FlagStorage | null,
  permissions: PermissionsLike | undefined,
): Promise<boolean> {
  if (!read(tab, ON_KEY)) return false
  let granted = false
  try {
    granted = (await permissions?.query({ name: 'camera' }))?.state === 'granted'
  } catch {
    granted = false
  }
  if (!granted) forgetOn(tab)
  return granted
}

/** Whether this browser has seen the coach. */
export const coachSeen = (browser: FlagStorage | null): boolean => read(browser, COACH_KEY)

/** Marks the coach as seen in this browser. */
export const markCoachSeen = (browser: FlagStorage | null): void => write(browser, COACH_KEY, true)

/** The page's storage of that kind, or null where reaching it throws (blocked site data). */
export const storageOf = (kind: 'sessionStorage' | 'localStorage'): FlagStorage | null => {
  try {
    return window[kind]
  } catch {
    return null
  }
}
