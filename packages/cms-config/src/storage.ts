import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import type { GeneratedAdapter } from '@payloadcms/plugin-cloud-storage/types'
import type { Plugin } from 'payload'

import { tagForTrash } from './media-trash'

/** Object keys are unique per upload, so every object is immutable (ADR-0005). */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

export type S3Options = {
  endpoint: string
  bucket: string
  region?: string
  accessKeyId: string
  secretAccessKey: string
  /** Path-style addressing, for a local S3 server; R2 does not need it. */
  forcePathStyle?: boolean
}

export type StorageOptions = {
  /**
   * Public base URL of the bucket (the R2 custom domain). The URL of an object is this plus its
   * key. When it is unset and there is no `s3`, files stay on local disk (development).
   */
  mediaOrigin?: string
  /** Needed by `cms` to upload. `web` only builds URLs and leaves it out. */
  s3?: S3Options
}

/** Public URL of a stored object. Never goes through Payload's file proxy. */
export function mediaUrl(mediaOrigin: string, key: string): string {
  return `${mediaOrigin.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`
}

/**
 * Storage by environment. Production sets `MEDIA_ORIGIN` on both apps and the `S3_*` variables on
 * `cms` (R2). With neither, files stay on local disk (development). `S3_*` without `MEDIA_ORIGIN`
 * is refused: uploads would succeed with URLs nobody can load.
 */
export function storageOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): StorageOptions {
  const mediaOrigin = env.MEDIA_ORIGIN || undefined
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env
  if (!S3_ENDPOINT && !S3_BUCKET && !S3_ACCESS_KEY_ID && !S3_SECRET_ACCESS_KEY) {
    return { ...(mediaOrigin ? { mediaOrigin } : {}) }
  }
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error(
      'S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together (see .env.example).',
    )
  }
  if (!mediaOrigin) {
    throw new Error('MEDIA_ORIGIN is not set: R2 uploads need the public media URL.')
  }
  return {
    mediaOrigin,
    s3: {
      endpoint: S3_ENDPOINT,
      bucket: S3_BUCKET,
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
      region: env.S3_REGION || 'auto',
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    },
  }
}

/** Where `images` files go on local disk when no object storage is configured. */
export function localImagesDir(databasePath: string): string {
  return path.join(path.dirname(path.resolve(databasePath)), 'images')
}

/** Where `videos` files go on local disk when no object storage is configured. */
export function localVideosDir(databasePath: string): string {
  return path.join(path.dirname(path.resolve(databasePath)), 'videos')
}

/**
 * Stores the `images` collection (the original and every generated size) and the `videos`
 * collection (the MP4 as uploaded). The plugin is always installed, so the database schema is the
 * same in every environment.
 *
 * - With `mediaOrigin`: objects go to S3-compatible storage (R2) with the immutable Cache-Control
 *   header, and URLs are `mediaOrigin + key`; `disablePayloadAccessControl` keeps the file proxy
 *   out of it.
 * - Without it (development): files go to the collection's local directory and Payload serves
 *   them from `/api/<collection>/file/<name>`.
 * - Deleting a record never destroys an object: R2 objects are tagged for the 30-day cleanup
 *   (`media-trash.ts`, ADR-0006), and local files stay (development).
 */
export function imagesStorage(
  options: StorageOptions,
  localImages: string,
  localVideos = path.join(path.dirname(localImages), 'videos'),
): Plugin {
  const { mediaOrigin, s3 } = options
  let client: S3Client | undefined
  const getClient = (config: S3Options) =>
    (client ??= new S3Client({
      endpoint: config.endpoint,
      region: config.region ?? 'auto',
      forcePathStyle: config.forcePathStyle ?? false,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    }))

  const buildAdapter = (slug: string, localDir: string, contentType: string): GeneratedAdapter => {
    const localPath = (key: string): string => {
      const target = path.resolve(localDir, key)
      if (!target.startsWith(path.resolve(localDir) + path.sep)) {
        throw new Error('Invalid file name.')
      }
      return target
    }
    return mediaOrigin
      ? {
          name: 'taha-s3',
          generateURL: ({ filename, prefix }) =>
            mediaUrl(mediaOrigin, prefix ? `${prefix}/${filename}` : filename),
          handleUpload: async ({ file, storageFilePath }) => {
            if (!s3) throw new Error('Object storage is not configured (set the S3_* variables).')
            await getClient(s3).send(
              new PutObjectCommand({
                Bucket: s3.bucket,
                Key: storageFilePath,
                Body: file.tempFilePath ? createReadStream(file.tempFilePath) : file.buffer,
                ContentType: file.mimeType,
                CacheControl: IMMUTABLE_CACHE_CONTROL,
              }),
            )
          },
          // Deleted media is tagged, not destroyed; the cleanup removes it after 30 days (ADR-0006).
          handleDelete: async ({ storageFilePath }) => {
            if (!s3) throw new Error('Object storage is not configured (set the S3_* variables).')
            await tagForTrash(getClient(s3), s3.bucket, storageFilePath)
          },
          staticHandler: () => new Response('Not found', { status: 404 }),
        }
      : {
          name: 'taha-local',
          generateURL: ({ filename, prefix }) =>
            `/api/${slug}/file/${prefix ? `${prefix}/${filename}` : filename}`,
          handleUpload: async ({ file, storageFilePath }) => {
            const target = localPath(storageFilePath)
            await fs.mkdir(path.dirname(target), { recursive: true })
            if (file.tempFilePath) await fs.copyFile(file.tempFilePath, target)
            else await fs.writeFile(target, file.buffer)
          },
          handleDelete: () => undefined,
          staticHandler: async (_req, { params }) => {
            try {
              const body = await fs.readFile(localPath(params.filename))
              return new Response(new Uint8Array(body), {
                headers: { 'Content-Type': contentType, 'Cache-Control': IMMUTABLE_CACHE_CONTROL },
              })
            } catch {
              return new Response('Not found', { status: 404 })
            }
          },
        }
  }

  // R2 URLs bypass Payload's file proxy; the local adapter needs it to serve files.
  const collection = (slug: string, localDir: string, contentType: string) => ({
    ...(mediaOrigin ? { disablePayloadAccessControl: true as const } : {}),
    adapter: () => buildAdapter(slug, localDir, contentType),
  })

  return cloudStoragePlugin({
    collections: {
      images: collection('images', localImages, 'image/webp'),
      videos: collection('videos', localVideos, 'video/mp4'),
    },
  })
}
