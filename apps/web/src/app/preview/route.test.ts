import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Next's request-scoped APIs only work inside a running server (no test starts Next, CLAUDE.md):
// draft mode is recorded, and redirect/notFound throw what the test can read.
const draft = vi.hoisted(() => ({ enabled: false }))
vi.mock('next/headers', () => ({
  draftMode: async () => ({
    get isEnabled() {
      return draft.enabled
    },
    enable: () => {
      draft.enabled = true
    },
    disable: () => {
      draft.enabled = false
    },
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw { redirect: url }
  },
  notFound: () => {
    throw { notFound: true }
  },
}))

/** Loads the route the way an instance starts: with or without PREVIEW=1. */
async function startInstance(preview: boolean) {
  vi.resetModules()
  vi.stubEnv('PREVIEW', preview ? '1' : '')
  const { GET } = await import('./route')
  return async (query: string): Promise<unknown> => {
    try {
      return await GET(new Request(`http://preview.test/preview${query}`))
    } catch (thrown) {
      return thrown
    }
  }
}

beforeEach(() => {
  draft.enabled = false
})
afterEach(() => vi.unstubAllEnvs())

describe('GET /preview (the admin preview link)', () => {
  it('turns on per-request rendering and opens the page on the preview instance', async () => {
    const open = await startInstance(true)
    expect(await open('?path=%2Fisler%2Fbir-is')).toEqual({ redirect: '/isler/bir-is' })
    expect(draft.enabled).toBe(true)
    expect(await open('?path=%2F')).toEqual({ redirect: '/' })
    expect(await open('?path=%2Fhakkimda')).toEqual({ redirect: '/hakkimda' })
  })

  it('does not exist on the public instance, so no request can turn draft rendering on there', async () => {
    const open = await startInstance(false)
    expect(await open('?path=%2Fisler%2Fbir-is')).toEqual({ notFound: true })
    expect(draft.enabled).toBe(false)
  })

  it('refuses a missing path or one that leaves the site', async () => {
    const open = await startInstance(true)
    for (const query of [
      '',
      '?path=',
      '?path=isler',
      '?path=%2F%2Fevil.test',
      '?path=%2F%5Cevil.test',
      '?path=https%3A%2F%2Fevil.test%2F',
    ]) {
      const response = await open(query)
      expect(response, query).toBeInstanceOf(Response)
      expect((response as Response).status, query).toBe(400)
    }
    expect(draft.enabled).toBe(false)
  })
})
