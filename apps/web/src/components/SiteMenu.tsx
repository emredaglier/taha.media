'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { lockScroll, MENU_PANEL_ID, nextFocus } from '../lib/menu-a11y'
import { legalLink, menuLinks } from '../lib/nav-links'

/**
 * A native <details>, so without JavaScript it still opens and reaches every link. With JS the
 * toggle is taken over: the page behind can't scroll, focus moves in and is trapped (every Tab
 * step is picked by `nextFocus`, for Safari), Escape closes and returns focus to MENU, and
 * following a link closes it. Adapted from daglier.com's mobile menu (ADR-0100), without its motion.
 *
 * After the pages come Gizlilik and the © line (`copyright`, rendered by the server): Home has no
 * footer (ADR-0103), so the menu holds them. Gizlilik is a link in the panel, so it is in the
 * focus loop like the rest.
 */
export function SiteMenu({ copyright }: { copyright: string }) {
  const pathname = usePathname()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  // A route change closes the menu (set state during render, not in an effect).
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    const details = detailsRef.current!
    details.open = open // also resets a native toggle made before hydration
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
        className="relative z-50 cursor-pointer list-none text-sm uppercase [&::-webkit-details-marker]:hidden"
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
        <nav aria-label="Menü" className="flex min-h-dvh flex-col justify-center gap-6 px-6">
          <ul className="flex flex-col gap-4">
            {menuLinks.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="font-serif text-5xl"
                  aria-current={pathname === href ? 'page' : undefined}
                  // A link to the current page changes no pathname, so it closes the menu itself.
                  onClick={() => setOpen(false)}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline gap-4 text-sm text-text-muted">
            <Link
              href={legalLink.href}
              className="underline"
              aria-current={pathname === legalLink.href ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {legalLink.label}
            </Link>
            <p>{copyright}</p>
          </div>
        </nav>
      </div>
    </details>
  )
}
