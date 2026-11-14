'use client'

import { usePathname, useRouter } from 'next/navigation'
import { type MouseEvent, type RefObject, useEffect, useRef } from 'react'

import { REDUCED_MOTION, saveDataOn } from '../lib/loop-mode'
import { lockScroll, MENU_PANEL_ID, PAGE_SHEET_ID } from '../lib/menu-a11y'
import { legalLink, menuLinks } from '../lib/nav-links'
import {
  createDraught,
  createSheet,
  type HingeSheet,
  landPage,
  landSheet,
  resetSheet,
  stepDraught,
  stepHinge,
} from '../lib/pinboard-hinge'
import { type Board as Layout, layoutBoard, SHEETS, stringCurve } from '../lib/pinboard-layout'
import { createBoard, createPinboardMoments, type MomentSheet } from '../lib/pinboard-tween'
import { deviceReport, isWeakDevice } from '../lib/weak-device'

/** Characters of each print's word and of Gizlilik: the layout's type sizes depend on them. */
export const PINBOARD_LABELS = {
  prints: menuLinks.map(({ label }) => label.length),
  legal: legalLink.label.length,
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Motion only for a visitor who gets it (ADR-0101); no `matchMedia` (an old browser, jsdom) gets none. */
const motionAllowed = () =>
  typeof matchMedia === 'function' &&
  !matchMedia(REDUCED_MOTION).matches &&
  !saveDataOn() &&
  !isWeakDevice(deviceReport())

type Sheet = MomentSheet &
  HingeSheet & { el: HTMLElement; sd: HTMLElement; link: number; z: string; zNow: string }

/** How long a flown sheet waits for the next page before the board fades anyway. */
const HOLD_MS = 4000

/** What the loop writes on a sheet or its shadow; removed again at rest, so the static board shows. */
const SHEET_STYLES = ['transform', 'opacity', 'will-change', 'height']

/**
 * The Pinboard's motion over the board SiteMenu renders inside `details` (ADR-0106), ported from
 * the prototype's `tick()`, `render()` and `renderPage()` (docs/design/menu3/pinboard.js): one rAF
 * loop, running from `open()` until the board is back at rest, steps the tweens and the hinges and
 * writes transforms and opacity. The live page box becomes the pinned sheet. At rest every style it
 * wrote is gone and `onRest` runs.
 */
function createPinboardMotion(details: HTMLDetailsElement, onRest: () => void) {
  const panel = details.querySelector<HTMLElement>(`#${MENU_PANEL_ID}`)!
  const page = document.getElementById(PAGE_SHEET_ID)
  const wallEl = panel.querySelector<HTMLElement>('.pb-wall')!
  const spotEl = panel.querySelector<HTMLElement>('.pb-spot')!
  const els = panel.querySelectorAll<HTMLElement>('.pb-s')
  const shadows = panel.querySelectorAll<HTMLElement>('.pb-sd')
  // The server draws the strings for two fixed views; while moving they are redrawn in view px.
  const strings = [...panel.querySelectorAll<SVGGElement>('.pb-str g')].map((group) => ({
    group,
    transform: group.getAttribute('transform'),
    paths: [...group.querySelectorAll('path')].map((path) => ({ path, d: path.getAttribute('d') })),
  }))

  const sheets: Sheet[] = SHEETS.map((def, i) => ({
    ...createSheet(def.rest, 0, 0),
    kind: def.kind,
    en: 0,
    dir: -1,
    dim: 0,
    fl: 0,
    el: els[i]!,
    sd: shadows[i]!,
    z: els[i]!.style.zIndex, // the server's stacking, back at rest
    zNow: els[i]!.style.zIndex,
    link: 'link' in def ? def.link : -1,
  }))
  const pageSheet = sheets[0]!
  const prints = sheets.filter((s) => s.kind === 'print')
  const board = createBoard(sheets)
  let rested = false
  const moments = createPinboardMoments(
    board,
    () => performance.now(),
    () => {
      for (const s of sheets) resetSheet(s)
      rested = true
    },
  )
  const pointer = { x: 0, y: 0 }
  const draught = createDraught(pointer)
  const listeners = new AbortController()
  let pointerSeen = false
  let hoverTimer: ReturnType<typeof setTimeout> | undefined
  /** When a held leave gives up waiting for the route (ms on the loop's clock); 0 when none waits. */
  let holdUntil = 0

  let L: Layout = layoutBoard(1, 1, PINBOARD_LABELS)
  let vw = 1
  let vh = 1
  let pageOn = false
  let raf = 0
  let last = 0

  /** Pivot and clip of the page box: its pin, and only the window of it that was on screen. */
  function placePage() {
    if (!page || !pageOn) return
    const top = page.offsetTop - scrollY // the box's top in the view, untransformed
    page.style.transformOrigin = `50% ${-top - L.b / L.s1}px`
    page.style.clipPath = `inset(${Math.max(0, -top)}px 0 ${Math.max(0, page.offsetHeight + top - vh)}px 0)`
    page.style.willChange = 'transform'
  }

  function layout() {
    vw = panel.clientWidth || innerWidth
    vh = panel.clientHeight || innerHeight
    L = layoutBoard(vw, vh, PINBOARD_LABELS)
    sheets.forEach((s, i) => {
      s.cx = L.sheets[i]!.cx
      s.cy = L.sheets[i]!.cy
    })
    const height = `${L.sheets[0]!.h}px`
    pageSheet.el.style.height = height
    pageSheet.sd.style.height = height
    for (const { group } of strings) group.setAttribute('transform', `scale(${1 / vw} ${1 / vh})`)
    placePage()
    render()
  }

  function renderPage() {
    const s = pageSheet
    const t = board.page.t
    const e = s.en
    if (t <= 0.0004) {
      if (pageOn) page?.removeAttribute('style')
      pageOn = false
      s.el.style.opacity = '0'
      s.sd.style.opacity = '0'
      return
    }
    if (!pageOn) {
      pageOn = true
      placePage()
    }
    const fy = (1 - e) * vh * 0.7
    const k = clamp(t * 1.2, 0, 1)
    const rot = s.a * k + (1 - e) * 16
    const lift = s.l * 24 * k
    const sc = lerp(1, L.s1, t)
    const tail = `perspective(${L.PP}px) rotate(${rot}deg) rotateX(${lift}deg) scale(`
    if (page) page.style.transform = `translate(${L.T1x * t}px,${L.T1y * t + fy}px) ${tail}${sc})`
    s.el.style.transform = `translate(${(1 - t) * L.Ox}px,${(1 - t) * L.Oy + fy}px) ${tail}${sc / L.s1})`
    const o = clamp((t - 0.5) * 3, 0, 1) * clamp(e * 2.2, 0, 1)
    s.el.style.opacity = `${o}`
    const up = 4 + s.l * 46 * L.K
    s.sd.style.transform = `translate(${(1 - t) * L.Ox}px,${(1 - t) * L.Oy + fy - up}px) rotate(${rot}deg) scale(${sc / L.s1})`
    s.sd.style.opacity = `${o * 0.8}`
  }

  function render() {
    const wa = board.wall.a
    panel.style.opacity = `${board.fade.o}` // the board fades out after a leave
    wallEl.style.opacity = `${wa}`
    spotEl.style.opacity = `${board.spot.a * wa}`
    spotEl.style.transform = `translate(${board.spot.x}px,${board.spot.y}px)`
    sheets.forEach((s, i) => {
      if (s === pageSheet) return
      const at = L.sheets[i]!
      const z = board.leaving === s ? '20' : board.hovered === s ? '9' : s.z
      if (z !== s.zNow) s.el.style.zIndex = s.zNow = z
      const e = s.en
      const fl = s.fl
      const fy = s.dir * (1 - e) * vh * 0.7
      const rot = (s.a + s.dir * (1 - e) * 16) * (1 - fl)
      const lift = s.l * 24 * (1 - s.hv) * (1 - fl)
      const sc = lerp((1 + 0.24 * s.hv) * (1 - 0.035 * s.dim), at.S, fl)
      const tx = at.dx * fl
      const ty = fy + at.dy * fl
      s.el.style.transform = `translate(${tx}px,${ty}px) perspective(${L.PP}px) rotate(${rot}deg) rotateX(${lift}deg) translateZ(${s.hv * 90 * L.K}px) scale(${sc})`
      const o = clamp(e * 2.2, 0, 1) * (1 - 0.55 * s.dim)
      s.el.style.opacity = `${o}`
      const up = 4 + s.l * 46 * L.K + s.hv * 38 * L.K
      s.sd.style.transform = `translate(${tx}px,${ty - up * (1 - fl)}px) rotate(${rot}deg) scale(${sc * (1 + s.l * 0.06 + s.hv * 0.1)})`
      s.sd.style.opacity = `${o * (0.8 - s.l * 0.25) * (1 - fl)}`
    })
    renderPage()
    prints.forEach((s, i) => {
      const d = stringCurve(L.sheets[0]!, L.sheets[sheets.indexOf(s)]!, {
        bows: s.link === 2,
        angle: s.a,
        pageAngle: pageSheet.a,
        lift: s.l,
        taut: s.hv,
      })
      const stroke = `rgba(237,237,237,${(0.5 + 0.45 * s.hv) * board.strings.o * wa})`
      for (const { paths } of strings) {
        const path = paths[i]?.path
        path?.setAttribute('d', d)
        path?.setAttribute('stroke', stroke)
        path?.setAttribute('stroke-width', `${1.2 + 0.8 * s.hv}`)
      }
    })
  }

  function tick(now: number) {
    raf = requestAnimationFrame(tick)
    const dt = (now - last) / 1000
    last = now
    moments.step(now)
    if (holdUntil && now >= holdUntil) release()
    if (rested) {
      stop()
      clear()
      onRest()
      return
    }
    stepDraught(draught, pointer, dt, now, vw, board.open && !board.leaving)
    const input = { pointer, draught, view: { width: vw, portrait: L.portrait }, now }
    sheets.forEach((s, i) => {
      if (s === pageSheet) {
        if (board.page.t >= 0.3) stepHinge(s, dt, input)
        return
      }
      stepHinge(s, dt, input)
      landSheet(s, i, s.en, board.open)
    })
    landPage(pageSheet, board.page.t, board.open)
    render()
  }

  function stop() {
    cancelAnimationFrame(raf)
    raf = 0
    removeEventListener('resize', layout)
    listeners.abort()
    clearTimeout(hoverTimer)
  }

  function release() {
    holdUntil = 0
    moments.release()
  }

  // SiteMenu's scroll lock ends with `open`; this one holds it until the close has ended, so the
  // sheet's pivot and clip, taken at open, stay true and the scrollbar can't change the width.
  let unlockClose: (() => void) | null = null
  const releaseScroll = () => {
    unlockClose?.()
    unlockClose = null
  }

  /** Back to the static board: every style the loop wrote, gone. */
  function clear() {
    releaseScroll()
    page?.removeAttribute('style')
    pageOn = false
    for (const s of sheets) {
      for (const el of [s.el, s.sd]) for (const name of SHEET_STYLES) el.style.removeProperty(name)
      s.el.style.zIndex = s.zNow = s.z
    }
    panel.style.removeProperty('opacity')
    wallEl.style.removeProperty('opacity')
    spotEl.style.removeProperty('opacity')
    spotEl.style.removeProperty('transform')
    panel.style.removeProperty('background')
    panel.removeAttribute('inert')
    for (const { group, transform, paths } of strings) {
      if (transform !== null) group.setAttribute('transform', transform)
      for (const { path, d } of paths) {
        if (d !== null) path.setAttribute('d', d)
        path.removeAttribute('stroke')
        path.removeAttribute('stroke-width')
      }
    }
  }

  /** Hovers a sheet; its pool of light goes a tenth below its middle. */
  const hover = (s: Sheet | null) => {
    const at = L.sheets[sheets.indexOf(s!)]
    moments.hover(s && at ? { sheet: s, x: at.cx, y: at.cy + at.h * 0.1 } : null)
  }
  const { signal } = listeners
  panel.addEventListener(
    'pointermove',
    (event) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      if (!pointerSeen) {
        pointerSeen = true
        draught.prevX = pointer.x // no wind from the jump out of the corner
        draught.prevY = pointer.y
      }
    },
    { signal, passive: true },
  )
  for (const s of sheets) {
    if (s.kind !== 'print' && s.kind !== 'legal') continue
    const on = (type: string, handler: (event: Event) => void) =>
      s.el.addEventListener(type, handler, { signal })
    on('pointerenter', () => {
      clearTimeout(hoverTimer)
      hover(s)
    })
    on('pointerleave', () => {
      clearTimeout(hoverTimer)
      hoverTimer = setTimeout(() => board.hovered === s && hover(null), 90)
    })
    // The touch version of hover.
    on('pointerdown', () => {
      if (!board.open || board.leaving) return
      clearTimeout(hoverTimer)
      hover(s)
    })
    on('focusin', (event) => {
      let visible = true
      try {
        visible = (event.target as Element).matches(':focus-visible')
      } catch {} // an old browser: take it as visible
      if (visible) hover(s)
    })
    on('focusout', () => board.hovered === s && hover(null))
  }

  return {
    /** Takes a plain click on sheet `index`: flies it at the view, then `onArrive`. True once a leave owns the click (a second click included). */
    leave(index: number, onArrive: () => boolean) {
      if (board.leaving) return true
      if (!board.open) return false
      moments.leave(sheets[index]!, () => {
        const hold = onArrive()
        // shortcut: a route that takes longer than this fades the board anyway, or a failed one would stick it.
        if (hold) holdUntil = performance.now() + HOLD_MS
        return hold
      })
      return true
    },
    /** The route has changed: the held board fades out. */
    release,
    get leaving() {
      return board.leaving !== null
    },
    /** Pins the page to the board; reverses a close from where it is. */
    open() {
      moments.open()
      rested = false
      releaseScroll() // before SiteMenu's lock, which runs after this hook's effect
      panel.removeAttribute('inert')
      // The wall fades in over the live page instead of the panel's opaque floor.
      panel.style.background = 'transparent'
      for (const s of sheets) {
        s.el.style.willChange = 'transform, opacity'
        s.sd.style.willChange = 'transform, opacity'
      }
      if (!raf) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
        addEventListener('resize', layout)
      }
      layout()
    },
    /** Grows the page back while the board falls away; `onRest` runs once it has. */
    close() {
      // Falling away or flying, it is gone for focus, pointer and screen readers.
      panel.setAttribute('inert', '')
      unlockClose ??= lockScroll(document.documentElement)
      if (board.leaving) return // the leave closes the board itself
      moments.close()
    },
    dispose() {
      stop()
      clear()
    },
  }
}

