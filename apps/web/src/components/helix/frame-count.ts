/**
 * The signal's frame counter (#66): one new number per drawn frame, so the line jitter re-rolls
 * on every frame of every display (120 a second on 120 Hz, 60 on 60 Hz), which time cannot
 * give. It wraps so the shader's hash keeps its float precision.
 */
export const FRAME_WRAP = 1000

/** The frame after `frame`, back to 0 at `FRAME_WRAP`. */
export const nextFrame = (frame: number): number => (frame + 1) % FRAME_WRAP
