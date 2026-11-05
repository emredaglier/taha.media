import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { en } from '@payloadcms/translations/languages/en'
import { tr } from '@payloadcms/translations/languages/tr'
import { buildConfig, type PayloadEmailAdapter, type SanitizedConfig } from 'payload'
import sharp from 'sharp'

import { Images } from './collections/Images'
import { Users } from './collections/Users'
import { Videos } from './collections/Videos'
import { Works } from './collections/Works'
import { buildDatabase, DEFAULT_BUSY_TIMEOUT_MS } from './db'
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

  return buildConfig({
    admin: {
      user: Users.slug,
      meta: { titleSuffix: '- taha.media' },
      ...(options.adminBaseDir ? { importMap: { baseDir: options.adminBaseDir } } : {}),
    },
    collections: [Users, Images, Videos, Works],
    sharp,
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
  return {
    role,
    databasePath,
    secret,
    ...(pushFlag === undefined ? {} : { push: pushFlag === 'true' }),
    origins,
    storage: storageOptionsFromEnv(env),
  }
}
