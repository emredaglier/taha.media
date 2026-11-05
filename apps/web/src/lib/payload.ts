import { buildSiteConfig, siteConfigOptionsFromEnv } from '@taha/cms-config'
import { getPayload, type Payload } from 'payload'

/**
 * The one way `web` reaches content: Payload's Local API over the shared SQLite file (ADR-0001).
 * Only the data module (`src/data/`) calls it; pages read through the data module.
 *
 * The `web` role never migrates or pushes, and its connection runs `PRAGMA query_only = ON` on
 * every connection (packages/cms-config/src/db.ts), so any write fails. The config is built
 * lazily, on the first read, so `next build` needs no DATABASE_PATH unless a page reads content.
 */
let cached: Promise<Payload> | undefined

export function getWebPayload(): Promise<Payload> {
  cached ??= buildSiteConfig(siteConfigOptionsFromEnv('web'))
    .then((config) => getPayload({ config, key: 'web' }))
    .catch((error: unknown) => {
      cached = undefined // let the next read retry instead of caching the failure
      throw error
    })
  return cached
}
