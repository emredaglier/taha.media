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

import { SiteMenu } from './SiteMenu'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLElement
let root: Root

const render = () => act(() => root.render(<SiteMenu />))
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

  it('traps Tab and Shift+Tab inside MENU and the links', () => {
    const [first, , last] = links()
    last!.focus()
    press('Tab')
    expect(document.activeElement).toBe(toggle())
    press('Tab')
    expect(document.activeElement).toBe(first)
    press('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(toggle())
    press('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('closes when a link is followed', () => {
    act(() => links()[1]!.click())
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('closes when the route changes', async () => {
    pathname = '/isler'
    await render()
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(links()[0]!.getAttribute('aria-current')).toBe('page')
  })
})
