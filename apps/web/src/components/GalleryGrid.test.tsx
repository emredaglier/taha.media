// @vitest-environment jsdom
import type { ImageRead, VideoRead } from '@taha/cms-config'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A real loop needs matchMedia and IntersectionObserver, which jsdom lacks: its own tests are in
// LoopVideo's use. Here it is a marker that says which video the lightbox put in front.
vi.mock('./LoopVideo', async () => {
  const { createElement } = await import('react')
  return {
    LoopVideo: ({ video }: { video: { src: string } }) =>
      createElement('div', { 'data-loop': video.src }),
  }
})

import type { GalleryItem } from '../data/gallery'
import { HAND_TUNING } from '../lib/hand-tuning'
import { GalleryGrid } from './GalleryGrid'
import { handGrabSink } from './hand/grab'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const picture = (id: number): ImageRead => ({
  id,
  src: `/img/${id}-1280.webp`,
  srcset: '',
  width: 3000,
  height: 2000,
  focalPoint: { x: 50, y: 50 },
  alt: `Görsel ${id}`,
})
const video: VideoRead = {
  id: 20,
  src: '/video/20.mp4',
  width: 1920,
  height: 1080,
  duration: 8,
  hasAudio: false,
  poster: picture(200),
}
const items: GalleryItem[] = [
  {
    id: 1,
    kind: 'image',
    caption: 'Birinci',
    year: 2025,
    image: { ...picture(1), fullSrc: '/img/1-2560.webp' },
  },
  { id: 2, kind: 'loop', caption: null, year: null, video },
  {
    id: 3,
    kind: 'image',
    caption: 'Üçüncü',
    year: null,
    image: { ...picture(3), fullSrc: '/img/3-2560.webp' },
  },
]

let container: HTMLElement
let root: Root

const render = (list: GalleryItem[] = items) => act(() => root.render(<GalleryGrid items={list} />))
const links = () => [...container.querySelectorAll<HTMLAnchorElement>('figure a')]
const dialog = () => container.querySelector<HTMLElement>('[role="dialog"]')
const buttons = () => [...dialog()!.querySelectorAll<HTMLButtonElement>('button')]
const button = (name: string) => buttons().find((b) => b.textContent === name)!
const label = () => dialog()?.getAttribute('aria-label')

/** Dispatches a click and reports whether the page's own handler cancelled the navigation. */
function click(element: Element, init: MouseEventInit = {}): boolean {
  let prevented = false
  // Runs after React's handler (the root is inside body). Cancelling here keeps jsdom from
  // trying to navigate when the handler left the link alone.
  const record = (event: Event) => {
    prevented = event.defaultPrevented
    event.preventDefault()
  }
  document.body.addEventListener('click', record)
  act(() => {
    element.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }),
    )
  })
  document.body.removeEventListener('click', record)
  return prevented
}

const press = (key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  act(() => {
    document.activeElement?.dispatchEvent(event)
  })
  return event
}

const touch = (type: string, x: number, y: number, init: PointerEventInit = {}) =>
  act(() => {
    // jsdom has no PointerEvent: a plain event with the fields the handler reads.
    const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      clientX: x,
      clientY: y,
      pointerType: 'touch',
      isPrimary: true,
      ...init,
    })
    container
      .querySelector('[role="dialog"] img, [role="dialog"] [data-loop]')!
      .dispatchEvent(event)
  })

const open = async (index: number) => {
  await render()
  click(links()[index]!)
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.documentElement.style.overflow = ''
})

describe('the grid, before anything is opened', () => {
  it('has a link to the full-size file for every item, and no dialog', async () => {
    await render()
    expect(links().map((link) => link.getAttribute('href'))).toEqual([
      '/img/1-2560.webp',
      '/video/20.mp4',
      '/img/3-2560.webp',
    ])
    expect(dialog()).toBeNull()
  })

  it('shows a loop as its poster', async () => {
    await render()
    expect(links()[1]!.querySelector('img')!.getAttribute('src')).toBe('/img/200-1280.webp')
    expect(container.querySelector('video, [data-loop]')).toBeNull()
  })
})

