'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'

import { cursorTarget } from '../lib/cursor'
import { CAN_HOVER, POINTER_FINE, REDUCED_MOTION, subscribeToPreferences } from '../lib/loop-mode'

const NATIVE_HIDDEN = 'site-cursor'
const DROP = 14
const BLOT = 150
/** A link's box taller than this gets its label cut out of the blot; a smaller one gets none. */
const LABEL_MIN_HEIGHT = 90
const STIFFNESS = 160
const DAMPING = 0.45
/** The pour's thickness at the link's top edge. */
const DRIP_STIFFNESS = 90
const DRIP_DAMPING = 0.5
/** Pour: liquid columns this wide fall from the top of a link with a picture or a loop in it. */
const COLUMN = 12
/** How far each column reaches from the mouse, in px: a bell curve this wide. */
const POUR_SPREAD = 55
/** Loose and slow, so the liquid lags the mouse and drips back up after it. */
const POUR_STIFFNESS = 25
const POUR_DAMPING = 0.35
const POUR_ID = 'site-cursor-pour'
/** The columns' idle top edge sits this far above the box, so the blur never shows a strip at rest. */
const POUR_TOP = -20
const POUR_REST = 16

const wanted = () =>
  matchMedia(`${CAN_HOVER} and ${POINTER_FINE}`).matches && !matchMedia(REDUCED_MOTION).matches

/** Only a real mouse moves the drop. */
const real = (event: PointerEvent) => event.isTrusted && event.pointerType === 'mouse'

/**
 * The site's cursor: a drop on the mouse point that stretches with speed. On a link with a
 * picture or a loop in it, liquid pours down from the link's top edge above the mouse and drips
 * back up after it. On any other link it
 * floods the link with a wobbling blot that inverts what is under it, with the label cut out of
 * it on big links. Decorative. Only for a mouse that hovers and with motion allowed.
 * Mounted from the root layout, outside the page sheet box: a transformed box would carry this
 * fixed element with it.
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
    const liquid = box.lastElementChild as SVGSVGElement
    const pour = liquid.querySelector('g')!
    const band = pour.firstElementChild as SVGRectElement
    let columns: SVGRectElement[] = []
    let lengths = new Float32Array(0)
    let speeds = new Float32Array(0)
    let strengths = new Float32Array(0)
    // One column per COLUMN px of the link, each with its own random reach.
    const fit = (width: number) => {
      const count = Math.ceil(width / COLUMN)
      if (count === columns.length) return
      for (const column of columns) column.remove()
      columns = Array.from({ length: count }, (_, index) => {
        const column = document.createElementNS(pour.namespaceURI, 'rect') as SVGRectElement
        column.setAttribute('x', `${index * COLUMN + 1}`)
        column.setAttribute('y', `${POUR_TOP}`)
        column.setAttribute('width', `${COLUMN - 2}`)
        column.setAttribute('height', `${POUR_REST}`)
        column.setAttribute('rx', `${COLUMN / 2 - 1}`)
        pour.append(column)
        return column
      })
      lengths = new Float32Array(count)
      speeds = new Float32Array(count)
      strengths = Float32Array.from({ length: count }, () => 0.35 + Math.random() * 0.65)
    }
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
    let drip = 0
    let dripV = 0
    let poured = true
    let pressed = false
    let shown = false

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      if (over && !over.isConnected) over = null
      const hit = cursorTarget(over, location.origin)
      // A link with a picture or a loop in it gets the pour, not the blot.
      const media = hit !== null && hit.element.querySelector('img, video') !== null
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
        // Text is written only when it changes, so the frame doesn't force a layout.
        const label = !media && at.height > LABEL_MIN_HEIGHT ? hit.label : ''
        if (text.textContent !== label) text.textContent = label
        if (media) {
          fit(at.width)
          band.setAttribute('width', `${at.width}`)
        }
      }
      // A loose spring: the blot overshoots and wobbles into place.
      const target = hit && !media ? 1 : 0
      soakV += ((target - soak) * STIFFNESS - soakV * 2 * Math.sqrt(STIFFNESS) * DAMPING) * dt
      soak += soakV * dt
      const dripTo = media ? 1 : 0
      dripV +=
        ((dripTo - drip) * DRIP_STIFFNESS - dripV * 2 * Math.sqrt(DRIP_STIFFNESS) * DRIP_DAMPING) *
        dt
      drip += dripV * dt
      const soaked =
        Math.abs(target - soak) < 0.001 &&
        Math.abs(soakV) < 0.01 &&
        Math.abs(dripTo - drip) < 0.001 &&
        Math.abs(dripV) < 0.01 &&
        poured
      if (at && !hit && soaked) {
        at = null
        box.style.display = 'none'
      }
      if (at) {
        blot.style.transform = `translate(${mx - at.left - BLOT / 2}px,${my - at.top - BLOT / 2}px) scale(${Math.max(0, soak)})`
        const wet = Math.max(0, drip)
        const reach = at.height * 0.8
        const x = mx - at.left
        poured = true
        columns.forEach((column, index) => {
          const want = media
            ? reach *
              Math.exp(-(((index * COLUMN + COLUMN / 2 - x) / POUR_SPREAD) ** 2)) *
              strengths[index]! *
              // Each column sways a little, so the liquid never freezes.
              (0.85 + 0.15 * Math.sin(now / 600 + index))
            : 0
          speeds[index]! +=
            ((want - lengths[index]!) * POUR_STIFFNESS -
              speeds[index]! * 2 * Math.sqrt(POUR_STIFFNESS) * POUR_DAMPING) *
            dt
          lengths[index] = Math.max(0, lengths[index]! + speeds[index]! * dt)
          column.setAttribute('height', `${POUR_REST + lengths[index]!}`)
          if (lengths[index]! > 0.5) poured = false
        })
        band.setAttribute('height', `${POUR_REST + wet * 8}`)
        liquid.style.display = media || !poured || wet > 0.01 ? '' : 'none'
      }
      drop.style.opacity = shown && (!hit || media) ? '1' : '0'
      if (dt > 0) {
        vx += ((mx - lastX) / dt - vx) * 0.25
        vy += ((my - lastY) / dt - vy) * 0.25
      }
      const speed = Math.hypot(vx, vy)
      // The pour sways, so the loop runs on while it is up.
      const resting = mx === lastX && my === lastY && speed < 20 && soaked && !media
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
        <div className="absolute top-0 left-0 grid h-[150px] w-[150px] animate-[site-cursor-wobble_5s_linear_infinite] place-items-center bg-text">
          <span className="font-serif text-[38px] leading-none font-normal text-background" />
        </div>
        {/* Blur then a hard alpha cut fuses the columns into one liquid. */}
        <svg className="absolute inset-0 h-full w-full" style={{ display: 'none' }}>
          <filter
            id={POUR_ID}
            x="-10%"
            y="-10%"
            width="120%"
            height="140%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation="6" />
            <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" />
          </filter>
          <g filter={`url(#${POUR_ID})`} className="fill-text">
            <rect x="0" y={POUR_TOP} height={POUR_REST} />
          </g>
        </svg>
      </div>
    </>
  )
}
