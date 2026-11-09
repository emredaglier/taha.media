'use client'

import { useEffect, useId, useRef } from 'react'

import { nextFocus } from '../../lib/menu-a11y'

/** The note's text, exactly as decided (#45, "Hand control"). */
export const CONSENT_TEXT = 'Kameran yalnızca elini görmek için açılır; görüntü cihazından çıkmaz'

/**
 * The note before the browser's camera prompt: only Aç goes on to ask the browser. Focus moves to
 * its first button and stays inside: every Tab step is picked by `nextFocus`, because Safari's Tab
 * skips buttons by default and would leave the note (the `webkit-focus` lesson). Esc is Vazgeç.
 * The toggle takes focus back when the note closes.
 */
export function ConsentNote({
  onAccept,
  onDecline,
}: {
  onAccept: () => void
  onDecline: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
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
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDecline])

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={textId}
      className="absolute top-full right-0 z-50 mt-3 w-72 border border-text-muted bg-background-raised p-4 text-sm text-text"
    >
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
