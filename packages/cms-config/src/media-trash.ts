import {
  DeleteObjectCommand,
  GetObjectTaggingCommand,
  ListObjectsV2Command,
  PutObjectTaggingCommand,
  S3Client,
} from '@aws-sdk/client-s3'

// No relative imports: `cleanup` runs as a script (`node media-trash.ts`, ADR-0006).

/** Tag put on an object when its Image or Video is deleted. The value is the ISO time. */
export const TRASH_TAG_KEY = 'deleted-at'

/** How long a tagged object is kept before the cleanup removes it (ADR-0006). */
export const TRASH_RETENTION_DAYS = 30

/** Marks an object as deleted. The object stays; the cleanup removes it after 30 days. */
export async function tagForTrash(
  client: S3Client,
  bucket: string,
  key: string,
  now: Date = new Date(),
): Promise<void> {
  await client.send(
    new PutObjectTaggingCommand({
      Bucket: bucket,
      Key: key,
      Tagging: { TagSet: [{ Key: TRASH_TAG_KEY, Value: now.toISOString() }] },
    }),
  )
}

export type CleanupResult = { deleted: string[]; kept: number }

/**
 * Deletes every object tagged `deleted-at` at least 30 days ago. Untagged objects, younger ones
 * and a tag that is not a date are left alone. This is the only code that deletes media; it runs
 * with the media bucket's own credentials, never the backup's (ADR-0006).
 */
export async function cleanupTrash(
  client: S3Client,
  bucket: string,
  {
    now = new Date(),
    days = TRASH_RETENTION_DAYS,
    dryRun = false,
  }: { now?: Date; days?: number; dryRun?: boolean } = {},
): Promise<CleanupResult> {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000
  const deleted: string[] = []
  let kept = 0
  let token: string | undefined
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    )
    for (const { Key: key } of page.Contents ?? []) {
      if (!key) continue
      const { TagSet = [] } = await client.send(
        new GetObjectTaggingCommand({ Bucket: bucket, Key: key }),
      )
      const stamp = TagSet.find((t) => t.Key === TRASH_TAG_KEY)?.Value
      const at = stamp ? Date.parse(stamp) : Number.NaN
      if (Number.isNaN(at) || at > cutoff) {
        kept += 1
        continue
      }
      if (!dryRun) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      deleted.push(key)
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  return { deleted, kept }
}

/** `node media-trash.ts [--dry-run]` with the S3_* variables of the media bucket. */
async function main(): Promise<void> {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error('Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.')
  }
  const client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: process.env.S3_REGION || 'auto',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  })
  const dryRun = process.argv.includes('--dry-run')
  const { deleted, kept } = await cleanupTrash(client, S3_BUCKET, { dryRun })
  console.log(`${dryRun ? 'Would delete' : 'Deleted'} ${deleted.length}, kept ${kept}.`)
  for (const key of deleted) console.log(`  ${key}`)
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
