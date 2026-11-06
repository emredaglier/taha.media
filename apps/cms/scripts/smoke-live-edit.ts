import fs from 'node:fs'

import { assertLocalEnvironment, type SmokeManifest } from '@taha/cms-config/seed'

/**
 * Release-gate smoke, step 5 (`pnpm smoke`, smoke/run.ts): the one CMS edit. Runs after the web
 * container is up and its pages are cached, with REVALIDATE_URL and REVALIDATE_SECRET pointing at
 * the container, so only the revalidate call can bring the new title to the pages. Local
 * databases only.
 */
try {
  assertLocalEnvironment()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
const source = process.env.SMOKE_MANIFEST
if (!source) {
  console.error('Set SMOKE_MANIFEST to the manifest file smoke-prepare wrote.')
  process.exit(1)
}
if (!process.env.REVALIDATE_URL) {
  console.error('Set REVALIDATE_URL: the live edit has to reach the web container.')
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(source, 'utf8')) as SmokeManifest
const { default: config } = await import('@payload-config')
const { applyLiveEdit } = await import('@taha/cms-config/seed')
const { getPayload } = await import('payload')

const payload = await getPayload({ config })
try {
  await applyLiveEdit(payload, manifest)
  console.log(`live edit saved: ${manifest.liveEdit.slug} is now "${manifest.liveEdit.newTitle}"`)
} finally {
  await payload.destroy()
}
process.exit(0)
