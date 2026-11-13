'use client'

import { useRouter } from 'next/navigation'
import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react'

import { cardAt, HELIX_SHAPE, lensFor } from '../../lib/helix-geometry'
import {
  cardPresence,
  counter,
  createHelix,
  frontWork,
  liveRegionAfter,
  openingOf,
  previewLoops,
  showsLoop,
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
import { loaded } from '../../lib/home-loader'
import { isMenuOpen } from '../../lib/menu-a11y'
import type { HelixWork } from '../FeaturedWorks'
import type { HelixShowreel } from '../Hero'
import { followFocus, FrontWork, watchWorkLinks } from './FrontWork'
import {
  forgetWork,
  handOverFadeMs,
  heroLoop,
  pageMarks,
  rememberedWork,
  rememberWork,
  SPACER_HEIGHT,
  watchLinks,
  zoomScroll,
} from './opening'
import { capturePointer, createHoverLevels, devicePoint, watchPointer } from './pointer'
import { createHelixRenderer, HelixUnavailable } from './renderer'

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** The cards the Helix shows now, each with its slot (what a click or the pointer picks from). */
const shownCards = (state: HelixState) =>
  visibleCards(state).map((card) => ({ card, slot: slotOf(state, card) }))

/** What the overlays name: the front Work and the counter. */
const frontOf = (state: HelixState) => ({ work: frontWork(state), counter: counter(state) })

/** The canvas's shape (width / height) and the focal length the Helix has on it. */
const lensOf = (canvas: HTMLCanvasElement) => lensFor(canvas.clientWidth, canvas.clientHeight)

/**
 * The Helix of Featured Works (#45), loaded only on a device that passed the capability check.
 *
 * It opens on the Showreel (#54): the static hero stays until the Helix's Showreel layer shows the
 * same picture, then the Helix takes over under it. Scrolling the page zooms the Showreel out into
 * the Helix (scrolling up reverses it); at the end of the scroll it melts away by itself, and from
 * then on Home locks to the screen. The wheel, a vertical drag and the arrow keys turn the Helix, which settles on a
 * card when the input ends. Enter, or a click on the front card, opens its Work
 * (remembered on the history entry, so coming back starts with it in front, past the Showreel); a
 * click on another card turns it to the front. On Home the logo replays the opening.
 *
 * Everything is seen through the glyph mosaic (#68): the top and bottom melt into letters and away,
 * and so do far cards and, while the pointer rests on a card (the hovered card), the others; the
 * cursor turns the letters back into picture where it passes and turning slides their rows. The
 * cards in the sharp middle band, and the hovered one, play their Preview loops; a card whose loop
 * stopped freezes on its last frame until its Work is off screen, and every other card shows its
 * poster.
 *
 * Where the Helix is and where it goes, and which loops play or hold a frame, live in the motion
 * model (`lib/helix-motion`); this component feeds it input, draws it (the bend of fast turning
 * and the hover easing in and out are its own, a look) and names the front Work. `onFail` runs
 * when WebGL2 can't start or the context is lost: the static Home comes back.
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

  // What the live region does after a step: speaks a stop on a new Work, or clears what it said
  // when the model forgot it (a reset, a skipped opening), so the same words can be heard again.
  const speak = useEffectEvent((before: HelixState, after: HelixState) => {
    const region = liveRegionAfter(before, after)
    if (region === 'clear') setAnnouncement('')
    else if (region !== 'keep') {
      const target = works[region.speak]
      if (target) setAnnouncement(`${target.title}, ${region.speak + 1} / ${works.length}`)
    }
  })

  // A layout effect: coming back to a remembered Work, the Helix is on screen from the first paint,
  // with no frame of the static Home before it.
  useLayoutEffect(() => {
    const canvas = canvasRef.current!
    let renderer: ReturnType<typeof createHelixRenderer>
    try {
      renderer = createHelixRenderer(canvas, works, showreel, () => fail())
    } catch (error) {
      if (!(error instanceof HelixUnavailable)) throw error
      loaded()
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
      const before = state
      state = stepHelix(state, input, performance.now())
      if (state.open !== null) open(state.open)
      speak(before, state)
    }
    const locked = () => openingOf(state).locked
    const crt = HELIX_TUNING.crtBend

    // The hand-over: the static hero stays on screen until the Showreel layer matches it. Coming
    // back to a remembered Work there is nothing to match.
    let ready = false
    let handedOver = false
    if (state.phase.kind === 'hero') {
      const shown = heroLoop()
      // The phone variant isn't the Helix's picture: its static picture fades out, not cuts.
      marks.fade(handOverFadeMs(shown))
      void renderer.handOver(shown).then(() => (ready = true))
    }

    // --- hovering: the card under a resting pointer is hovered, and the others melt a little
    const pointer = watchPointer(canvas)
    const hoverLevels = createHoverLevels(state.cards)
    let hovered: number | null = null
    // The Works whose loop frame is held (none at first): their cards freeze on it once they stop.
    let held: ReadonlySet<number> = new Set()
    // A press on the Helix (a drag, or a click when it doesn't travel).
    let press: { id: number; x: number; y: number; lastY: number; travel: number } | null = null

    // --- drawing: every frame while the tab is visible (the loops and the heat trail move on)
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
      const before = state
      state = stepHelix(state, { kind: 'frame' }, now)
      speak(before, state)
      if (!handedOver && state.phase.kind === 'hero' && !ready) return
      const opening = openingOf(state)
      // The marks first: the hero's text is measured from the page as they lay it out.
      marks.show(state.phase.kind, opening)
      // Fast turning bends the cards; the bend follows the speed with time-based easing.
      const target = clamp(state.speed / 60, -bendMax, bendMax)
      bend += (target - bend) * (1 - (1 - bendEase) ** (dt * 60))

      // The hovered card changes only while the pointer rests, and there is none during a press,
      // while the zoom runs, or without a pointer over it.
      const { aspect, focal } = lensOf(canvas)
      const sample = pointer.sample(dt, crt)
      if (state.phase.kind === 'hero' || !sample.point) hovered = null
      else if (sample.resting && !press) {
        const card = cardAt(sample.point, shownCards(state), focal, aspect)
        hovered = card >= 0 ? card : null
      }
      hoverLevels.step(hovered, dt)
      const loops = previewLoops(state, focal, hovered, held)
      held = loops.held

      renderer.draw({
        cards: visibleCards(state).map((card) => ({
          slot: slotOf(state, card),
          work: workOfCard(state, card),
          presence: cardPresence(state, card),
          showsLoop: showsLoop(state, loops, card),
          hovered: hoverLevels.hovered(card),
          dimmed: hoverLevels.dimmed(card),
        })),
        band: visibleSlots(state),
        bend,
        progress: state.progress,
        zoom: opening.zoom,
        heroGone: opening.heroGone,
        crt,
        showreel:
          opening.showreelSlot === null ? null : { slot: opening.showreelSlot, melt: opening.melt },
        playing: loops.playing,
        held: loops.held,
        cursor: sample.cursor,
        dt,
      })
      // The first frame drawn takes over from the static Home, in the same paint, and the loader
      // (if it is still up) goes.
      if (!handedOver) {
        handedOver = true
        window.scrollTo(0, 0)
        loaded()
      }
      if (frontWork(state) !== shown) {
        shown = frontWork(state)
        setFront(frontOf(state))
        // Focus stays with what is in front when the wheel or the arrow keys turn the Helix.
        followFocus(works, shown)
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
    // While the tab is hidden nothing is drawn and no video plays (held frames stay).
    const onVisibility = () => {
      if (!document.hidden) return start()
      stop()
      renderer.pause()
    }

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

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || isMenuOpen(document) || !locked()) return
      capturePointer(canvas, event.pointerId)
      const { clientX: x, clientY: y } = event
      press = { id: event.pointerId, x, y, lastY: y, travel: 0 }
      // A pressed pointer isn't resting: no card is hovered until it rests again after the press,
      // so a hovered card dragged away stops playing and the others stop dimming.
      hovered = null
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
      const { aspect, focal } = lensOf(canvas)
      const point = devicePoint(canvas, event.clientX, event.clientY, crt)
      const card = cardAt(point, shownCards(state), focal, aspect)
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
      pointer.destroy()
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
      loaded()
      window.history.scrollRestoration = restoration
    }
  }, [works, showreel])

  return (
    <>
      {/* The page's height while the Helix runs: one screen plus the zoom's scroll length. */}
      <div aria-hidden="true" className="hidden helix:block" style={{ height: SPACER_HEIGHT }} />
      {/* No landmark of its own: the static section of Work links is "Öne çıkan işler". */}
      <div className="helix:visible invisible fixed inset-0 z-0">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 size-full cursor-grab touch-none select-none active:cursor-grabbing helix-hero:cursor-auto helix-hero:touch-pan-y"
        />
        {/* Shown at once while a Work link has focus: the ring is never hidden (WCAG 2.4.7). */}
        <div
          className="transition-opacity"
          style={{
            opacity: frontShown || focusedWork !== null ? 1 : 0,
            transitionDuration: focusedWork !== null ? '0ms' : `${HELIX_TUNING.frontFadeMs}ms`,
          }}
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
