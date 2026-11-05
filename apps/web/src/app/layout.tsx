import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { isPreviewInstance } from '../lib/preview'

export const metadata: Metadata = {
  title: 'taha.media',
  // The preview instance (PREVIEW=1) is never indexed; `proxy.ts` also sends X-Robots-Tag.
  ...(isPreviewInstance() ? { robots: { index: false, follow: false } } : {}),
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  )
}
