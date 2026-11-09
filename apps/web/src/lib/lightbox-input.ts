/** What the lightbox does for a key press or a swipe. */
export type LightboxAction = 'close' | 'previous' | 'next'

type KeyLike = {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

/**
 * Escape closes; the left and right arrows step. An arrow with a modifier is not ours (Alt+Left
 * and Cmd+Left are the browser's Back), and every other key is left to the browser, Tab included
 * (the focus trap handles that one).
 */
export function keyAction(event: KeyLike): LightboxAction | null {
  if (event.key === 'Escape') return 'close'
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  if (event.key === 'ArrowLeft') return 'previous'
  if (event.key === 'ArrowRight') return 'next'
  return null
}

/** The shortest sideways travel, in CSS pixels, that counts as a swipe rather than a tap. */
export const SWIPE_MIN_DISTANCE = 48

/** A swipe must be this many times longer sideways than it is up or down. */
const SWIPE_STRAIGHTNESS = 1.5

/**
 * What a finger travelling `dx` across and `dy` down does. Swiping left pulls the next item in,
 * swiping right brings the previous back. A short travel, or one that is more up or down than
 * sideways (a scroll or a diagonal), does nothing.
 */
export function swipeAction(dx: number, dy: number): 'previous' | 'next' | null {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return null
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_STRAIGHTNESS) return null
  return dx < 0 ? 'next' : 'previous'
}

/**
 * A click that should open the lightbox: a plain click with the main button. With a modifier or
 * another button the visitor is asking the browser for the file itself (new tab, download), so
 * the link keeps working.
 */
export const isPlainClick = (event: {
  button: number
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}): boolean =>
  event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey

/** "3 / 12": the open item's place in the Gallery, counted from one. */
export const positionLabel = (index: number, count: number): string => `${index + 1} / ${count}`

/** The dialog's accessible name: "Galeri, 3 / 12", with the caption after a colon when it has one. */
export function lightboxLabel(index: number, count: number, caption: string | null): string {
  const text = caption?.trim()
  return `Galeri, ${positionLabel(index, count)}${text ? `: ${text}` : ''}`
}
