'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'

import { cursorTarget } from '../lib/cursor'
import { CAN_HOVER, POINTER_FINE, REDUCED_MOTION, subscribeToPreferences } from '../lib/loop-mode'

const NATIVE_HIDDEN = 'site-cursor'
const DROP = 14
const BLOT = 220
/** A link's box taller than this gets its label cut out of the blot; a smaller one gets none. */
const LABEL_MIN_HEIGHT = 90
const STIFFNESS = 160
const DAMPING = 0.45

const wanted = () =>
  matchMedia(`${CAN_HOVER} and ${POINTER_FINE}`).matches && !matchMedia(REDUCED_MOTION).matches

/** Hand control sends synthetic pointer events; only a real mouse moves the drop. */
const real = (event: PointerEvent) => event.isTrusted && event.pointerType === 'mouse'

/**
 * The site's cursor: a drop on the mouse point that stretches with speed. On a link it floods
 * the link with a wobbling blot that inverts what is under it, with the label cut out of it on
 * big links. Decorative. Only for a mouse that hovers and with motion allowed.
 * shortcut: mounted from PageMain because the root layout has unmerged work, move to the root
 * layout once the owner's layout work is merged.
 */
export function SiteCursor() {
  const enabled = useSyncExternalStore(subscribeToPreferences, wanted, () => false)
  const dropRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const drop = dropRef.current
    const box = boxRef.current
    if (!enabled || !drop || !box) return
    const blot = box.firstElementChild as HTMLElement
    const text = blot.firstElementChild as HTMLElement
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
    let at: DOMRect | null = null
    let soak = 0
    let soakV = 0
    let pressed = false
    let shown = false

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      if (over && !over.isConnected) over = null
      const hit = cursorTarget(over, location.origin)
      if (hit) {
        // Read each frame: the page scrolls under a resting mouse.
        at = hit.element.getBoundingClientRect()
        Object.assign(box.style, {
          display: '',
          left: `${at.left}px`,
          top: `${at.top}px`,
          width: `${at.width}px`,
          height: `${at.height}px`,
        })
        text.textContent = at.height > LABEL_MIN_HEIGHT ? hit.label : ''
      }
      // A loose spring: the blot overshoots and wobbles into place.
      const target = hit ? 1 : 0
      soakV += ((target - soak) * STIFFNESS - soakV * 2 * Math.sqrt(STIFFNESS) * DAMPING) * dt
      soak += soakV * dt
      const soaked = Math.abs(target - soak) < 0.001 && Math.abs(soakV) < 0.01
      if (at && !hit && soaked) {
        at = null
        box.style.display = 'none'
      }
      if (at) {
        blot.style.transform = `translate(${mx - at.left - BLOT / 2}px,${my - at.top - BLOT / 2}px) scale(${Math.max(0, soak)})`
      }
      drop.style.opacity = shown && !hit ? '1' : '0'
      if (dt > 0) {
        vx += ((mx - lastX) / dt - vx) * 0.25
        vy += ((my - lastY) / dt - vy) * 0.25
      }
      const speed = Math.hypot(vx, vy)
      const resting = mx === lastX && my === lastY && speed < 20 && soaked
      lastX = mx
      lastY = my
      if (resting) vx = vy = 0
      const long = resting ? 1 : 1 + Math.min(speed / 1400, 1.4)
      const press = pressed ? 0.8 : 1
      drop.style.transform = `translate(${mx - DROP / 2}px,${my - DROP / 2}px) rotate(${resting ? 0 : Math.atan2(vy, vx)}rad) scale(${long * press},${press / Math.sqrt(long)})`
      raf = resting ? 0 : requestAnimationFrame(frame)
    }
    // No work while the mouse rests and the blot has settled: the loop stops, and the next event
    // starts it again.
    const wake = () => {
      if (raf) return
      last = performance.now() - 16
      raf = requestAnimationFrame(frame)
    }
    const hide = () => {
      shown = pressed = false
      over = null
      wake()
    }
    const track = (event: PointerEvent) => {
      if (!real(event)) return
      // An external player shows the native cursor itself.
      if (event.target instanceof HTMLIFrameElement) return hide()
      if (!shown) {
        shown = true
        lastX = event.clientX
        lastY = event.clientY
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
    document.addEventListener('scroll', wake, { passive: true, capture: true })
    return () => {
      document.removeEventListener('pointermove', track)
      document.removeEventListener('pointerover', track)
      document.removeEventListener('pointerout', leave)
      document.removeEventListener('pointerdown', press)
      document.removeEventListener('pointerup', press)
      document.removeEventListener('scroll', wake, { capture: true })
      cancelAnimationFrame(raf)
      root.classList.remove(NATIVE_HIDDEN)
    }
  }, [enabled])

  if (!enabled) return null
  return (
    <>
      {/* The native cursor hides only once the drop has seen a real mouse (the class is set then). */}
      <style>{`html.${NATIVE_HIDDEN}, html.${NATIVE_HIDDEN} * { cursor: none !important }
@keyframes site-cursor-wobble {
  0%, 100% { border-radius: 46% 54% 57% 43% / 52% 44% 56% 48% }
  33% { border-radius: 56% 44% 45% 55% / 44% 56% 46% 54% }
  66% { border-radius: 44% 56% 52% 48% / 57% 45% 55% 43% }
}`}</style>
      <div
        ref={dropRef}
        aria-hidden="true"
        style={{ opacity: 0 }}
        className="pointer-events-none fixed top-0 left-0 z-[90] h-3.5 w-3.5 rounded-full bg-text mix-blend-difference"
      />
      <div
        ref={boxRef}
        aria-hidden="true"
        style={{ display: 'none' }}
        className="pointer-events-none fixed z-[90] overflow-hidden mix-blend-difference"
      >
        <div className="absolute top-0 left-0 grid h-[220px] w-[220px] animate-[site-cursor-wobble_5s_linear_infinite] place-items-center bg-text">
          <span className="font-serif text-[52px] leading-none font-normal text-background" />
        </div>
      </div>
    </>
  )
}
