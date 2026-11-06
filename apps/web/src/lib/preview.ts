/**
 * The preview instance (ADR-0001): the same `web` image as the public site, started with
 * `PREVIEW=1` and reachable only over Tailscale. It reads the latest drafts, renders on every
 * request and tells crawlers to stay away.
 *
 * Read once, when the server process loads this module, and only from the environment: nothing a
 * request carries (parameters, headers, cookies, Next's draft mode) can turn it on, and nothing
 * that changes `process.env` later can either. `next build` runs without it, so prerendered
 * pages only ever hold published content.
 */
const PREVIEW = process.env.PREVIEW === '1'

export const isPreviewInstance = (): boolean => PREVIEW

/** Sent on every preview response (`X-Robots-Tag`), on top of the robots meta tag. */
export const PREVIEW_ROBOTS = 'noindex, nofollow'
