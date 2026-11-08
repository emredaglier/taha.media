import Link from 'next/link'

import { legalLink } from '../lib/nav-links'
import { copyrightNotice } from '../lib/site'

export function SiteFooter() {
  return (
    <footer className="flex items-baseline justify-between gap-4 bg-background-raised px-6 py-4 text-sm text-text-muted">
      <p>{copyrightNotice()}</p>
      <Link href={legalLink.href} className="underline">
        {legalLink.label}
      </Link>
    </footer>
  )
}
