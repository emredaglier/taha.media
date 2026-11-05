/** The providers an external video link can point to (GLOSSARY: Main media). */
export const EXTERNAL_PROVIDERS = ['vimeo', 'youtube'] as const

export type ExternalProvider = (typeof EXTERNAL_PROVIDERS)[number]

export type ExternalVideo = { provider: ExternalProvider; id: string }

export const EXTERNAL_URL_REFUSAL =
  'Bu adres tanınmadı. Bir Vimeo veya YouTube video adresi yapıştırın.'

const YOUTUBE_ID = /^[\w-]{11}$/
const VIMEO_ID = /^\d+$/

const YOUTUBE_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]
const VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com']

/**
 * Reads provider and video id from a pasted Vimeo or YouTube address, or returns null when the
 * address is not a single video of one of them. Accepts the forms people copy: YouTube watch,
 * `youtu.be`, embed, shorts and live; Vimeo `vimeo.com/<id>`, channel and group paths and
 * `player.vimeo.com/video/<id>`. Timestamps and other parameters are ignored. The host must match
 * exactly, so `vimeo.com.evil.test` and `notvimeo.com` are refused. Link ticket #10's Site
 * Showreel link and Work main media both use this.
 */
export function parseExternalVideoUrl(input: string): ExternalVideo | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  let url: URL
  try {
    // People paste addresses without the scheme.
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()
  const segments = url.pathname.split('/').filter(Boolean)

  if (host === 'youtu.be') {
    return segments.length === 1 && YOUTUBE_ID.test(segments[0]!)
      ? { provider: 'youtube', id: segments[0]! }
      : null
  }

  if (YOUTUBE_HOSTS.includes(host)) {
    const candidate =
      segments[0] === 'watch' && segments.length === 1
        ? url.searchParams.get('v')
        : ['embed', 'shorts', 'live', 'v'].includes(segments[0] ?? '') && segments.length === 2
          ? segments[1]
          : null
    return candidate && YOUTUBE_ID.test(candidate) ? { provider: 'youtube', id: candidate } : null
  }

  if (host === 'player.vimeo.com') {
    return segments[0] === 'video' && segments.length === 2 && VIMEO_ID.test(segments[1]!)
      ? { provider: 'vimeo', id: segments[1]! }
      : null
  }

  if (VIMEO_HOSTS.includes(host)) {
    // vimeo.com/<id>, or under /channels/<name>/<id> and /groups/<name>/videos/<id>.
    const last = segments.at(-1)
    const plain = segments.length === 1
    const channel = segments.length === 3 && segments[0] === 'channels'
    const group = segments.length === 4 && segments[0] === 'groups' && segments[2] === 'videos'
    return (plain || channel || group) && last && VIMEO_ID.test(last)
      ? { provider: 'vimeo', id: last }
      : null
  }

  return null
}
