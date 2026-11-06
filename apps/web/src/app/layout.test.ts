import { afterEach, expect, it, vi } from 'vitest'

/** The root layout's metadata, as an instance started with or without PREVIEW=1 sees it. */
async function layoutMetadata(preview: boolean) {
  vi.resetModules()
  vi.stubEnv('PREVIEW', preview ? '1' : '')
  return (await import('./layout')).metadata
}

afterEach(() => vi.unstubAllEnvs())

it('tells robots not to index or follow any preview page', async () => {
  expect((await layoutMetadata(true)).robots).toEqual({ index: false, follow: false })
})

it('leaves robots alone on the public instance', async () => {
  expect((await layoutMetadata(false)).robots).toBeUndefined()
})
