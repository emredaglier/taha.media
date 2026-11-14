'use client'

import { type RefObject, useEffect, useRef } from 'react'

import { REDUCED_MOTION, saveDataOn } from '../lib/loop-mode'
import { MENU_PANEL_ID, PAGE_SHEET_ID } from '../lib/menu-a11y'
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

type Sheet = MomentSheet & HingeSheet & { el: HTMLElement; sd: HTMLElement; link: number }

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
  // shortcut: the pointer stays put, so no draught yet; the interactions ticket (#151) feeds it.
  const pointer = { x: 0, y: 0 }
  const draught = createDraught(pointer)

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

  // shortcut: the board's fade after a leave (`board.fade`) and hover's stacking are left to #151.
  function render() {
    const wa = board.wall.a
    wallEl.style.opacity = `${wa}`
    spotEl.style.opacity = `${board.spot.a * wa}`
    spotEl.style.transform = `translate(${board.spot.x}px,${board.spot.y}px)`
    sheets.forEach((s, i) => {
      if (s === pageSheet) return
      const at = L.sheets[i]!
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
  }

  /** Back to the static board: every style the loop wrote, gone. */
  function clear() {
    page?.removeAttribute('style')
    pageOn = false
    for (const s of sheets) {
      for (const el of [s.el, s.sd]) for (const name of SHEET_STYLES) el.style.removeProperty(name)
    }
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

  return {
    /** Pins the page to the board; reverses a close from where it is. */
    open() {
      moments.open()
      rested = false
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
      moments.close()
      // Falling away, it is gone for focus, pointer and screen readers.
      panel.setAttribute('inert', '')
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
export function usePinboardMotion(
  open: boolean,
  detailsRef: RefObject<HTMLDetailsElement | null>,
): void {
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

  useEffect(
    () => () => {
      motion.current?.dispose()
      motion.current = null
    },
    [],
  )
}
