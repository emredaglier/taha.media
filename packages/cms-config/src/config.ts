import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { en } from '@payloadcms/translations/languages/en'
import { tr } from '@payloadcms/translations/languages/tr'
import {
  buildConfig,
  type CollectionConfig,
  type GlobalConfig,
  type PayloadEmailAdapter,
  type SanitizedConfig,
} from 'payload'
import sharp from 'sharp'

import { Gallery } from './collections/Gallery'
import { Images } from './collections/Images'
import { Users } from './collections/Users'
import { Videos } from './collections/Videos'
import { Works } from './collections/Works'
import { About } from './globals/About'
import { Privacy } from './globals/Privacy'
import { Site } from './globals/Site'
import type { PageSlug } from './tags'
import { VIDEO_LIMITS } from './video-limits'
import { parsePreviewUrl, withPagePreview, withWorkPreview } from './preview'
import { buildDatabase, DEFAULT_BUSY_TIMEOUT_MS } from './db'
import type { MediaCollection } from './media-references'
import {
  galleryRevalidationHooks,
  httpRevalidationTransport,
  mediaRevalidationHooks,
  pageRevalidationHooks,
  workRevalidationHooks,
  type RevalidationTransport,
} from './revalidation'
import {
  imagesStorage,
  localImagesDir,
  localVideosDir,
  storageOptionsFromEnv,
  type StorageOptions,
} from './storage'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Committed migrations live next to the source, whichever app loads the config. */
export const MIGRATION_DIR = path.join(here, 'migrations')
/** Generated Payload types are committed here. */
export const TYPES_FILE = path.join(here, 'payload-types.ts')

/** The only content locale for now (ADR-0002). Adding `en` later is a config change. */
export const CONTENT_LOCALE = 'tr'

const MB = 1024 * 1024
/**
 * Payload's multipart defaults (20 MB a file, 50 MB a request) answer an English 413 before our
 * Turkish cap check runs, so the file limit sits 4 MB above the largest video cap.
 */
export const UPLOAD_FILE_LIMIT =
  Math.max(...Object.values(VIDEO_LIMITS).map((limits) => limits.maxBytes)) + 4 * MB

export type SiteConfigOptions = {
  /**
   * `cms` is the admin app: it owns the database file, WAL setup and schema changes.
   * `web` is the public site: same collections, opened read-only (ADR-0001, ADR-0003).
   */
  role: 'cms' | 'web'
  /** Filesystem path of the SQLite file. */
  databasePath: string
  secret: string
  /** Push the schema on startup (local dev only). Defaults to `NODE_ENV === 'development'`. */
  push?: boolean
  busyTimeoutMs?: number
  /** Origins allowed to call the admin API with cookies, e.g. the tailnet HTTPS URL. */
  origins?: string[]
  /** Base directory Payload resolves admin component paths against (the cms app's `src`). */
  adminBaseDir?: string
  /**
   * Media storage. Without `mediaOrigin` (and `s3`), images stay on local disk next to the
   * database file (development). Production sets both, see `storageOptionsFromEnv`.
   */
  storage?: StorageOptions
  /**
   * Where `cms` sends the cache tags a publish, unpublish or delete touched (ADR-0012). Only the
   * writer uses it. Omit it and nothing is sent (local dev without `web`, most tests).
   */
  revalidate?: RevalidationTransport
  /**
   * Origin of the preview instance (`web` with `PREVIEW=1`, Tailscale only, ADR-0001). With it,
   * the admin shows a preview button on Works and each single-entry page; without it, none.
   * Only the admin uses it.
   */
  previewUrl?: string
}

/** Nothing sends mail (ADR-0013). Declared so Payload doesn't warn at boot; it only logs. */
const emailAdapter: PayloadEmailAdapter = ({ payload }) => ({
  name: 'console',
  defaultFromAddress: 'noreply@taha.media',
  defaultFromName: 'taha.media',
  sendEmail: async (message) => {
    payload.logger.info({ msg: `Email not sent (no adapter). Subject: "${message.subject}"` })
  },
})

