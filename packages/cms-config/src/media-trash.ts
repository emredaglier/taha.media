import { CopyObjectCommand, DeleteObjectCommand, type S3Client } from '@aws-sdk/client-s3'

/**
 * Deleted media is moved under this prefix instead of being destroyed (ADR-0006). R2 lifecycle
 * rules match by key prefix only and R2 has no object tagging, so a prefix is the only way to
 * expire them: the 30-day rule on this prefix is `infra/media-trash/lifecycle.json`. Keep it in
 * sync with that file, the backup script's exclusion and the runbook in `infra/README.md`.
 */
export const TRASH_PREFIX = 'trash/'

/**
 * Moves one object to `trash/<key>`: copy first, delete only after the copy succeeded, so a failure
 * leaves the object where it was and never loses it. The 30 days count from the move. Returns
 * false (after calling `onError`) when the copy failed; it never throws, so a failed move cannot
 * block the record's deletion.
 */
export async function moveToTrash(
  client: S3Client,
  bucket: string,
  key: string,
  onError: (error: unknown) => void = () => undefined,
): Promise<boolean> {
  if (key.startsWith(TRASH_PREFIX)) return true
  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: `${TRASH_PREFIX}${key}`,
        CopySource: `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`,
      }),
    )
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (error) {
    onError(error)
    return false
  }
}
