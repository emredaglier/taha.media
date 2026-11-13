import Link from 'next/link'

import { copyrightNotice, OWNER_NAME, TAGLINE } from '../lib/site'
import { SiteMenu } from './SiteMenu'

/**
 * The name links Home; MENU opens the full-screen menu at every width. The © line goes to the
 * menu as a prop, so the year the server rendered is the one the client hydrates with. It stacks
 * above the Helix, which covers the whole screen on Home. On Home it sits over the full-bleed hero,
 * and while the Helix runs it stays on screen throughout, as the page scrolls the zoom.
 */
export function SiteHeader() {
  return (
    // Difference blend inverts over light video; off while the menu is open, or its panel would blend too.
    <header className="relative z-10 flex items-baseline justify-between gap-4 px-8 py-7 text-text mix-blend-difference has-[details[open]]:mix-blend-normal over-hero:absolute over-hero:inset-x-0 over-hero:top-0 helix:fixed helix:inset-x-0 helix:top-0">
      <Link href="/" className="flex items-baseline gap-2">
        <span className="font-sans text-lg font-bold tracking-tight">{OWNER_NAME}</span>
        <span className="font-serif text-xl">{TAGLINE}</span>
      </Link>
      <div className="flex items-baseline gap-6">
        <SiteMenu copyright={copyrightNotice()} />
      </div>
    </header>
  )
}
