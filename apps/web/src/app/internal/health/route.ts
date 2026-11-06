import { getWebPayload } from '../../../lib/payload'

export const dynamic = 'force-dynamic'

/**
 * Container health check (Docker HEALTHCHECK, Compose, Caddy's upstream check). Opens the shared
 * SQLite file through the read-only `web` role and runs one trivial query. Under `/internal`, so
 * Caddy answers 404 for it on the public hosts (infra/caddy/site.caddy).
 */
export async function GET(): Promise<Response> {
  try {
    const payload = await getWebPayload()
    await payload.count({ collection: 'users', overrideAccess: true })
    return Response.json({ status: 'ok' })
  } catch {
    return Response.json({ status: 'unhealthy' }, { status: 503 })
  }
}
