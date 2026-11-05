import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { Client } from '@libsql/client'
import { getPayload, type Payload } from 'payload'

import { buildSiteConfig } from './config'
import type { User } from './payload-types'

/**
 * Integration-test harness for the main seam (spec #1, Seam 1): a fresh SQLite file in a temp
 * directory, its schema built from the committed migrations (as production's migrate step does),
 * and a `cms`-role Payload that writes to it the way the admin does. `web` reads the same file
 * through its data module: point it here with `webEnv`.
 *
 * Call once per test file in `beforeAll` and `close()` in `afterAll`. Vitest runs files in
 * separate processes, so files never share a database.
 */
export type TestSite = {
  /** The SQLite file, for anything that opens the database itself. */
  databasePath: string
  /** The `cms`-role Local API (the writer), schema migrated. */
  cms: Payload
  /** The writer's raw libsql connection, for pragma checks. */
  cmsClient: () => Client
  /** Env vars that make `web` (`siteConfigOptionsFromEnv('web')`) open this database. */
  webEnv: { DATABASE_PATH: string; PAYLOAD_SECRET: string }
  /** Creates an Editor, for writes with access rules applied (`user`, `overrideAccess: false`). */
  createEditor: (credentials?: { email?: string; password?: string }) => Promise<User>
  close: () => Promise<void>
}

const SECRET = 'test-secret'

export async function createTestSite(): Promise<TestSite> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taha-site-'))
  const databasePath = path.join(dir, 'site.db')
  const cms = await getPayload({
    // Unique per site, so a second site in the same process gets its own instance.
    key: `test-cms-${randomUUID()}`,
    config: await buildSiteConfig({ role: 'cms', databasePath, secret: SECRET, push: false }),
  })
  await cms.db.migrate()

  let editors = 0
  return {
    databasePath,
    cms,
    // Payload types `db.client` as the libsql config; at runtime it is the connected client.
    cmsClient: () => (cms.db as unknown as { client: Client }).client,
    webEnv: { DATABASE_PATH: databasePath, PAYLOAD_SECRET: SECRET },
    createEditor: ({ email, password } = {}) =>
      cms.create({
        collection: 'users',
        data: {
          email: email ?? `editor-${++editors}@example.com`,
          password: password ?? 'correct-horse-battery',
        },
      }),
    close: async () => {
      await cms.db.destroy?.()
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}
