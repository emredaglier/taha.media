/**
 * What the mouse is over for the site cursor: the element the blot floods and its label, or
 * `null` for nothing. The nearest `data-cursor` wins (an empty one means nothing); otherwise a
 * link is named by where it leads.
 */
export function cursorTarget(
  target: Element | null,
  origin: string,
): { element: Element; label: string } | null {
  const marked = target?.closest('[data-cursor]')
  if (marked) {
    const label = marked.getAttribute('data-cursor') ?? ''
    return label ? { element: marked, label } : null
  }
  const link = target?.closest<HTMLAnchorElement>('a[href]')
  if (!link) return null
  const url = new URL(link.href)
  if (url.protocol === 'mailto:') return { element: link, label: 'Yaz' }
  if (url.origin !== origin) return { element: link, label: 'Git' }
  return { element: link, label: url.pathname === '/' ? 'Ana sayfa' : 'Aç' }
}

/** The label the site cursor shows for what the mouse is over, or `''` for none. */
export const cursorLabel = (target: Element | null, origin: string): string =>
  cursorTarget(target, origin)?.label ?? ''
