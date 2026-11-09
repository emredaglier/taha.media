'use client'

import { useEffect, useId, useRef } from 'react'

import { nextFocus } from '../../lib/menu-a11y'

/** The coach's steps (#45, "First use"): short, in Turkish. */
export const COACH_STEPS = [
  { title: 'Gez', text: 'İşaret parmağın imleçtir. Elini gezdir, üstüne geldiğin şey canlanır.' },
  {
    title: 'Kaydır',
    text: 'Başparmağınla işaret parmağını birleştir ve elini yukarı ya da aşağı götür.',
  },
  { title: 'Tıkla', text: 'Parmaklarını hızlıca birleştirip aç.' },
] as const

/** The coach's name for assistive technology. */
export const COACH_TITLE = 'Elinle gezme'

/**
 * The coach (#58): three skippable steps, next to the preview. A light, non-modal dialog (the page
 * behind stays live): focus moves to its main button and Tab keeps it inside while it is open,
 * every step picked by `nextFocus` (Safari's Tab skips buttons, the `webkit-focus` lesson); Esc or
 * Atla skips it. Its Esc and Tab stop there, so the menu's own handlers don't act on them too.
 * When it closes, focus goes to `returnFocus()` (the "?" that opened it, or the toggle), not to
 * whatever had focus before: after a mouse click in Safari, that is the page's body. Each step is
 * announced politely. It isn't one of Hand control's overlays, so the hand can press its buttons
 * too: the last step's click is a good first try.
 */
export function HandCoach({
  step,
  onStep,
  onClose,
  returnFocus,
}: {
  step: number
  onStep: (step: number) => void
  onClose: () => void
  /** Where focus goes when the coach closes, read then. */
  returnFocus: () => HTMLElement | null
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const textId = useId()
  const last = step >= COACH_STEPS.length - 1
  const { title, text } = COACH_STEPS[Math.min(step, COACH_STEPS.length - 1)]!

  const focusBack = useRef(returnFocus)
  useEffect(() => {
    focusBack.current = returnFocus
  }, [returnFocus])

  // Focus comes in when it opens, and goes back when it closes.
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>('[data-coach-next]')?.focus()
    return () => focusBack.current()?.focus()
  }, [])

  useEffect(() => {
    const coach = panel.current!
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      } else if (event.key === 'Tab') {
        const target = nextFocus(
          [...coach.querySelectorAll('button')],
          document.activeElement as HTMLButtonElement | null,
          event.shiftKey,
        )
        if (target) {
          event.preventDefault()
          event.stopPropagation()
          target.focus()
        }
      }
    }
    // In the capture phase, so it comes before the menu's and the lightbox's own key handlers.
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={textId}
      data-hand-coach=""
      className="fixed top-16 left-56 z-[60] w-72 border border-text-muted bg-background-raised p-4 text-sm text-text"
    >
      <h2 id={titleId} className="sr-only">
        {COACH_TITLE}
      </h2>
      <div id={textId} aria-live="polite">
        <p className="text-xs text-text-muted">
          {step + 1} / {COACH_STEPS.length}
        </p>
        <p className="mt-1 uppercase">{title}</p>
        <p className="mt-1">{text}</p>
      </div>
      <div className="mt-4 flex justify-end gap-6">
        <button type="button" className="cursor-pointer underline" onClick={onClose}>
          Atla
        </button>
        <button
          type="button"
          data-coach-next=""
          className="cursor-pointer underline"
          onClick={() => (last ? onClose() : onStep(step + 1))}
        >
          {last ? 'Tamam' : 'İleri'}
        </button>
      </div>
    </div>
  )
}
