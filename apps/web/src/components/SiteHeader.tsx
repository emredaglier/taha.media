import Link from 'next/link'

import { OWNER_NAME, TAGLINE } from '../lib/site'
import { SiteMenu } from './SiteMenu'

/** The name links Home; MENU opens the full-screen menu at every width. */
export function SiteHeader() {
  return (
    <header className="flex items-baseline justify-between gap-4 px-6 py-4">
      <Link href="/" className="font-serif text-xl text-text">
        {OWNER_NAME}
      </Link>
      <div className="flex items-baseline gap-6">
        <p className="text-sm text-text-muted">{TAGLINE}</p>
        <SiteMenu />
      </div>
    </header>
  )
}