describe('opening', () => {
  it('opens the clicked item in a modal dialog and cancels the navigation to the file', async () => {
    await render()
    expect(click(links()[2]!)).toBe(true)
    expect(dialog()).not.toBeNull()
    expect(dialog()!.getAttribute('aria-modal')).toBe('true')
    expect(label()).toBe('Galeri, 3 / 3: Üçüncü')
    expect(dialog()!.querySelector('img')!.getAttribute('src')).toBe('/img/3-1280.webp')
  })

  it('leaves the link alone for a click that asks for the file (Cmd, Ctrl, Shift, middle)', async () => {
    await render()
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      expect(click(links()[0]!, init)).toBe(false)
      expect(dialog()).toBeNull()
    }
  })

  it('stops the page behind from scrolling, and moves focus to Kapat', async () => {
    await open(0)
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.activeElement).toBe(button('Kapat'))
  })

  it('puts a loop in front for a loop item, and a picture for an image', async () => {
    await open(1)
    expect(dialog()!.querySelector('[data-loop]')!.getAttribute('data-loop')).toBe('/video/20.mp4')
    expect(dialog()!.querySelector('img')).toBeNull()
    expect(label()).toBe('Galeri, 2 / 3')
  })
})

describe('stepping', () => {
  it('goes to the next item with ArrowRight and the previous with ArrowLeft', async () => {
    await open(0)
    press('ArrowRight')
    expect(label()).toBe('Galeri, 2 / 3')
    press('ArrowRight')
    expect(label()).toBe('Galeri, 3 / 3: Üçüncü')
    press('ArrowLeft')
    expect(label()).toBe('Galeri, 2 / 3')
  })

  it('wraps from the last item to the first and from the first to the last', async () => {
    await open(2)
    press('ArrowRight')
    expect(label()).toBe('Galeri, 1 / 3: Birinci')
    press('ArrowLeft')
    expect(label()).toBe('Galeri, 3 / 3: Üçüncü')
  })

  it('steps with the Önceki and Sonraki buttons, and keeps focus on the one used', async () => {
    await open(0)
    act(() => button('Sonraki').focus())
    click(button('Sonraki'))
    expect(label()).toBe('Galeri, 2 / 3')
    expect(document.activeElement).toBe(button('Sonraki'))
    click(button('Önceki'))
    click(button('Önceki'))
    expect(label()).toBe('Galeri, 3 / 3: Üçüncü')
  })

  it('says the place and the caption in a live region', async () => {
    await open(0)
    const live = dialog()!.querySelector('[aria-live="polite"]')!
    expect(live.textContent).toBe('1 / 3 · Birinci · 2025')
    press('ArrowRight')
    expect(live.textContent).toBe('2 / 3')
  })

  it('leaves an arrow with a modifier to the browser (Alt+Left is Back)', async () => {
    await open(1)
    expect(press('ArrowLeft', { altKey: true }).defaultPrevented).toBe(false)
    expect(label()).toBe('Galeri, 2 / 3')
  })

  it('swipes: left for the next item, right for the previous, and ignores a short or vertical one', async () => {
    await open(0)
    touch('pointerdown', 200, 100)
    touch('pointerup', 80, 110)
    expect(label()).toBe('Galeri, 2 / 3')
    touch('pointerdown', 80, 100)
    touch('pointerup', 200, 100)
    expect(label()).toBe('Galeri, 1 / 3: Birinci')
    touch('pointerdown', 100, 100)
    touch('pointerup', 120, 100)
    touch('pointerdown', 100, 100)
    touch('pointerup', 100, 400)
    expect(label()).toBe('Galeri, 1 / 3: Birinci')
  })

  it('does not swipe with a mouse, so dragging the picture does nothing', async () => {
    await open(0)
    touch('pointerdown', 200, 100, { pointerType: 'mouse' })
    touch('pointerup', 80, 100, { pointerType: 'mouse' })
    expect(label()).toBe('Galeri, 1 / 3: Birinci')
  })
})

