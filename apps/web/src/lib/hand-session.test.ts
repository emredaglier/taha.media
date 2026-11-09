import { describe, expect, it, vi } from 'vitest'

import {
  coachSeen,
  forgetOn,
  markCoachSeen,
  mayResume,
  rememberOn,
  type FlagStorage,
} from './hand-session'

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

describe('coming back on after a reload', () => {
  it('only when this tab had it on and the camera is granted', async () => {
    const tab = memory()
    rememberOn(tab)
    const granted = permissions('granted')
    expect(await mayResume(tab, granted)).toBe(true)
    expect(granted.query).toHaveBeenCalledWith({ name: 'camera' })
  })

  it('not in a tab that never had it on: the browser is not even asked', async () => {
    const granted = permissions('granted')
    expect(await mayResume(memory(), granted)).toBe(false)
    expect(granted.query).not.toHaveBeenCalled()
  })

  it('not once it was turned off in this tab', async () => {
    const tab = memory()
    rememberOn(tab)
    forgetOn(tab)
    expect(await mayResume(tab, permissions('granted'))).toBe(false)
  })

  it.each(['prompt', 'denied'] as const)(
    'not while the camera would be %s, and the tab forgets it was on',
    async (state) => {
      const tab = memory()
      rememberOn(tab)
      expect(await mayResume(tab, permissions(state))).toBe(false)
      expect(await mayResume(tab, permissions('granted'))).toBe(false)
    },
  )

  it.each<[string, Parameters<typeof mayResume>[1]]>([
    ['without the Permissions API', undefined],
    [
      'where the camera cannot be queried (Firefox throws)',
      {
        query: () => {
          throw new TypeError("'camera' is not a valid value for enumeration PermissionName")
        },
      },
    ],
    ['where the query rejects', { query: () => Promise.reject(new TypeError('camera')) }],
  ])('not %s', async (_, api) => {
    const tab = memory()
    rememberOn(tab)
    expect(await mayResume(tab, api)).toBe(false)
  })

  it('not where session storage is refused, and nothing throws', async () => {
    expect(() => rememberOn(refusing)).not.toThrow()
    expect(() => forgetOn(refusing)).not.toThrow()
    expect(await mayResume(refusing, permissions('granted'))).toBe(false)
    expect(await mayResume(null, permissions('granted'))).toBe(false)
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
