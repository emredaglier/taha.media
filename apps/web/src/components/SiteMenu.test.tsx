// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('next/link', async () => {
  const { createElement } = await import('react')
  return {
    default: ({ children, ...props }: Record<string, unknown>) =>
      createElement('a', props, children as never),
  }
})

import { legalLink, menuLinks } from '../lib/nav-links'
import { SiteMenu } from './SiteMenu'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLElement
let root: Root

const COPYRIGHT = '© 2026 Taha Çiftçi'
const render = () => act(() => root.render(<SiteMenu copyright={COPYRIGHT} />))
const toggle = () => container.querySelector('summary') as HTMLElement
const links = () => [...container.querySelectorAll<HTMLAnchorElement>('nav a')]
const details = () => container.querySelector('details')!
const press = (key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  act(() => {
    document.activeElement?.dispatchEvent(event)
  })
  return event
}

beforeEach(() => {
  pathname = '/'
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.documentElement.style.overflow = ''
})

describe('closed', () => {
  it('reads MENU, points at its panel and is not expanded', async () => {
    await render()
    expect(toggle().textContent).toBe('MENU')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector(`#${toggle().getAttribute('aria-controls')}`)).not.toBeNull()
    expect(details().open).toBe(false)
  })
})

describe('the links', () => {
  it('are the three pages, then Gizlilik, then the © line', async () => {
    await render()
    expect(links().map((link) => link.getAttribute('href'))).toEqual([
      ...menuLinks.map(({ href }) => href),
      legalLink.href,
    ])
    expect(links().at(-1)!.textContent).toBe('Gizlilik')
    const nav = container.querySelector('nav')!
    expect(nav.textContent).toContain(COPYRIGHT)
    const last = links().at(-1)!
    expect(last.compareDocumentPosition(nav.querySelector('p')!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('marks Gizlilik as the current page on /gizlilik', async () => {
    pathname = '/gizlilik'
    await render()
    expect(links().at(-1)!.getAttribute('aria-current')).toBe('page')
    expect(links()[0]!.getAttribute('aria-current')).toBeNull()
  })
})

describe('open', () => {
  beforeEach(async () => {
    await render()
    act(() => toggle().click())
  })

  it('reads KAPAT, is expanded and moves focus into the menu', () => {
    expect(toggle().textContent).toBe('KAPAT')
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(details().open).toBe(true)
    expect(document.activeElement).toBe(links()[0])
  })

  it('stops the page behind from scrolling, and lets it scroll again once closed', () => {
    expect(document.documentElement.style.overflow).toBe('hidden')
    act(() => toggle().click())
    expect(document.documentElement.style.overflow).toBe('')
    expect(toggle().textContent).toBe('MENU')
  })

  it('closes on Escape and returns focus to MENU', () => {
    const event = press('Escape')
    expect(event.defaultPrevented).toBe(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle())
  })

  it('traps Tab and Shift+Tab inside MENU and every link, Gizlilik included', () => {
    const all = links()
    const first = all[0]!
    const last = all.at(-1)!
    expect(last.getAttribute('href')).toBe('/gizlilik')
    last.focus()
    press('Tab')
    expect(document.activeElement).toBe(toggle())
    press('Tab')
    expect(document.activeElement).toBe(first)
    for (const link of all.slice(1)) {
      press('Tab')
      expect(document.activeElement).toBe(link)
    }
    press('Tab')
    expect(document.activeElement).toBe(toggle())
    press('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(last)
    press('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(all.at(-2))
  })

  it.each([1, 3])('closes when link %i is followed', (index) => {
    act(() => links()[index]!.click())
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('closes when the route changes', async () => {
    pathname = '/isler'
    await render()
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(links()[0]!.getAttribute('aria-current')).toBe('page')
  })
})
