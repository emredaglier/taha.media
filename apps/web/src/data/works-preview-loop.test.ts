import { createTestSite, type TestSite } from '@taha/cms-config/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getWorkBySlug } from './works'

let site: TestSite

beforeAll(async () => {
  site = await createTestSite()
  Object.assign(process.env, site.webEnv)
}, 60_000)

afterAll(async () => {
  await site?.close()
})

describe('a Work’s preview loop', () => {
  it('is read with width, height, duration, audio and poster; a Work without one reads null', async () => {
    const editor = await site.createEditor()
    const loop = await site.uploadVideo(editor, { use: 'previewLoop', file: 'portrait.mp4' })
    const save = async (slug: string, previewLoop?: number) =>
      site.cms.create({
        collection: 'works',
        data: {
          title: slug,
          slug,
          disciplines: ['motion'],
          year: 2026,
          cover: (await site.uploadImage(editor)).id,
          ...(previewLoop ? { previewLoop } : {}),
          _status: 'published',
        },
        user: editor,
        overrideAccess: false,
      })
    await save('donguli', loop.id)
    await save('donugsuz')

    const withLoop = await getWorkBySlug('donguli')
    if (withLoop.kind !== 'work') throw new Error('expected a work')
    expect(withLoop.work.previewLoop).toMatchObject({
      width: 360,
      height: 640,
      hasAudio: false,
      src: loop.url,
      poster: { alt: 'Bir deneme fotoğrafı', width: 3000 },
    })
    expect(withLoop.work.previewLoop?.duration).toBeCloseTo(2, 1)

    const without = await getWorkBySlug('donugsuz')
    if (without.kind !== 'work') throw new Error('expected a work')
    expect(without.work.previewLoop).toBeNull()
  })
})
