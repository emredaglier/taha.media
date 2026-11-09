import { describe, expect, it, vi } from 'vitest'

import {
  coachSeen,
  forgetOn,
  HAND_ON_KEY,
  markCoachSeen,
  markHiddenWhileOn,
  mayResume,
  type FlagStorage,
  type PageLoad,
} from './hand-session'
import { HAND_TUNING } from './hand-tuning'

const { resumeWindowMs } = HAND_TUNING.lifetime

/** An in-memory stand-in for `sessionStorage` or `localStorage`. */
const memory = (): FlagStorage => {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
}

/** A storage the browser refuses (blocked site data, a sandboxed frame). */
const refusing: FlagStorage = {
  getItem: () => {
    throw new DOMException('denied', 'SecurityError')
  },
  setItem: () => {
    throw new DOMException('denied', 'SecurityError')
  },
  removeItem: () => {
    throw new DOMException('denied', 'SecurityError')
  },
}

/** `navigator.permissions` answering `state` for the camera. */
const permissions = (state: PermissionState) => ({
  query: vi.fn(async () => ({ state }) as PermissionStatus),
})

const HID_AT = 1_000_000

/** A reload, shown, a moment after the page hid. */
const RELOAD: PageLoad = {
  navigation: 'reload',
  wasDiscarded: false,
  hidden: false,
  now: HID_AT + 300,
}

/** A tab whose page hid at `HID_AT` with Hand control on. */
const tabOn = () => {
  const tab = memory()
  markHiddenWhileOn(tab, HID_AT)
  return tab
}

describe('coming back on after a reload', () => {
  it('only after a reload moments after it was on, with the camera granted', async () => {
    const granted = permissions('granted')
    expect(await mayResume(tabOn(), RELOAD, granted)).toBe(true)
    expect(granted.query).toHaveBeenCalledWith({ name: 'camera' })
  })

  it('uses the mark once: it is gone after the load, whatever follows', async () => {
    const tab = tabOn()
    expect(
      await mayResume(tab, { ...RELOAD, navigation: 'navigate' }, permissions('granted')),
    ).toBe(false)
    expect(tab.getItem(HAND_ON_KEY)).toBeNull()
    expect(await mayResume(tab, RELOAD, permissions('granted'))).toBe(false)
  })

  it('not in a tab that never had it on: the browser is not even asked', async () => {
    const granted = permissions('granted')
    expect(await mayResume(memory(), RELOAD, granted)).toBe(false)
    expect(granted.query).not.toHaveBeenCalled()
  })

  it('not once it was turned off in this tab', async () => {
    const tab = tabOn()
    forgetOn(tab)
    expect(await mayResume(tab, RELOAD, permissions('granted'))).toBe(false)
  })

  it.each<[string, Partial<PageLoad>]>([
    ['a mark older than the window', { now: HID_AT + resumeWindowMs + 1 }],
    ['a mark from the future', { now: HID_AT - 1 }],
    ['a new navigation (a reopened or duplicated tab)', { navigation: 'navigate' }],
    ['Back or Forward', { navigation: 'back_forward' }],
    ['a browser that does not say', { navigation: undefined }],
    ['a tab the browser discarded', { wasDiscarded: true }],
    ['a hidden page', { hidden: true }],
  ])('not after %s, and the camera is not even asked about', async (_, load) => {
    const granted = permissions('granted')
    expect(await mayResume(tabOn(), { ...RELOAD, ...load }, granted)).toBe(false)
    expect(granted.query).not.toHaveBeenCalled()
  })

  it('not with a mark that holds no time (copied from elsewhere)', async () => {
    const tab = memory()
    tab.setItem(HAND_ON_KEY, '1')
    expect(await mayResume(tab, RELOAD, permissions('granted'))).toBe(false)
    tab.setItem(HAND_ON_KEY, 'on')
    expect(await mayResume(tab, RELOAD, permissions('granted'))).toBe(false)
  })

  it.each(['prompt', 'denied'] as const)('not while the camera would be %s', async (state) => {
    expect(await mayResume(tabOn(), RELOAD, permissions(state))).toBe(false)
  })

  it.each<[string, Parameters<typeof mayResume>[2]]>([
    ['without the Permissions API', undefined],
    [
      'where the camera cannot be queried (the query throws, as in older browsers)',
      {
        query: () => {
          throw new TypeError("'camera' is not a valid value for enumeration PermissionName")
        },
      },
    ],
    ['where the query rejects', { query: () => Promise.reject(new TypeError('camera')) }],
  ])('not %s', async (_, api) => {
    expect(await mayResume(tabOn(), RELOAD, api)).toBe(false)
  })

  it('not where session storage is refused, and nothing throws', async () => {
    expect(() => markHiddenWhileOn(refusing, HID_AT)).not.toThrow()
    expect(() => forgetOn(refusing)).not.toThrow()
    expect(await mayResume(refusing, RELOAD, permissions('granted'))).toBe(false)
    expect(await mayResume(null, RELOAD, permissions('granted'))).toBe(false)
  })
})

describe('the coach, once per browser', () => {
  it('is unseen at first, and seen once marked', () => {
    const browser = memory()
    expect(coachSeen(browser)).toBe(false)
    markCoachSeen(browser)
    expect(coachSeen(browser)).toBe(true)
  })

  it('where local storage is refused, it counts as unseen and nothing throws', () => {
    expect(coachSeen(refusing)).toBe(false)
    expect(() => markCoachSeen(refusing)).not.toThrow()
    expect(coachSeen(null)).toBe(false)
  })
})
