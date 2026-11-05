import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

import { TRASH_PREFIX } from '../../packages/cms-config/src/media-trash'

// Repo guard (ADR-0006): R2 lifecycle rules match by key prefix only, so the rule must expire the
// prefix the CMS moves deleted media to, and nothing outside it.
const config = JSON.parse(readFileSync(new URL('./lifecycle.json', import.meta.url), 'utf8')) as {
  rules: {
    enabled: boolean
    conditions: { prefix: string }
    deleteObjectsTransition?: { condition: { type: string; maxAge: number } }
  }[]
}

const expiring = config.rules.filter((rule) => rule.deleteObjectsTransition)

test('expires only objects under the prefix the CMS moves deleted media to', () => {
  expect(expiring.length).toBeGreaterThan(0)
  for (const rule of expiring) expect(rule.conditions.prefix).toBe(TRASH_PREFIX)
})

test('keeps deleted media recoverable for at least the 30 days ADR-0006 promises', () => {
  const thirtyDays = 30 * 24 * 60 * 60
  for (const rule of expiring) {
    expect(rule.deleteObjectsTransition?.condition.maxAge).toBeGreaterThanOrEqual(thirtyDays)
  }
})
