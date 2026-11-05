import { ValidationError, type Field } from 'payload'

export const EXTERNAL_PROVIDERS = ['vimeo', 'youtube'] as const
export type ExternalProvider = (typeof EXTERNAL_PROVIDERS)[number]

/**
 * Minimal Vimeo/YouTube URL parser for the Site's full Showreel link. Returns null for any other
 * URL. (Ticket #6 owns the shared parser for Works; switch to it when both are merged.)
 */
export function parseShowreelUrl(raw: string): { provider: ExternalProvider; id: string } | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.replace(/^(www|m)\./, '')
  const parts = url.pathname.split('/').filter(Boolean)
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = parts.find((part) => /^\d+$/.test(part))
    return id ? { provider: 'vimeo', id } : null
  }
  if (host === 'youtu.be') {
    return parts[0] && /^[\w-]{6,}$/.test(parts[0]) ? { provider: 'youtube', id: parts[0] } : null
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id =
      parts[0] === 'watch'
        ? url.searchParams.get('v')
        : ['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '')
          ? parts[1]
          : null
    return id && /^[\w-]{6,}$/.test(id) ? { provider: 'youtube', id } : null
  }
  return null
}

export const SHOWREEL_LINK_REFUSAL = 'Tam showreel bağlantısı bir Vimeo veya YouTube adresi olmalı.'

/**
 * The full Showreel's external link: the Editor pastes the URL; provider and id are derived and
 * stored with it. An empty URL clears all three.
 */
export const showreelLinkField = (): Field => ({
  name: 'showreelLink',
  label: 'Tam showreel bağlantısı',
  type: 'group',
  fields: [
    {
      name: 'url',
      label: 'Adres',
      type: 'text',
      hooks: {
        beforeValidate: [
          ({ global, req, siblingData, value }) => {
            const url = typeof value === 'string' ? value.trim() : ''
            const parsed = url ? parseShowreelUrl(url) : null
            if (url && !parsed) {
              throw new ValidationError(
                {
                  global: global?.slug,
                  errors: [
                    { path: 'showreelLink.url', label: 'Bağlantı', message: SHOWREEL_LINK_REFUSAL },
                  ],
                  req,
                },
                req.t,
              )
            }
            siblingData.provider = parsed?.provider ?? null
            siblingData.videoId = parsed?.id ?? null
            return url || null
          },
        ],
      },
    },
    {
      name: 'provider',
      label: 'Sağlayıcı',
      type: 'select',
      options: EXTERNAL_PROVIDERS.map((value) => ({ value, label: value })),
      admin: { readOnly: true },
    },
    { name: 'videoId', label: 'Video kimliği', type: 'text', admin: { readOnly: true } },
  ],
})