/** The Payload config both apps build: `cms` as the writer, `web` as a read-only reader. */
export function buildSiteConfig(options: SiteConfigOptions): Promise<SanitizedConfig> {
  const writer = options.role === 'cms'
  const push = writer && (options.push ?? process.env.NODE_ENV === 'development')

  if (writer) {
    fs.mkdirSync(path.dirname(path.resolve(options.databasePath)), { recursive: true })
  }

  const revalidate = writer ? options.revalidate : undefined
  const previewUrl = writer ? options.previewUrl : undefined
  // Payload adds the position field and hook of an `orderable` collection to the `fields` and
  // `hooks.beforeChange` arrays in place. A collection with drafts (Works) gets a fresh `fields`
  // array from Payload first; Gallery has none, so it gets copies here. Without them a second
  // build in one process (tests) finds `_order` twice and piles up hooks.
  const gallery: CollectionConfig = {
    ...Gallery,
    fields: [...Gallery.fields],
    hooks: { ...Gallery.hooks, beforeChange: [...(Gallery.hooks?.beforeChange ?? [])] },
  }
  let works = revalidate ? withWorkRevalidation(Works, revalidate) : Works
  if (previewUrl) works = withWorkPreview(works, previewUrl)
  const globals = [Site, About, Privacy].map((global) => {
    const revalidated = revalidate ? withPageRevalidation(global, revalidate) : global
    return previewUrl ? withPagePreview(revalidated, previewUrl) : revalidated
  })

  return buildConfig({
    admin: {
      user: Users.slug,
      components: {
        afterLogin: ['@taha/cms-config/admin/hide-forgot-password#HideForgotPassword'],
      },
      meta: { titleSuffix: '- taha.media' },
      ...(options.adminBaseDir ? { importMap: { baseDir: options.adminBaseDir } } : {}),
    },
    collections: [
      Users,
      revalidate ? withMediaRevalidation(Images, revalidate) : Images,
      revalidate ? withMediaRevalidation(Videos, revalidate) : Videos,
      works,
      revalidate ? withGalleryRevalidation(gallery, revalidate) : gallery,
    ],
    globals,
    sharp,
    // Default editor; fields that take rich text set their own restricted one (rich-text.ts).
    editor: lexicalEditor(),
    // The admin speaks Turkish; English stays selectable for the developer.
    i18n: { fallbackLanguage: 'tr', supportedLanguages: { tr, en } },
    localization: {
      locales: [{ code: CONTENT_LOCALE, label: 'Türkçe' }],
      defaultLocale: CONTENT_LOCALE,
      fallback: true,
    },
    db: buildDatabase({
      databasePath: options.databasePath,
      writer,
      push,
      migrationDir: MIGRATION_DIR,
      busyTimeoutMs: options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS,
    }),
    plugins: [
      imagesStorage(
        options.storage ?? {},
        localImagesDir(options.databasePath),
        localVideosDir(options.databasePath),
      ),
    ],
    upload: { limits: { fileSize: UPLOAD_FILE_LIMIT }, requestSizeLimit: UPLOAD_FILE_LIMIT + MB },
    cors: options.origins ?? [],
    csrf: options.origins ?? [],
    email: emailAdapter,
    // web reads through the Local API; nothing needs GraphQL.
    graphQL: { disable: true },
    secret: options.secret,
    telemetry: false,
    typescript: { outputFile: TYPES_FILE },
  })
}

function withWorkRevalidation(
  collection: CollectionConfig,
  transport: RevalidationTransport,
): CollectionConfig {
  const hooks = workRevalidationHooks(transport)
  const own = collection.hooks ?? {}
  return {
    ...collection,
    hooks: {
      ...own,
      // Last, so it sees the data every other hook has settled.
      beforeChange: [...(own.beforeChange ?? []), hooks.beforeChange],
      afterChange: [...(own.afterChange ?? []), hooks.afterChange],
      afterDelete: [...(own.afterDelete ?? []), hooks.afterDelete],
    },
  }
}

