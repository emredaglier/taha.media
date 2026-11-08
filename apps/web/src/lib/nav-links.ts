/** The pages the menu opens, in order. */
export const menuLinks = [
  { href: '/isler', label: 'İşler' },
  { href: '/galeri', label: 'Galeri' },
  { href: '/hakkimda', label: 'Hakkımda' },
] as const

/**
 * The privacy notice. It is in the footer on every page except Home, and in the menu after
 * `menuLinks`, so Home (which has no footer, ADR-0103) reaches it too.
 */
export const legalLink = { href: '/gizlilik', label: 'Gizlilik' } as const
