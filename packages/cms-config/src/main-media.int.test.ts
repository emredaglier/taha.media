import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { User, Work } from './payload-types'
import { createTestSite, type TestSite } from './testing'

let site: TestSite
let editor: User
let coverId: number
let counter = 0

beforeAll(async () => {
  site = await createTestSite()
  editor = await site.createEditor()
  coverId = (await site.uploadImage(editor)).id
}, 30_000)

afterAll(async () => {
  await site?.close()
})

type MainMedia = NonNullable<Work['mainMedia']>

const save = (mainMedia: Partial<MainMedia> | undefined, status: 'draft' | 'published') =>
  site.cms.create({
    collection: 'works',
    data: {
      title: 'Ana Medya',
      slug: `ana-medya-${++counter}`,
      disciplines: ['kurgu'],
      year: 2026,
      cover: coverId,
      ...(mainMedia ? { mainMedia } : {}),
      _status: status,
    },
    draft: status === 'draft',
    depth: 0,
    user: editor,
    overrideAccess: false,
  })

const errorsOf = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return (error as { data: { errors: { path: string; message: string }[] } }).data.errors
  }
  throw new Error('expected the save to be refused')
}

const external = (url: string, poster: number | null = coverId): Partial<MainMedia> => ({
  kind: 'external',
  externalUrl: url,
  externalPoster: poster,
})

describe('publishing a Work without main media', () => {
  it('is refused, while a draft saves', async () => {
    expect(await errorsOf(save(undefined, 'published'))).toEqual([
      expect.objectContaining({
        path: 'mainMedia.kind',
        message: 'Ana medya türünü seçin: video, dış bağlantı veya görsel.',
      }),
    ])
    expect((await save(undefined, 'draft'))._status).toBe('draft')
  })

  it('is refused when the chosen kind has no content', async () => {
    expect(await errorsOf(save({ kind: 'video' }, 'published'))).toEqual([
      expect.objectContaining({ path: 'mainMedia.video', message: 'Ana videoyu seçin.' }),
    ])
    expect(await errorsOf(save({ kind: 'image' }, 'published'))).toEqual([
      expect.objectContaining({ path: 'mainMedia.image', message: 'Ana görseli seçin.' }),
    ])
    expect(await errorsOf(save({ kind: 'external' }, 'published'))).toEqual([
      expect.objectContaining({ path: 'mainMedia.externalUrl' }),
      expect.objectContaining({ path: 'mainMedia.externalPoster' }),
    ])
  })

  it('is refused when an update would empty it', async () => {
    const work = await save({ kind: 'image', image: coverId }, 'published')
    expect(
      await errorsOf(
        site.cms.update({
          collection: 'works',
          id: work.id,
          data: { mainMedia: { kind: 'image', image: null } },
          depth: 0,
          user: editor,
          overrideAccess: false,
        }),
      ),
    ).toEqual([expect.objectContaining({ path: 'mainMedia.image' })])
  })
})

