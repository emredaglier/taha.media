'use client'

import { Fragment, useEffect, useRef, useSyncExternalStore } from 'react'

import { cursorTarget } from '../lib/cursor'
import { CAN_HOVER, POINTER_FINE, REDUCED_MOTION, subscribeToPreferences } from '../lib/loop-mode'

const NATIVE_HIDDEN = 'site-cursor'
const DROP = 14
const BLOT = 150
/** A link's box taller than this gets its label cut out of the blot; a smaller one gets none. */
const LABEL_MIN_HEIGHT = 90
const STIFFNESS = 160
const DAMPING = 0.45
const DRIP_STIFFNESS = 90
const DRIP_DAMPING = 0.5
const MELT_ID = 'site-cursor-melt'

/**
 * The Melt bend as a displacement map for the label on a picture: green shifts what is drawn
 * downwards in 24 columns of random strength, fading to none at the rim (128 is no shift).
 */
function meltMap(): string {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return ''
  const image = context.createImageData(size, size)
  const drips = Array.from({ length: 24 }, () => 0.2 + Math.random() * 0.8)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1
      const v = ((y + 0.5) / size) * 2 - 1
      const rim = 1 - (u * u + v * v)
      const shift = rim <= 0 ? 0 : -drips[Math.floor(((u + 1) / 2) * 24)]! * (1 - u * u) * rim
      const at = (y * size + x) * 4
      image.data[at] = 128
      image.data[at + 1] = 128 + 127 * shift
      image.data[at + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  return canvas.toDataURL()
}

const wanted = () =>
  matchMedia(`${CAN_HOVER} and ${POINTER_FINE}`).matches && !matchMedia(REDUCED_MOTION).matches

/** Only a real mouse moves the drop. */
const real = (event: PointerEvent) => event.isTrusted && event.pointerType === 'mouse'

/**
 * The site's cursor: a drop on the mouse point that stretches with speed. On a link with a
 * picture or a loop in it, the label melts into the picture at the mouse. On any other link it
 * floods the link with a wobbling blot that inverts what is under it, with the label cut out of
 * it on big links. Decorative. Only for a mouse that hovers and with motion allowed.
 * Mounted from the root layout, outside the page sheet box: a transformed box would carry this
 * fixed element with it.
 */
export function SiteCursor() {
  const enabled = useSyncExternalStore(subscribeToPreferences, wanted, () => false)
  const dropRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<SVGFilterElement>(null)

  useEffect(() => {
    const drop = dropRef.current
    const box = boxRef.current
    const filter = filterRef.current
    if (!enabled || !drop || !box || !filter) return
    const blot = box.firstElementChild as HTMLElement
    const text = blot.firstElementChild as HTMLElement
    const word = box.lastElementChild as HTMLElement
    const map = filter.querySelector('feImage')!
    const bends = [...filter.querySelectorAll('feDisplacementMap')]
    map.setAttribute('href', meltMap())
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
    let pressed = false
    let shown = false
    let wordW = 0
    let wordH = 0

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      if (over && !over.isConnected) over = null
      const hit = cursorTarget(over, location.origin)
      // A link with a picture or a loop in it gets the melting label, not the blot.
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
        if (media && word.textContent !== hit.label) {
          word.textContent = hit.label
          wordW = word.offsetWidth
          wordH = word.offsetHeight
          // The bend covers the word's own box.
          for (const part of [map, ...bends]) {
            part.setAttribute('width', `${wordW}`)
            part.setAttribute('height', `${wordH}`)
          }
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
        Math.abs(dripV) < 0.01
      if (at && !hit && soaked) {
        at = null
        box.style.display = 'none'
      }
      if (at) {
        blot.style.transform = `translate(${mx - at.left - BLOT / 2}px,${my - at.top - BLOT / 2}px) scale(${Math.max(0, soak)})`
        const melted = Math.max(0, drip)
        word.style.opacity = `${Math.min(1, melted * 1.5)}`
        if (melted > 0) {
          word.style.transform = `translate(${mx - at.left - wordW / 2}px,${my - at.top - 80}px)`
          // The bend breathes a little.
          bends.forEach((bend, channel) =>
            bend.setAttribute(
              'scale',
              `${(40 + melted * 110 + Math.sin(now / 500) * 15) * (1 + (channel - 1) * 0.12)}`,
            ),
          )
        }
      }
      drop.style.opacity = shown && (!hit || media) ? '1' : '0'
      if (dt > 0) {
        vx += ((mx - lastX) / dt - vx) * 0.25
        vy += ((my - lastY) / dt - vy) * 0.25
      }
      const speed = Math.hypot(vx, vy)
      // The melting label breathes, so the loop runs on while it is up.
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
        <div
          style={{ opacity: 0, filter: `url(#${MELT_ID})` }}
          className="absolute top-0 left-0 px-6 pt-10 pb-[90px] font-serif text-[96px] leading-none whitespace-nowrap text-text"
        />
      </div>
      {/* Bends the label by the Melt map, red, green and blue each a little differently. */}
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <filter
          ref={filterRef}
          id={MELT_ID}
          x="0"
          y="0"
          width="100%"
          height="100%"
          primitiveUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feImage x="0" y="0" result="map" preserveAspectRatio="none" />
          {[
            '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0',
            '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0',
            '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0',
          ].map((channel, index) => (
            <Fragment key={channel}>
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                x="0"
                y="0"
                xChannelSelector="R"
                yChannelSelector="G"
                result={`bent${index}`}
              />
              <feColorMatrix
                in={`bent${index}`}
                values={`${channel}  0 0 0 1 0`}
                result={`ink${index}`}
              />
            </Fragment>
          ))}
          <feBlend mode="screen" in="ink0" in2="ink1" result="two" />
          <feBlend mode="screen" in="two" in2="ink2" />
        </filter>
      </svg>
    </>
  )
}