/**
 * Brings SiteMenu's resting board to life (ADR-0106) and drives its `<details>`: open at once on
 * `open`; on close it stays open until the board has fallen away, so `isMenuOpen` holds until
 * then. Whether there is motion is checked at each open: without it the board stays the static
 * one and the `<details>` closes at once.
 */
export function usePinboardMotion(open: boolean, detailsRef: RefObject<HTMLDetailsElement | null>) {
  const router = useRouter()
  const pathname = usePathname()
  const motion = useRef<ReturnType<typeof createPinboardMotion> | null>(null)

  useEffect(() => {
    const details = detailsRef.current!
    if (open) {
      details.open = true
      if (!motion.current && motionAllowed()) {
        motion.current = createPinboardMotion(details, () => {
          motion.current = null
          details.open = false
        })
      }
      motion.current?.open()
    } else if (motion.current) motion.current.close()
    else details.open = false // also resets a native toggle made before hydration
  }, [open, detailsRef])

  // The next page is there: a held board fades out over it.
  useEffect(() => {
    motion.current?.release()
  }, [pathname])

  useEffect(
    () => () => {
      motion.current?.dispose()
      motion.current = null
    },
    [],
  )

  return {
    /**
     * A click on sheet `index`'s link. With motion a plain one (main button, no modifier) is taken
     * over: the sheet flies, then `href` opens (the page we are on just closes). Any other click is
     * left to the browser. The caller closes the menu's state either way.
     */
    follow(event: MouseEvent, href: string, index: number) {
      const plain =
        event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      // The page we are on has no route change to wait for.
      const go = () => {
        if (pathname === href) return false
        router.push(href)
        return true
      }
      if (plain && motion.current?.leave(index, go)) event.preventDefault()
    },
    /** A leave is flying: MENU does nothing meanwhile. */
    leaving: () => motion.current?.leaving === true,
  }
}
