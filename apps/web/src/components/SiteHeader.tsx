import Link from 'next/link'

import { OWNER_NAME, TAGLINE } from '../lib/site'

/** The name links Home; the MENU button comes with the menu ticket. */
export function SiteHeader() {
  return (
    <header className="flex items-baseline justify-between gap-4 px-6 py-4">
      <Link href="/" className="font-serif text-xl text-text">
        {OWNER_NAME}
      </Link>
      <p className="text-sm text-text-muted">{TAGLINE}</p>
    </header>
  )
}
