import { HELIX_TUNING } from '../../lib/helix-tuning'
import type { PointerPath } from './ripples'

const { restSpeed, speedFade, inRate, outRate } = HELIX_TUNING.pointer

/** Where a point in the page (client px) is on the canvas, in normalized device coordinates (y up). */
export function devicePoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const box = canvas.getBoundingClientRect()
  return {
    x: ((clientX - box.left) / Math.max(1, box.width)) * 2 - 1,
    y: 1 - ((clientY - box.top) / Math.max(1, box.height)) * 2,
  }
}

/** What the pointer did over the Helix since the last frame. */
export type PointerSample = {
  /** Where it is, in normalized device coordinates; null when it isn't over the Helix. */
  point: { x: number; y: number } | null
  /** Whether it has come to rest, so the card under it is the hovered card. */
  resting: boolean
  /** Its path since the last frame, for ripples. */
  cursor: PointerPath | null
}

/**
 * Follows the pointer over the Helix's canvas (#55): a mouse, a pen, or a finger while it is down
 * (Hand control will feed the same pointer events). `sample` is called once per frame.
 */
export function watchPointer(canvas: HTMLCanvasElement) {
  /** Where it is and where it was at the last sample, in client px. */
  let at: { x: number; y: number } | null = null
  let last: { x: number; y: number } | null = null
  let speed = 0

  const move = (event: PointerEvent) => {
    at = { x: event.clientX, y: event.clientY }
  }
  const leave = () => {
    at = null
    last = null
    speed = 0
  }
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerleave', leave)

  /** A point in client px on the screen, 0 to 1 across and up. */
  const onScreen = (p: { x: number; y: number }) => {
    const { x, y } = devicePoint(canvas, p.x, p.y)
    return { x: x / 2 + 0.5, y: y / 2 + 0.5 }
  }

  return {
    sample(dt: number): PointerSample {
      if (!at) return { point: null, resting: false, cursor: null }
      const from = last ?? at
      const moved = Math.hypot(at.x - from.x, at.y - from.y) / Math.max(dt, 1e-3)
      // The fastest it moved lately: it rests only once it has been slow for a moment.
      speed = Math.max(moved, speed * Math.exp(-dt * speedFade))
      last = at
      return {
        point: devicePoint(canvas, at.x, at.y),
        resting: speed < restSpeed,
        cursor: { from: onScreen(from), to: onScreen(at), speed: moved },
      }
    },

    destroy() {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
    },
  }
}

/**
 * How far each of `cards` cards is hovered (`hovered`) or dimmed for not being hovered (`dimmed`),
 * 0 to 1. While a card is hovered, every other card is dimmed; with none, no card is. Each eases
 * towards that with time, in faster than out, so the hover glides from card to card.
 */
export function createHoverLevels(cards: number) {
  const hovered = new Float32Array(cards)
  const dimmed = new Float32Array(cards)
  const ease = (from: number, to: number, dt: number) =>
    from + (to - from) * (1 - Math.exp(-dt * (to > from ? inRate : outRate)))

  return {
    step(hoveredCard: number | null, dt: number) {
      for (let card = 0; card < cards; card++) {
        hovered[card] = ease(hovered[card]!, card === hoveredCard ? 1 : 0, dt)
        dimmed[card] = ease(dimmed[card]!, hoveredCard !== null && card !== hoveredCard ? 1 : 0, dt)
      }
    },
    hovered: (card: number) => hovered[card] ?? 0,
    dimmed: (card: number) => dimmed[card] ?? 0,
  }
}
