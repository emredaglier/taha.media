import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Discipline } from './disciplines'
import { createTestSite, type TestSite } from './testing'

let site: TestSite
let coverId: number

beforeAll(async () => {
  site = await createTestSite()
  coverId = (await site.uploadImage(await site.createEditor())).id
}, 30_000)

afterAll(async () => {
  await site?.close()
})

const work = {
  title: 'Kış Reklamı',
  slug: 'kis-reklami',
  disciplines: ['kurgu'] as Discipline[],
  year: 2025,
}

describe('an Editor', () => {
  it('logs in, saves a Work as a draft, then publishes it', async () => {
    const editor = await site.createEditor({
      email: 'taha@example.com',
      password: 'uzun-bir-sifre',
    })
    const { token } = await site.cms.login({
      collection: 'users',
      data: { email: 'taha@example.com', password: 'uzun-bir-sifre' },
    })
    expect(token).toBeTruthy()

    const cover = await site.uploadImage(editor)
    const draft = await site.cms.create({
      collection: 'works',
      data: { ...work, cover: cover.id, mainMedia: { kind: 'image', image: cover.id } },
      draft: true,
      user: editor,
      overrideAccess: false,
    })
    expect(draft._status).toBe('draft')

    const published = await site.cms.update({
      collection: 'works',
      id: draft.id,
      data: { _status: 'published' },
      user: editor,
      overrideAccess: false,
    })
    expect(published).toMatchObject({ ...work, _status: 'published' })
  })
})

describe('a Work with no Discipline', () => {
  // What the admin shows under the Disciplines field.
  const refusal = {
    data: { errors: [{ path: 'disciplines', message: 'En az bir disiplin seçin.' }] },
  }
  const noDiscipline = { ...work, slug: 'disiplinsiz', disciplines: [], cover: coverId }

  it('is refused when published', async () => {
    const editor = await site.createEditor()
    await expect(
      site.cms.create({
        collection: 'works',
        data: { ...noDiscipline, _status: 'published' },
        user: editor,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject(refusal)
  })

  it('is refused as a draft too', async () => {
    const editor = await site.createEditor()
    await expect(
      site.cms.create({
        collection: 'works',
        data: noDiscipline,
        draft: true,
        user: editor,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject(refusal)
  })

  it('is refused when an existing Work loses its last Discipline', async () => {
    const editor = await site.createEditor()
    const saved = await site.cms.create({
      collection: 'works',
      data: { ...work, slug: 'sonradan-bosaltilan', cover: coverId },
      draft: true,
      user: editor,
      overrideAccess: false,
    })
    await expect(
      site.cms.update({
        collection: 'works',
        id: saved.id,
        data: { disciplines: [] },
        draft: true,
        user: editor,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject(refusal)
  })
})

describe('Editors', () => {
  it('all have the same rights: a new Editor can edit and delete another Editor’s Work and account', async () => {
    const first = await site.createEditor()
    const second = await site.cms.create({
      collection: 'users',
      data: { email: 'yeni@example.com', password: 'correct-horse-battery' },
      user: first,
      overrideAccess: false,
    })
    const created = await site.cms.create({
      collection: 'works',
      data: { ...work, slug: 'ortak', cover: coverId },
      draft: true,
      user: first,
      overrideAccess: false,
    })

    const edited = await site.cms.update({
      collection: 'works',
      id: created.id,
      data: { year: 2024 },
      draft: true,
      user: second,
      overrideAccess: false,
    })
    expect(edited.year).toBe(2024)
    await site.cms.delete({
      collection: 'works',
      id: created.id,
      user: second,
      overrideAccess: false,
    })
    await site.cms.delete({
      collection: 'users',
      id: first.id,
      user: second,
      overrideAccess: false,
    })
    const { totalDocs } = await site.cms.count({
      collection: 'users',
      where: { id: { equals: first.id } },
    })
    expect(totalDocs).toBe(0)
  })

  it('are the only ones who can create Works or accounts', async () => {
    await expect(
      site.cms.create({
        collection: 'works',
        data: { ...work, slug: 'anonim', cover: coverId },
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      site.cms.create({
        collection: 'users',
        data: { email: 'kayit@example.com', password: 'correct-horse-battery' },
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })
})
