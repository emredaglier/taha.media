// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
// A real loop needs matchMedia and IntersectionObserver, which jsdom lacks: here it is a marker.
vi.mock('./LoopVideo', async () => {
  const { createElement } = await import('react')
  return {
    LoopVideo: ({ video, fill }: { video: { src: string }; fill?: boolean }) =>
      createElement('div', { 'data-loop': video.src, 'data-fill': String(fill) }),
  }
})
vi.mock('next/link', async () => {
  const { createElement } = await import('react')
  return {
    default: ({ children, ...props }: Record<string, unknown>) =>
      createElement('a', props, children as never),
  }
})

import type { ImageRead, VideoRead } from '@taha/cms-config'

import type { MenuMedia } from '../data/menu'
import { legalLink, menuLinks } from '../lib/nav-links'
import { SiteMenu } from './SiteMenu'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLElement
let root: Root

const COPYRIGHT = '© Taha Çiftçi'
const NO_MEDIA: MenuMedia = { isler: null, galeri: null, hakkimda: null }
const picture = (name: string): ImageRead => ({
  id: 1,
  src: `/${name}.webp`,
  srcset: '',
  width: 1600,
  height: 900,
  focalPoint: { x: 50, y: 50 },
  alt: `${name} alt`,
})
const loop = (name: string): VideoRead => ({
  id: 2,
  src: `/${name}.mp4`,
  width: 1600,
  height: 900,
  duration: 2,
  hasAudio: false,
  poster: picture(`${name}-poster`),
})
const render = (media: MenuMedia = NO_MEDIA) =>
  act(() => root.render(<SiteMenu copyright={COPYRIGHT} media={media} />))
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

describe('the Pinboard at rest', () => {
  it('holds three print links, with the word as a span on the tape', async () => {
    await render()
    const prints = [...container.querySelectorAll('nav a.pb-pr')]
    expect(prints.map((print) => print.querySelector('.pb-tape span')?.textContent)).toEqual(
      menuLinks.map(({ label }) => label),
    )
  })

  it('hides every decoration from assistive tech and holds no note words', async () => {
    await render()
    const nav = container.querySelector('nav')!
    const decorations = nav.querySelectorAll(
      '.pb-wall, .pb-spot, .pb-shadows, .pb-str, .pb-clip, .pb-story, .pb-note:not([data-k=legal])',
    )
    expect(decorations.length).toBeGreaterThan(5)
    for (const decoration of decorations) {
      expect(decoration.closest('[aria-hidden=true]')).not.toBeNull()
    }
    expect(nav.textContent).toBe(
      [...menuLinks.map(({ label }) => label), legalLink.label, COPYRIGHT].join(''),
    )
  })
})

describe('the frame pictures', () => {
  const slots = () =>
    [...container.querySelectorAll('nav a.pb-pr')].map((a) => a.querySelector('.pb-pic')!)

  it('leave the grey slot empty when there is no media', async () => {
    await render()
    expect(slots().map((slot) => slot.childElementCount)).toEqual([0, 0, 0])
  })

  it('show a loop in İşler, a still in Galeri and the portrait in Hakkımda, all hidden from assistive tech', async () => {
    await render({
      isler: loop('isler'),
      galeri: {
        kind: 'image',
        id: 3,
        caption: null,
        year: null,
        image: { ...picture('galeri'), fullSrc: '/g.webp' },
      },
      hakkimda: picture('portre'),
    })
    const [isler, galeri, hakkimda] = slots()
    expect(isler!.querySelector('[data-loop]')?.getAttribute('data-loop')).toBe('/isler.mp4')
    expect(isler!.querySelector('[data-loop]')?.getAttribute('data-fill')).toBe('true')
    expect(galeri!.querySelector('img')?.getAttribute('src')).toBe('/galeri.webp')
    expect(hakkimda!.querySelector('img')?.getAttribute('src')).toBe('/portre.webp')
    expect(galeri!.querySelector('img')?.getAttribute('alt')).toBe('')
    expect(hakkimda!.querySelector('img')?.getAttribute('alt')).toBe('')
    for (const slot of slots()) expect(slot.getAttribute('aria-hidden')).toBe('true')
    expect(links().map((link) => link.textContent)).toEqual([
      ...menuLinks.map(({ label }) => label),
      legalLink.label,
    ])
  })

  it('show a Gallery loop in Galeri', async () => {
    await render({
      ...NO_MEDIA,
      galeri: { kind: 'loop', id: 3, caption: null, year: null, video: loop('galeri') },
    })
    expect(slots()[1]!.querySelector('[data-loop]')?.getAttribute('data-loop')).toBe('/galeri.mp4')
    expect(slots()[0]!.childElementCount).toBe(0)
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
