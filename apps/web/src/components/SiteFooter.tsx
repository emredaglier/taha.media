import Link from 'next/link'

import { OWNER_NAME } from '../lib/site'

export function SiteFooter() {
  return (
    <footer className="flex items-baseline justify-between gap-4 bg-background-raised px-6 py-4 text-sm text-text-muted">
      <p>{`© ${new Date().getFullYear()} ${OWNER_NAME}`}</p>
      <Link href="/gizlilik" className="underline">
        Gizlilik
      </Link>
    </footer>
  )
}
