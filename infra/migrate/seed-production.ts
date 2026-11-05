// Run once on the server, after the first migration (ADR-0013):
//   docker compose run --rm migrate node node_modules/payload/bin.js run seed-production.ts
// Same as `pnpm seed:production` (apps/cms/scripts/seed-production.ts) but against this image's
// config. The Editors come from SEED_DEVELOPER_* and SEED_TAHA_* in cms.env.
import { getPayload } from 'payload'

import config from './payload.config.ts'
import { accountsFromEnv } from './src/seed/accounts.ts'
import { seedProduction } from './src/seed/production.ts'

let accounts
try {
  accounts = accountsFromEnv()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const payload = await getPayload({ config })
let code = 0
try {
  await seedProduction(payload, { accounts, log: (message) => console.log(`seed ${message}`) })
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  code = 1
} finally {
  await payload.destroy()
}
process.exit(code)
