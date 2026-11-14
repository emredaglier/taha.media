import type { ReactNode } from 'react'

import { MeltLayer } from './MeltLayer'
import { SiteFooter } from './SiteFooter'

/**
 * The page's `main`, the target of the skip link. The root layout leaves it to each route,
 * because Home is full-bleed and has no footer, while the other pages are padded and have one.
 */
export function PageMain({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <>
      <main id="main" className={`flex-1 px-6 ${className ?? ''}`.trimEnd()}>
        {children}
      </main>
      <MeltLayer />
    </>
  )
}

/**
 * `main` with the footer after it: what every route has except Home, which holds the screen and
 * has no footer (ADR-0103). Used by the `(site)` layout and by the not-found page. A not-found
 * page replaces everything below the root layout, so it can't rely on the `(site)` layout.
 */
export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <PageMain>{children}</PageMain>
      <SiteFooter />
    </>
  )
}
