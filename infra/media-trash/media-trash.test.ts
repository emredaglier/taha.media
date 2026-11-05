import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

import { TRASH_RETENTION_DAYS, TRASH_TAG_KEY } from '../../packages/cms-config/src/media-trash'

// Repo guard: the lifecycle rule we hand to S3-compatible storage must match what the CMS tags
// (the behaviour itself is tested in packages/cms-config/src/media-trash*.test.ts).
const rule = JSON.parse(readFileSync(new URL('./lifecycle.json', import.meta.url), 'utf8')) as {
  Rules: { Status: string; Filter: { Tag: { Key: string } }; Expiration: { Days: number } }[]
}

test('the lifecycle rule expires the tagged objects after the retention days', () => {
  expect(rule.Rules).toHaveLength(1)
  const [only] = rule.Rules
  expect(only?.Status).toBe('Enabled')
  expect(only?.Filter.Tag.Key).toBe(TRASH_TAG_KEY)
  expect(only?.Expiration.Days).toBe(TRASH_RETENTION_DAYS)
})
