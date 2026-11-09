'use client'

import { useEffect, useId, useRef, type RefObject } from 'react'

import { nextFocus } from '../../lib/menu-a11y'

/** The note's text, exactly as decided (#45, "Hand control"). */
export const CONSENT_TEXT = 'Kameran yalnızca elini görmek için açılır; görüntü cihazından çıkmaz'

/** The note's name for assistive technology; the sentence is its description. */
export const CONSENT_TITLE = 'Kamera izni'

/** How long a swallowed press waits for its click after the pointer is released. */
const CLICK_WAIT_MS = 600

/**
 * Takes the press that dismissed the note away from the page: its compat `mousedown` and the
 * `click` that follows, which lands on `pressed` or an ancestor of it (the click's target is the
 * common ancestor of where the pointer went down and up). One-shot: it ends with the first click,
 * the next press, or `CLICK_WAIT_MS` after the release, so a later click is never eaten. It lives
 * on `window`, not in the note's effect, because Vazgeç unmounts the note before the click comes.
 */
function swallowPress(pressed: Node) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    clearTimeout(timer)
    window.removeEventListener('mousedown', onMouseDown, true)
    window.removeEventListener('pointerdown', stop, true)
    window.removeEventListener('pointerup', onRelease, true)
    window.removeEventListener('pointercancel', onRelease, true)
    window.removeEventListener('click', onClick, true)
  }
  const onMouseDown = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    window.removeEventListener('mousedown', onMouseDown, true)
  }
  const onRelease = () => {
    clearTimeout(timer)
    timer = setTimeout(stop, CLICK_WAIT_MS)
  }
  const onClick = (event: MouseEvent) => {
    stop()
    if (event.target instanceof Node && event.target.contains(pressed)) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  window.addEventListener('mousedown', onMouseDown, true)
  window.addEventListener('pointerdown', stop, true)
  window.addEventListener('pointerup', onRelease, true)
  window.addEventListener('pointercancel', onRelease, true)
  window.addEventListener('click', onClick, true)
  // A press that never gets released or clicked (the tab loses it) must not wait for ever.
  timer = setTimeout(stop, 10 * CLICK_WAIT_MS)
}

/**
 * The note before the browser's camera prompt: only Aç goes on to ask the browser. Focus moves to
 * its first button and stays inside: every Tab step is picked by `nextFocus`, because Safari's Tab
 * skips buttons by default and would leave the note (the `webkit-focus` lesson). Esc is Vazgeç,
 * and so is a press anywhere outside `within` (the toggle and the note), so the note is modal for
 * the pointer as well as the keyboard: that press and its click are taken away from the page, so
 * a Work card or link under the pointer is not opened (#74). The toggle takes focus back when the note closes.
 */
export function ConsentNote({
  onAccept,
  onDecline,
  within,
}: {
  onAccept: () => void
  onDecline: () => void
  /** The toggle with the note: a press inside it is not a press outside the note. */
  within: RefObject<HTMLElement | null>
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const textId = useId()

  useEffect(() => {
    const note = panel.current!
    note.querySelector('button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onDecline()
      } else if (event.key === 'Tab') {
        const target = nextFocus(
          [...note.querySelectorAll('button')],
          document.activeElement as HTMLButtonElement | null,
          event.shiftKey,
        )
        if (target) {
          event.preventDefault()
          target.focus()
        }
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      const inside = within.current ?? note
      if (event.target instanceof Node && inside.contains(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      if (event.target instanceof Node) swallowPress(event.target)
      onDecline()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [onDecline, within])

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={textId}
      className="absolute top-full right-0 z-50 mt-3 w-72 border border-text-muted bg-background-raised p-4 text-sm text-text"
    >
      <h2 id={titleId} className="sr-only">
        {CONSENT_TITLE}
      </h2>
      <p id={textId}>{CONSENT_TEXT}</p>
      <div className="mt-4 flex justify-end gap-6">
        <button type="button" className="underline" onClick={onDecline}>
          Vazgeç
        </button>
        <button type="button" className="underline" onClick={onAccept}>
          Aç
        </button>
      </div>
    </div>
  )
}
