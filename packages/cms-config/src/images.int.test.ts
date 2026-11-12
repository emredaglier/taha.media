import fs from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { IMAGE_MAX_BYTES } from './collections/Images'
import type { User } from './payload-types'
import { createTestSite, TEST_MEDIA_ORIGIN, testPhoto, type TestSite } from './testing'

let site: TestSite
let editor: User

beforeAll(async () => {
  site = await createTestSite()
  editor = await site.createEditor()
}, 60_000)

afterAll(async () => {
  await site?.close()
})

describe('uploading an image', () => {
  it('creates the WebP sizes, stores them on R2 with an immutable cache header and serves public URLs', async () => {
    const before = site.s3.puts().length
    // Wide enough for every size (the largest is 2560).
    const image = await site.uploadImage(editor, { name: 'kis.jpg', width: 2560, height: 1707 })

    const sizes = image.sizes as Record<string, { url?: string; mimeType?: string; width?: number }>
    for (const name of ['small', 'medium', 'large', 'xlarge']) {
      expect(sizes[name]?.mimeType, name).toBe('image/webp')
      expect(sizes[name]?.url?.startsWith(`${TEST_MEDIA_ORIGIN}/`), name).toBe(true)
    }
    expect(image.mimeType).toBe('image/webp')
    expect(image.url).not.toContain('/api/')

    const puts = site.s3.puts().slice(before)
    expect(puts.length).toBeGreaterThanOrEqual(5)
    for (const put of puts) {
      expect(put.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    }
  })

  it('stores two uploads of the same filename, and a replaced file, under different keys', async () => {
    const before = site.s3.puts().length
    const first = await site.uploadImage(editor, { name: 'ayni.jpg' })
    const second = await site.uploadImage(editor, { name: 'ayni.jpg' })
    expect(first.filename).not.toBe(second.filename)

    const data = await testPhoto(2400, 1600)
    const replaced = await site.cms.update({
      collection: 'images',
      id: first.id,
      data: {},
      file: { data, mimetype: 'image/jpeg', name: 'ayni.jpg', size: data.length },
      user: editor,
      overrideAccess: false,
    })
    expect(replaced.filename).not.toBe(first.filename)

    const keys = site.s3
      .puts()
      .slice(before)
      .map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('is refused without alt text', async () => {
    const data = await testPhoto(100, 100)
    await expect(
      site.cms.create({
        collection: 'images',
        data: {} as never,
        file: { data, mimetype: 'image/jpeg', name: 'x.jpg', size: data.length },
        user: editor,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ data: { errors: [{ path: 'alt' }] } })
  })

  it('stores the focal point and returns it on read', async () => {
    const data = await testPhoto(1000, 800)
    const created = await site.cms.create({
      collection: 'images',
      data: { alt: 'Odak', focalX: 20, focalY: 70 },
      file: { data, mimetype: 'image/jpeg', name: 'odak.jpg', size: data.length },
      user: editor,
      overrideAccess: false,
    })
    const read = await site.cms.findByID({ collection: 'images', id: created.id })
    expect([read.focalX, read.focalY]).toEqual([20, 70])
  })
})

describe('a Work cover', () => {
  const work = {
    title: 'Kış Reklamı',
    slug: 'kis-reklami-kapak',
    disciplines: ['kurgu' as const],
    year: 2025,
  }
  const asEditor = () => ({ user: editor, overrideAccess: false })

  it('is required to publish, but a draft can be saved without one', async () => {
    const draft = await site.cms.create({
      collection: 'works',
      data: { ...work, mainMedia: { kind: 'image', image: (await site.uploadImage(editor)).id } },
      draft: true,
      ...asEditor(),
    })
    await expect(
      site.cms.update({
        collection: 'works',
        id: draft.id,
        data: { _status: 'published' },
        ...asEditor(),
      }),
    ).rejects.toMatchObject({ data: { errors: [{ path: 'cover' }] } })

    const cover = await site.uploadImage(editor)
    const published = await site.cms.update({
      collection: 'works',
      id: draft.id,
      data: { cover: cover.id, _status: 'published' },
      ...asEditor(),
    })
    expect(published._status).toBe('published')
  })
})

describe('with no object storage (development)', () => {
  it('keeps the files on local disk and serves them from the admin API path', async () => {
    const local = await createTestSite({ objectStorage: false })
    try {
      const image = await local.uploadImage(await local.createEditor(), {
        name: 'yerel.jpg',
        // Wide enough for five files: original, thumbnail, small, medium, large.
        width: 1920,
        height: 1280,
      })
      expect(image.url).toBe(`/api/images/file/${image.filename}`)
      expect(local.s3.requests).toHaveLength(0)
      const onDisk = fs.readdirSync(path.join(path.dirname(local.databasePath), 'images'))
      expect(onDisk).toContain(image.filename)
      expect(onDisk.length).toBeGreaterThanOrEqual(5)
    } finally {
      await local.close()
    }
  }, 30_000)
})

describe('an image over 20 MB', () => {
  it('is refused under the file field before any size is made', async () => {
    const before = site.s3.puts().length
    const data = Buffer.alloc(IMAGE_MAX_BYTES + 1)
    const error = (await site.cms
      .create({
        collection: 'images',
        data: { alt: 'büyük' },
        file: { data, mimetype: 'image/png', name: 'buyuk.png', size: data.length },
        user: editor,
        overrideAccess: false,
      })
      .catch((e: unknown) => e)) as { data?: { errors?: { path?: string; message: string }[] } }
    expect(error.data?.errors).toEqual([
      expect.objectContaining({
        path: 'file',
        message: 'Dosya boyutu en fazla 20 MB olabilir; bu dosya 20,0 MB.',
      }),
    ])
    expect(site.s3.puts().length).toBe(before)
  })
})
