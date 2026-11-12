import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { User } from './payload-types'
import { createTestSite, type TestSite } from './testing'

let site: TestSite
let editor: User

beforeAll(async () => {
  site = await createTestSite()
  editor = await site.createEditor()
}, 60_000)

afterAll(async () => {
  await site?.close()
})

const saveSocial = (url: string) =>
  site.cms.updateGlobal({
    slug: 'site',
    data: { socials: [{ platform: 'Instagram', url }], _status: 'published' },
    user: editor,
    overrideAccess: false,
  })

describe('the Site socials', () => {
  it('refuses a bare address and saves a full http(s) URL', async () => {
    const error = (await saveSocial('instagram.com/taha').then(
      () => null,
      (e: unknown) => e,
    )) as { data?: { errors?: { message: string }[] } } | null
    expect(error?.data?.errors?.map((e) => e.message)).toEqual([
      'Adres http:// veya https:// ile başlayan tam bir bağlantı olmalı.',
    ])

    const saved = await saveSocial('https://instagram.com/taha')
    expect(saved.socials?.[0]?.url).toBe('https://instagram.com/taha')
  })
})
