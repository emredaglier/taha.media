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
 * The coach (#58): three skippable steps, next to the preview. Focus moves to its main button and
 * stays inside while it is open, every Tab step picked by `nextFocus` (Safari's Tab skips buttons,
 * the `webkit-focus` lesson); Esc or Atla skips it, and focus goes back to where it was. Each step
 * is announced politely. It isn't one of Hand control's overlays, so the hand can press its
 * buttons too: the last step's click is a good first try.
 */
export function HandCoach({
  step,
  onStep,
  onClose,
}: {
  step: number
  onStep: (step: number) => void
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const textId = useId()
  const last = step >= COACH_STEPS.length - 1
  const { title, text } = COACH_STEPS[Math.min(step, COACH_STEPS.length - 1)]!

  // Focus comes in when it opens, and goes back to where it was when it closes.
  useEffect(() => {
    const before = document.activeElement
    panel.current?.querySelector<HTMLButtonElement>('[data-coach-next]')?.focus()
    return () => {
      if (before instanceof HTMLElement && before.isConnected && before !== document.body) {
        before.focus()
      }
    }
  }, [])

  useEffect(() => {
    const coach = panel.current!
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'Tab') {
        const target = nextFocus(
          [...coach.querySelectorAll('button')],
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
  }, [onClose])

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
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
