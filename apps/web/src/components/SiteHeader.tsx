import Link from 'next/link'

import { copyrightNotice, OWNER_NAME, TAGLINE } from '../lib/site'
import { HandToggle } from './hand/HandToggle'
import { SiteMenu } from './SiteMenu'

/**
 * The name links Home; MENU opens the full-screen menu at every width. The © line goes to the
 * menu as a prop, so the year the server rendered is the one the client hydrates with. It stacks
 * above the Helix, which covers the whole screen on Home. On Home it sits over the full-bleed hero,
 * and while the Helix runs it stays on screen throughout, as the page scrolls the zoom. Hand
 * control's "Elinle gez" sits next to MENU, only where it is offered (desktop with a camera).
 */
export function SiteHeader() {
  return (
    <header className="relative z-10 flex items-baseline justify-between gap-4 px-6 py-4 over-hero:absolute over-hero:inset-x-0 over-hero:top-0 helix:fixed helix:inset-x-0 helix:top-0">
      <Link href="/" className="font-serif text-xl text-text">
        {OWNER_NAME}
      </Link>
      <div className="flex items-baseline gap-6">
        <p className="text-sm text-text-muted">{TAGLINE}</p>
        <HandToggle />
        <SiteMenu copyright={copyrightNotice()} />
      </div>
    </header>
  )
}
