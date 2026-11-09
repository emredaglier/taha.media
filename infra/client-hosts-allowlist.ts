/**
 * The hosts the built client output may name (#80), read by `infra/client-hosts.ts`, which fails
 * the web image build on any other. Every entry says why it is allowed; an entry without a real
 * reason fails `infra/client-hosts.test.ts` and the scan itself.
 *
 * Add a host here only after finding out what the code does with it:
 *   - a request the site makes on purpose (our own files, analytics, error reports, a player the
 *     visitor clicked): say which code and what the visitor chose;
 *   - a string that is never requested (a comment kept by a library, an XML namespace, an error
 *     message's documentation link): say so, and limit it with `in:` to the file that holds it, so
 *     the same host in our own code still fails.
 * Never add a host that a consent-gated or "nothing is collected" feature would send data to.
 *
 * `*.sub.domain.tld` allows any subdomain of it, not the bare domain, and needs three labels.
 *
 * `in:` is a regex on a file's path with forward slashes. The scan of built output
 * (`.next/static`, the prerendered HTML) matches it against the built file's path; the scan of our
 * own source (`apps/web/src`, `client-hosts-source.test.ts`) matches it against the source file's
 * path. A scope for built output (`/static/chunks/`) therefore never applies to source, and a
 * host named in our source (a comment included) needs its own entry scoped to that file.
 */
import type { AllowedHost } from './client-hosts.ts'

export const ALLOWLIST: AllowedHost[] = [
  // --- Our own origins -------------------------------------------------------------------------
  {
    host: 'taha.media',
    reason: 'Our own site origin: canonical and Open Graph URLs (SITE_ORIGIN in lib/site.ts).',
  },
  {
    host: 'cdn.taha.media',
    reason:
      'Our own static and media origin: the release assets prefix (ASSET_PREFIX, ADR-0005), ' +
      'including the Hand control files, and MEDIA_ORIGIN for uploaded images and videos.',
  },

  // --- Analytics and error reports (the privacy notice names both) -----------------------------
  {
    host: 'static.cloudflareinsights.com',
    reason:
      'Cloudflare Web Analytics beacon script, cookieless, in the layout only in a production ' +
      'build with a token (BEACON_SRC in lib/observability.ts).',
  },
  {
    host: '*.ingest.sentry.io',
    reason:
      'Sentry ingest, US region: the DSN host (NEXT_PUBLIC_SENTRY_DSN) the browser SDK sends ' +
      'scrubbed error reports to (components/Observability.tsx, backend ADR-0007).',
  },
  {
    host: '*.ingest.us.sentry.io',
    reason: 'Sentry ingest, US region with the explicit region label; same DSN use as above.',
  },
  {
    host: '*.ingest.de.sentry.io',
    reason: 'Sentry ingest, EU region (Frankfurt); same DSN use as above.',
  },

  // --- Players the visitor starts ---------------------------------------------------------------
  {
    host: 'player.vimeo.com',
    reason:
      'Click-to-load Vimeo player (ADR-0102, components/ExternalVideo.tsx): the iframe is only ' +
      'created after the visitor clicks play, with dnt=1.',
  },
  {
    host: 'www.youtube-nocookie.com',
    reason:
      'Click-to-load YouTube player (ADR-0102, components/ExternalVideo.tsx): the iframe is only ' +
      'created after the visitor clicks play, on the cookie-free domain.',
  },

  // --- Names that are never requested ------------------------------------------------------------
  // Each is scoped to the built files that hold it, so the same host in our own code, in another
  // file type or in another library's chunk still fails.
  {
    host: 'www.w3.org',
    in: /\/static\/chunks\/|\.(?:html|rsc|svg)$/,
    reason:
      'XML namespace identifiers (SVG, MathML, XLink, XML) that React and inline SVG use to create ' +
      'elements, and the `xmlns` of prerendered markup or an SVG file; an identifier, not an ' +
      'address anything fetches.',
  },
  {
    host: 'react.dev',
    in: /\/static\/chunks\//,
    reason:
      "React's production error decoder link (`https://react.dev/errors/<code>`), built into an " +
      'error message in a chunk and never requested by the page.',
  },
  {
    host: 'nextjs.org',
    in: /\/static\/chunks\//,
    reason:
      "Documentation links in Next's error and warning messages in a chunk; text, never requested.",
  },
  {
    host: 'tailwindcss.com',
    in: /\/static\/css\/[^/]+\.css$/,
    reason:
      'The licence banner Tailwind keeps at the top of the built stylesheet ' +
      '(`/*! tailwindcss v4 | MIT License | https://tailwindcss.com */`); a comment, never requested.',
  },
  {
    host: 'github.com',
    in: /\/static\/chunks\/polyfills-[^/]+\.js$/,
    reason:
      "core-js's `license:` and `source:` strings in Next's polyfills chunk, a link to its licence " +
      'and repository kept for attribution; text, never requested.',
  },
  {
    host: 'docs.sentry.io',
    in: /\/static\/chunks\/[^/]+\.js$/,
    reason:
      "The Sentry browser SDK's warning about running inside a browser extension, a " +
      'documentation link in a console message; text, never requested.',
  },

  // --- Names in our own source (the source scan only; none of them is in the built output) ------
  {
    host: 'site.invalid',
    in: /\/apps\/web\/src\/app\/preview\/route\.ts$/,
    reason:
      "A placeholder origin for parsing the preview route's `path` parameter (an open-redirect " +
      'guard): `.invalid` is reserved and never resolves, and the code only compares origins.',
  },
  {
    host: 'storage.googleapis.com',
    in: /\/apps\/web\/src\/components\/hand\/tracker\.ts$/,
    reason:
      "A comment in tracker.ts saying where the vendored hand model came from (MediaPipe's model " +
      'bucket). The file is vendored and SHA-256 pinned, never downloaded from there.',
  },

  // --- MediaPipe's WASM loader and binary (Hand control, #56) ------------------------------------
  // They are emitted as `static/media/vision_wasm_internal.<hash>.js|wasm` and keep Emscripten's
  // and TensorFlow Lite's source comments and error text, which hold documentation links. Scoped to
  // those files, so the same hosts in our own code or any other library still fail.
  ...[
    'github.com',
    'kripken.github.io',
    'developer.mozilla.org',
    'unicode.org',
    'en.wikipedia.org',
    'www.ietf.org',
    'tools.ietf.org',
    'pubs.opengroup.org',
    'webkit.org',
    'bugzil.la',
    'www.khronos.org',
    'www.tensorflow.org',
    'server.com',
  ].map((host): AllowedHost => ({
    host,
    in: /\/vision_wasm(?:_module)?_internal\.[^/]+$/,
    reason:
      'Link or example in a comment or error text of the MediaPipe WASM loader or binary ' +
      '(Emscripten, TensorFlow Lite, a stack-trace example); never requested.',
  })),
]
