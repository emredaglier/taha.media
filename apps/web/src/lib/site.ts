/** The owner's name, as the header and footer show it. A frontend constant for now. */
export const OWNER_NAME = 'Taha Çiftçi'

/** The © line the footer and the menu show (no year: cached pages would show a stale one, ADR-0012). */
export const copyrightNotice = (): string => `© ${OWNER_NAME}`

/** Placeholder tagline next to the name until the real copy exists. */
export const TAGLINE = 'creative director'

/** The site's name, for the page title. */
export const SITE_NAME = 'taha.media'

/** Canonical origin, for resolving relative metadata URLs. */
export const SITE_ORIGIN = 'https://taha.media'
