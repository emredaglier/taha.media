import { PutObjectCommand, PutObjectTaggingCommand, S3Client } from '@aws-sdk/client-s3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cleanupTrash, tagForTrash } from './media-trash'
import { startS3Stub, type S3Stub } from './testing'

// Seam 3 (spec #1): the cleanup rule that removes tagged objects after 30 days, run against the
// S3 stub.

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-12-01T12:00:00.000Z')
const ago = (days: number) => new Date(now.getTime() - days * DAY)

let stub: S3Stub
let client: S3Client

beforeAll(async () => {
  stub = await startS3Stub('media')
  client = new S3Client({
    endpoint: stub.endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: 'k', secretAccessKey: 's' },
  })
})

afterAll(async () => {
  await stub.close()
})

const put = (key: string) =>
  client.send(new PutObjectCommand({ Bucket: 'media', Key: key, Body: 'x' }))

describe('cleanupTrash', () => {
  it('removes objects tagged more than 30 days ago and keeps younger and untagged ones', async () => {
    for (const key of ['old.webp', 'edge.webp', 'young.webp', 'live.webp', 'odd.webp']) {
      await put(key)
    }
    await tagForTrash(client, 'media', 'old.webp', ago(31))
    await tagForTrash(client, 'media', 'edge.webp', ago(30))
    await tagForTrash(client, 'media', 'young.webp', ago(29))
    // A tag we do not understand is never a reason to delete.
    await client.send(
      new PutObjectTaggingCommand({
        Bucket: 'media',
        Key: 'odd.webp',
        Tagging: { TagSet: [{ Key: 'deleted-at', Value: 'yesterday-ish' }] },
      }),
    )

    const result = await cleanupTrash(client, 'media', { now })

    expect(result.deleted.sort()).toEqual(['edge.webp', 'old.webp'])
    expect([...stub.objects].sort()).toEqual(['live.webp', 'odd.webp', 'young.webp'])
  })

  it('deletes nothing in dry-run mode', async () => {
    await put('doomed.webp')
    await tagForTrash(client, 'media', 'doomed.webp', ago(60))
    const result = await cleanupTrash(client, 'media', { now, dryRun: true })
    expect(result.deleted).toEqual(['doomed.webp'])
    expect(stub.objects.has('doomed.webp')).toBe(true)
  })
})
