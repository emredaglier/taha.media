import type { CSSProperties } from 'react'

/**
 * The box of a main medium, reserved from its stored width and height before anything loads: its
 * own aspect ratio, full width, but never taller than 80% of the viewport (a 9:16 video stays on
 * screen, centred, narrower).
 */
export function mediaFrameStyle(width: number, height: number): CSSProperties {
  return {
    aspectRatio: `${width} / ${height}`,
    width: `min(100%, ${((80 * width) / height).toFixed(3)}svh)`,
  }
}