describe('each kind', () => {
  it('publishes with an uploaded main Video', async () => {
    const video = await site.uploadVideo(editor, { use: 'main' })
    const work = await save({ kind: 'video', video: video.id }, 'published')
    expect(work.mainMedia).toMatchObject({ kind: 'video', video: video.id })
  })

  it('refuses a Video of another use, even as a draft', async () => {
    const loop = await site.uploadVideo(editor, { use: 'previewLoop' })
    for (const status of ['draft', 'published'] as const) {
      expect(await errorsOf(save({ kind: 'video', video: loop.id }, status))).toEqual([
        expect.objectContaining({ path: 'video' }),
      ])
    }
  })

  it('publishes with an Image', async () => {
    const work = await save({ kind: 'image', image: coverId }, 'published')
    expect(work.mainMedia).toMatchObject({ kind: 'image', image: coverId })
  })

  it('publishes an external link with its poster, storing provider and id', async () => {
    const work = await save(external('https://vimeo.com/76979871'), 'published')
    expect(work.mainMedia).toMatchObject({
      kind: 'external',
      externalUrl: 'https://vimeo.com/76979871',
      externalProvider: 'vimeo',
      externalId: '76979871',
      externalPoster: coverId,
    })
  })

  it('drops the fields of the previous kind when the kind changes', async () => {
    const video = await site.uploadVideo(editor, { use: 'main' })
    const work = await save({ kind: 'video', video: video.id }, 'published')
    const update = (mainMedia: Partial<MainMedia>) =>
      site.cms.update({
        collection: 'works',
        id: work.id,
        data: { mainMedia },
        depth: 0,
        user: editor,
        overrideAccess: false,
      })

    const switched = await update({ kind: 'image', image: coverId })
    expect(switched.mainMedia).toMatchObject({ kind: 'image', image: coverId, video: null })

    const toExternal = await update(external('https://youtu.be/dQw4w9WgXcQ'))
    expect(toExternal.mainMedia).toMatchObject({ kind: 'external', image: null, video: null })

    const back = await update({ kind: 'image', image: coverId })
    expect(back.mainMedia).toMatchObject({
      kind: 'image',
      externalUrl: null,
      externalProvider: null,
      externalId: null,
      externalPoster: null,
    })
  })
})

describe('external URLs', () => {
  const id = 'dQw4w9WgXcQ'
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', id],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=43s', 'youtube', id],
    ['https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ', 'youtube', id],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube', id],
    ['https://youtu.be/dQw4w9WgXcQ?t=90', 'youtube', id],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ?start=30', 'youtube', id],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'youtube', id],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube', id],
    ['  www.youtube.com/watch?v=dQw4w9WgXcQ  ', 'youtube', id],
    ['https://vimeo.com/76979871', 'vimeo', '76979871'],
    ['https://www.vimeo.com/76979871#t=30s', 'vimeo', '76979871'],
    ['https://vimeo.com/76979871?t=1m2s', 'vimeo', '76979871'],
    ['https://player.vimeo.com/video/76979871', 'vimeo', '76979871'],
    ['https://player.vimeo.com/video/76979871?h=abc123&autoplay=1', 'vimeo', '76979871'],
    ['https://vimeo.com/channels/staffpicks/76979871', 'vimeo', '76979871'],
  ])('%s parses to %s %s', async (url, provider, videoId) => {
    const work = await save(external(url), 'published')
    expect(work.mainMedia).toMatchObject({ externalProvider: provider, externalId: videoId })
  })

  it.each([
    'https://www.dailymotion.com/video/x7tgad0',
    'https://www.youtube.com/@tahamedia',
    'https://www.youtube.com/playlist?list=PL1234567890',
    'https://www.youtube.com/watch?v=short',
    'https://vimeo.com/tahamedia',
    'https://vimeo.com/showcase/123456',
    'https://example.com/https://vimeo.com/76979871',
    'https://notvimeo.com/76979871',
    'https://vimeo.com.evil.test/76979871',
    'javascript:alert(1)',
    'bu bir adres değil',
  ])('refuses %s in Turkish, drafts included', async (url) => {
    for (const status of ['draft', 'published'] as const) {
      expect(await errorsOf(save(external(url), status))).toEqual([
        expect.objectContaining({
          path: 'mainMedia.externalUrl',
          message: 'Bu adres tanınmadı. Bir Vimeo veya YouTube video adresi yapıştırın.',
        }),
      ])
    }
  })

  it('stores provider and id again when the URL changes', async () => {
    const work = await save(external('https://vimeo.com/76979871'), 'published')
    const updated = await site.cms.update({
      collection: 'works',
      id: work.id,
      data: { mainMedia: external('https://youtu.be/dQw4w9WgXcQ') },
      depth: 0,
      user: editor,
      overrideAccess: false,
    })
    expect(updated.mainMedia).toMatchObject({ externalProvider: 'youtube', externalId: id })
  })
})
