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
