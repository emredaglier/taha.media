import { accountsFromEnv } from '@taha/cms-config/seed'

/**
 * `pnpm seed:production`: the first-deploy seed (ADR-0013). Creates the two Editors named in
 * SEED_DEVELOPER_* and SEED_TAHA_*, empty Site and About pages and a draft Privacy text. Run it
 * once on the server against the migrated database; running it again changes nothing.
 */
let accounts
try {
  accounts = accountsFromEnv()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const { default: config } = await import('@payload-config')
const { seedProduction } = await import('@taha/cms-config/seed')
const { getPayload } = await import('payload')

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
