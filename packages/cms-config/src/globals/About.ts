import type { GlobalConfig } from 'payload'

import { editor, publishedOrEditor } from '../access'
import { DISCIPLINE_LABELS, DISCIPLINES } from '../disciplines'
import { restrictedRichText } from '../rich-text'
import { seoField } from '../seo'

/** The About page. */
export const About: GlobalConfig = {
  slug: 'about',
  label: 'Hakkımda',
  access: { read: publishedOrEditor, update: editor },
  fields: [
    { name: 'portrait', label: 'Portre', type: 'upload', relationTo: 'images' },
    {
      name: 'bio',
      label: 'Özgeçmiş',
      type: 'richText',
      localized: true,
      editor: restrictedRichText(),
    },
    {
      // One line per Discipline; the keys are the fixed Discipline values.
      name: 'disciplineLines',
      label: 'Disiplin satırları',
      type: 'group',
      fields: DISCIPLINES.map((value) => ({
        name: value,
        label: DISCIPLINE_LABELS[value],
        type: 'text' as const,
        localized: true,
      })),
    },
    {
      // Array rows keep the order the Editor dragged them into.
      name: 'clients',
      label: 'Müşteriler',
      type: 'array',
      labels: { singular: 'Müşteri', plural: 'Müşteriler' },
      fields: [
        { name: 'name', label: 'Ad', type: 'text', required: true },
        { name: 'logo', label: 'Logo', type: 'upload', relationTo: 'images' },
      ],
    },
    seoField(),
  ],
  versions: { drafts: true, max: 20 },
}
