/** Home shows between 6 and 12 Featured Works (GLOSSARY: Featured Work). */
export const FEATURED_MIN = 6
export const FEATURED_MAX = 12

/**
 * The Editor-facing warning for a featured count outside 6–12, or `null` when it is fine. It is
 * only ever shown: saving is never blocked, so Taha can feature Works one at a time.
 */
export function featuredCountWarning(count: number): string | null {
  if (count >= FEATURED_MIN && count <= FEATURED_MAX) return null
  return `Ana sayfada ${FEATURED_MIN} ile ${FEATURED_MAX} arasında öne çıkan iş olmalı; şu an ${count} var. Kaydetmek yine de çalışır.`
}
