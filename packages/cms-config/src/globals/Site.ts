import type { GlobalConfig } from 'payload'

import { editor, publishedOrEditor } from '../access'
import { seoField } from '../seo'
import { showreelLinkField } from '../showreel-link'
import { videoField } from '../video-field'

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
    { name: 'intro', label: 'Tanıtım cümlesi', type: 'text', localized: true },
    { name: 'email', label: 'İletişim e-postası', type: 'email' },
    {
      name: 'socials',
      label: 'Sosyal medya',
      type: 'array',
      labels: { singular: 'Bağlantı', plural: 'Bağlantılar' },
      fields: [
        { name: 'platform', label: 'Platform', type: 'text', required: true },
        { name: 'url', label: 'Adres', type: 'text', required: true },
      ],
    },
    seoField(),
  ],
  versions: { drafts: true, max: 20 },
}
