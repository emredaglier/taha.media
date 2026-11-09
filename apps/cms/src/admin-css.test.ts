import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// #73: the admin stylesheet may only restyle field-error tooltips. A bare `.tooltip` rule
// would change every other Payload tooltip, and it would only show in the browser.
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

  it('scopes every selector to .field-error.tooltip', () => {
    for (const selector of selectors) {
      expect(selector).toMatch(/^\.field-error\.tooltip(\s|$)/)
    }
  })

  it('is unlayered and never forces with !important', () => {
    expect(css).not.toMatch(/@layer/)
    expect(css).not.toMatch(/!important/)
  })

  it('is imported by the Payload root layout after Payload CSS', () => {
    const layout = read('./app/(payload)/layout.tsx')
    const payloadCss = layout.indexOf("import '@payloadcms/next/css'")
    const adminCss = layout.indexOf("import './admin.css'")
    expect(payloadCss).toBeGreaterThanOrEqual(0)
    expect(adminCss).toBeGreaterThan(payloadCss)
  })
})
