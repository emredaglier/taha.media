import { ValidationError, type Field } from 'payload'

import { EXTERNAL_PROVIDERS, parseExternalVideoUrl } from './external-video'

/** The Site's full Showreel link uses the same Vimeo/YouTube parser as a Work's main media. */
export const parseShowreelUrl = parseExternalVideoUrl

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
