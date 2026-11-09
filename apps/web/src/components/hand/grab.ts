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

/**
 * Whether the page itself is locked (`overflow: hidden` on the root: the open menu, the Galeri
 * lightbox, Home once it holds the screen). `scrollBy` would still move it, the wheel doesn't.
 * The shorthand's last value is its vertical one (jsdom leaves `overflowY` unexpanded).
 */
const pageLocked = () => {
  const { overflow, overflowY } = getComputedStyle(document.documentElement)
  const clipped = (value: string | undefined) => value === 'hidden' || value === 'clip'
  return clipped(overflowY) || clipped(overflow.split(/\s+/).at(-1))
}

/** What a grab at `element` scrolls: its nearest scrolling ancestor, otherwise the page. */
const scrollerOf = (element: Element | null): Element | Window => {
  for (let at = element; at; at = at.parentElement) if (scrolls(at)) return at
  return window
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The page side of a grab (#57): scrolls what is under the cursor (its nearest scrolling ancestor,
 * or the page unless it is locked, as the wheel would) as the hand moves, and on letting go glides
 * on briefly at the hand's last speed, unless the visitor prefers reduced motion. `elementAt`
 * answers what is under the cursor when the grab first moves. Whole pixels only, the remainder
 * carried, so a slow hand still scrolls.
 */
export function createGrabScroller(elementAt: () => Element | null) {
  const { scrollGain, glideSampleMs, glideSeconds, glideStopPxPerSecond, glideFromPxPerSecond } =
    HAND_TUNING.grab
  let target: Element | Window | null = null
  let carry = 0
  /** The grab's recent moves: how far, over which time (ms). */
  let recent: { from: number; at: number; px: number }[] = []
  let glide = 0

  const scroll = (px: number) => {
    carry += px
    const whole = Math.trunc(carry)
    if (whole === 0 || !target) return
    carry -= whole
    if (target === window && pageLocked()) return
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

  /**
   * The hand moved `up` screen heights while grabbing, at `at` (ms): the content follows it. A
   * catch-up (`since`, ms) brings in at once what the hand moved since then, so for the glide's
   * speed it spreads over that time, not over one frame.
   */
  const move = (up: number, at: number, since?: number) => {
    stopGlide()
    target ??= scrollerOf(elementAt())
    const px = up * document.documentElement.clientHeight * scrollGain
    const from = since ?? recent.at(-1)?.at ?? at
    recent = [...recent, { from, at, px }].filter((sample) => at - sample.at < glideSampleMs)
    scroll(px)
  }

  /**
   * The hand's speed (px per second) over its moves of the last `glideSampleMs`, each over the
   * time it covers (from the move before it), so any camera frame rate reads the same.
   */
  const speedOf = () => {
    const last = recent.at(-1)
    if (!last) return 0
    const span = (last.at - Math.min(...recent.map((sample) => sample.from))) / 1000
    return span > 0 ? recent.reduce((sum, sample) => sum + sample.px, 0) / span : 0
  }

  /**
   * The grab let go at `at` (ms, the animation frames' clock), its last steady frame at `steadyAt`:
   * if the hand was still moving then, fast enough, the page glides on at its speed, slowing to a
   * stop. Never under reduced motion: the page stops where the grab let go.
   */
  const release = (steadyAt: number, at: number) => {
    const last = recent.at(-1)
    const moving = last !== undefined && steadyAt - last.at <= glideSampleMs
    let speed = moving ? speedOf() : 0
    recent = []
    stopGlide()
    if (!target || reducedMotion() || Math.abs(speed) < glideFromPxPerSecond) return cancel()
    let previous = at
    const step = (now: number) => {
      const dt = Math.min(Math.max((now - previous) / 1000, 0), 0.1)
      previous = now
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