function withGalleryRevalidation(
  collection: CollectionConfig,
  transport: RevalidationTransport,
): CollectionConfig {
  const hooks = galleryRevalidationHooks(transport)
  const own = collection.hooks ?? {}
  return {
    ...collection,
    hooks: {
      ...own,
      afterChange: [...(own.afterChange ?? []), hooks.afterChange],
      afterDelete: [...(own.afterDelete ?? []), hooks.afterDelete],
    },
  }
}

function withMediaRevalidation(
  collection: CollectionConfig,
  transport: RevalidationTransport,
): CollectionConfig {
  const hooks = mediaRevalidationHooks(collection.slug as MediaCollection, transport)
  const own = collection.hooks ?? {}
  return {
    ...collection,
    hooks: {
      ...own,
      afterChange: [...(own.afterChange ?? []), hooks.afterChange],
    },
  }
}

function withPageRevalidation(
  global: GlobalConfig,
  transport: RevalidationTransport,
): GlobalConfig {
  const hooks = pageRevalidationHooks(global.slug as PageSlug, transport)
  const own = global.hooks ?? {}
  return {
    ...global,
    hooks: {
      ...own,
      beforeChange: [...(own.beforeChange ?? []), hooks.beforeChange],
      afterChange: [...(own.afterChange ?? []), hooks.afterChange],
    },
  }
}

/** `"a, b,,c"` -> `['a', 'b', 'c']`: split on commas, trim, drop empty entries. */
const commaList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

/** Reads the shared env vars. Throws a readable error instead of booting half-configured. */
export function siteConfigOptionsFromEnv(
  role: SiteConfigOptions['role'],
  env: Record<string, string | undefined> = process.env,
): SiteConfigOptions {
  const databasePath = env.DATABASE_PATH
  const secret = env.PAYLOAD_SECRET
  if (!databasePath) throw new Error('DATABASE_PATH is not set (see .env.example).')
  if (!secret) throw new Error('PAYLOAD_SECRET is not set (see .env.example).')
  const pushFlag = env.PAYLOAD_DB_PUSH
  const origins = commaList(env.CMS_ORIGINS)
  // Payload's CSRF check is off when the list is empty, so a production cms must name its
  // origins. `next build` (also NODE_ENV=production) never serves a request, so it is exempt.
  const buildPhase = env.NEXT_PHASE === 'phase-production-build'
  if (role === 'cms' && env.NODE_ENV === 'production' && !buildPhase && origins.length === 0) {
    throw new Error(
      'CMS_ORIGINS is not set: production cms needs it for CSRF and CORS (see .env.example).',
    )
  }
  const revalidate = role === 'cms' ? revalidationFromEnv(env, buildPhase) : undefined
  const previewUrl = role === 'cms' && env.PREVIEW_URL?.trim()
  return {
    role,
    databasePath,
    secret,
    ...(pushFlag === undefined ? {} : { push: pushFlag === 'true' }),
    origins,
    storage: storageOptionsFromEnv(env),
    ...(revalidate ? { revalidate } : {}),
    ...(previewUrl ? { previewUrl: parsePreviewUrl(previewUrl) } : {}),
  }
}

/**
 * `cms` POSTs cache tags to `web`'s internal revalidate route (ADR-0012). Without it, published
 * changes never reach the prerendered pages, so a production cms (and anything else that writes
 * with the cms config, such as the seed in the migrate container) refuses to start without it.
 */
function revalidationFromEnv(
  env: Record<string, string | undefined>,
  buildPhase: boolean,
): RevalidationTransport | undefined {
  const url = env.REVALIDATE_URL?.trim()
  const secret = env.REVALIDATE_SECRET
  if (!url) {
    if (env.NODE_ENV === 'production' && !buildPhase) {
      throw new Error(
        'REVALIDATE_URL is not set: production cms must tell web what to refresh (see .env.example).',
      )
    }
    return undefined
  }
  if (!secret) {
    throw new Error('REVALIDATE_URL is set but REVALIDATE_SECRET is not (see .env.example).')
  }
  const timeoutMs = Number(env.REVALIDATE_TIMEOUT_MS)
  return httpRevalidationTransport({
    url,
    secret,
    ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
  })
}
