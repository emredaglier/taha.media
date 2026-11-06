import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Discipline } from './disciplines'
import type { User } from './payload-types'
import { createTestSite, TEST_MEDIA_ORIGIN, videoFixture, type TestSite } from './testing'
import type { VideoUse } from './video-limits'

let site: TestSite
let editor: User

beforeAll(async () => {
  site = await createTestSite()
  editor = await site.createEditor()
}, 60_000)

afterAll(async () => {
  await site?.close()
})

/** A valid MP4 grown past a size cap by a trailing `free` box (ignored by every player). */
function padded(fixture: string, totalBytes: number): Buffer {
  const base = videoFixture(fixture)
  const free = Buffer.alloc(totalBytes - base.length)
  free.writeUInt32BE(free.length, 0)
  free.write('free', 4, 'latin1')
  return Buffer.concat([base, free])
}

/** The message the Editor reads. */
const refusal = async (promise: Promise<unknown>): Promise<string> => {
  const error = (await promise.then(
    () => {
      throw new Error('Expected the upload to be refused.')
    },
    (e: unknown) => e,
  )) as { data?: { errors?: { message: string }[] }; message: string }
  return error.data?.errors?.map((e) => e.message).join(' | ') ?? error.message
}

describe('reading the MP4 header', () => {
  // Expected values come from ffprobe on the committed fixtures, not from the reader.
  it.each([
    ['loop-ok.mp4', 640, 360, 2, false],
    ['portrait.mp4', 360, 640, 2, false],
    ['with-audio.mp4', 640, 360, 2, true],
    ['hd-1080.mp4', 1920, 1080, 1, false],
  ] as const)('stores width, height, duration and audio of %s', async (file, w, h, secs, audio) => {
    // main allows 1080p and audio, so every fixture here is accepted.
    const video = await site.uploadVideo(editor, { use: 'main', file })
    expect(video).toMatchObject({ width: w, height: h, hasAudio: audio, codec: 'avc1' })
    expect(video.duration).toBeCloseTo(secs, 1)
  })

  it('stores the file on R2 under a public URL with the immutable header', async () => {
    const before = site.s3.puts().length
    const video = await site.uploadVideo(editor, { use: 'previewLoop', name: 'ayni.mp4' })
    const again = await site.uploadVideo(editor, { use: 'previewLoop', name: 'ayni.mp4' })
    expect(video.url?.startsWith(`${TEST_MEDIA_ORIGIN}/`)).toBe(true)
    expect(video.filename).not.toBe(again.filename)
    const puts = site.s3.puts().slice(before)
    const stored = puts.filter((p) => p.key === video.filename)
    expect(stored).toHaveLength(1)
    expect(stored[0]?.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(stored[0]?.headers['content-type']).toBe('video/mp4')
  })
})

describe('refusals', () => {
  it('too long, naming the limit and the actual length', async () => {
    const loop = await refusal(
      site.uploadVideo(editor, { use: 'previewLoop', file: 'long-12s.mp4' }),
    )
    expect(loop).toBe('Süre en fazla 10 sn olabilir; bu videonun süresi 12 sn.')
    const reel = await refusal(site.uploadVideo(editor, { use: 'showreel', file: 'long-35s.mp4' }))
    expect(reel).toBe('Süre en fazla 30 sn olabilir; bu videonun süresi 35 sn.')
    const main = await refusal(site.uploadVideo(editor, { use: 'main', file: 'long-200s.mp4' }))
    expect(main).toBe('Süre en fazla 3 dk olabilir; bu videonun süresi 3 dk 20 sn.')
  })

  it('too high a resolution', async () => {
    const loop = await refusal(
      site.uploadVideo(editor, { use: 'previewLoop', file: 'hd-1080.mp4' }),
    )
    expect(loop).toBe('Çözünürlük en fazla 720p (1280×720) olabilir; bu video 1920×1080.')
    const main = await refusal(site.uploadVideo(editor, { use: 'main', file: 'uhd-1440.mp4' }))
    expect(main).toBe('Çözünürlük en fazla 1080p (1920×1080) olabilir; bu video 2560×1440.')
  })

  it('audio in a loop', async () => {
    const message = await refusal(
      site.uploadVideo(editor, { use: 'showreel', file: 'with-audio.mp4' }),
    )
    expect(message).toBe('Bu kullanımda video sessiz olmalı; bu videoda ses kanalı var.')
  })

  it('the wrong codec', async () => {
    const message = await refusal(site.uploadVideo(editor, { use: 'main', file: 'hevc.mp4' }))
    expect(message).toBe('Video H.264 olmalı; bu videonun kodeği hvc1.')
  })

  it('too large a file', async () => {
    const loop = await refusal(
      site.uploadVideo(editor, { use: 'previewLoop', file: padded('loop-ok.mp4', 5_400_000) }),
    )
    expect(loop).toBe('Dosya boyutu en fazla 4 MB olabilir; bu dosya 5,1 MB.')
    const main = await refusal(
      site.uploadVideo(editor, { use: 'main', file: padded('loop-ok.mp4', 64_000_000) }),
    )
    expect(main).toBe('Dosya boyutu en fazla 60 MB olabilir; bu dosya 61,0 MB.')
  })

  it('a file that is not an MP4, whatever its name or declared type', async () => {
    const text = Buffer.from('Merhaba, bu bir video değil.')
    const message = await refusal(
      site.uploadVideo(editor, { use: 'main', file: text, name: 'klip.mp4' }),
    )
    expect(message).toBe('Dosya bir MP4 videosu değil. Lütfen H.264 MP4 olarak dışa aktarın.')
    await expect(
      site.uploadVideo(editor, { use: 'main', file: text, mimetype: 'text/plain', name: 'a.txt' }),
    ).rejects.toThrow()
  })

  it('stores nothing when refused', async () => {
    const poster = (await site.uploadImage(editor)).id
    const before = site.s3.puts().length
    await site
      .uploadVideo(editor, { use: 'previewLoop', file: 'hd-1080.mp4', poster })
      .catch(() => null)
    expect(site.s3.puts().length).toBe(before)
  })

  it('re-checks the stored video when its use changes', async () => {
    const video = await site.uploadVideo(editor, { use: 'main', file: 'with-audio.mp4' })
    const message = await refusal(
      site.cms.update({
        collection: 'videos',
        id: video.id,
        data: { use: 'previewLoop' },
        user: editor,
        overrideAccess: false,
      }),
    )
    expect(message).toBe('Bu kullanımda video sessiz olmalı; bu videoda ses kanalı var.')
  })
})

describe('the poster', () => {
  it('is required to save a Video', async () => {
    const data = videoFixture('loop-ok.mp4')
    await expect(
      site.cms.create({
        collection: 'videos',
        data: { use: 'previewLoop' } as never,
        file: { data, mimetype: 'video/mp4', name: 'a.mp4', size: data.length },
        user: editor,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })
})

describe('a Work’s preview loop', () => {
  const work = {
    title: 'Döngülü İş',
    slug: 'dongulu-is',
    disciplines: ['motion'] as Discipline[],
    year: 2026,
  }
  const save = async (previewLoop: number, draft = false) =>
    site.cms.create({
      collection: 'works',
      data: {
        ...work,
        slug: `is-${previewLoop}-${draft}`,
        cover: (await site.uploadImage(editor)).id,
        previewLoop,
      },
      draft,
      user: editor,
      overrideAccess: false,
    })

  it('accepts a previewLoop Video, and reads back with its poster', async () => {
    const loop = await site.uploadVideo(editor, { use: 'previewLoop' })
    const saved = await save(loop.id)
    const read = await site.cms.findByID({
      collection: 'works',
      id: saved.id,
      depth: 2,
      user: editor,
      overrideAccess: false,
    })
    const previewLoop = read.previewLoop as { width: number; poster: { id: number } }
    expect(previewLoop.width).toBe(640)
    expect(typeof previewLoop.poster).toBe('object')
  })

  it.each(['showreel', 'main'] as const)('refuses a %s Video, even in a draft', async (use) => {
    const wrong = await site.uploadVideo(editor, { use })
    for (const draft of [false, true]) {
      const message = await refusal(save(wrong.id, draft))
      expect(message).toBe(
        'Önizleme döngüsü yalnızca “Önizleme döngüsü” kullanımlı bir video olabilir.',
      )
    }
  })
})

describe('changing a Video’s use', () => {
  const changeUse = (id: number, use: 'previewLoop' | 'showreel') =>
    site.cms.update({
      collection: 'videos',
      id,
      data: { use },
      user: editor,
      overrideAccess: false,
    })

  const createWork = async (title: string, previewLoop: number, draft: boolean) =>
    site.cms.create({
      collection: 'works',
      data: {
        title,
        slug: `kullanim-${previewLoop}`,
        disciplines: ['motion'],
        year: 2026,
        cover: (await site.uploadImage(editor)).id,
        mainMedia: { kind: 'video', video: (await site.uploadVideo(editor, { use: 'main' })).id },
        previewLoop,
        _status: draft ? 'draft' : 'published',
      },
      draft,
      user: editor,
      overrideAccess: false,
    })

  // loop-ok.mp4 fits every use's caps, so only the references can stand in the way.
  it('is refused while a Work uses it, naming the Work', async () => {
    const loop = await site.uploadVideo(editor, { use: 'previewLoop' })
    await createWork('Yayındaki İş', loop.id, false)
    expect(await refusal(changeUse(loop.id, 'showreel'))).toBe(
      'Bu video kullanıldığı için kullanımı değiştirilemez: “Yayındaki İş” işi. Önce videoyu oradan kaldırın.',
    )
  })

  it('is refused while only a draft uses it', async () => {
    const loop = await site.uploadVideo(editor, { use: 'previewLoop' })
    await createWork('Taslak İş', loop.id, true)
    expect(await refusal(changeUse(loop.id, 'showreel'))).toBe(
      'Bu video kullanıldığı için kullanımı değiştirilemez: “Taslak İş” işi. Önce videoyu oradan kaldırın.',
    )
  })

  it('is refused while the Site uses it', async () => {
    const showreel = await site.uploadVideo(editor, { use: 'showreel' })
    await site.cms.updateGlobal({
      slug: 'site',
      data: { showreel: showreel.id, _status: 'published' },
      user: editor,
      overrideAccess: false,
    })
    expect(await refusal(changeUse(showreel.id, 'previewLoop'))).toBe(
      'Bu video kullanıldığı için kullanımı değiştirilemez: Site sayfası. Önce videoyu oradan kaldırın.',
    )
  })

  it('is refused while a Gallery item uses it, naming the item', async () => {
    const loop = await site.uploadVideo(editor, { use: 'gallery' })
    const create = (caption?: string) =>
      site.cms.create({
        collection: 'gallery',
        data: { kind: 'loop', video: loop.id, caption } as never,
        user: editor,
        overrideAccess: false,
      })
    await create('Set günü')
    expect(await refusal(changeUse(loop.id, 'showreel'))).toBe(
      'Bu video kullanıldığı için kullanımı değiştirilemez: “Set günü” galeri öğesi. Önce videoyu oradan kaldırın.',
    )
    // A new item goes first in the Gallery, and the refusal lists items in that order.
    const uncaptioned = await create()
    expect(await refusal(changeUse(loop.id, 'showreel'))).toBe(
      `Bu video kullanıldığı için kullanımı değiştirilemez: Galeri öğesi #${uncaptioned.id}, “Set günü” galeri öğesi. Önce videoyu oradan kaldırın.`,
    )
  })

  it('is allowed again once no Gallery item uses it', async () => {
    const loop = await site.uploadVideo(editor, { use: 'gallery' })
    const item = await site.cms.create({
      collection: 'gallery',
      data: { kind: 'loop', video: loop.id } as never,
      user: editor,
      overrideAccess: false,
    })
    await site.cms.delete({
      collection: 'gallery',
      id: item.id,
      user: editor,
      overrideAccess: false,
    })
    expect((await changeUse(loop.id, 'showreel')).use).toBe('showreel')
  })

  it('is allowed when nothing uses it', async () => {
    const loop = await site.uploadVideo(editor, { use: 'previewLoop' })
    expect((await changeUse(loop.id, 'showreel')).use).toBe('showreel')
  })
})

describe('a Gallery loop', () => {
  // 15 s, 1080p, silent, 10 MB (ADR-0008); these fixtures break the caps of the other uses.
  it.each(['long-12s.mp4', 'hd-1080.mp4'] as const)('accepts %s', async (file) => {
    const video = await site.uploadVideo(editor, { use: 'gallery', file })
    expect(video.use).toBe('gallery')
    expect(video.codec).toBe('avc1')
  })

  it('stores the width, height and duration of a portrait loop', async () => {
    const video = await site.uploadVideo(editor, { use: 'gallery', file: 'portrait.mp4' })
    expect(video).toMatchObject({ width: 360, height: 640, hasAudio: false })
    expect(video.duration).toBeCloseTo(2, 1)
  })

  it('is refused when too long, naming the limit and the actual length', async () => {
    expect(await refusal(site.uploadVideo(editor, { use: 'gallery', file: 'long-35s.mp4' }))).toBe(
      'Süre en fazla 15 sn olabilir; bu videonun süresi 35 sn.',
    )
  })

  it('is refused above 1080p, naming the limit and the actual size', async () => {
    expect(await refusal(site.uploadVideo(editor, { use: 'gallery', file: 'uhd-1440.mp4' }))).toBe(
      'Çözünürlük en fazla 1080p (1920×1080) olabilir; bu video 2560×1440.',
    )
  })

  it('is refused with audio', async () => {
    expect(
      await refusal(site.uploadVideo(editor, { use: 'gallery', file: 'with-audio.mp4' })),
    ).toBe('Bu kullanımda video sessiz olmalı; bu videoda ses kanalı var.')
  })

  it('is refused over 10 MB, naming the limit and the actual size', async () => {
    expect(
      await refusal(
        site.uploadVideo(editor, { use: 'gallery', file: padded('loop-ok.mp4', 11_000_000) }),
      ),
    ).toBe('Dosya boyutu en fazla 10 MB olabilir; bu dosya 10,5 MB.')
  })

  it('is refused when it is not H.264', async () => {
    expect(await refusal(site.uploadVideo(editor, { use: 'gallery', file: 'hevc.mp4' }))).toBe(
      'Video H.264 olmalı; bu videonun kodeği hvc1.',
    )
  })

  it('needs a poster Image like every Video', async () => {
    const data = videoFixture('loop-ok.mp4')
    await expect(
      site.cms.create({
        collection: 'videos',
        data: { use: 'gallery' } as never,
        file: { data, mimetype: 'video/mp4', name: 'a.mp4', size: data.length },
        user: editor,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  const changeUse = (id: number, use: VideoUse) =>
    site.cms.update({
      collection: 'videos',
      id,
      data: { use },
      user: editor,
      overrideAccess: false,
    })

  it('is re-checked against the new use’s caps when its use changes', async () => {
    const loop = await site.uploadVideo(editor, { use: 'gallery', file: 'long-12s.mp4' })
    expect(await refusal(changeUse(loop.id, 'previewLoop'))).toBe(
      'Süre en fazla 10 sn olabilir; bu videonun süresi 12 sn.',
    )
    expect((await changeUse(loop.id, 'showreel')).use).toBe('showreel')
  })

  it('can take over a preview loop that fits the Gallery caps', async () => {
    const loop = await site.uploadVideo(editor, { use: 'previewLoop' })
    expect((await changeUse(loop.id, 'gallery')).use).toBe('gallery')
  })
})