describe('closing', () => {
  it('closes on Escape, unlocks the page and returns focus to the item that was opened', async () => {
    await open(1)
    press('Escape')
    expect(dialog()).toBeNull()
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.activeElement).toBe(links()[1])
  })

  it('returns to the item that was opened, not the one the visitor stepped to', async () => {
    await open(0)
    press('ArrowRight')
    press('ArrowRight')
    press('Escape')
    expect(document.activeElement).toBe(links()[0])
  })

  it('closes with Kapat and with a click on the empty backdrop, and not on the picture', async () => {
    await open(0)
    click(dialog()!.querySelector('img')!)
    expect(dialog()).not.toBeNull()
    click(button('Kapat'))
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(links()[0])

    click(links()[0]!)
    click(dialog()!.querySelector('img')!.parentElement!.parentElement!)
    expect(dialog()).toBeNull()
  })

  it('stops listening for keys once closed', async () => {
    await open(0)
    press('Escape')
    expect(press('ArrowRight').defaultPrevented).toBe(false)
  })

  it('reopens on another item afterwards', async () => {
    await open(0)
    press('Escape')
    click(links()[2]!)
    expect(label()).toBe('Galeri, 3 / 3: Üçüncü')
  })
})

describe('Hand control (#59)', () => {
  const { stepWidths } = HAND_TUNING.grab
  /** Hand control's grab moving `right` screen widths, in ten moves, then letting go. */
  const grab = (right: number) =>
    act(() => {
      const sink = handGrabSink()!
      for (let i = 0; i < 10; i++) sink.move(0, right / 10)
      sink.end()
    })

  it('claims the grab only while the lightbox is open, and lets it go on closing', async () => {
    await render()
    expect(handGrabSink()).toBeNull()
    click(links()[0]!)
    expect(handGrabSink()).not.toBeNull()
    click(button('Kapat'))
    expect(dialog()).toBeNull()
    expect(handGrabSink()).toBeNull()
  })

  it('a grab moving left steps to the next item, one moving right to the previous', async () => {
    await open(0)
    grab(-stepWidths * 1.2)
    expect(label()).toBe('Galeri, 2 / 3')
    grab(stepWidths * 1.2)
    grab(stepWidths * 1.2)
    expect(label()).toBe('Galeri, 3 / 3: Üçüncü')
  })

  it('takes the whole grab, up or down alike (move and end say so, so the page neither scrolls nor glides)', async () => {
    await open(0)
    const sink = handGrabSink()!
    let took = false
    act(() => {
      took = sink.move(0.2, 0)
    })
    expect(took).toBe(true)
    expect(sink.end()).toBe(true)
    expect(label()).toBe('Galeri, 1 / 3: Birinci')
  })
})

describe('the focus trap', () => {
  it('walks Tab through Kapat, Önceki and Sonraki, and wraps at the end', async () => {
    await open(0)
    const order = ['Kapat', 'Önceki', 'Sonraki', 'Kapat']
    for (const name of order.slice(1)) {
      expect(press('Tab').defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(button(name))
    }
  })

  it('walks Shift+Tab back and wraps from Kapat to Sonraki', async () => {
    await open(0)
    press('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(button('Sonraki'))
    press('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(button('Önceki'))
  })

  // Safari's own Tab skips links and buttons, so every step is picked by the page.
  it('picks every step itself, and pulls focus back in if it was outside', async () => {
    await open(0)
    act(() => (document.activeElement as HTMLElement).blur())
    expect(document.activeElement).toBe(document.body)
    press('Tab')
    expect(dialog()!.contains(document.activeElement)).toBe(true)
  })
})

describe('one item', () => {
  it('has no previous and next, and the arrows leave it where it is', async () => {
    await render([items[0]!])
    click(links()[0]!)
    expect(buttons().map((b) => b.textContent)).toEqual(['Kapat'])
    press('ArrowRight')
    expect(label()).toBe('Galeri, 1 / 1: Birinci')
    press('Tab')
    expect(document.activeElement).toBe(button('Kapat'))
  })
})
