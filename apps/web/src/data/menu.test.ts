import { connection } from 'next/server'
import { createTestSite, type TestSite } from '@taha/cms-config/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { getGalleryItems } from './gallery'
import { getMenuMedia } from './menu'

// `connection()` only works inside a request; here it records that the render went dynamic.
vi.mock('next/server', () => ({ connection: vi.fn(async () => {}) }))
vi.mock('./gallery', async (importOriginal) => {
  const real = await importOriginal<typeof import('./gallery')>()
  return { ...real, getGalleryItems: vi.fn(real.getGalleryItems) }
})

let site: TestSite
let editor: Awaited<ReturnType<TestSite['createEditor']>>

beforeAll(async () => {
  site = await createTestSite()
  Object.assign(process.env, site.webEnv)
  editor = await site.createEditor()
}, 60_000)

afterAll(async () => {
  await site?.close()
})

const writeAbout = (portrait: number | null) =>
  site.cms.updateGlobal({
    slug: 'about',
    data: { portrait, _status: 'published' } as never,
    user: editor,
    overrideAccess: false,
  })

beforeEach(async () => {
  await site.cms.delete({ collection: 'gallery', where: { id: { exists: true } } })
  await site.cms.delete({ collection: 'works', where: { id: { exists: true } } })
  await writeAbout(null)
})

const saveWork = async (slug: string, previewLoop: number, featuredOrder: number) =>
  site.cms.create({
    collection: 'works',
    data: {
      title: slug,
      slug,
      disciplines: ['motion'],
      year: 2026,
      featured: true,
      featuredOrder,
      cover: (await site.uploadImage(editor)).id,
      mainMedia: { kind: 'image', image: (await site.uploadImage(editor)).id },
      previewLoop,
      _status: 'published',
    },
    user: editor,
    overrideAccess: false,
  })

describe('the menu media read', () => {
  it('is all nulls for empty content', async () => {
    expect(await getMenuMedia()).toEqual({ isler: null, galeri: null, hakkimda: null })
  })

  it('picks the first Featured Work loop, the first Gallery item and the portrait', async () => {
    const second = await site.uploadVideo(editor, { use: 'previewLoop' })
    const first = await site.uploadVideo(editor, { use: 'previewLoop' })
    await saveWork('ikinci', second.id, 2)
    await saveWork('birinci', first.id, 1)
    const photo = await site.uploadImage(editor)
    const portrait = await site.uploadImage(editor, { alt: 'Taha portresi' })
    for (const caption of ['A', 'B']) {
      await site.cms.create({
        collection: 'gallery',
        data: { kind: 'image', image: photo.id, caption } as never,
        user: editor,
        overrideAccess: false,
      })
    }
    await writeAbout(portrait.id)

    const media = await getMenuMedia()
    expect(media.isler?.src).toBe(first.url)
    expect(media.galeri).toMatchObject({ kind: 'image', caption: 'B' }) // newest first
    expect(media.hakkimda?.alt).toBe('Taha portresi')
  })

  it('is all nulls when a read throws', async () => {
    vi.mocked(getGalleryItems).mockRejectedValueOnce(new Error('no database'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await getMenuMedia()).toEqual({ isler: null, galeri: null, hakkimda: null })
    expect(log).toHaveBeenCalled() // logged, not silent
    expect(connection).toHaveBeenCalled() // the render goes dynamic, so grey is not baked in
    log.mockRestore()
  })
})
