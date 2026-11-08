'use client'

import { useRouter } from 'next/navigation'
import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react'

import { cardAt, focalFor, HELIX_SHAPE } from '../../lib/helix-geometry'
import {
  cardPresence,
  counter,
  createHelix,
  frontWork,
  isResting,
  openingOf,
  slotOf,
  startHelix,
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
import type { HelixShowreel } from '../Hero'
import { FrontWork, watchWorkLinks } from './FrontWork'
import {
  forgetWork,
  heroLoop,
  pageMarks,
  rememberedWork,
  rememberWork,
  SPACER_HEIGHT,
  watchLinks,
  zoomScroll,
} from './opening'
import { createHelixRenderer, HelixUnavailable } from './renderer'

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** The cards the Helix shows now: each with its slot, the Work on it and how present it is. */
const shownCards = (state: HelixState) =>
  visibleCards(state).map((card) => ({
    card,
    slot: slotOf(state, card),
    work: workOfCard(state, card),
    presence: cardPresence(state, card),
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
 *
 * It opens on the Showreel (#54): the static hero stays until the Helix's Showreel layer shows the
 * same picture, then the Helix takes over under it. Scrolling the page zooms the Showreel out into
 * the Helix (scrolling up reverses it); at the end of the scroll it melts away by itself, and from
 * then on Home locks to the screen. The wheel, a vertical drag and the arrow keys turn the Helix,
 * which settles on a card when the input ends. Enter, or a click on the front card, opens its Work
 * (remembered on the history entry, so coming back starts with it in front, past the Showreel); a
 * click on another card turns it to the front. On Home the logo replays the opening.
 *
 * Where the Helix is and where it goes lives in the motion model (`lib/helix-motion`); this
 * component feeds it input, draws it (only the bend of fast turning is its own, a look) and names
 * the front Work. `onFail` runs when WebGL2 can't start or the context is lost: the static Home
 * comes back.
 */
export function Helix({
  works,
  showreel,
  onFail,
}: {
  works: HelixWork[]
  showreel: HelixShowreel
  onFail: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const router = useRouter()
  const [front, setFront] = useState(() => frontOf(createHelix(works.length)))
  // The front Work's overlay comes in once the Helix is in place.
  const [frontShown, setFrontShown] = useState(false)

  // The Work whose static link has focus, and what the live region last said.
  const [focusedWork, setFocusedWork] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const fail = useEffectEvent(onFail)
  const open = useEffectEvent((work: number) => {
    const target = works[work]
    if (!target) return
    rememberWork(target.slug)
    router.push(`/isler/${target.slug}`)
  })

  const announce = useEffectEvent((work: number) => {
    const target = works[work]
    if (target) setAnnouncement(`${target.title}, ${work + 1} / ${works.length}`)
  })

  // A layout effect: coming back to a remembered Work, the Helix is on screen from the first paint,
  // with no frame of the static Home before it.
  useLayoutEffect(() => {
    const canvas = canvasRef.current!
    let renderer: ReturnType<typeof createHelixRenderer>
    try {
      renderer = createHelixRenderer(
        canvas,
        works.map((work) => work.poster),
        showreel,
        () => fail(),
      )
    } catch (error) {
      if (!(error instanceof HelixUnavailable)) throw error
      fail()
      return
    }

    const root = document.documentElement
    const marks = pageMarks(root)
    // The opening starts at the top of the page, after a reload too.
    const restoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'

    let state: HelixState = startHelix(works.length, rememberedWork(works))
    const apply = (input: HelixInput) => {
      state = stepHelix(state, input, performance.now())
      if (state.open !== null) open(state.open)
      if (state.arrived !== null) announce(state.arrived)
    }
    const locked = () => openingOf(state).locked

    // The hand-over: the static hero stays on screen until the Showreel layer matches it. Coming
    // back to a remembered Work there is nothing to match.
    let ready = false
    let handedOver = false
    if (state.phase.kind === 'hero') {
      void renderer.handOver(heroLoop()).then(() => (ready = true))
    }

    // --- drawing: every frame while the tab is visible, skipped while nothing moves
    const { bendEase, bendMax } = HELIX_SHAPE
    let bend = 0
    let shown = -1
    let frontIn = false
    let frameId = 0
    let lastFrame = 0
    const frame = () => {
      frameId = requestAnimationFrame(frame)
      const now = performance.now()
      const dt = Math.min((now - lastFrame) / 1000, 0.1)
      lastFrame = now
      state = stepHelix(state, { kind: 'frame' }, now)
      if (state.arrived !== null) announce(state.arrived)
      if (!handedOver && state.phase.kind === 'hero' && !ready) return
      const opening = openingOf(state)
      // Fast turning bends the cards; the bend follows the speed with time-based easing.
      const target = clamp(state.speed / 60, -bendMax, bendMax)
      bend += (target - bend) * (1 - (1 - bendEase) ** (dt * 60))
      if (
        !handedOver ||
        !isResting(state) ||
        Math.abs(bend) > 1e-4 ||
        renderer.stale ||
        opening.showreelSlot !== null
      ) {
        renderer.draw({
          cards: shownCards(state),
          band: visibleSlots(state),
          bend,
          zoom: opening.zoom,
          showreel:
            opening.showreelSlot === null
              ? null
              : { slot: opening.showreelSlot, melt: opening.melt },
        })
      }
      // The first frame drawn takes over from the static Home, in the same paint.
      if (!handedOver) {
        handedOver = true
        window.scrollTo(0, 0)
      }
      marks.show(state.phase.kind, opening)
      if (frontWork(state) !== shown) {
        shown = frontWork(state)
        setFront(frontOf(state))
      }
      if (opening.frontShown !== frontIn) {
        frontIn = opening.frontShown
        setFrontShown(frontIn)
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

    // --- the opening: the page's scroll drives the zoom (finger scroll too); the logo replays it
    const onScroll = () => {
      if (handedOver) apply({ kind: 'scroll', fraction: zoomScroll() })
    }
    const unwatchPageLinks = watchLinks({
      onHome: () => {
        forgetWork()
        apply({ kind: 'reset' })
        window.scrollTo(0, 0)
      },
      onWork: rememberWork,
    })

    // --- input. While the menu is open the Helix ignores it (and the menu may scroll). Until the
    // melt the page scrolls: the wheel, touch and the arrow keys are the browser's.
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || isMenuOpen(document)) return // ctrl + wheel is the browser's zoom
      if (!locked()) return
      event.preventDefault()
      apply({ kind: 'wheel', deltaY: event.deltaY, deltaMode: event.deltaMode })
    }

    let press: { id: number; x: number; y: number; lastY: number; travel: number } | null = null
    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || isMenuOpen(document) || !locked()) return
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
      if (isMenuOpen(document) || !locked()) return
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
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerEnd)
    canvas.addEventListener('pointercancel', onPointerEnd)
    document.addEventListener('visibilitychange', onVisibility)
    if (!document.hidden) start()

    return () => {
      stop()
      unwatchLinks()
      unwatchPageLinks()
      resized.disconnect()
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerEnd)
      canvas.removeEventListener('pointercancel', onPointerEnd)
      document.removeEventListener('visibilitychange', onVisibility)
      renderer.destroy()
      marks.clear()
      window.history.scrollRestoration = restoration
    }
  }, [works, showreel])

  return (
    <>
      {/* The page's height while the Helix runs: one screen plus the zoom's scroll length. */}
      <div aria-hidden="true" className="hidden helix:block" style={{ height: SPACER_HEIGHT }} />
      <div
        role="region"
        aria-label="Öne çıkan işler"
        className="helix:visible invisible fixed inset-0 z-0"
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 size-full cursor-grab touch-none select-none active:cursor-grabbing helix-hero:cursor-auto helix-hero:touch-pan-y"
        />
        <div
          className="transition-opacity duration-[600ms]"
          style={{ opacity: frontShown ? 1 : 0 }}
        >
          <FrontWork
            work={works[front.work]}
            position={front.counter.current}
            total={front.counter.total}
            focused={focusedWork === front.work}
            announcement={announcement}
          />
        </div>
      </div>
    </>
  )
}
