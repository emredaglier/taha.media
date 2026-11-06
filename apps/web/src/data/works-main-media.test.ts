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

describe('a Work’s main media', () => {
  it('is read as a union by kind, with only the fields of its kind', async () => {
    const editor = await site.createEditor()
    const cover = await site.uploadImage(editor)
    const picture = await site.uploadImage(editor, { alt: 'Ana görsel', width: 2000, height: 1000 })
    const poster = await site.uploadImage(editor, { alt: 'Kapak görseli' })
    const video = await site.uploadVideo(editor, { use: 'main', file: 'with-audio.mp4' })
    const publish = (
      slug: string,
      mainMedia:
        | { kind: 'video'; video: number }
        | { kind: 'external'; externalUrl: string; externalPoster: number }
        | { kind: 'image'; image: number },
    ) =>
      site.cms.create({
        collection: 'works',
        data: {
          title: slug,
          slug,
          disciplines: ['kurgu'],
          year: 2026,
          cover: cover.id,
          mainMedia,
          _status: 'published',
        },
        user: editor,
        overrideAccess: false,
      })
    await publish('video-is', { kind: 'video', video: video.id })
    await publish('dis-is', {
      kind: 'external',
      externalUrl: 'https://youtu.be/dQw4w9WgXcQ?t=5',
      externalPoster: poster.id,
    })
    await publish('gorsel-is', { kind: 'image', image: picture.id })

    const read = async (slug: string) => {
      const result = await getWorkBySlug(slug)
      if (result.kind !== 'work') throw new Error('expected a work')
      return result.work.mainMedia
    }

    const main = await read('video-is')
    if (main.kind !== 'video') throw new Error('expected video')
    expect(main.video).toMatchObject({
      id: video.id,
      hasAudio: true,
      poster: { id: expect.any(Number) },
    })
    expect(Object.keys(main).sort()).toEqual(['kind', 'video'])

    const external = await read('dis-is')
    expect(external).toMatchObject({
      kind: 'external',
      provider: 'youtube',
      id: 'dQw4w9WgXcQ',
      url: 'https://youtu.be/dQw4w9WgXcQ?t=5',
      poster: { id: poster.id, alt: 'Kapak görseli' },
    })

    const image = await read('gorsel-is')
    expect(image).toMatchObject({ kind: 'image', image: { id: picture.id, alt: 'Ana görsel' } })
  })
})
