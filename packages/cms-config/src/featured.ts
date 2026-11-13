/** The Edit Room on Home shows the first 8 Featured Works (GLOSSARY: Featured Work). */
export const FEATURED_ROOM = 8

/**
 * The Editor-facing warning for a featured count other than 8, or `null` when it is exactly 8.
 * It is only ever shown: saving is never blocked, so Taha can feature Works one at a time.
 */
export function featuredCountWarning(count: number): string | null {
  if (count === FEATURED_ROOM) return null
  return `Ana sayfadaki oda ilk ${FEATURED_ROOM} öne çıkan işi gösterir; şu an ${count} var. Kaydetmek yine de çalışır.`
}
