'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState } from 'react'

import { cardAt, focalFor, HELIX_SHAPE } from '../../lib/helix-geometry'
import {
  counter,
  createHelix,
  frontWork,
  isResting,
  slotOf,
  stepHelix,
  visibleCards,
  visibleSlots,
  workOfCard,
  type HelixInput,
  type HelixState,
} from '../../lib/helix-motion'
import { HELIX_TUNING } from '../../lib/helix-tuning'
import { isMenuOpen } from '../../lib/menu-a11y'
import type { HelixWork } from '../FeaturedWorks'
import { FrontWork, watchWorkLinks } from './FrontWork'
import { createHelixRenderer, HelixUnavailable } from './renderer'

/**
 * Set on `<html>` while the Helix runs. The CSS keyed to it hides the static Home (visually only:
 * its links stay for screen readers and keyboards), shows the Helix and locks the page. Nothing
 * is hidden before JavaScript has set it (ADR-0101).
 */
const MARK = 'helix'

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** The cards the Helix shows now: each with its slot and the Work on it. */
const shownCards = (state: HelixState) =>
  visibleCards(state).map((card) => ({
    card,
    slot: slotOf(state, card),
    work: workOfCard(state, card),
  }))

/** What the overlays name: the front Work and the counter. */
const frontOf = (state: HelixState) => ({ work: frontWork(state), counter: counter(state) })

/** Where a pointer event is on the canvas, in normalized device coordinates (y up). */
function pointOn(canvas: HTMLCanvasElement, event: PointerEvent) {
  const box = canvas.getBoundingClientRect()
  return {
    point: {
      x: ((event.clientX - box.left) / box.width) * 2 - 1,
      y: 1 - ((event.clientY - box.top) / box.height) * 2,
    },
    aspect: box.width / Math.max(1, box.height),
  }
}

/**
 * The Helix of Featured Works (#45), loaded only on a device that passed the capability check.
 * Home locks to the screen; the wheel, a vertical drag and the arrow keys turn the Helix, which
 * settles on a card when the input ends. Enter, or a click on the front card, opens its Work; a
 * click on another card turns it to the front. Where the Helix is and where it goes lives in the
 * motion model (`lib/helix-motion`); this component feeds it input, draws it (only the bend of fast
 * turning is its own, a look) and names the front Work. `onFail` runs when WebGL2 can't start or
 * the context is lost: the static Home comes back.
 */
