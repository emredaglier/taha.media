import { vi } from 'vitest'

// `useRouter` throws outside a mounted app router, so a test that renders the header (the site
// menu's links navigate with it) gets a stand-in. The rest of `next/navigation` stays real, and a
// file that mocks the module itself (SiteMenu.test, Room.test) overrides this.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))
