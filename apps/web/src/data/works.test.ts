import type { Discipline } from '@taha/cms-config'
import { createTestSite, type TestSite } from '@taha/cms-config/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getWorkBySlug, getWorks } from './works'

let site: TestSite

beforeAll(async () => {
  site = await createTestSite()
  // web opens the same file the way it does in production: from its environment.
  Object.assign(process.env, site.webEnv)

  const editor = await site.createEditor()
  type Fields = { title: string; slug: string; disciplines?: Discipline[] }
  const save = (data: Fields, status: 'draft' | 'published') =>
    site.cms.create({
      collection: 'works',
      data: { disciplines: ['kurgu'], year: 2025, ...data, _status: status },
      draft: status === 'draft',
      user: editor,
      overrideAccess: false,
    })

  await save({ title: 'Yayında', slug: 'yayinda', disciplines: ['motion', 'grafik'] }, 'published')
  await save({ title: 'Taslak', slug: 'taslak' }, 'draft')
  // Published once, then edited as a draft: the site keeps showing the published version.
  const edited = await save({ title: 'İlk hali', slug: 'duzenlenen' }, 'published')
  await site.cms.update({
    collection: 'works',
    id: edited.id,
    data: { title: 'Yayınlanmamış düzenleme' },
    draft: true,
    user: editor,
    overrideAccess: false,
  })
}, 30_000)

afterAll(async () => {
  await site?.close()
})

describe('the Works list', () => {
  it('returns published Works only, as they were published', async () => {
    const works = await getWorks()
    expect(works.map((work) => work.title).sort()).toEqual(['Yayında', 'İlk hali'].sort())
  })
})

describe('a Work by slug', () => {
  it('returns a published Work', async () => {
    expect(await getWorkBySlug('yayinda')).toMatchObject({
      title: 'Yayında',
      slug: 'yayinda',
      disciplines: ['motion', 'grafik'],
      year: 2025,
    })
  })

  it('returns the published version of a Work with an unpublished edit', async () => {
    expect((await getWorkBySlug('duzenlenen'))?.title).toBe('İlk hali')
  })

  it('is null for a draft and for an unknown slug', async () => {
    expect(await getWorkBySlug('taslak')).toBeNull()
    expect(await getWorkBySlug('yok-boyle-bir-is')).toBeNull()
  })
})