export function Helix({ works, onFail }: { works: HelixWork[]; onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const router = useRouter()
  const [front, setFront] = useState(() => frontOf(createHelix(works.length)))

  // The Work whose static link has focus, and what the live region last said.
  const [focusedWork, setFocusedWork] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const fail = useEffectEvent(onFail)
  const open = useEffectEvent((work: number) => {
    const target = works[work]
    if (target) router.push(`/isler/${target.slug}`)
  })

  const announce = useEffectEvent((work: number) => {
    const target = works[work]
    if (target) setAnnouncement(`${target.title}, ${work + 1} / ${works.length}`)
  })

  useEffect(() => {
    const canvas = canvasRef.current!
    let renderer: ReturnType<typeof createHelixRenderer>
    try {
      renderer = createHelixRenderer(
        canvas,
        works.map((work) => work.poster),
        () => fail(),
      )
    } catch (error) {
      if (!(error instanceof HelixUnavailable)) throw error
      fail()
      return
    }

    const root = document.documentElement
    root.dataset.home = MARK
    window.scrollTo(0, 0)

    let state: HelixState = createHelix(works.length)
    const apply = (input: HelixInput) => {
      state = stepHelix(state, input, performance.now())
      if (state.open !== null) open(state.open)
      if (state.arrived !== null) announce(state.arrived)
    }

    // --- drawing: every frame while the tab is visible, skipped while nothing moves
    const { bendEase, bendMax } = HELIX_SHAPE
    let bend = 0
    let shown = -1
    let frameId = 0
    let lastFrame = 0
    const frame = () => {
      frameId = requestAnimationFrame(frame)
      const now = performance.now()
      const dt = Math.min((now - lastFrame) / 1000, 0.1)
      lastFrame = now
      state = stepHelix(state, { kind: 'frame' }, now)
      if (state.arrived !== null) announce(state.arrived)
      // Fast turning bends the cards; the bend follows the speed with time-based easing.
      const target = clamp(state.speed / 60, -bendMax, bendMax)
      bend += (target - bend) * (1 - (1 - bendEase) ** (dt * 60))
      if (!isResting(state) || Math.abs(bend) > 1e-4 || renderer.stale) {
        renderer.draw({ cards: shownCards(state), band: visibleSlots(state), bend })
      }
      if (frontWork(state) !== shown) {
        shown = frontWork(state)
        setFront(frontOf(state))
      }
    }
    const start = () => {
      if (frameId) return
      lastFrame = performance.now()
      frameId = requestAnimationFrame(frame)
    }
    const stop = () => {
      cancelAnimationFrame(frameId)
      frameId = 0
    }
    const onVisibility = () => (document.hidden ? stop() : start())

    renderer.resize()
    const resized = new ResizeObserver(() => renderer.resize())
    resized.observe(canvas)

    // --- input. While the menu is open the Helix ignores it (and the menu may scroll).
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || isMenuOpen(document)) return // ctrl + wheel is the browser's zoom
      event.preventDefault()
      apply({ kind: 'wheel', deltaY: event.deltaY, deltaMode: event.deltaMode })
    }

    let press: { id: number; x: number; y: number; lastY: number; travel: number } | null = null
    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || isMenuOpen(document)) return
      canvas.setPointerCapture(event.pointerId)
      const { clientX: x, clientY: y } = event
      press = { id: event.pointerId, x, y, lastY: y, travel: 0 }
      apply({ kind: 'dragStart' })
    }
    const onPointerMove = (event: PointerEvent) => {
      if (press?.id !== event.pointerId) return
      const up = press.lastY - event.clientY
      press.lastY = event.clientY
      press.travel = Math.max(
        press.travel,
        Math.hypot(event.clientX - press.x, event.clientY - press.y),
      )
      if (up !== 0) apply({ kind: 'dragMove', up })
    }
    const onPointerEnd = (event: PointerEvent) => {
      if (press?.id !== event.pointerId) return
      const click = event.type === 'pointerup' && press.travel < HELIX_TUNING.clickSlopPx
      press = null
      apply({ kind: 'dragEnd' })
      if (!click) return
      const { point, aspect } = pointOn(canvas, event)
      const card = cardAt(point, shownCards(state), focalFor(aspect), aspect)
      if (card >= 0) apply({ kind: 'card', card })
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (isMenuOpen(document)) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        apply({ kind: 'arrow', step: event.key === 'ArrowDown' ? 1 : -1 })
      } else if (event.key === 'Enter') {
        // Enter on a focused link or button is theirs (the logo, MENU, a Work's own link).
        const focused = document.activeElement
        if (!focused || focused === document.body || focused === canvas) apply({ kind: 'enter' })
      }
    }

    // Focus on a Work's (visually hidden) static link turns that Work to the front.
    const unwatchLinks = watchWorkLinks(works, (work, focused) => {
      setFocusedWork((current) => (focused ? work : current === work ? null : current))
      if (focused) apply({ kind: 'focus', work })
    })

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerEnd)
    canvas.addEventListener('pointercancel', onPointerEnd)
    document.addEventListener('visibilitychange', onVisibility)
    if (!document.hidden) start()

    return () => {
      stop()
      unwatchLinks()
      resized.disconnect()
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerEnd)
      canvas.removeEventListener('pointercancel', onPointerEnd)
      document.removeEventListener('visibilitychange', onVisibility)
      renderer.destroy()
      delete root.dataset.home
    }
  }, [works])

  return (
    <div
      role="region"
      aria-label="Öne çıkan işler"
      className="helix:visible invisible fixed inset-0 z-0"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 size-full cursor-grab touch-none select-none active:cursor-grabbing"
      />
      <FrontWork
        work={works[front.work]}
        position={front.counter.current}
        total={front.counter.total}
        focused={focusedWork === front.work}
        announcement={announcement}
      />
    </div>
  )
}
