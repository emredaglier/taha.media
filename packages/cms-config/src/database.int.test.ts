import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestSite, type TestSite } from './testing'

let site: TestSite

beforeAll(async () => {
  site = await createTestSite()
}, 30_000)

afterAll(async () => {
  await site?.close()
})

async function pragma(name: string) {
  const result = await site.cmsClient().execute(`PRAGMA ${name};`)
  return Object.values(result.rows[0] ?? {})[0]
}

describe('the cms database (ADR-0003)', () => {
  it('builds its schema from the committed migrations and runs in WAL mode', async () => {
    expect(await pragma('journal_mode')).toBe('wal')
    const { totalDocs } = await site.cms.count({ collection: 'works' })
    expect(totalDocs).toBe(0)
  })

  // libsql opens a new connection after every transaction; the settings must follow it.
  it('keeps busy_timeout and foreign_keys on after a transaction', async () => {
    const tx = await site.cmsClient().transaction('write')
    await tx.commit()
    expect(await pragma('busy_timeout')).toBe(5000)
    expect(await pragma('foreign_keys')).toBe(1)
  })
})
