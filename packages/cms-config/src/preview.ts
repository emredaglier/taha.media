import type { CollectionConfig, GlobalConfig } from 'payload'

import type { PageSlug } from './tags'

/** Where each single-entry page is shown on the site. */
export const PAGE_PATHS: Record<PageSlug, string> = {
  site: '/',
  about: '/hakkimda',
  privacy: '/gizlilik',
}

/** A Work's own page on the site. */
export const workPath = (slug: string): string => `/isler/${slug}`

/**
 * The admin's preview link: the preview instance's entry route (`web` with `PREVIEW=1`,
 * `apps/web/src/app/preview/route.ts`), which turns on per-request rendering and opens `path`.
 */
export function previewLink(previewUrl: string, path: string): string {
  const url = new URL('/preview', previewUrl)
  url.searchParams.set('path', path)
  return url.toString()
}

/** Gives the Works admin a preview button that opens the Work's page on the preview instance. */
export function withWorkPreview(
  collection: CollectionConfig,
  previewUrl: string,
): CollectionConfig {
  return {
    ...collection,
    admin: {
      ...collection.admin,
      // A Work has no page until it has a slug (an unsaved new Work).
      preview: (doc) =>
        typeof doc.slug === 'string' && doc.slug
          ? previewLink(previewUrl, workPath(doc.slug))
          : null,
    },
  }
}

/** Gives a single-entry page's admin a preview button that opens its page on the preview instance. */
export function withPagePreview(global: GlobalConfig, previewUrl: string): GlobalConfig {
  const link = previewLink(previewUrl, PAGE_PATHS[global.slug as PageSlug])
  return { ...global, admin: { ...global.admin, preview: () => link } }
}

/** `PREVIEW_URL` as an http(s) origin, or a readable error instead of a broken button. */
export function parsePreviewUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`PREVIEW_URL is not a URL: "${value}" (see .env.example).`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`PREVIEW_URL must be an http(s) URL: "${value}" (see .env.example).`)
  }
  return url.origin
}
