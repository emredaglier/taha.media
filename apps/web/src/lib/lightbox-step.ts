/** One step through a list (the Gallery lightbox, the next Work): forward (`1`) or back (`-1`). */
export type Step = 1 | -1

/**
 * Where a step goes from `index` in a list of `count` items. It wraps: next from the last
 * item is the first, previous from the first is the last (so next then previous is always the
 * identity). An empty list has no position and answers 0.
 */
export const stepIndex = (index: number, count: number, step: Step): number =>
  count < 1 ? 0 : (((index + step) % count) + count) % count
