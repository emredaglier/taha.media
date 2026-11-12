import type { GlobalConfig } from 'payload'

import { editor, publishedOrEditor } from '../access'
import { seoField } from '../seo'
import { showreelLinkField } from '../showreel-link'
import { videoField } from '../video-field'

const URL_MESSAGE = 'Adres http:// veya https:// ile başlayan tam bir bağlantı olmalı.'

// Hakkımda renders the address raw as a link, so a bare "instagram.com/taha" would 404.
const isHttpUrl = (value: string | null | undefined) => {
  try {
    return ['https:', 'http:'].includes(new URL(value ?? '').protocol)
  } catch {
    return false
  }
}

/** Site-wide settings (GLOSSARY: Showreel): the Home hero, contact and socials. */
export const Site: GlobalConfig = {
  slug: 'site',
  label: 'Site',
  access: { read: publishedOrEditor, update: editor },
  fields: [
    videoField({ name: 'showreel', label: 'Showreel döngüsü', use: 'showreel' }),
    videoField({ name: 'showreelPhone', label: 'Showreel telefon sürümü', use: 'showreel' }),
    { name: 'showreelPoster', label: 'Showreel görseli', type: 'upload', relationTo: 'images' },
    showreelLinkField(),
    // The Statement (GLOSSARY): the sentence in the Home hero.
    {
      name: 'statement',
      label: 'Tanıtım cümlesi',
      type: 'text',
      localized: true,
      admin: { description: 'Ana sayfadaki hero bölümünde görünen cümle.' },
    },
    { name: 'email', label: 'İletişim e-postası', type: 'email' },
    {
      name: 'socials',
      label: 'Sosyal medya',
      type: 'array',
      labels: { singular: 'Bağlantı', plural: 'Bağlantılar' },
      fields: [
        { name: 'platform', label: 'Platform', type: 'text', required: true },
        {
          name: 'url',
          label: 'Adres',
          type: 'text',
          required: true,
          validate: (value: string | null | undefined) => isHttpUrl(value) || URL_MESSAGE,
        },
      ],
    },
    seoField(),
  ],
  versions: { drafts: true, max: 20 },
}
