/**
 * The label the site cursor shows for what the mouse is over, or `''` for none.
 * The nearest `data-cursor` wins (an empty one means no label); otherwise a link is named by
 * where it leads.
 */
export function cursorLabel(target: Element | null, origin: string): string {
  const marked = target?.closest('[data-cursor]')
  if (marked) return marked.getAttribute('data-cursor') ?? ''
  const link = target?.closest<HTMLAnchorElement>('a[href]')
  if (!link) return ''
  const url = new URL(link.href)
  if (url.protocol === 'mailto:') return 'Yaz'
  if (url.origin !== origin) return 'Git'
  return url.pathname === '/' ? 'Ana sayfa' : 'Aç'
}
