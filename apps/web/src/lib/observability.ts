/**
 * Pure parts of the free-tier observability (backend ADR-0007, `infra/cloudflare/frontend-handoff.md`):
 * no SDK import, so the server layout can use them and tests stay cheap. Copied once from
 * daglier.com's plumbing (ADR-0100).
 */

export const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'

/**
 * Attributes of the explicit Cloudflare Web Analytics script, or null when it must not load: no
 * token, not a production build, or the preview instance. Automatic injection is off in the
 * dashboard, so the tag has to be in our layout.
 */
export function beaconAttributes(options: {
  token: string | undefined
  production: boolean
  preview: boolean
}): { src: string; 'data-cf-beacon': string } | null {
  const token = options.token?.trim()
  if (!token || !options.production || options.preview) return null
  return { src: BEACON_SRC, 'data-cf-beacon': JSON.stringify({ token }) }
}

/**
 * The public build-time variables (`NEXT_PUBLIC_*`: the site token and the DSN appear in the page
 * by design). Named in full, so Next inlines them into the build.
 */
export const beaconToken = (): string | undefined =>
  process.env.NEXT_PUBLIC_CLOUDFLARE_BEACON_TOKEN?.trim() || undefined
export const sentryDsn = (): string | undefined =>
  process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined
/** The release Sentry groups events by: the image's deployment id (git sha), when there is one. */
export const releaseId = (): string | undefined => process.env.DEPLOYMENT_ID?.trim() || undefined

/** What the server passes to the browser component: plain data, so it can cross to the client. */
export type SentryOptions = { dsn: string; release: string | undefined }

/** The init options the server decides, or null when Sentry must stay off: no DSN, or preview. */
export function sentryOptions(input: {
  dsn: string | undefined
  preview: boolean
  release?: string
}): SentryOptions | null {
  if (!input.dsn || input.preview) return null
  return { dsn: input.dsn, release: input.release }
}

/** Share of page loads traced: low, to stay inside the free plan. */
export const SENTRY_TRACES_SAMPLE_RATE = 0.05

type Scrubbable = {
  user?: unknown
  request?: { cookies?: unknown; headers?: Record<string, string> }
}

const SECRET_HEADERS = new Set(['cookie', 'set-cookie', 'authorization'])

/**
 * Runs on every event before it leaves the browser (`beforeSend`): drops the user object (which
 * is where an IP address would sit), the request's cookies and the headers that carry cookies or
 * credentials. The privacy notice says nothing personal is collected, so this must hold even if
 * an SDK default changes.
 */
export function scrubEvent<E extends Scrubbable>(event: E): E {
  const { user: _user, request, ...rest } = event
  if (!request) return rest as E
  const { cookies: _cookies, headers, ...requestRest } = request
  const kept = headers
    ? Object.fromEntries(
        Object.entries(headers).filter(([name]) => !SECRET_HEADERS.has(name.toLowerCase())),
      )
    : undefined
  return { ...rest, request: { ...requestRest, ...(kept ? { headers: kept } : {}) } } as E
}
