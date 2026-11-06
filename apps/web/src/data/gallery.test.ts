import { createTestSite, type TestSite } from '@taha/cms-config/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getGalleryItems } from './gallery'

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

beforeEach(async () => {
  await site.cms.delete({ collection: 'gallery', where: { id: { exists: true } } })
})

const save = (data: Record<string, unknown>) =>
  site.cms.create({
    collection: 'gallery',
    data: data as never,
    user: editor,
    overrideAccess: false,
  })

describe('the Gallery read', () => {
  it('is an empty list for an empty Gallery', async () => {
    expect(await getGalleryItems()).toEqual([])
  })

  it('lists every item newest first, then in the order the Editor dragged them to', async () => {
    const image = (await site.uploadImage(editor)).id
    const a = await save({ kind: 'image', image, caption: 'A' })
    await save({ kind: 'image', image, caption: 'B' })
    const c = await save({ kind: 'image', image, caption: 'C' })
    expect((await getGalleryItems()).map((item) => item.caption)).toEqual(['C', 'B', 'A'])

    // A drag rewrites the dragged item's position key: C and A swap places.
    const key = async (id: number) =>
      (await site.cms.findByID({ collection: 'gallery', id, depth: 0 }))._order
    const [keyA, keyC] = [await key(a.id), await key(c.id)]
    await site.cms.update({ collection: 'gallery', id: c.id, data: { _order: keyA } })
    await site.cms.update({ collection: 'gallery', id: a.id, data: { _order: keyC } })
    expect((await getGalleryItems()).map((item) => item.caption)).toEqual(['A', 'B', 'C'])
  })

  it('reads an image item with its sizes and the full-size file', async () => {
    const photo = await site.uploadImage(editor, {
      alt: 'Taha sette',
      width: 3000,
      height: 2000,
    })
    await save({ kind: 'image', image: photo.id, caption: 'Set günü', year: 2025 })
    const [item] = await getGalleryItems()

    expect(item).toMatchObject({
      kind: 'image',
      caption: 'Set günü',
      year: 2025,
      image: { id: photo.id, alt: 'Taha sette', width: 3000, height: 2000 },
    })
    const shown = item?.kind === 'image' ? item.image : undefined
    expect(shown?.srcset).toMatch(/\.webp \d+w/)
    // `src` is the medium size (1280 wide); the file to open is the largest (2560 for a 3000 px photo).
    expect(shown?.src).toMatch(/-1280x\d+\.webp$/)
    expect(shown?.fullSrc).toMatch(/-2560x\d+\.webp$/)
  })

  it('falls back to the original file when no size was generated', async () => {
    const small = await site.uploadImage(editor, { width: 600, height: 400 })
    await save({ kind: 'image', image: small.id })
    const [item] = await getGalleryItems()
    const stored = await site.cms.findByID({ collection: 'images', id: small.id, depth: 0 })
    const shown = item?.kind === 'image' ? item.image : undefined
    expect(shown?.fullSrc).toBe(stored.url)
    expect(shown?.fullSrc).not.toMatch(/-\d+x\d+\.webp$/)
  })

  it('reads a loop item with its video, dimensions and poster', async () => {
    const poster = await site.uploadImage(editor, { alt: 'Döngü kapağı' })
    const loop = await site.uploadVideo(editor, { use: 'gallery', poster: poster.id })
    await save({ kind: 'loop', video: loop.id, caption: 'Döngü' })
    const [item] = await getGalleryItems()

    expect(item).toMatchObject({
      kind: 'loop',
      caption: 'Döngü',
      year: null,
      video: {
        id: loop.id,
        width: 640,
        height: 360,
        hasAudio: false,
        poster: { id: poster.id, alt: 'Döngü kapağı' },
      },
    })
    expect(item?.kind === 'loop' && item.video.src).toBe(loop.url)
    expect(item).not.toHaveProperty('image')
  })

  it('reads an unset caption or year as null', async () => {
    await save({ kind: 'image', image: (await site.uploadImage(editor)).id, caption: '   ' })
    const [item] = await getGalleryItems()
    expect(item).toMatchObject({ caption: null, year: null })
  })
})
