/** The Melt bend of the cursor (#122): its tuning, its spring and the crop a picture shows. */
export const MELT = {
  size: 300,
  rest: 70,
  link: 150,
  split: 0.1,
  kick: 250,
  loose: 0.25,
  columns: 24,
}

export type Spring = { power: number; speed: number }

/** A loose spring toward `to`: the bend overshoots and wobbles into place. */
export function springStep({ power, speed }: Spring, to: number, dt: number): Spring {
  const next = speed + ((to - power) * 180 - speed * 2 * Math.sqrt(180) * MELT.loose) * dt
  return { power: power + next * dt, speed: next }
}

/** Whether the spring has arrived at `to`, so the loop may stop. */
export const settled = ({ power, speed }: Spring, to: number) =>
  Math.abs(to - power) < 0.05 && Math.abs(speed) < 0.5

/** A rectangle in fractions of a picture, from its top left. */
export type Rect = { x: number; y: number; w: number; h: number }

/**
 * The part of a picture a box shows, as CSS `object-fit` and `object-position` (fractions, 0 is
 * the start) place it. null for fits that leave empty bands (`contain`, `none`): those don't melt.
 */
export function visibleRect(
  box: { width: number; height: number },
  natural: { width: number; height: number },
  fit: string,
  position: { x: number; y: number },
): Rect | null {
  if (fit === 'fill') return { x: 0, y: 0, w: 1, h: 1 }
  if (fit !== 'cover') return null
  const scale = Math.max(box.width / natural.width, box.height / natural.height)
  const w = box.width / (natural.width * scale)
  const h = box.height / (natural.height * scale)
  return { x: (1 - w) * position.x, y: (1 - h) * position.y, w, h }
}
