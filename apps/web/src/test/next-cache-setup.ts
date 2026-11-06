import { vi } from 'vitest'

// Every test file gets the in-memory `next/cache` (see next-cache-fake.ts). Files that never
// import `next/cache` are unaffected.
vi.mock('next/cache', () => import('./next-cache-fake'))
