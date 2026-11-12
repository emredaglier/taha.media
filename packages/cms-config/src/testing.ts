import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import http from 'node:http'
import type { AddressInfo } from 'node:net'

import type { Client } from '@libsql/client'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'

import { buildSiteConfig } from './config'
import type { Image, User, Video } from './payload-types'
import type { RevalidationTransport } from './revalidation'

/** One request the S3 stub received. */
export type S3Request = { method: string; key: string; headers: http.IncomingHttpHeaders }

/**
 * An in-process stand-in for R2 (no real credentials, no Docker). It records every request and
 * keeps the set of stored keys, which is all the storage assertions need.
 */
export type S3Stub = {
  endpoint: string
  bucket: string
  requests: S3Request[]
  /** Keys currently stored. */
  objects: Set<string>
  /** Requests that stored a new object (copies excluded), in order. */
  puts: () => S3Request[]
  /** While true, copy requests (`x-amz-copy-source`) are answered with a 500. */
  failCopies: boolean
  close: () => Promise<void>
}

export async function startS3Stub(bucket = 'bucket'): Promise<S3Stub> {
  const requests: S3Request[] = []
  const objects = new Set<string>()
  const stub: { failCopies: boolean } = { failCopies: false }
  const server = http.createServer((req, res) => {
    req.on('data', () => undefined)
    req.on('end', () => {
      const path = decodeURIComponent((req.url ?? '').split('?')[0] ?? '')
      const key = path.replace(new RegExp(`^/${bucket}/`), '')
      requests.push({ method: req.method ?? '', key, headers: req.headers })
      if (stub.failCopies && typeof req.headers['x-amz-copy-source'] === 'string') {
        res.writeHead(500, { 'Content-Type': 'application/xml' })
        res.end('<Error><Code>InternalError</Code><Message>stub</Message></Error>')
        return
      }
      if (req.method === 'PUT') objects.add(key)
      if (req.method === 'DELETE') objects.delete(key)
      if (typeof req.headers['x-amz-copy-source'] === 'string') {
        res.writeHead(200, { 'Content-Type': 'application/xml' })
        res.end('<CopyObjectResult><ETag>"stub"</ETag></CopyObjectResult>')
        return
      }
      res.writeHead(req.method === 'DELETE' ? 204 : 200, { ETag: '"stub"' })
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    endpoint: `http://127.0.0.1:${port}`,
    bucket,
    requests,
    objects,
    puts: () =>
      requests.filter(
        (r) => r.method === 'PUT' && typeof r.headers['x-amz-copy-source'] !== 'string',
      ),
    get failCopies() {
      return stub.failCopies
    },
    set failCopies(v: boolean) {
      stub.failCopies = v
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

/** A plain JPEG of the given size, as a camera export would be. */
export const testPhoto = (width: number, height: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: '#7a5c3e' } })
    .jpeg()
    .toBuffer()

/** A committed fixture MP4 (see `fixtures/videos/make-fixtures.sh`), by file name. */
export const videoFixture = (name: string): Buffer =>
  fs.readFileSync(new URL(`./fixtures/videos/${name}`, import.meta.url))

export const TEST_MEDIA_ORIGIN = 'https://cdn.test/media'

/**
 * Integration-test harness for the main seam (spec #1, Seam 1): a fresh SQLite file in a temp
 * directory, its schema built from the committed migrations (as production's migrate step does),
 * and a `cms`-role Payload that writes to it the way the admin does. `web` reads the same file
 * through its data module: point it here with `webEnv`.
 *
 * Call once per test file in `beforeAll` and `close()` in `afterAll`. Vitest runs files in
 * separate processes, so files never share a database.
 */
export type TestSite = {
  /** The SQLite file, for anything that opens the database itself. */
  databasePath: string
  /** The `cms`-role Local API (the writer), schema migrated. */
  cms: Payload
  /** The writer's raw libsql connection, for pragma checks. */
  cmsClient: () => Client
  /** Env vars that make `web` (`siteConfigOptionsFromEnv('web')`) open this database. */
  webEnv: { DATABASE_PATH: string; PAYLOAD_SECRET: string; MEDIA_ORIGIN: string }
  /** Creates an Editor, for writes with access rules applied (`user`, `overrideAccess: false`). */
  createEditor: (credentials?: { email?: string; password?: string }) => Promise<User>
  /** The R2 stand-in the writer uploads to. */
  s3: S3Stub
  /**
   * Every set of cache tags the writer sent to `web`, in order (spec #1, Tags). Clear it with
   * `revalidations.length = 0`. Recorded before the `revalidate` transport (if any) is called.
   */
  revalidations: string[][]
  /**
   * Uploads a generated photo as an Editor would. The default is 800×533, the smallest photo that
   * still gets a `small` srcset size; a test of larger sizes passes `width` and `height`. `alt`
   * defaults to a sample text.
   */
  uploadImage: (
    editor: User,
    options?: { name?: string; width?: number; height?: number; alt?: string },
  ) => Promise<Image>
  /**
   * Uploads a video as an Editor would. `file` is a fixture name or the bytes themselves; the
   * poster defaults to a freshly uploaded Image.
   */
  uploadVideo: (
    editor: User,
    options: {
      use: Video['use']
      file?: string | Buffer
      name?: string
      mimetype?: string
      poster?: number
    },
  ) => Promise<Video>
  close: () => Promise<void>
}

const SECRET = 'test-secret'

export async function createTestSite({
  objectStorage = true,
  revalidate,
}: {
  /** `false` leaves media on local disk, as in development. */
  objectStorage?: boolean
  /**
   * Delivers the tags after they are recorded, e.g. to `web`'s revalidate route, or a transport
   * that fails. Without it the tags are only recorded.
   */
  revalidate?: RevalidationTransport
} = {}): Promise<TestSite> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taha-site-'))
  const databasePath = path.join(dir, 'site.db')
  const s3 = await startS3Stub()
  const revalidations: string[][] = []
  const cms = await getPayload({
    // Unique per site, so a second site in the same process gets its own instance.
    key: `test-cms-${randomUUID()}`,
    config: await buildSiteConfig({
      role: 'cms',
      databasePath,
      secret: SECRET,
      push: false,
      revalidate: async (tags) => {
        revalidations.push(tags)
        await revalidate?.(tags)
      },
      storage: objectStorage
        ? {
            mediaOrigin: TEST_MEDIA_ORIGIN,
            s3: {
              endpoint: s3.endpoint,
              bucket: s3.bucket,
              accessKeyId: 'test-key',
              secretAccessKey: 'test-secret',
              region: 'us-east-1',
              forcePathStyle: true,
            },
          }
        : {},
    }),
  })
  await cms.db.migrate()

  let editors = 0
  const site: TestSite = {
    databasePath,
    cms,
    // Payload types `db.client` as the libsql config; at runtime it is the connected client.
    cmsClient: () => (cms.db as unknown as { client: Client }).client,
    webEnv: {
      DATABASE_PATH: databasePath,
      PAYLOAD_SECRET: SECRET,
      MEDIA_ORIGIN: TEST_MEDIA_ORIGIN,
    },
    createEditor: ({ email, password } = {}) =>
      cms.create({
        collection: 'users',
        data: {
          email: email ?? `editor-${++editors}@example.com`,
          password: password ?? 'correct-horse-battery',
        },
      }),
    s3,
    revalidations,
    uploadImage: async (editor, { name = 'photo.jpg', width = 800, height = 533, alt } = {}) => {
      const data = await testPhoto(width, height)
      return cms.create({
        collection: 'images',
        data: { alt: alt ?? 'Bir deneme fotoğrafı' },
        file: { data, mimetype: 'image/jpeg', name, size: data.length },
        user: editor,
        overrideAccess: false,
      })
    },
    uploadVideo: async (
      editor,
      { use, file = 'loop-ok.mp4', name = 'klip.mp4', mimetype = 'video/mp4', poster },
    ) => {
      const data = typeof file === 'string' ? videoFixture(file) : file
      return cms.create({
        collection: 'videos',
        data: { use, poster: poster ?? (await site.uploadImage(editor)).id },
        file: { data, mimetype, name, size: data.length },
        user: editor,
        overrideAccess: false,
      })
    },
    close: async () => {
      await cms.db.destroy?.()
      await s3.close()
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
  return site
}
