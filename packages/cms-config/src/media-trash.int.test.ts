import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { User } from './payload-types'
import { createTestSite, type TestSite } from './testing'

// Seam 1 (spec #1): deleting media in the admin, observed at the S3 stub that stands in for R2.

let site: TestSite
let editor: User

beforeAll(async () => {
  site = await createTestSite()
  editor = await site.createEditor()
}, 60_000)

afterAll(async () => {
  await site?.close()
})

describe('deleting an image', () => {
  it('removes the record, keeps every object and tags each one for cleanup', async () => {
    const image = await site.uploadImage(editor, { name: 'silinecek.jpg' })
    const keys = [
      image.filename,
      ...Object.values(image.sizes ?? {}).map((s) => s?.filename),
    ].filter((k): k is string => Boolean(k))
    expect(keys.length).toBeGreaterThan(1)
    const requestsBefore = site.s3.requests.length

    await site.cms.delete({
      collection: 'images',
      id: image.id,
      user: editor,
      overrideAccess: false,
    })

    await expect(site.cms.findByID({ collection: 'images', id: image.id })).rejects.toThrow()
    const during = site.s3.requests.slice(requestsBefore)
    expect(during.filter((r) => r.method === 'DELETE')).toEqual([])
    for (const key of keys) {
      expect(site.s3.objects.has(key), key).toBe(true)
      expect(site.s3.tags.get(key)?.['deleted-at'], key).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })
})

describe('deleting a video', () => {
  it('keeps the MP4 on R2 and tags it', async () => {
    const video = await site.uploadVideo(editor, { use: 'previewLoop' })
    const key = video.filename as string
    await site.cms.delete({
      collection: 'videos',
      id: video.id,
      user: editor,
      overrideAccess: false,
    })
    expect(site.s3.objects.has(key)).toBe(true)
    expect(site.s3.tags.get(key)?.['deleted-at']).toBeTruthy()
  })
})
