import '@fontsource/instrument-serif'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource-variable/geist'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { HandControl } from '../components/hand/HandControl'
import { Observability } from '../components/Observability'
import { SiteHeader } from '../components/SiteHeader'
import {
  beaconAttributes,
  beaconToken,
  releaseId,
  sentryDsn,
  sentryOptions,
} from '../lib/observability'
import { loaderScript } from '../lib/home-loader'
import { isPreviewInstance } from '../lib/preview'
import { SITE_NAME, SITE_ORIGIN } from '../lib/site'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: { default: SITE_NAME, template: `%s — ${SITE_NAME}` },
  // The preview instance (PREVIEW=1) is never indexed; `proxy.ts` also sends X-Robots-Tag.
  ...(isPreviewInstance() ? { robots: { index: false, follow: false } } : {}),
}

/**
 * The shell every public route renders in: skip link and header. The `main` and the footer come
 * from the route's own layout (`PageFrame`): Home has no footer (ADR-0103), so the footer can't
 * live here. A single root layout keeps navigation between Home and the other pages client-side,
 * which also keeps Hand control's controller (camera, tracker, preview, ring) running across it.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  const sentry = sentryOptions({
    dsn: sentryDsn(),
    preview: isPreviewInstance(),
    release: releaseId(),
  })
  const beacon = beaconAttributes({
    token: beaconToken(),
    production: process.env.NODE_ENV === 'production',
    preview: isPreviewInstance(),
  })
  return (
    // The loader's script marks `<html>` before React hydrates it (ADR-0104).
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: loaderScript() }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-background font-sans text-text">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-background-raised focus:px-3 focus:py-2"
        >
          İçeriğe geç
        </a>
        <SiteHeader />
        {children}
        <HandControl />
        {sentry ? <Observability options={sentry} /> : null}
        {beacon ? <script defer {...beacon} /> : null}
        <div aria-hidden="true" className="crt" />
      </body>
    </html>
  )
}
