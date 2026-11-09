'use client'

import { useCallback, useEffect, useRef } from 'react'

import { handStatus, isRunning } from '../../lib/hand-control'
import { useHandToggleShown } from '../../lib/hand-toggle'
import { HAND_TUNING } from '../../lib/hand-tuning'
import { ConsentNote } from './ConsentNote'
import { dispatchHand, useHandControl } from './store'

/** The toggle's label and type: the reserved slot is sized by the same text in the same type. */
const LABEL = 'Elinle gez'
const TYPE = 'text-sm uppercase'

/**
 * "Elinle gez" next to MENU (#56): a toggle button (`aria-pressed`) with the status line in a
 * polite live region, in Turkish. The first press opens the consent note.
 *
 * Its slot is reserved from the first paint on a desktop pointer (owner, 2026-11-09): the server
 * can't know the pointer, so it renders the slot for everyone, holding the label invisibly
 * (`aria-hidden`, not focusable), and CSS shows it only under `fine-hover:` (`globals.css`); other
 * devices get no slot and no gap. Once `showHandToggle` passes, the button fades in over that
 * placeholder, so nothing in the header moves. Where it doesn't pass (no camera, Save-Data, a weak
 * device), the slot stays an empty gap. While Hand control runs, the button stays, so it can
 * always be turned off.
 */
export function HandToggle() {
  const shown = useHandToggleShown()
  const state = useHandControl()
  const button = useRef<HTMLButtonElement>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const status = handStatus(state)
  const running = isRunning(state)

  // A note clears itself after a moment; the next one starts its own timer.
  useEffect(() => {
    if (!state.notice) return
    const timer = setTimeout(() => dispatchHand({ kind: 'dismissNotice' }), HAND_TUNING.noticeMs)
    return () => clearTimeout(timer)
  }, [state.notice])

  // Focus comes back to the toggle when the consent note closes, however it closed.
  const wasConsenting = useRef(false)
  useEffect(() => {
    if (wasConsenting.current && state.phase !== 'consenting') button.current?.focus()
    wasConsenting.current = state.phase === 'consenting'
  }, [state.phase])

  const accept = useCallback(() => dispatchHand({ kind: 'accept' }), [])
  const decline = useCallback(() => dispatchHand({ kind: 'decline' }), [])

  const offered = shown || state.phase !== 'off'
  return (
    <div ref={wrapper} data-hand-toggle-slot="" className="relative hidden fine-hover:block">
      <span aria-hidden="true" className={`invisible whitespace-nowrap ${TYPE}`}>
        {LABEL}
      </span>
      {offered ? (
        <>
          <button
            ref={button}
            type="button"
            aria-pressed={running}
            className={`absolute inset-0 cursor-pointer whitespace-nowrap motion-safe:animate-hand-in ${TYPE}`}
            onClick={() => dispatchHand({ kind: 'toggle' })}
          >
            {LABEL}
          </button>
          <p
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute top-full right-0 mt-1 text-xs whitespace-nowrap text-text-muted"
          >
            {status}
          </p>
          {state.phase === 'consenting' ? (
            <ConsentNote onAccept={accept} onDecline={decline} within={wrapper} />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
