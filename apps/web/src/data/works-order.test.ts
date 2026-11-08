import type { Discipline } from '@taha/cms-config'
import { createTestSite, type TestSite } from '@taha/cms-config/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getFeaturedWorks, getWorks } from './works'

let site: TestSite
let editor: Awaited<ReturnType<TestSite['createEditor']>>
let coverId: number
let loopId: number

beforeAll(async () => {
  site = await createTestSite()
  Object.assign(process.env, site.webEnv)
  editor = await site.createEditor()
  coverId = (await site.uploadImage(editor)).id
  // Publishing a featured Work needs a 16:9 Preview loop (#43).
  loopId = (await site.uploadVideo(editor, { use: 'previewLoop' })).id
}, 30_000)

afterAll(async () => {
  await site?.close()
})

type Fields = {
  title: string
  year?: number
  disciplines?: Discipline[]
  featured?: boolean
  featuredOrder?: number
  createdAt?: string
}

const save = (data: Fields, status: 'draft' | 'published' = 'published') =>
  site.cms.create({
    collection: 'works',
    data: {
      disciplines: ['kurgu'],
      year: 2025,
      cover: coverId,
      mainMedia: { kind: 'image', image: coverId },
      ...(data.featured ? { previewLoop: loopId } : {}),
      slug: data.title.toLowerCase().replaceAll(' ', '-'),
      ...data,
      _status: status,
    },
    draft: status === 'draft',
    user: editor,
    overrideAccess: false,
  })

const clearAll = async () => {
  await site.cms.delete({ collection: 'works', where: { id: { exists: true } } })
}

const titles = async (options?: Parameters<typeof getWorks>[0]) =>
  (await getWorks(options)).map((work) => work.title)

describe('the Works list order', () => {
  it('follows the drag order set in the admin', async () => {
    await clearAll()
    const a = await save({ title: 'A' })
    await save({ title: 'B' })
    const c = await save({ title: 'C' })
    expect(await titles()).toEqual(['A', 'B', 'C'])

    // A drag in the list rewrites the dragged Work's position key: C and A swap places.
    const { docs } = await site.cms.find({ collection: 'works', limit: 0, pagination: false })
    const position = (title: string) => docs.find((doc) => doc.title === title)?._order
    await site.cms.update({ collection: 'works', id: c.id, data: { _order: position('A') } })
    await site.cms.update({ collection: 'works', id: a.id, data: { _order: position('C') } })
    expect(await titles()).toEqual(['C', 'B', 'A'])
  })

  it('puts Works without a position after positioned ones: year desc, then created desc', async () => {
    await clearAll()
    await save({ title: 'Positioned', year: 2000 })
    await save({ title: 'Old', year: 2020, createdAt: '2026-01-01T00:00:00.000Z' })
    await save({ title: 'New 2024 late', year: 2024, createdAt: '2026-03-01T00:00:00.000Z' })
    await save({ title: 'New 2024 early', year: 2024, createdAt: '2026-02-01T00:00:00.000Z' })
    await save({ title: 'Newest', year: 2025, createdAt: '2026-01-15T00:00:00.000Z' })
    // Works created before ordering existed have no position.
    await site.cmsClient().execute("UPDATE works SET _order = NULL WHERE slug != 'positioned'")

    expect(await titles()).toEqual([
      'Positioned',
      'Newest',
      'New 2024 late',
      'New 2024 early',
      'Old',
    ])
  })
})

describe('the featured Works', () => {
  it('returns featured, published Works by featured order', async () => {
    await clearAll()
    await save({ title: 'Second', featured: true, featuredOrder: 2 })
    await save({ title: 'First', featured: true, featuredOrder: 1 })
    await save({ title: 'Not featured' })
    await save({ title: 'Featured draft', featured: true, featuredOrder: 0 }, 'draft')
    await save({ title: 'Unplaced', featured: true })

    expect((await getFeaturedWorks()).map((work) => work.title)).toEqual([
      'First',
      'Second',
      'Unplaced',
    ])
  })

  it('saves with any number of featured Works: the warning never blocks', async () => {
    await clearAll()
    const only = await save({ title: 'Only one', featured: true, featuredOrder: 1 })
    expect(only.featured).toBe(true)
    for (let i = 0; i < 9; i++) await save({ title: `Extra ${i}`, featured: true })
    expect(await getFeaturedWorks()).toHaveLength(10)
  })
})

describe('the Discipline filter', () => {
  it('returns the Works that have the Discipline, for each Discipline', async () => {
    await clearAll()
    await save({ title: 'Edit', disciplines: ['kurgu'] })
    await save({ title: 'Edit and motion', disciplines: ['kurgu', 'motion'] })
    await save({ title: 'Brand', disciplines: ['grafik'] })

    expect(await titles({ discipline: 'kurgu' })).toEqual(['Edit', 'Edit and motion'])
    expect(await titles({ discipline: 'motion' })).toEqual(['Edit and motion'])
    expect(await titles({ discipline: 'grafik' })).toEqual(['Brand'])
    expect(await titles()).toHaveLength(3)
  })

  it('rejects an unknown Discipline', async () => {
    await expect(getWorks({ discipline: 'ses' as Discipline })).rejects.toThrow(/ses/)
  })
})
