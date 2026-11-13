'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'

import { cursorLabel } from '../lib/cursor'
import { CAN_HOVER, POINTER_FINE, REDUCED_MOTION, subscribeToPreferences } from '../lib/loop-mode'

const NATIVE_HIDDEN = 'site-cursor'
const DROP = 14
const PILL = 34
const EDGE = 8

const wanted = () =>
  matchMedia(`${CAN_HOVER} and ${POINTER_FINE}`).matches && !matchMedia(REDUCED_MOTION).matches

/** Hand control sends synthetic pointer events; only a real mouse moves the drop. */
const real = (event: PointerEvent) => event.isTrusted && event.pointerType === 'mouse'

/**
 * The site's cursor: a drop on the mouse point that stretches with speed and swells into a
 * labelled pill on links. Decorative. Only for a mouse that hovers and with motion allowed.
 * shortcut: mounted from PageMain because the root layout has unmerged work, move to the root
 * layout once the owner's layout work is merged.
 */
export function SiteCursor() {
  const enabled = useSyncExternalStore(subscribeToPreferences, wanted, () => false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const drop = dropRef.current
    if (!enabled || !drop) return
    const text = drop.firstElementChild as HTMLElement
    const root = document.documentElement
    let mx = 0
    let my = 0
    let lastX = 0
    let lastY = 0
    let vx = 0
    let vy = 0
    let last = 0
    let raf = 0
    let over: Element | null = null
    let label = ''
    let pressed = false
    let shown = false

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      if (over && !over.isConnected) over = null
      const next = cursorLabel(over, location.origin)
      if (next !== label) {
        label = next
        // Keeps the old text while the pill shrinks, so the label fades out instead of vanishing.
        if (next) text.textContent = next
        if (next) drop.dataset.on = ''
        else delete drop.dataset.on
      }
      if (dt > 0) {
        vx += ((mx - lastX) / dt - vx) * 0.25
        vy += ((my - lastY) / dt - vy) * 0.25
      }
      const speed = Math.hypot(vx, vy)
      const w = label ? text.offsetWidth : DROP
      const h = label ? PILL : DROP
      drop.style.width = `${w}px`
      drop.style.height = `${h}px`
      // The size eases with CSS, so the loop runs until it has arrived.
      const cw = drop.offsetWidth
      const ch = drop.offsetHeight
      const resting = mx === lastX && my === lastY && speed < 20 && cw === w && ch === h
      lastX = mx
      lastY = my
      if (resting) vx = vy = 0
      // A pill near the right edge opens to the left, so it stays on screen.
      const left = label !== '' && mx + w > innerWidth - EDGE
      const long = label || resting ? 1 : 1 + Math.min(speed / 1400, 1.4)
      const press = pressed ? 0.8 : 1
      drop.style.transformOrigin = `${left ? cw - ch / 2 : ch / 2}px 50%`
      drop.style.transform = `translate(${left ? mx + ch / 2 - cw : mx - ch / 2}px,${my - ch / 2}px) rotate(${label || resting ? 0 : Math.atan2(vy, vx)}rad) scale(${long * press},${press / Math.sqrt(long)})`
      raf = resting ? 0 : requestAnimationFrame(frame)
    }
    // No work while the mouse rests: the loop stops, and the next event starts it again.
    const wake = () => {
      if (raf) return
      last = performance.now() - 16
      raf = requestAnimationFrame(frame)
    }
    const hide = () => {
      shown = pressed = false
      over = null
      drop.style.opacity = '0'
    }
    const track = (event: PointerEvent) => {
      if (!real(event)) return
      // An external player shows the native cursor itself.
      if (event.target instanceof HTMLIFrameElement) return hide()
      if (!shown) {
        shown = true
        lastX = event.clientX
        lastY = event.clientY
        drop.style.opacity = '1'
        root.classList.add(NATIVE_HIDDEN)
      }
      mx = event.clientX
      my = event.clientY
      over = event.target instanceof Element ? event.target : null
      wake()
    }
    const press = (event: PointerEvent) => {
      if (!real(event)) return
      pressed = event.type === 'pointerdown'
      wake()
    }
    const leave = (event: PointerEvent) => {
      if (real(event) && !event.relatedTarget) hide()
    }

    document.addEventListener('pointermove', track)
    document.addEventListener('pointerover', track)
    document.addEventListener('pointerout', leave)
    document.addEventListener('pointerdown', press)
    document.addEventListener('pointerup', press)
    return () => {
      document.removeEventListener('pointermove', track)
      document.removeEventListener('pointerover', track)
      document.removeEventListener('pointerout', leave)
      document.removeEventListener('pointerdown', press)
      document.removeEventListener('pointerup', press)
      cancelAnimationFrame(raf)
      root.classList.remove(NATIVE_HIDDEN)
    }
  }, [enabled])

  if (!enabled) return null
  return (
    <>
      {/* The native cursor hides only once the drop has seen a real mouse (the class is set then). */}
      <style>{`html.${NATIVE_HIDDEN}, html.${NATIVE_HIDDEN} * { cursor: none !important }`}</style>
      <div
        ref={dropRef}
        aria-hidden="true"
        style={{ opacity: 0 }}
        className="group pointer-events-none fixed top-0 left-0 z-[90] h-3.5 w-3.5 overflow-hidden rounded-full bg-text mix-blend-difference transition-[width,height] duration-[400ms] ease-[cubic-bezier(.2,1.2,.3,1)] data-[on]:mix-blend-normal"
      >
        <span className="inline-block px-[18px] font-sans text-sm leading-[34px] font-medium whitespace-nowrap text-background opacity-0 transition-opacity duration-200 group-data-[on]:opacity-100" />
      </div>
    </>
  )
}
