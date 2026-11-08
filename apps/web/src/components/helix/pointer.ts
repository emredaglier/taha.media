import { HELIX_TUNING } from '../../lib/helix-tuning'
import type { ScreenPoint } from './ripples'

const { restSpeed, speedFade, inRate, outRate } = HELIX_TUNING.pointer

/** What the pointer did over the Helix since the last frame. */
export type PointerSample = {
  /** Where it is, in normalized device coordinates (-1 to 1, y up); null when it isn't over it. */
  point: { x: number; y: number } | null
  /** Whether it has come to rest, so the card under it is the one pointed at. */
  resting: boolean
  /** Its path since the last frame (0 to 1, y up) and its speed (CSS px per second), for ripples. */
  cursor: { from: ScreenPoint; to: ScreenPoint; speed: number } | null
}

/**
 * Follows the pointer over the Helix's canvas (#55): a mouse, a pen, or a finger while it is down
 * (Hand control will feed the same pointer events). `sample` is called once per frame.
 */
export function watchPointer(canvas: HTMLCanvasElement) {
  /** Where it is and where it was at the last sample, in CSS px from the canvas's top left. */
  let at: { x: number; y: number } | null = null
  let last: { x: number; y: number } | null = null
  let speed = 0

  const move = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect()
    at = { x: event.clientX - box.left, y: event.clientY - box.top }
  }
  const leave = () => {
    at = null
    last = null
    speed = 0
  }
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerleave', leave)

  return {
    sample(dt: number): PointerSample {
      const width = Math.max(1, canvas.clientWidth)
      const height = Math.max(1, canvas.clientHeight)
      if (!at) return { point: null, resting: false, cursor: null }
      const from = last ?? at
      const moved = Math.hypot(at.x - from.x, at.y - from.y) / Math.max(dt, 1e-3)
      // The fastest it moved lately: it rests only once it has been slow for a moment.
      speed = Math.max(moved, speed * Math.exp(-dt * speedFade))
      last = at
      const screen = (p: { x: number; y: number }) => ({ x: p.x / width, y: 1 - p.y / height })
      return {
        point: { x: (at.x / width) * 2 - 1, y: 1 - (at.y / height) * 2 },
        resting: speed < restSpeed,
        cursor: { from: screen(from), to: screen(at), speed: moved },
      }
    },

    destroy() {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
    },
  }
}

/**
 * How far each of `cards` cards is pointed at (`hover`) or not (`dim`), 0 to 1. While a card is
 * pointed at, every other card is "not pointed at"; with none, no card is. Each eases towards that
 * with time, in faster than out, so the focus glides from card to card.
 */
export function createFocus(cards: number) {
  const hover = new Float32Array(cards)
  const dim = new Float32Array(cards)
  const ease = (from: number, to: number, dt: number) =>
    from + (to - from) * (1 - Math.exp(-dt * (to > from ? inRate : outRate)))

  return {
    step(pointed: number | null, dt: number) {
      for (let card = 0; card < cards; card++) {
        hover[card] = ease(hover[card]!, card === pointed ? 1 : 0, dt)
        dim[card] = ease(dim[card]!, pointed !== null && card !== pointed ? 1 : 0, dt)
      }
    },
    hover: (card: number) => hover[card] ?? 0,
    dim: (card: number) => dim[card] ?? 0,
  }
}
