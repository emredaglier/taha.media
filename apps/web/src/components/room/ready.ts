import { LOADER_TIMEOUT_MS } from '../../lib/home-loader'
import { ROOM_TUNING } from '../../lib/room-tuning'

/** How long before the loader's own cap the room stops waiting, so its first frame lands under it. */
const LOADER_MARGIN_MS = 200

/**
 * How long the room may still wait (ms) when `now` ms have passed since the page began loading
 * (`performance.now()`): `ROOM_TUNING.stillsWaitMs`, less what is left of the loader's 4 s, which
 * counts from the page load and not from when the room mounted. Never below 0.
 */
export const waitBudgetMs = (now: number): number =>
  Math.max(0, Math.min(ROOM_TUNING.stillsWaitMs, LOADER_TIMEOUT_MS - LOADER_MARGIN_MS - now))

/**
 * Resolves when every promise in `parts` has settled (an `undefined` part counts as done) or after
 * `ms`, whichever comes first: the room waits for what it needs for its first frame (the
 * Statement, the stills, the Showreel) and never for longer than `ms`, which stays under the
 * loader's own 4 s cap (`LOADER_TIMEOUT_MS`).
 */
export function readyWithin(parts: readonly (Promise<unknown> | undefined)[], ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const give = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  const all = Promise.all(parts).then(() => undefined)
  return Promise.race([all, give]).finally(() => clearTimeout(timer))
}
