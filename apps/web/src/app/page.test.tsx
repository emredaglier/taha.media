import { expect, test } from 'vitest'

import { renderRoute } from '../test/page-html'

test('the home page renders inside the shell, as Turkish HTML with an empty main', async () => {
  const outcome = await renderRoute('/')
  expect(outcome.kind).toBe('html')
  if (outcome.kind !== 'html') return
  expect(outcome.html).toContain('<html lang="tr"')
  expect(outcome.html).toMatch(/<main[^>]*id="main"[^>]*><\/main>/)
})
