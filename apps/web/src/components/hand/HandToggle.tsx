'use client'

import { useCallback, useEffect, useRef } from 'react'

import { handStatus, isRunning } from '../../lib/hand-control'
import { useHandToggleShown } from '../../lib/hand-toggle'
import { HAND_TUNING } from '../../lib/hand-tuning'
import { ConsentNote } from './ConsentNote'
import { dispatchHand, useHandControl } from './store'

/**
 * "Elinle gez" next to MENU (#56): a toggle button (`aria-pressed`) with the status line in a
 * polite live region, in Turkish. The first press opens the consent note. It renders nothing on
 * the server or where Hand control isn't offered (`showHandToggle`), so nobody sees it flash and
 * no other visitor's header shifts; while Hand control runs it stays, so it can always be turned
 * off.
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

  if (!shown && state.phase === 'off') return null
  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        aria-pressed={running}
        className="cursor-pointer text-sm uppercase"
        onClick={() => dispatchHand({ kind: 'toggle' })}
      >
        Elinle gez
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
    </div>
  )
}
