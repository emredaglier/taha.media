import { vi } from 'vitest'

// Every test file gets the in-memory `next/cache` (see next-cache-fake.ts). Files that never
// import `next/cache` are unaffected.
vi.mock('next/cache', () => import('./next-cache-fake'))

// `connection()` throws outside a request, which is where unit tests render the layout.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}))
