import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// #73: the admin stylesheet may only restyle field-error tooltips. A bare `.tooltip` rule
// would change every other Payload tooltip, and it would only show in the browser. This
// guards #73's rule that no other tooltip changes. Selectors such as
// `.file-field > .field-error.tooltip` pass; `.tooltip` and `.tooltip-content` fail.
const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

describe('admin stylesheet (#73)', () => {
  const css = read('./app/(payload)/admin.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].flatMap((match) =>
    match[1]!.split(',').map((selector) => selector.trim()),
  )

  it('has rules', () => {
    expect(selectors.length).toBeGreaterThan(0)
  })

  it('only targets .field-error.tooltip or its descendants', () => {
    for (const selector of selectors) {
      expect(selector).toMatch(/\.field-error\.tooltip(?![\w-])/)
    }
  })

  it('is unlayered and never forces with !important', () => {
    expect(css).not.toMatch(/@layer/)
    expect(css).not.toMatch(/!important/)
  })
})
