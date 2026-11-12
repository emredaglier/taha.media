import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { handleEndpoints } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { IMAGE_MAX_BYTES } from './collections/Images'
import type { Image, User } from './payload-types'
import { createTestSite, testPhoto, videoFixture, type TestSite } from './testing'

// The admin's uploads arrive as multipart and spool to `os.tmpdir()` (#107). This file gets its
// own temp folder, so it can tell that a file was spooled there and removed again.
const spool = fs.mkdtempSync(path.join(os.tmpdir(), 'taha-spool-'))
const previousTmpdir = process.env.TMPDIR

let site: TestSite
let editor: User
let token: string

const api = (url: string, init: RequestInit): Promise<Response> =>
  handleEndpoints({
    config: Promise.resolve(site.cms.config),
    request: new Request(`http://localhost${url}`, init),
  })

beforeAll(async () => {
  process.env.TMPDIR = spool
  site = await createTestSite()
  editor = await site.createEditor({ email: 'spool@example.com', password: 'spool-password-1' })
  const login = await api('/api/users/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'spool@example.com', password: 'spool-password-1' }),
  })
  token = ((await login.json()) as { token: string }).token
}, 60_000)

afterAll(async () => {
  await site?.close()
  if (previousTmpdir === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = previousTmpdir
  fs.rmSync(spool, { recursive: true, force: true })
})

/** Uploads a file the way the admin does: a multipart POST with the fields in `_payload`. */
const upload = (collection: string, file: Buffer, name: string, type: string, data: object) => {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(file)], { type }), name)
  form.append('_payload', JSON.stringify(data))
  return api(`/api/${collection}`, {
    method: 'POST',
    headers: { Authorization: `JWT ${token}` },
    body: form,
  })
}

/**
 * Runs an upload and checks its temp file: the spool folder changed (a file was written there and
 * removed) and holds the same entries as before (the test site's folder, tsx's cache).
 */
async function spooled(request: () => Promise<Response>): Promise<Response> {
  const entries = fs.readdirSync(spool)
  const changed = fs.statSync(spool, { bigint: true }).mtimeNs
  const response = await request()
  expect(fs.statSync(spool, { bigint: true }).mtimeNs).not.toBe(changed)
  expect(fs.readdirSync(spool)).toEqual(entries)
  return response
}

/** The messages of a refused upload, with the field each is shown under. */
const refusal = async (response: Response) => {
  expect(response.status).toBe(400)
  const body = (await response.json()) as {
    errors: { data?: { errors?: { path: string; message: string }[] } }[]
  }
  return body.errors.flatMap((e) => e.data?.errors ?? [])
}

/** A valid MP4 grown past a size cap by a trailing `free` box (ignored by every player). */
function padded(fixture: string, totalBytes: number): Buffer {
  const base = videoFixture(fixture)
  const free = Buffer.alloc(totalBytes - base.length)
  free.writeUInt32BE(free.length, 0)
  free.write('free', 4, 'latin1')
  return Buffer.concat([base, free])
}

describe('an admin video upload, spooled to a temp file', () => {
  it('is read from its header, stored on R2 and leaves no temp file', async () => {
    const poster = (await site.uploadImage(editor)).id
    const response = await spooled(() =>
      upload('videos', videoFixture('with-audio.mp4'), 'klip.mp4', 'video/mp4', {
        use: 'main',
        poster,
      }),
    )
    expect(response.status).toBe(201)
    const { doc } = (await response.json()) as {
      doc: { filename: string; width: number; height: number; duration: number; hasAudio: boolean }
    }
    expect(doc).toMatchObject({ width: 640, height: 360, duration: 2, hasAudio: true })
    // Streamed to R2 from the temp file, byte for byte.
    expect(site.s3.objects.get(doc.filename)?.body.equals(videoFixture('with-audio.mp4'))).toBe(
      true,
    )
  })

  it('over its cap is refused under the file and leaves no temp file', async () => {
    const poster = (await site.uploadImage(editor)).id
    const response = await spooled(() =>
      upload('videos', padded('loop-ok.mp4', 5_400_000), 'klip.mp4', 'video/mp4', {
        use: 'previewLoop',
        poster,
      }),
    )
    expect(await refusal(response)).toEqual([
      expect.objectContaining({
        path: 'file',
        message: 'Dosya boyutu en fazla 4 MB olabilir; bu dosya 5,1 MB.',
      }),
    ])
  })

  it('that is not an MP4 is refused and leaves no temp file', async () => {
    const poster = (await site.uploadImage(editor)).id
    const response = await spooled(() =>
      upload('videos', Buffer.from('video değil'), 'klip.mp4', 'video/mp4', {
        use: 'main',
        poster,
      }),
    )
    expect(await refusal(response)).toEqual([
      expect.objectContaining({
        path: 'file',
        message: 'Dosya bir MP4 videosu değil. Lütfen H.264 MP4 olarak dışa aktarın.',
      }),
    ])
  })
})

describe('an admin image upload, spooled to a temp file', () => {
  it('is stored and leaves no temp file', async () => {
    const response = await spooled(async () =>
      upload('images', await testPhoto(800, 533), 'foto.jpg', 'image/jpeg', { alt: 'Deneme' }),
    )
    expect(response.status).toBe(201)
  })

  it('makes the same sizes as an in-memory upload of the photo', async () => {
    // With the temp file, Payload wrote its full-size WebP there and decoded that once per size,
    // which ran the 512 MB cms out of memory on a 24 MP photo (#107). Noise makes the two differ.
    const photo = await sharp({
      create: {
        width: 900,
        height: 600,
        channels: 3,
        background: '#000',
        noise: { type: 'gaussian', mean: 128, sigma: 30 },
      },
    })
      .jpeg()
      .toBuffer()
    const response = await spooled(() =>
      upload('images', photo, 'foto.jpg', 'image/jpeg', { alt: 'Deneme' }),
    )
    const { doc } = (await response.json()) as { doc: Image }
    const inMemory = await site.cms.create({
      collection: 'images',
      data: { alt: 'Deneme' },
      file: { data: photo, mimetype: 'image/jpeg', name: 'foto.jpg', size: photo.length },
    })
    const small = (image: Image) => site.s3.objects.get(image.sizes?.small?.filename ?? '')?.body
    expect(small(inMemory)).toBeDefined()
    expect(small(doc)?.equals(small(inMemory)!)).toBe(true)
  })

  it('over 20 MB is refused under the file and leaves no temp file', async () => {
    const response = await spooled(() =>
      upload('images', Buffer.alloc(IMAGE_MAX_BYTES + 1), 'buyuk.png', 'image/png', {
        alt: 'Büyük',
      }),
    )
    expect(await refusal(response)).toEqual([
      expect.objectContaining({
        path: 'file',
        message: 'Dosya boyutu en fazla 20 MB olabilir; bu dosya 20,0 MB.',
      }),
    ])
  })
})
