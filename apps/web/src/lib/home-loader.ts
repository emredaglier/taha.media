import { HELIX_TUNING } from './helix-tuning'

// `REDUCED_MOTION` in `loop-mode.ts`, spelled out: that module uses a client-only hook, and the root
// layout (a Server Component) imports this one. The tests hold the two to the same result.
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * The Home loader (ADR-0104): a black screen with the TAHA mark, over Home while the Helix gets
 * its first frame ready. `LOADING_CLASS` on `<html>` shows it; the Helix takes it off once
 * that frame is drawn, or when it gives up, and the inline script itself after
 * `LOADER_TIMEOUT_MS` whatever happens, so the page is never held back for longer.
 */
export const LOADING_CLASS = 'is-loading'

/** The longest the loader stays (ms). */
export const LOADER_TIMEOUT_MS = 4000

/**
 * The inline script that puts the loader up before the first paint, on Home, on a device that will
 * get the Helix: the same test as `chooseHomeMode` (reduced motion, Save-Data, WebGL2, a weak
 * device), which the tests hold it to. It is in the root layout's head, so it runs once per
 * document load, never on a client-side navigation; Home renders the loader itself only with
 * Featured Works, so without them the class shows nothing. It runs as a string, so it reads only
 * `window`.
 */
export function loaderScript(): string {
  const { minMemoryGb, minCores } = HELIX_TUNING.weakDevice
  return `(function (w) {
  if (w.location.pathname !== '/') return;
  var n = w.navigator, c = n.connection, m = n.deviceMemory, k = n.hardwareConcurrency;
  if (w.matchMedia(${JSON.stringify(REDUCED_MOTION)}).matches) return;
  if ((c && c.saveData === true) || typeof w.WebGL2RenderingContext === 'undefined') return;
  if ((m !== undefined && m < ${minMemoryGb}) || (k > 0 && k < ${minCores})) return;
  var root = w.document.documentElement;
  root.classList.add('${LOADING_CLASS}');
  w.setTimeout(function () { root.classList.remove('${LOADING_CLASS}'); }, ${LOADER_TIMEOUT_MS});
})(window);`
}

/** Takes the loader off: the Helix's first frame is drawn, or the Helix gave up. */
export const loaded = (): void => document.documentElement.classList.remove(LOADING_CLASS)
