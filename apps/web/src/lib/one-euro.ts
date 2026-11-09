/** The one-euro filter's settings: cutoffs in Hz, `beta` per unit of speed. */
export type OneEuroParams = { minCutoff: number; beta: number; dCutoff: number }

/** Where the filter is: its output, the speed it reads (units per second) and when (ms). */
export type OneEuroState = { value: number; speed: number; at: number }

/** How far a low-pass filter with this cutoff moves towards a new sample after `dt` seconds. */
const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))

/**
 * One step of the one-euro filter (Casiez, Roussel and Vogel, CHI 2012): a low-pass filter whose
 * cutoff rises with the speed, so a still input is steady and a moving one doesn't lag. Pure:
 * pass the last state (null for the first sample, which passes through) and the time in ms.
 */
export function oneEuro(
  state: OneEuroState | null,
  value: number,
  now: number,
  { minCutoff, beta, dCutoff }: OneEuroParams,
): OneEuroState {
  if (!state) return { value, speed: 0, at: now }
  const dt = Math.max((now - state.at) / 1000, 1e-3)
  const speed = state.speed + alpha(dCutoff, dt) * ((value - state.value) / dt - state.speed)
  const cutoff = minCutoff + beta * Math.abs(speed)
  return { value: state.value + alpha(cutoff, dt) * (value - state.value), speed, at: now }
}
