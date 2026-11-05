import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

import { TRASH_PREFIX } from '../../packages/cms-config/src/media-trash'

// Repo guard: the R2 lifecycle rule (R2 matches by key prefix only) must expire exactly the prefix
// the CMS moves deleted media to, after 30 days, and nothing else (ADR-0006).
const config = JSON.parse(readFileSync(new URL('./lifecycle.json', import.meta.url), 'utf8')) as {
  rules: {
    enabled: boolean
    conditions: { prefix: string }
    deleteObjectsTransition: { condition: { type: string; maxAge: number } }
  }[]
}

test('the lifecycle rule deletes objects under the trash prefix 30 days after the move', () => {
  expect(config.rules).toHaveLength(1)
  const [rule] = config.rules
  expect(rule?.enabled).toBe(true)
  expect(rule?.conditions.prefix).toBe(TRASH_PREFIX)
  expect(rule?.deleteObjectsTransition.condition).toEqual({
    type: 'Age',
    maxAge: 30 * 24 * 60 * 60,
  })
})
