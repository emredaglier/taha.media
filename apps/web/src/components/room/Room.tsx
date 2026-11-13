'use client'

import { useEffect, useEffectEvent, useRef } from 'react'

import { loaded } from '../../lib/home-loader'
import { isMenuOpen } from '../../lib/menu-a11y'
import { createScroll, scrollBy, stepScroll } from '../../lib/room-model'
import { wheelPixels } from '../../lib/room-motion'
import type { HelixWork } from '../FeaturedWorks'
import { createRoomRenderer, RoomUnavailable, type RoomRenderer } from './renderer'
import type { RoomFrame } from './scene'

/**
 * The Edit Room on Home (#127), loaded only on a device that passed the capability check. It draws
 * the room at rest: each Featured Work's still on its place, spare places dark. The wheel and a
 * vertical drag move the camera along the path and the page never scrolls (ADR-0103); the pointer
 * turns the view a little. The static Home stays in the page underneath, visually hidden, so
 * screen readers and keyboards still reach every Work.
 *
 * The first frame drawn takes over from the static Home in the same paint and takes the loader
 * off. If WebGL2 can't start, a shader doesn't compile or the context is lost, the loader comes
 * off, `onFail` runs and the static Home is back as it was. A hidden tab draws nothing.
 */
export function Room({ works, onFail }: { works: HelixWork[]; onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fail = useEffectEvent(onFail)

  useEffect(() => {
    const canvas = canvasRef.current!
    const root = document.documentElement
    const touch = window.matchMedia('(hover: none)').matches
    const giveUp = () => {
      loaded()
      fail()
    }
    let renderer: RoomRenderer
    try {
      renderer = createRoomRenderer(canvas, works, touch, giveUp)
    } catch (error) {
      if (!(error instanceof RoomUnavailable)) throw error
      giveUp()
      return
    }

    // Everything a frame reads or writes is made here once: a frame allocates nothing.
    const scroll = createScroll()
    const pointer = { nx: 0, ny: 0, dx: 0, inside: false }
    const input: RoomFrame = { seconds: 0, dt: 0, progress: 0, pointer: null }
    let drag: { id: number; lastY: number } | null = null

    let frameId = 0
    let last = 0
    let shown = false
    const frame = () => {
      frameId = requestAnimationFrame(frame)
      const now = performance.now()
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      stepScroll(scroll, dt)
      input.seconds = now / 1000
      input.dt = dt
      input.progress = scroll.progress
      input.pointer = pointer.inside ? pointer : null
      renderer.draw(input)
      pointer.dx = 0
      if (!shown) {
        shown = true
        // The room takes over from the static Home in this paint, and the loader goes. The CSS
        // locks Home to the screen (no page scroll) on `html[data-home='room']` with any
        // `data-helix-phase` but `hero` (globals.css, "Home holds the screen"), so 'rest' does that.
        root.dataset.home = 'room'
        root.dataset.helixPhase = 'rest'
        window.scrollTo(0, 0)
        loaded()
      }
    }
    const start = () => {
      if (frameId) return
      last = performance.now()
      frameId = requestAnimationFrame(frame)
    }
    const stop = () => {
      cancelAnimationFrame(frameId)
      frameId = 0
    }
    const onVisibility = () => (document.hidden ? stop() : start())

    // --- input: the wheel and a vertical drag move the camera; the menu, when open, has the input.
    const onWheel = (event: WheelEvent) => {
      // Before the first frame the static Home shows and the page scrolls: the wheel is the browser's.
      if (!shown || event.ctrlKey || isMenuOpen(document)) return // ctrl + wheel is the browser's zoom
      event.preventDefault()
      scrollBy(scroll, wheelPixels(event.deltaY, event.deltaMode, window.innerHeight))
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || isMenuOpen(document)) return
      try {
        canvas.setPointerCapture(event.pointerId)
      } catch {
        // Not an active pointer: nothing to capture, and nothing to drag past the canvas.
      }
      drag = { id: event.pointerId, lastY: event.clientY }
    }
    const onPointerMove = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect()
      pointer.inside = true
      pointer.nx = ((event.clientX - box.left) / Math.max(1, box.width)) * 2 - 1
      pointer.ny = 1 - ((event.clientY - box.top) / Math.max(1, box.height)) * 2
      pointer.dx += event.movementX
      if (drag?.id !== event.pointerId) return
      scrollBy(scroll, drag.lastY - event.clientY) // dragging up goes further in
      drag.lastY = event.clientY
    }
    const onPointerEnd = (event: PointerEvent) => {
      if (drag?.id === event.pointerId) drag = null
    }
    const onPointerLeave = () => (pointer.inside = false)

    renderer.resize()
    const resized = new ResizeObserver(() => renderer.resize())
    resized.observe(canvas)
    window.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerEnd)
    canvas.addEventListener('pointercancel', onPointerEnd)
    canvas.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('visibilitychange', onVisibility)

    // Drawing starts once the stills are in, or after a short wait (`stillsWaitMs`): the loader
    // goes at the first frame, and by the inline script's 4 s at the latest.
    let cancelled = false
    void renderer.ready.then(() => {
      if (!cancelled && !document.hidden) start()
    })

    return () => {
      cancelled = true
      stop()
      resized.disconnect()
      window.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerEnd)
      canvas.removeEventListener('pointercancel', onPointerEnd)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      renderer.destroy()
      delete root.dataset.home
      delete root.dataset.helixPhase
      loaded()
    }
  }, [works])

  return (
    // Hidden until the first frame sets the marks. No landmark of its own: the static section of
    // Work links is "Öne çıkan işler".
    <div className="invisible fixed inset-0 z-0 helix:visible">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 size-full touch-none select-none"
      />
    </div>
  )
}
