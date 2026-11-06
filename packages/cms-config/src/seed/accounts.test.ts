import { describe, expect, it } from 'vitest'

import { accountsFromEnv } from './accounts'

describe('accountsFromEnv', () => {
  it('reads the developer and Taha', () => {
    expect(
      accountsFromEnv({
        SEED_DEVELOPER_EMAIL: 'dev@example.com',
        SEED_DEVELOPER_PASSWORD: 'a',
        SEED_TAHA_EMAIL: 'taha@example.com',
        SEED_TAHA_PASSWORD: 'b',
      }),
    ).toEqual([
      { email: 'dev@example.com', password: 'a' },
      { email: 'taha@example.com', password: 'b' },
    ])
  })

  it('names every missing variable', () => {
    expect(() => accountsFromEnv({ SEED_TAHA_EMAIL: 'x@example.com' })).toThrow(
      /SEED_DEVELOPER_EMAIL, SEED_DEVELOPER_PASSWORD, SEED_TAHA_PASSWORD/,
    )
  })
})
