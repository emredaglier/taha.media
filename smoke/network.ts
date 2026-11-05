// The request policy every browser spec shares. Requests may only go to the public instance (via
// Caddy), the asset prefix (rewritten to the instance) and the seeded media. Anything else is
// aborted, so a stray external request cannot hide in CI.
//
// CI builds the image with the real CDN prefix (https://cdn.taha.media/releases/<id>) but uploads
// only after smoke passes (ADR-0005, #17), so the CDN does not have the files yet: every
// `/_next/` request under the prefix is answered by the instance instead. Without that, the page
// never hydrates.
//
// Media: the demo seed (`pnpm seed`) refuses to run with R2 settings, so the smoke database keeps
// its files on local disk and stores `/api/images/file/<name>` URLs, which `web` does not serve
// (it has no API routes). The smoke answers those from the seed's folders (SMOKE_MEDIA_DIR).
import fs from 'node:fs'
import path from 'node:path'

import type { BrowserContext } from '@playwright/test'

const origin = (url: string) => new URL(url).origin

export type AssetTarget =
  | { kind: 'continue' }
  | { kind: 'rewrite'; url: string }
  | { kind: 'media'; collection: 'images' | 'videos'; name: string }
  | { kind: 'abort' }

const MEDIA_PATH = /^\/api\/(images|videos)\/file\/([^/]+)$/

/**
 * Where a request for `url` is answered from: the instance itself, the instance's `/_next/` file
 * for an asset-prefix URL, a seeded media file, or `abort` when the request must fail.
 */
export function assetTarget(
  url: string,
  config: { baseUrl: string; assetPrefix?: string | undefined },
): AssetTarget {
  const parsed = new URL(url)
  if (parsed.origin === origin(config.baseUrl)) {
    const media = MEDIA_PATH.exec(parsed.pathname)
    if (media) {
      return {
        kind: 'media',
        collection: media[1] as 'images' | 'videos',
        name: decodeURIComponent(media[2]!),
      }
    }
    return { kind: 'continue' }
  }
  if (config.assetPrefix && parsed.origin === origin(config.assetPrefix)) {
    const at = parsed.pathname.indexOf('/_next/')
    if (at === -1) return { kind: 'abort' }
    return { kind: 'rewrite', url: `${config.baseUrl}${parsed.pathname.slice(at)}` }
  }
  return { kind: 'abort' }
}

const MEDIA_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
}

/** The file of a seeded media object, or null when the name tries to leave the folder. */
export function mediaFile(
  mediaDir: string,
  target: { collection: string; name: string },
): { file: string; type: string } | null {
  const dir = path.resolve(mediaDir, target.collection)
  const file = path.resolve(dir, target.name)
  if (!file.startsWith(dir + path.sep)) return null
  return {
    file,
    type: MEDIA_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
  }
}

/** Applies `assetTarget` to every http(s) request of the context. */
export async function routeAssets(context: BrowserContext): Promise<void> {
  const baseUrl = process.env.SMOKE_BASE_URL
  const mediaDir = process.env.SMOKE_MEDIA_DIR
  if (!baseUrl || !mediaDir) throw new Error('Run through `pnpm smoke` (SMOKE_BASE_URL unset).')
  const assetPrefix = process.env.SMOKE_ASSET_PREFIX || undefined
  await context.route(/^https?:/, async (route) => {
    const target = assetTarget(route.request().url(), { baseUrl, assetPrefix })
    if (target.kind === 'continue') return route.continue()
    if (target.kind === 'abort') return route.abort('failed')
    if (target.kind === 'media') {
      const media = mediaFile(mediaDir, target)
      // A missing file answers 404, which the response rule then reports as a failure.
      if (!media || !fs.existsSync(media.file)) return route.fulfill({ status: 404 })
      return route.fulfill({ path: media.file, contentType: media.type })
    }
    try {
      const response = await route.fetch({ url: target.url })
      return await route.fulfill({
        response,
        headers: { ...response.headers(), 'access-control-allow-origin': '*' },
      })
    } catch (error) {
      // A test that ends while a file is still being fetched makes Playwright throw here. The
      // page is gone, so nobody needs the answer. Anything else is real.
      if (isTeardown(error)) return
      throw error
    }
  })
}

/** What Playwright throws for a request whose page, context or browser has gone away. */
const isTeardown = (error: unknown): boolean =>
  error instanceof Error &&
  /disposed|has been closed|Target (page|context|browser).*closed|Request context disposed/i.test(
    error.message,
  )
