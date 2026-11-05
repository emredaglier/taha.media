import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; list each one web imports.
  transpilePackages: ['@taha/cms-config'],
  poweredByHeader: false,
}

// web has no admin and no API routes (ADR-0001); withPayload is only here to bundle Payload's
// server packages (libsql, ...) correctly for the data module's Local API reads.
const withServerPackages = withPayload(nextConfig, { devBundleServerPackages: false })
const payloadHeaders = withServerPackages.headers

/** The Client Hints header names `withPayload` adds for the admin's theme detection. */
const isClientHintHeader = ({ key, value }: { key: string; value: string }) =>
  ['accept-ch', 'critical-ch'].includes(key.toLowerCase()) ||
  (key.toLowerCase() === 'vary' && /^sec-ch-/i.test(value))

/**
 * `withPayload` sends `Accept-CH`, `Critical-CH` and `Vary: Sec-CH-Prefers-Color-Scheme` on every
 * path, for the Payload admin. web has no admin, so the headers only cost: on a first visit Chrome
 * sees `Critical-CH`, throws the response away and requests the page again, and `Vary` splits
 * caches.
 */
const stripClientHints: NonNullable<NextConfig['headers']> = async () =>
  ((await payloadHeaders?.()) ?? [])
    .map((rule) => ({ ...rule, headers: rule.headers.filter((h) => !isClientHintHeader(h)) }))
    .filter((rule) => rule.headers.length > 0)

export default { ...withServerPackages, headers: stripClientHints } satisfies NextConfig
