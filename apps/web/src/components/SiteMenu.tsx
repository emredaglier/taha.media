'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type CSSProperties, useEffect, useRef, useState } from 'react'

import { lockScroll, MENU_PANEL_ID, nextFocus } from '../lib/menu-a11y'
import { legalLink, menuLinks } from '../lib/nav-links'
import { layoutBoard, SHEETS, stringCurve } from '../lib/pinboard-layout'
import { PINBOARD_LABELS, usePinboardMotion } from './PinboardMotion'

/** A sheet's place for CSS (`.pb-s`, `.pb-sd` in globals.css): both views' pin and width, the tilt, the stacking. */
const place = ({ L, P, rest }: (typeof SHEETS)[number], zIndex?: number) =>
  ({
    '--lw': L.w,
    '--lx': L.x,
    '--ly': L.y,
    '--pw': P.w,
    '--px': P.x,
    '--py': P.y,
    '--rest': `${rest}deg`,
    zIndex,
  }) as CSSProperties

/**
 * The strings at rest, as server HTML: the layout's curves for a 1440x900 and a 390x844 view,
 * scaled into a 1x1 viewBox. shortcut: they stretch with the view instead of being redrawn per
 * size (the motion ticket redraws them live).
 */
const STRINGS = (
  [
    ['pb-str-l', 1440, 900],
    ['pb-str-p', 390, 844],
  ] as const
).map(([className, width, height]) => {
  const [page, ...rest] = layoutBoard(width, height, PINBOARD_LABELS).sheets
  const paths = rest.flatMap((sheet, i) => {
    const def = SHEETS[i + 1]!
    return def.kind === 'print'
      ? [
          stringCurve(page!, sheet, {
            bows: def.link === 2,
            angle: def.rest,
            pageAngle: SHEETS[0].rest,
            lift: 0,
            taut: 0,
          }),
        ]
      : []
  })
  return { className, scale: `scale(${1 / width} ${1 / height})`, paths }
})

const Clip = () => (
  <svg className="pb-clip" viewBox="0 0 20 54" aria-hidden="true">
    <path d="M6 40V12a6 6 0 0 1 12 0v32a9 9 0 0 1-18 0V10" />
  </svg>
)

/**
 * A native <details>, so without JavaScript it still opens and reaches every link. With JS the
 * toggle is taken over: the page behind can't scroll, focus moves in and is trapped (every Tab
 * step is picked by `nextFocus`, for Safari), Escape closes and returns focus to MENU, and
 * following a link closes it. Adapted from daglier.com's mobile menu (ADR-0100). With motion
 * (`usePinboardMotion`), a close keeps the <details> open until the board has fallen away; the
 * summary, the trap and focus follow `open` at once.
 *
 * The panel is the Pinboard at rest (ADR-0106): a wall with the three pages as print links, blank
 * notes, a storyboard strip, and last the legal note with Gizlilik and the © line (`copyright`,
 * rendered by the server): Home has no footer (ADR-0103), so the menu holds them. Gizlilik is a
 * link in the panel, so it is in the focus loop like the rest. Sheets are placed by CSS from
 * `lib/pinboard-layout.ts`; each print's `.pb-pic` is its picture slot.
 */
export function SiteMenu({ copyright }: { copyright: string }) {
  const pathname = usePathname()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  usePinboardMotion(open, detailsRef) // before the effect below: it opens the <details> first

  // A route change closes the menu (set state during render, not in an effect).
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current!
    const summary = summaryRef.current!
    const unlock = lockScroll(document.documentElement)
    panel.querySelector<HTMLElement>('a')?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        summary.focus()
      } else if (event.key === 'Tab') {
        const focusables = [summary, ...panel.querySelectorAll<HTMLElement>('a[href], button')]
        const target = nextFocus(
          focusables,
          document.activeElement as HTMLElement | null,
          event.shiftKey,
        )
        if (target) {
          event.preventDefault()
          target.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      unlock()
    }
  }, [open])

  return (
    <details ref={detailsRef}>
      <summary
        ref={summaryRef}
        aria-controls={MENU_PANEL_ID}
        aria-expanded={open}
        data-cursor={open ? 'Kapat' : 'Menü'}
        className="relative z-50 cursor-pointer list-none font-serif text-xl uppercase [&::-webkit-details-marker]:hidden"
        onClick={(event) => {
          // Pre-hydration this is the native toggle; after, state drives `details.open`.
          event.preventDefault()
          setOpen((wasOpen) => !wasOpen)
        }}
      >
        {open ? 'KAPAT' : 'MENU'}
      </summary>
      <div
        ref={panelRef}
        id={MENU_PANEL_ID}
        className="fixed inset-0 z-40 overflow-y-auto bg-background text-text"
      >
        <nav aria-label="Menü" className="pinboard">
          <div className="pb-wall" aria-hidden="true" />
          <div className="pb-spot" aria-hidden="true" />
          <div className="pb-shadows" aria-hidden="true">
            {SHEETS.map((sheet) => (
              <div key={sheet.id} className="pb-sd" data-k={sheet.kind} style={place(sheet)} />
            ))}
          </div>
          <svg className="pb-str" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
            {STRINGS.map(({ className, scale, paths }) => (
              <g key={className} className={className} transform={scale}>
                {paths.map((d) => (
                  <path key={d} d={d} />
                ))}
              </g>
            ))}
          </svg>
          {SHEETS.map((sheet, index) => {
            const props = { 'data-k': sheet.kind, style: place(sheet, index + 1) }
            if (sheet.kind === 'print') {
              const { href, label } = menuLinks[sheet.link]!
              return (
                <Link
                  key={sheet.id}
                  href={href}
                  className="pb-s pb-pr"
                  aria-current={pathname === href ? 'page' : undefined}
                  // A link to the current page changes no pathname, so it closes the menu itself.
                  onClick={() => setOpen(false)}
                  {...props}
                >
                  <i className="pb-pin" />
                  <span className="pb-pic" />
                  <span className="pb-tape" style={{ '--n': label.length } as CSSProperties}>
                    <span>{label}</span>
                  </span>
                  {sheet.link < 2 && <Clip />}
                </Link>
              )
            }
            if (sheet.kind === 'legal') {
              return (
                <div
                  key={sheet.id}
                  className="pb-s pb-note"
                  {...props}
                  style={{ ...props.style, '--n': legalLink.label.length } as CSSProperties}
                >
                  <i className="pb-pin" />
                  <Link
                    href={legalLink.href}
                    aria-current={pathname === legalLink.href ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {legalLink.label}
                  </Link>
                  <p className="pb-cp">{copyright}</p>
                </div>
              )
            }
            if (sheet.kind === 'page') {
              // The live page's frame: hidden at rest, drawn round the page box with motion.
              return (
                <div key={sheet.id} className="pb-s pb-fr" aria-hidden="true" {...props}>
                  <i className="pb-pin" />
                </div>
              )
            }
            return (
              <div
                key={sheet.id}
                className={sheet.kind === 'story' ? 'pb-s pb-story' : 'pb-s pb-note'}
                aria-hidden="true"
                {...props}
              >
                <i className="pb-pin" />
                {sheet.kind === 'story' && [0, 1, 2, 3, 4].map((n) => <i key={n} />)}
              </div>
            )
          })}
        </nav>
      </div>
    </details>
  )
}
