// Release assets on R2 (ADR-0005): each release's /_next/static under releases/<id>/, kept 30 days.
// Runs against an in-process S3 stub, no R2 or network.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { S3Client } from '@aws-sdk/client-s3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { pruneReleases, uploadRelease } from './release-assets.ts'
import { startS3Stub } from './s3-stub.ts'

const DAY = 86_400_000
let stub: Awaited<ReturnType<typeof startS3Stub>>
let client: S3Client
let dir: string

beforeEach(async () => {
  stub = await startS3Stub()
  client = new S3Client({
    endpoint: stub.endpoint,
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: 'k', secretAccessKey: 's' },
  })
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taha-static-'))
})
afterEach(async () => {
  await stub.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

const write = (rel: string, body = 'x') => {
  const file = path.join(dir, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body)
}
/** A release uploaded `ageDays` before `now`. */
const seed = (release: string, ageDays: number, now: Date) => {
  stub.objects.set(`releases/${release}/_next/static/chunks/a.js`, {
    body: Buffer.from('x'),
    headers: {},
    lastModified: new Date(now.getTime() - ageDays * DAY),
  })
}
const releasesLeft = () =>
  [
    ...new Set(
      [...stub.objects.keys()].filter((k) => k.startsWith('releases/')).map((k) => k.split('/')[1]),
    ),
  ].sort()
/** A media object in the same bucket (cdn.taha.media serves both). */
const media = () =>
  stub.objects.set('work-cover-1a2b-small.webp', {
    body: Buffer.from('p'),
    headers: {},
    lastModified: new Date(0),
  })

describe('uploadRelease', () => {
  it('uploads under releases/<id>/_next/static with immutable headers and content types', async () => {
    write('chunks/app.js')
    write('css/app.css')
    write('media/font.woff2')
    await uploadRelease({ client, bucket: 'b', dir, release: 'abc123' })
    const get = (k: string) => stub.objects.get(`releases/abc123/_next/static/${k}`)
    expect(get('chunks/app.js')?.headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect(get('css/app.css')?.headers['content-type']).toBe('text/css; charset=utf-8')
    expect(get('media/font.woff2')?.headers['content-type']).toBe('font/woff2')
    expect(stub.objects.size).toBe(3)
    for (const o of stub.objects.values()) {
      expect(o.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    }
  })

  it('never deletes: older releases and media stay', async () => {
    write('a.js')
    seed('old', 100, new Date())
    media()
    await uploadRelease({ client, bucket: 'b', dir, release: 'new' })
    expect(stub.requests.filter((r) => r.method === 'DELETE')).toEqual([])
    expect(releasesLeft()).toEqual(['new', 'old'])
    expect(stub.objects.has('work-cover-1a2b-small.webp')).toBe(true)
  })

  it('refuses an empty directory and an unsafe release name', async () => {
    await expect(uploadRelease({ client, bucket: 'b', dir, release: 'abc' })).rejects.toThrow(
      /no files/i,
    )
    write('a.js')
    await expect(uploadRelease({ client, bucket: 'b', dir, release: '../x' })).rejects.toThrow(
      /release/i,
    )
    expect(stub.objects.size).toBe(0)
  })
})

describe('pruneReleases: 30-day retention', () => {
  const now = new Date('2026-11-06T00:00:00Z')

  it('removes releases older than 30 days and keeps those uploaded within 30 days', async () => {
    seed('r1', 45, now)
    seed('r2', 31, now)
    seed('r3', 29, now)
    seed('r4', 1, now)
    const res = await pruneReleases({ client, bucket: 'b', now, keep: ['r4'] })
    expect(res.deleted.sort()).toEqual(['r1', 'r2'])
    expect(releasesLeft()).toEqual(['r3', 'r4'])
  })

  it('keeps the live and previous live release whatever their age, and never touches media', async () => {
    // A quiet site: no deploy for months. Open tabs still load the live release's chunks.
    seed('r1', 200, now)
    seed('prev', 120, now)
    seed('live', 90, now)
    media()
    const res = await pruneReleases({ client, bucket: 'b', now, keep: ['prev', 'live'] })
    expect(res.deleted).toEqual(['r1'])
    expect(releasesLeft()).toEqual(['live', 'prev'])
    expect(stub.objects.has('work-cover-1a2b-small.webp')).toBe(true)
  })

  it('keeps the previous LIVE release, not a newer upload that failed and rolled back', async () => {
    seed('A', 45, now) // live before
    seed('B', 40, now) // uploaded, failed its checks, rolled back to A
    seed('C', 0, now) // live now
    const res = await pruneReleases({ client, bucket: 'b', now, keep: ['A', 'C'] })
    expect(res.deleted).toEqual(['B'])
    expect(releasesLeft()).toEqual(['A', 'C'])
  })

  it('a dry run deletes nothing', async () => {
    seed('r1', 100, now)
    seed('r2', 0, now)
    const dry = await pruneReleases({ client, bucket: 'b', now, keep: ['r2'], dryRun: true })
    expect(dry.deleted).toEqual(['r1'])
    expect(stub.requests.filter((r) => r.method === 'DELETE')).toEqual([])
  })

  it('refuses to prune without releases to keep, or with an unsafe name', async () => {
    seed('r1', 100, now)
    await expect(pruneReleases({ client, bucket: 'b', now, keep: [] })).rejects.toThrow(/keep/)
    await expect(pruneReleases({ client, bucket: 'b', now, keep: ['../x'] })).rejects.toThrow(
      /release/i,
    )
    expect(releasesLeft()).toEqual(['r1'])
  })
})
