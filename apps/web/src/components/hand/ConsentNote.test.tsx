// @vitest-environment jsdom
import { act, createRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CLICK_WAIT_MS, ConsentNote, UNRELEASED_PRESS_WAIT_MS } from './ConsentNote'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const onDecline = vi.fn()
const onLink = vi.fn()
const onPageDown = vi.fn()

/**
 * A page link (stands for a Work card) beside the toggle and its note. Like the real toggle, the
 * wrapper closes the note as soon as Vazgeç arrives, so the note is gone before the click.
 */
function Page() {
  const within = createRef<HTMLDivElement>()
  const [open, setOpen] = useState(true)
  return (
    <div>
      <a href="#work" id="work" onClick={onLink}>
        Work
      </a>
      <div ref={within}>
        <button type="button" id="toggle">
          Toggle
        </button>
        {open && (
          <ConsentNote
            onAccept={() => {}}
            onDecline={() => {
              onDecline()
              setOpen(false)
            }}
            within={within}
          />
        )}
      </div>
    </div>
  )
}

let root: Root
let container: HTMLElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(<Page />))
  for (const type of ['pointerdown', 'mousedown']) document.body.addEventListener(type, onPageDown)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  for (const type of ['pointerdown', 'mousedown'])
    document.body.removeEventListener(type, onPageDown)
  vi.clearAllMocks()
  vi.useRealTimers()
})

const link = () => document.getElementById('work')!
const toggle = () => document.getElementById('toggle')!

const fire = <E extends Event>(target: Element, event: E): E => {
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}
const init = { bubbles: true, cancelable: true }

/** One press and release on `target` (released on `up`): what a browser sends before the click. */
const press = (target: Element, up: Element = target) => {
  const down = fire(target, new PointerEvent('pointerdown', init))
  const mouse = fire(target, new MouseEvent('mousedown', init))
  fire(up, new PointerEvent('pointerup', init))
  fire(up, new MouseEvent('mouseup', init))
  return { down, mouse }
}
const click = (target: Element) => fire(target, new MouseEvent('click', init))

describe('a press outside the consent note (#74)', () => {
  it('is Vazgeç, and neither the press nor the click after it reaches the page', () => {
    const { down, mouse } = press(link())
    click(link())
    expect(onDecline).toHaveBeenCalledTimes(1)
    expect(onPageDown).not.toHaveBeenCalled()
    expect(down.defaultPrevented).toBe(true)
    expect(mouse.defaultPrevented).toBe(true)
    expect(onLink).not.toHaveBeenCalled()
  })

  it('does not follow the link: the click is cancelled', () => {
    press(link())
    expect(click(link()).defaultPrevented).toBe(true)
  })

  it('swallows only that one click: the next click on the link works', () => {
    press(link())
    click(link())
    const later = click(link())
    expect(onLink).toHaveBeenCalledTimes(1)
    expect(later.defaultPrevented).toBe(false)
  })

  it('swallows the click of a press released elsewhere, which lands on a shared ancestor', () => {
    press(link(), document.body)
    click(container)
    expect(click(container).defaultPrevented).toBe(false)
    expect(onLink).not.toHaveBeenCalled()
  })

  it('does not swallow a click on something the press never touched', () => {
    press(container)
    click(link())
    expect(onLink).toHaveBeenCalledTimes(1)
  })

  it('stops waiting for the click a short while after the release', () => {
    vi.useFakeTimers()
    press(link())
    act(() => {
      vi.advanceTimersByTime(CLICK_WAIT_MS)
    })
    click(link())
    expect(onLink).toHaveBeenCalledTimes(1)
  })

  describe('a press that is never released', () => {
    const unreleased = () => {
      vi.useFakeTimers()
      fire(link(), new PointerEvent('pointerdown', init))
      fire(link(), new MouseEvent('mousedown', init))
    }

    it('still has its click swallowed until the longer wait is over', () => {
      unreleased()
      act(() => {
        vi.advanceTimersByTime(UNRELEASED_PRESS_WAIT_MS - 1)
      })
      expect(click(link()).defaultPrevented).toBe(true)
    })

    it('stops waiting then', () => {
      unreleased()
      act(() => {
        vi.advanceTimersByTime(UNRELEASED_PRESS_WAIT_MS)
      })
      expect(click(link()).defaultPrevented).toBe(false)
      expect(onLink).toHaveBeenCalledTimes(1)
    })
  })

  it('stops waiting when the next press begins', () => {
    press(link())
    press(toggle())
    click(link())
    expect(onLink).toHaveBeenCalledTimes(1)
  })
})

describe('a press on the toggle', () => {
  it('is not swallowed: the reducer closes the note as before', () => {
    const { down } = press(toggle())
    const event = click(toggle())
    expect(onDecline).not.toHaveBeenCalled()
    expect(onPageDown).toHaveBeenCalled()
    expect(down.defaultPrevented).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  })
})
