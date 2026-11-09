import type { Metadata } from 'next'
import Link from 'next/link'

import { PageFrame } from '../components/PageFrame'

export const metadata: Metadata = { title: 'Sayfa bulunamadı' }

/**
 * Server-rendered, so the body is there without JavaScript. Next answers with status 404. It
 * replaces everything below the root layout (the `(site)` layout too), so it brings its own
 * `main` and footer.
 */
export default function NotFound() {
  return (
    <PageFrame>
      <div className="flex flex-col items-start gap-4 py-16">
        <h1 className="font-serif text-4xl">Sayfa bulunamadı</h1>
        <Link href="/" className="underline">
          Ana sayfaya dön
        </Link>
      </div>
    </PageFrame>
  )
}
