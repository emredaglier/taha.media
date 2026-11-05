import {
  HeadingFeature,
  OrderedListFeature,
  UnorderedListFeature,
} from '@payloadcms/richtext-lexical'
import type { GlobalConfig } from 'payload'

import { editor, publishedOrEditor } from '../access'
import { restrictedRichText } from '../rich-text'
import { seoField } from '../seo'

/** The privacy notice: the only text that may use H2/H3 headings and lists. */
export const Privacy: GlobalConfig = {
  slug: 'privacy',
  label: 'Gizlilik',
  access: { read: publishedOrEditor, update: editor },
  fields: [
    {
      name: 'body',
      label: 'Metin',
      type: 'richText',
      localized: true,
      editor: restrictedRichText([
        HeadingFeature({ enabledHeadingSizes: ['h2', 'h3'] }),
        OrderedListFeature(),
        UnorderedListFeature(),
      ]),
    },
    seoField(),
  ],
  versions: { drafts: true, max: 20 },
}
