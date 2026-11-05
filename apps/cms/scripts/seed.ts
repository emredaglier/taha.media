import { assertLocalEnvironment } from '@taha/cms-config/seed'

/**
 * `pnpm seed`: fills the local database with demo content. Run with `payload run` from apps/cms
 * against a migrated database. The environment is checked before the config is even loaded, so a
 * production environment is refused before anything is opened or written.
 */
try {
  assertLocalEnvironment()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const { default: config } = await import('@payload-config')
const { seedLocal } = await import('@taha/cms-config/seed')
const { getPayload } = await import('payload')

const payload = await getPayload({ config })
try {
  await seedLocal(payload, { log: (message) => console.log(`seed ${message}`) })
} finally {
  await payload.destroy()
}
process.exit(0)
