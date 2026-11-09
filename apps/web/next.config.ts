import path from 'node:path'

import { withPayload } from '@payloadcms/next/withPayload'
import { sentryWebpackPlugin } from '@sentry/webpack-plugin'
import type { NextConfig } from 'next'

// Source maps go to Sentry only in a CI build that has the secret auth token, an org and a
// project; without all three nothing is generated or uploaded (frontend-handoff.md). The token
// is never baked into the image: it is only read here, at build time.
const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT } = process.env
const uploadSourceMaps = Boolean(SENTRY_AUTH_TOKEN && SENTRY_ORG && SENTRY_PROJECT)

/**
 * `import('./tracker')` inside `components/hand`, the one import the server build skips (below).
 * Exported for its guard test: renaming the file or its folder must fail a test, not quietly ship
 * the files in the server build again.
 */
export const handTrackerOnlyInBrowser = {
  checkResource: (resource: string, context: string) =>
    resource === './tracker' && /[\\/]components[\\/]hand$/.test(context),
}

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; list each one web imports.
  transpilePackages: ['@taha/cms-config'],
  poweredByHeader: false,
  // Docker image only: self-contained server output, traced from the monorepo root.
  ...(process.env.NEXT_STANDALONE === '1'
    ? {
        output: 'standalone' as const,
        outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
      }
    : {}),
  // Build arguments of the Docker image (ADR-0005): the CDN prefix for /_next/static and the
  // deployment id for skew protection. CI sets them (#17); both may be empty.
  ...(process.env.ASSET_PREFIX ? { assetPrefix: process.env.ASSET_PREFIX } : {}),
  ...(process.env.DEPLOYMENT_ID ? { deploymentId: process.env.DEPLOYMENT_ID } : {}),
  ...(uploadSourceMaps ? { productionBrowserSourceMaps: true } : {}),
  webpack: (config, { isServer, dev, webpack }) => {
    // Hand control's tracker (MediaPipe's WASM and the model, about 22 MB) is reached only by a
    // dynamic import in an effect after the camera grant, which never runs on the server. Without
    // this the server compilation emits its three `new URL(…, import.meta.url)` files a second
    // time, into `.next/server/chunks/static/media`, and they land in the web image (#69). Ignored,
    // the import is a promise that rejects if it ever ran; the browser build is untouched.
    if (isServer) config.plugins.push(new webpack.IgnorePlugin(handTrackerOnlyInBrowser))
    // Browser bundles of a production build only: Sentry is browser-side only.
    if (uploadSourceMaps && !isServer && !dev) {
      config.plugins.push(
        sentryWebpackPlugin({
          authToken: SENTRY_AUTH_TOKEN,
          org: SENTRY_ORG,
          project: SENTRY_PROJECT,
          release: { name: process.env.DEPLOYMENT_ID || undefined },
          // Uploaded, then removed, so the maps never ship in the image.
          sourcemaps: { filesToDeleteAfterUpload: ['.next/static/**/*.map'] },
          telemetry: false,
        }),
      )
    }
    return config
  },
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
