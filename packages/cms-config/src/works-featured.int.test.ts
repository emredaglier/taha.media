import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { User, Work } from './payload-types'
import { createTestSite, type TestSite } from './testing'

// Issue #43: featuring a Work (published) needs a 16:9 Preview loop. Same seam as works.int.test.ts.

const NEEDS_LOOP = 'Öne çıkarmak için 16:9 önizleme döngüsü gerekli.'
const WRONG_SHAPE = 'Öne çıkarmak için önizleme döngüsü 16:9 olmalı; bu video'

let site: TestSite
let editor: User
let coverId: number
let counter = 0

beforeAll(async () => {
  site = await createTestSite()
  editor = await site.createEditor()
  coverId = (await site.uploadImage(editor)).id
}, 60_000)

afterAll(async () => {
  await site?.close()
})

const loop = async (file: string) =>
  (await site.uploadVideo(editor, { use: 'previewLoop', file, name: file })).id

const save = (data: Partial<Work>, status: 'draft' | 'published', id?: number): Promise<Work> => {
  const base = {
    draft: status === 'draft',
    depth: 0,
    user: editor,
    overrideAccess: false,
  }
  if (id !== undefined) {
    return site.cms.update({ collection: 'works', id, data: { ...data, _status: status }, ...base })
  }
  return site.cms.create({
    collection: 'works',
    data: {
      title: 'Öne çıkan',
      slug: `one-cikan-${++counter}`,
      disciplines: ['kurgu'],
      year: 2026,
      cover: coverId,
      mainMedia: { kind: 'image', image: coverId },
      ...data,
      _status: status,
    },
    ...base,
  })
}

const messagesOf = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return (error as { data: { errors: { path: string; message: string }[] } }).data.errors
  }
  throw new Error('expected the save to be refused')
}

describe('publishing a featured Work', () => {
  it('is refused without a Preview loop, in Turkish', async () => {
    expect(await messagesOf(save({ featured: true }, 'published'))).toEqual([
      expect.objectContaining({ path: 'previewLoop', message: NEEDS_LOOP }),
    ])
  })

  it.each(['portrait.mp4', 'square.mp4', 'loop-636.mp4'])(
    'is refused when the loop is %s, not 16:9',
    async (file) => {
      const errors = await messagesOf(
        save({ featured: true, previewLoop: await loop(file) }, 'published'),
      )
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatchObject({ path: 'previewLoop' })
      expect(errors[0]?.message).toContain(WRONG_SHAPE)
      expect(errors[0]?.message).toContain('16:9')
    },
  )

  // 1920x1080 and 1918x1080 exceed the loop cap (720p, ADR-0008), so the same shapes are tested at
  // 1280x720 and 638x360 (2 px off, the edge).
  it.each(['loop-720.mp4', 'loop-ok.mp4', 'loop-638.mp4'])(
    'passes with the loop %s',
    async (file) => {
      const work = await save({ featured: true, previewLoop: await loop(file) }, 'published')
      expect(work).toMatchObject({ _status: 'published', featured: true })
    },
  )

  it('never looks at the main video, only at the loop', async () => {
    const portraitMain = (
      await site.uploadVideo(editor, { use: 'main', file: 'portrait.mp4', name: 'ana.mp4' })
    ).id
    const work = await save(
      {
        featured: true,
        previewLoop: await loop('loop-720.mp4'),
        mainMedia: { kind: 'video', video: portraitMain },
      },
      'published',
    )
    expect(work._status).toBe('published')

    const noLoop = save(
      { featured: true, mainMedia: { kind: 'video', video: portraitMain } },
      'published',
    )
    expect(await messagesOf(noLoop)).toEqual([
      expect.objectContaining({ path: 'previewLoop', message: NEEDS_LOOP }),
    ])
  })

  it('is refused when an update removes the loop', async () => {
    const work = await save(
      { featured: true, previewLoop: await loop('loop-720.mp4') },
      'published',
    )
    const errors = await messagesOf(save({ previewLoop: null }, 'published', work.id))
    expect(errors).toEqual([expect.objectContaining({ path: 'previewLoop', message: NEEDS_LOOP })])
  })

  it('is refused when an update swaps the loop for a non-16:9 one', async () => {
    const work = await save(
      { featured: true, previewLoop: await loop('loop-720.mp4') },
      'published',
    )
    const errors = await messagesOf(
      save({ previewLoop: await loop('portrait.mp4') }, 'published', work.id),
    )
    expect(errors[0]?.message).toContain(WRONG_SHAPE)
  })

  it('is refused when an update features a published Work that has no loop', async () => {
    const work = await save({}, 'published')
    const errors = await messagesOf(save({ featured: true }, 'published', work.id))
    expect(errors).toEqual([expect.objectContaining({ path: 'previewLoop', message: NEEDS_LOOP })])
  })

  it('accepts a swap for another 16:9 loop', async () => {
    const work = await save(
      { featured: true, previewLoop: await loop('loop-720.mp4') },
      'published',
    )
    const next = await save({ previewLoop: await loop('loop-ok.mp4') }, 'published', work.id)
    expect(next._status).toBe('published')
  })
})

describe('a Work that needs no loop', () => {
  it('publishes without one when it is not featured, and with a non-16:9 one', async () => {
    expect((await save({ featured: false }, 'published'))._status).toBe('published')
    const odd = await save({ previewLoop: await loop('portrait.mp4') }, 'published')
    expect(odd._status).toBe('published')
  })

  it('saves a featured draft without a loop or with a non-16:9 one', async () => {
    expect((await save({ featured: true }, 'draft'))._status).toBe('draft')
    const odd = await save({ featured: true, previewLoop: await loop('square.mp4') }, 'draft')
    expect(odd._status).toBe('draft')
  })

  it('saves a draft of a published featured Work without the loop', async () => {
    const work = await save(
      { featured: true, previewLoop: await loop('loop-720.mp4') },
      'published',
    )
    const draft = await save({ previewLoop: null }, 'draft', work.id)
    expect(draft._status).toBe('draft')
  })
})
