import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Sayfa bulunamadı' }

/** Server-rendered, so the body is there without JavaScript. Next answers with status 404. */
export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4 py-16">
      <h1 className="font-serif text-4xl">Sayfa bulunamadı</h1>
      <Link href="/" className="underline">
        Ana sayfaya dön
      </Link>
    </div>
  )
}
