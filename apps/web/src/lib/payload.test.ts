import type { Client } from '@libsql/client'
import { createTestSite, type TestSite } from '@taha/cms-config/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getWebPayload } from './payload'

let site: TestSite

beforeAll(async () => {
  site = await createTestSite()
  Object.assign(process.env, site.webEnv)
  const editor = await site.createEditor()
  await site.cms.create({
    collection: 'works',
    data: { title: 'cms yazdı', slug: 'cms-yazdi', disciplines: ['kurgu'], year: 2025 },
    user: editor,
  })
}, 30_000)

afterAll(async () => {
  await site?.close()
})

describe("web's database connection (ADR-0001, ADR-0003)", () => {
  it('reads what cms wrote', async () => {
    const web = await getWebPayload()
    const { docs } = await web.find({ collection: 'works', draft: false })
    expect(docs.map((doc) => doc.title)).toEqual(['cms yazdı'])
  })

  it('fails any write through the raw connection, including after a transaction', async () => {
    const web = await getWebPayload()
    const client = (web.db as unknown as { client: Client }).client
    await expect(client.execute('UPDATE works SET year = 1999')).rejects.toThrow(/readonly/i)
    const tx = await client.transaction('read')
    await tx.commit()
    await expect(client.execute('DELETE FROM users')).rejects.toThrow(/readonly/i)
    await expect(client.execute('CREATE TABLE sneaky (id INTEGER)')).rejects.toThrow(/readonly/i)
  })

  it('fails a Local API write even with access rules bypassed', async () => {
    const web = await getWebPayload()
    await expect(
      web.create({
        collection: 'works',
        data: { title: 'web yazdı', slug: 'web-yazdi', disciplines: ['kurgu'], year: 2025 },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
    const { totalDocs } = await site.cms.count({ collection: 'works' })
    expect(totalDocs).toBe(1)
  })
})
