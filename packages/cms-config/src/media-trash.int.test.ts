import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { User } from './payload-types'
import { createTestSite, type TestSite } from './testing'

// Seam 1 (spec #1): deleting media in the admin, observed at the S3 stub that stands in for R2.
// Soft delete is a move to `trash/<key>`; a lifecycle rule on that prefix expires it (ADR-0006).

let site: TestSite
let editor: User

beforeAll(async () => {
  site = await createTestSite()
  editor = await site.createEditor()
}, 60_000)

afterAll(async () => {
  await site?.close()
})

const keysOf = (media: { filename?: string | null; sizes?: object | null }) =>
  [
    media.filename,
    ...Object.values((media.sizes ?? {}) as Record<string, { filename?: string | null }>).map(
      (s) => s?.filename,
    ),
  ].filter((k): k is string => Boolean(k))

describe('deleting an image', () => {
  it('removes the record and moves the original and every size to trash/', async () => {
    const image = await site.uploadImage(editor, { name: 'silinecek.jpg' })
    const keys = keysOf(image)
    expect(keys.length).toBeGreaterThan(1)
    for (const key of keys) expect(site.s3.objects.has(key), key).toBe(true)

    await site.cms.delete({
      collection: 'images',
      id: image.id,
      user: editor,
      overrideAccess: false,
    })

    await expect(site.cms.findByID({ collection: 'images', id: image.id })).rejects.toThrow()
    for (const key of keys) {
      expect(site.s3.objects.has(key), `${key} left the live key`).toBe(false)
      expect(site.s3.objects.has(`trash/${key}`), `trash/${key}`).toBe(true)
    }
  })

  it('copies before it deletes, and deletes only the live keys', async () => {
    const image = await site.uploadImage(editor)
    const keys = keysOf(image)
    const from = site.s3.requests.length
    await site.cms.delete({
      collection: 'images',
      id: image.id,
      user: editor,
      overrideAccess: false,
    })
    const during = site.s3.requests.slice(from)
    for (const key of keys) {
      const copy = during.findIndex((r) => r.method === 'PUT' && r.key === `trash/${key}`)
      const del = during.findIndex((r) => r.method === 'DELETE' && r.key === key)
      expect(copy, `copy of ${key}`).toBeGreaterThan(-1)
      expect(del, `delete of ${key}`).toBeGreaterThan(copy)
    }
    expect(during.filter((r) => r.method === 'DELETE').every((r) => keys.includes(r.key))).toBe(
      true,
    )
  })

  it('still deletes the record, and keeps the files in place, when the copy to trash fails', async () => {
    const image = await site.uploadImage(editor)
    const keys = keysOf(image)
    site.s3.failCopies = true
    try {
      await site.cms.delete({
        collection: 'images',
        id: image.id,
        user: editor,
        overrideAccess: false,
      })
    } finally {
      site.s3.failCopies = false
    }
    await expect(site.cms.findByID({ collection: 'images', id: image.id })).rejects.toThrow()
    for (const key of keys) {
      expect(site.s3.objects.has(key), `${key} must not be lost`).toBe(true)
      expect(site.s3.objects.has(`trash/${key}`)).toBe(false)
    }
  })
})

describe('deleting a video', () => {
  it('moves the MP4 to trash/', async () => {
    const video = await site.uploadVideo(editor, { use: 'previewLoop' })
    const key = video.filename as string
    await site.cms.delete({
      collection: 'videos',
      id: video.id,
      user: editor,
      overrideAccess: false,
    })
    expect(site.s3.objects.has(key)).toBe(false)
    expect(site.s3.objects.has(`trash/${key}`)).toBe(true)
  })
})
