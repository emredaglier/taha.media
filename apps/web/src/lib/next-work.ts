/**
 * The Work that follows `current` in list order, wrapping from the last to the first. Null when
 * there is no other Work (a single one) or `current` is not in the list. Items can be anything
 * with identity, such as slugs or Works.
 */
export function nextWork<T>(ordered: readonly T[], current: T): T | null {
  const index = ordered.indexOf(current)
  if (index === -1 || ordered.length < 2) return null
  return ordered[(index + 1) % ordered.length] ?? null
}
