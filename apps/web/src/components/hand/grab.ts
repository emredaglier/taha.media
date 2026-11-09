import { HAND_TUNING } from '../../lib/hand-tuning'

/**
 * Something on the page that takes Hand control's grab instead of the page scroll: the Helix on
 * Home, which turns like a drag once Home holds the screen.
 */
export type GrabSink = {
  /** The grab moved `up` screen heights (negative: down). Returns whether it took the move. */
  move(up: number): boolean
  /** The grab let go. Returns whether it had taken the grab (then the page doesn't glide). */
  end(): boolean
}

let sink: GrabSink | null = null

/** `next` takes the grab from now on (the latest claim wins). Returns the undo. */
export function claimHandGrab(next: GrabSink): () => void {
  sink = next
  return () => {
    if (sink === next) sink = null
  }
}

/** Whoever claimed the grab, if anyone. */
export const handGrabSink = (): GrabSink | null => sink

/** Whether `element` scrolls on its own (a scrolling panel, not the page). */
const scrolls = (element: Element) => {
  if (element === document.documentElement || element === document.body) return false
  const { overflowY } = getComputedStyle(element)
  return /^(auto|scroll|overlay)$/.test(overflowY) && element.scrollHeight > element.clientHeight
}

/** What a grab at `element` scrolls: its nearest scrolling ancestor, otherwise the page. */
const scrollerOf = (element: Element | null): Element | Window => {
  for (let at = element; at; at = at.parentElement) if (scrolls(at)) return at
  return window
}

/**
 * The page side of a grab (#57): scrolls what is under the cursor (its nearest scrolling ancestor,
 * or the page) as the hand moves, and on letting go glides on briefly at the hand's last speed.
 * `elementAt` answers what is under the cursor when the grab first moves. Whole pixels only, the
 * remainder carried, so a slow hand still scrolls.
 */
export function createGrabScroller(elementAt: () => Element | null) {
  const { scrollGain, glideSampleMs, glideSeconds, glideStopPxPerSecond } = HAND_TUNING.grab
  let target: Element | Window | null = null
  let carry = 0
  let recent: { at: number; px: number }[] = []
  let glide = 0

  const scroll = (px: number) => {
    carry += px
    const whole = Math.trunc(carry)
    if (whole === 0 || !target) return
    carry -= whole
    target.scrollBy({ top: whole, behavior: 'instant' })
  }

  const stopGlide = () => {
    if (glide) cancelAnimationFrame(glide)
    glide = 0
  }

  /** Ends any grab or glide without gliding (a sink took it, a new pinch, Hand control off). */
  const cancel = () => {
    stopGlide()
    target = null
    carry = 0
    recent = []
  }

  /** The hand moved `up` screen heights while grabbing, at `at` (ms): the content follows it. */
  const move = (up: number, at: number) => {
    stopGlide()
    target ??= scrollerOf(elementAt())
    const px = up * document.documentElement.clientHeight * scrollGain
    recent = [...recent, { at, px }].filter((sample) => at - sample.at <= glideSampleMs)
    scroll(px)
  }

  /**
   * The grab let go at `at` (ms, the animation frames' clock): glide on at the speed of its last
   * moments, slowing to a stop.
   */
  const release = (at: number) => {
    // The speed of the last moments of movement (the release itself comes a few camera frames
    // after the hand stopped moving, once the fingers have surely opened); none if it had stopped.
    const lastMove = recent.at(-1)?.at ?? -Infinity
    const moved =
      at - lastMove <= glideSampleMs
        ? recent
            .filter((sample) => lastMove - sample.at < glideSampleMs)
            .reduce((sum, sample) => sum + sample.px, 0)
        : 0
    let speed = moved / (glideSampleMs / 1000) // px per second
    recent = []
    stopGlide()
    if (!target || Math.abs(speed) < glideStopPxPerSecond) return cancel()
    let last = at
    const step = (now: number) => {
      const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1)
      last = now
      scroll(speed * dt)
      speed *= Math.exp(-dt / glideSeconds)
      if (Math.abs(speed) < glideStopPxPerSecond) return cancel()
      glide = requestAnimationFrame(step)
    }
    glide = requestAnimationFrame(step)
  }

  return { move, release, cancel }
}

export type GrabScroller = ReturnType<typeof createGrabScroller>
