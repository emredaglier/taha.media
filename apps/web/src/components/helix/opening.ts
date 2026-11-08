import type { HelixPhase, Opening } from '../../lib/helix-motion'
import { HELIX_TUNING } from '../../lib/helix-tuning'
import type { HelixWork } from '../FeaturedWorks'
import { WORK_LINK_ATTRIBUTE } from './FrontWork'

/**
 * The page around the Helix's opening (#54): the scroll that drives the zoom, the marks the CSS
 * keys to, the Work remembered on the history entry, and the links that replay or remember.
 */

/** How far the page has scrolled through the zoom's scroll length: 0 at the top, 1 at its end. */
export const zoomScroll = (): number =>
  window.scrollY / Math.max(1, (window.innerHeight * HELIX_TUNING.zoomScrollVh) / 100)

/** The page's height while the Helix runs: one screen, plus the zoom's scroll length. */
export const SPACER_HEIGHT = `calc(100vh + ${HELIX_TUNING.zoomScrollVh}vh)`

/**
 * Writes the marks the CSS keys to on `<html>`: `data-home="helix"` (the Helix runs),
 * `data-helix-phase` (the opening's phase: the page scrolls in `hero` and is locked after), and
 * how far the hero's overlays have left. Writes only what changed.
 */
export function pageMarks(root: HTMLElement) {
  let phase = ''
  let gone = -1
  return {
    show(next: HelixPhase['kind'], opening: Opening) {
      if (next !== phase) {
        phase = next
        root.dataset.helixPhase = next
        root.dataset.home = 'helix'
      }
      const heroGone = Math.round(opening.heroGone * 1000) / 1000
      if (heroGone !== gone) {
        gone = heroGone
        root.style.setProperty('--helix-hero-gone', String(heroGone))
        root.style.setProperty('--helix-hero-visibility', heroGone >= 1 ? 'hidden' : 'visible')
      }
    },
    clear() {
      delete root.dataset.home
      delete root.dataset.helixPhase
      root.style.removeProperty('--helix-hero-gone')
      root.style.removeProperty('--helix-hero-visibility')
    },
  }
}

/** Where on the Home history entry the Work opened from the Helix is kept (its slug). */
const HISTORY_KEY = 'helixWork'

const historyState = (): Record<string, unknown> =>
  typeof window.history.state === 'object' && window.history.state !== null
    ? (window.history.state as Record<string, unknown>)
    : {}

/**
 * Remembers on the current history entry that Work `slug` was opened from the Helix. The whole
 * state is kept (Next's own included), and the URL doesn't change.
 */
export function rememberWork(slug: string): void {
  window.history.replaceState({ ...historyState(), [HISTORY_KEY]: slug }, '')
}

/** Forgets it: the next time Home starts on this entry, it starts from the Showreel. */
export function forgetWork(): void {
  if (!(HISTORY_KEY in historyState())) return
  const rest = { ...historyState() }
  delete rest[HISTORY_KEY]
  window.history.replaceState(rest, '')
}

/**
 * Whether this document was loaded by reloading Home. A browser keeps the history entry's state
 * across a reload, but a reload starts from the Showreel, so the first Helix of such a document
 * forgets the remembered Work. Coming back (browser back, a client-side back navigation, a
 * document restored from history) keeps it.
 */
let reloadedHome = (() => {
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
  return entry?.type === 'reload' && new URL(entry.name).pathname === window.location.pathname
})()

/**
 * The Work Home starts with, its place among `works`: the one remembered on this history entry,
 * unless this is a reload of Home (then it is forgotten), or that Work is no longer featured.
 */
export function rememberedWork(works: readonly HelixWork[]): number | null {
  if (reloadedHome) {
    reloadedHome = false
    forgetWork()
    return null
  }
  const slug = historyState()[HISTORY_KEY]
  const work = works.findIndex((each) => each.slug === slug)
  return work >= 0 ? work : null
}

/**
 * Watches clicks on links while the Helix runs. A link to Home (the logo) calls `onHome` instead of
 * navigating: Home is already there, and it replays the opening. A static Work link (focused from
 * the keyboard, or followed by a screen reader) calls `onWork` before the navigation, so its Work
 * is remembered. Runs before Next's own link handling (capture, on `window`). Returns the cleanup.
 */
export function watchLinks({
  onHome,
  onWork,
}: {
  onHome: () => void
  onWork: (slug: string) => void
}): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!link) return
    if (link.getAttribute('href') === '/') {
      event.preventDefault()
      onHome()
      return
    }
    const slug = link.getAttribute(WORK_LINK_ATTRIBUTE)
    if (slug) onWork(slug)
  }
  window.addEventListener('click', onClick, { capture: true })
  return () => window.removeEventListener('click', onClick, { capture: true })
}

/**
 * The static hero's loop on screen, if it plays one (the phone or the wide variant, whichever
 * shows): the picture the Helix's Showreel layer takes over from.
 */
export function heroLoop(): HTMLVideoElement | null {
  const videos = document.querySelectorAll<HTMLVideoElement>('[data-home-hero] video')
  return [...videos].find((video) => video.getClientRects().length > 0) ?? null
}
