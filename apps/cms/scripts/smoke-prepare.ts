import fs from 'node:fs'

import { assertLocalEnvironment } from '@taha/cms-config/seed'

/**
 * Release-gate smoke, step 2 (`pnpm smoke`, smoke/run.ts): after `pnpm seed`, adds a draft Work
 * and a renamed Work and writes what the browser spec expects to the file named by
 * SMOKE_MANIFEST. Local databases only, like the demo seed.
 */
try {
  assertLocalEnvironment()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
const target = process.env.SMOKE_MANIFEST
if (!target) {
  console.error('Set SMOKE_MANIFEST to the file the manifest is written to.')
  process.exit(1)
}

const { default: config } = await import('@payload-config')
const { prepareSmokeContent } = await import('@taha/cms-config/seed')
const { getPayload } = await import('payload')

const payload = await getPayload({ config })
try {
  const manifest = await prepareSmokeContent(payload)
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`smoke manifest written to ${target}`)
} finally {
  await payload.destroy()
}
process.exit(0)
