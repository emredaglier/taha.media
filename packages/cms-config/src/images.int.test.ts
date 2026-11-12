import fs from 'node:fs'
import path from 'node:path'
import { crc32 } from 'node:zlib'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import sharp from 'sharp'

import { IMAGE_MAX_BYTES, IMAGE_MAX_PIXELS, IMAGE_STORED_MAX } from './collections/Images'
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
    expect(image.width).toBe(2560) // under the cap: never enlarged

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

  it('stores a photo wider than the cap no wider than the cap, and still makes the sizes', async () => {
    const image = await site.uploadImage(editor, { name: 'genis.jpg', width: 5000, height: 2000 })

    expect(image.width).toBe(IMAGE_STORED_MAX)
    expect(image.height).toBe(1638) // 2000 * 4096 / 5000, rounded
    const sizes = image.sizes as Record<string, { filename?: string | null }>
    for (const name of ['thumbnail', 'small', 'medium', 'large', 'xlarge']) {
      expect(sizes[name]?.filename, name).toBeTruthy()
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

describe('an image over the pixel cap', () => {
  const upload = async (data: Buffer, mimetype = 'image/png') =>
    (await site.cms
      .create({
        collection: 'images',
        data: { alt: 'piksel' },
        file: { data, mimetype, name: 'piksel.png', size: data.length },
        user: editor,
        overrideAccess: false,
      })
      .catch((e: unknown) => e)) as { data?: { errors?: { path?: string; message: string }[] } }

  it('is refused under the file field from its header alone, before sharp decodes it', async () => {
    // A real 1 px PNG whose IHDR (width, height, then its CRC) says 10000 x 10000: a few hundred
    // bytes, and a decode would need 400 MB.
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } })
      .png()
      .toBuffer()
    png.writeUInt32BE(10_000, 16)
    png.writeUInt32BE(10_000, 20)
    png.writeUInt32BE(crc32(png.subarray(12, 29)), 29)
    expect(10_000 * 10_000).toBeGreaterThan(IMAGE_MAX_PIXELS)

    const before = site.s3.puts().length
    const error = await upload(png)
    expect(error.data?.errors).toEqual([
      expect.objectContaining({
        path: 'file',
        message: 'Görsel en fazla 50 megapiksel olabilir; bu görsel 100,0 megapiksel.',
      }),
    ])
    expect(site.s3.puts().length).toBe(before)
  })

  it('is refused the same way when the header cannot be read', async () => {
    const before = site.s3.puts().length
    const error = await upload(Buffer.from('bu bir görsel değil'))
    expect(error.data?.errors).toEqual([expect.objectContaining({ path: 'file' })])
    expect(site.s3.puts().length).toBe(before)
  })

  it('counts every frame of an animated WebP, which Payload decodes in full', async () => {
    // One frame is 4 MP, under the cap; 13 frames are 52 MP.
    // Frames differ, or the encoder merges them into one.
    const frames = await Promise.all(
      Array.from({ length: 13 }, (_, i) =>
        sharp({
          create: {
            width: 2000,
            height: 2000,
            channels: 3,
            background: { r: i * 19, g: 40, b: 200 - i * 10 },
          },
        })
          .png()
          .toBuffer(),
      ),
    )
    const webp = await sharp(frames, { join: { animated: true } })
      .webp()
      .toBuffer()

    const before = site.s3.puts().length
    const error = await upload(webp, 'image/webp')
    expect(error.data?.errors).toEqual([
      expect.objectContaining({
        path: 'file',
        message: 'Görsel en fazla 50 megapiksel olabilir; bu görsel 52,0 megapiksel.',
      }),
    ])
    expect(site.s3.puts().length).toBe(before)
  }, 30_000)

  it('is refused the same way when the buffer is empty', async () => {
    const before = site.s3.puts().length
    const error = await upload(Buffer.alloc(0))
    expect(error.data?.errors).toEqual([expect.objectContaining({ path: 'file' })])
    expect(site.s3.puts().length).toBe(before)
  })
})
