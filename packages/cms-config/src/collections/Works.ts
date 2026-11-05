import {
  slugField,
  ValidationError,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
} from 'payload'

import { editor, publishedOrEditor } from '../access'
import { DISCIPLINE_LABELS, DISCIPLINES } from '../disciplines'
import { videoField } from '../video-field'
import { restrictedRichText } from '../rich-text'
import { seoField } from '../seo'
import { cleanSlug, recordPreviousSlugs, slugify } from '../slugs'

export const NO_DISCIPLINE_MESSAGE = 'En az bir disiplin seçin.'

/**
 * Every save needs a Discipline, drafts included, so every Work can be found through the filter.
 * Payload skips field validation on draft saves, so `required` alone would only cover publishing.
 */
const requireDiscipline: CollectionBeforeValidateHook = ({
  collection,
  data,
  originalDoc,
  req,
}) => {
  const disciplines: unknown = data?.disciplines ?? originalDoc?.disciplines
  if (Array.isArray(disciplines) && disciplines.length > 0) return data
  throw new ValidationError(
    {
      collection: collection.slug,
      errors: [{ path: 'disciplines', label: 'Disiplinler', message: NO_DISCIPLINE_MESSAGE }],
      req,
    },
    req.t,
  )
}

/** A Work (GLOSSARY): one piece of Taha's work, with its own page on the site. */
export const Works: CollectionConfig = {
  slug: 'works',
  labels: { singular: 'İş', plural: 'İşler' },
  // Drag to reorder in the admin list; the public list follows this order.
  orderable: true,
  access: {
    create: editor,
    update: editor,
    delete: editor,
    read: publishedOrEditor,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'disciplines', 'year', '_status', 'updatedAt'],
  },
  fields: [
    { name: 'title', label: 'Başlık', type: 'text', required: true, localized: true },
    {
      name: 'disciplines',
      label: 'Disiplinler',
      type: 'select',
      hasMany: true,
      required: true,
      options: DISCIPLINES.map((value) => ({ value, label: DISCIPLINE_LABELS[value] })),
    },
    { name: 'year', label: 'Yıl', type: 'number', required: true },
    slugField({ useAsSlug: 'title', slugify }),
    {
      name: 'previousSlugs',
      label: 'Eski adresler',
      type: 'text',
      hasMany: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Bu işin eski adresleri. Yeni adrese yönlendirilir. Otomatik doldurulur.',
      },
    },
    {
      name: 'featured',
      label: 'Ana sayfada öne çıkar',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },
    {
      name: 'featuredOrder',
      label: 'Ana sayfa sırası',
      type: 'number',
      min: 0,
      admin: { condition: (data) => Boolean(data?.featured) },
    },
    {
      name: 'featuredWarning',
      type: 'ui',
      admin: {
        components: { Field: '@taha/cms-config/admin/featured-warning#FeaturedWarning' },
      },
    },
    {
      name: 'cover',
      label: 'Kapak görseli',
      type: 'upload',
      relationTo: 'images',
      required: true,
    },
    videoField({ name: 'previewLoop', label: 'Önizleme döngüsü', use: 'previewLoop' }),
    { name: 'client', label: 'Müşteri', type: 'text', localized: true },
    { name: 'role', label: 'Görev', type: 'text', localized: true },
    {
      // Array rows keep the order the Editor dragged them into.
      name: 'credits',
      label: 'Jenerik',
      type: 'array',
      labels: { singular: 'Kişi', plural: 'Kişiler' },
      fields: [
        { name: 'name', label: 'Ad', type: 'text', required: true },
        { name: 'role', label: 'Görev', type: 'text', localized: true },
      ],
    },
    {
      name: 'description',
      label: 'Açıklama',
      type: 'richText',
      localized: true,
      editor: restrictedRichText(),
    },
    {
      name: 'stills',
      label: 'Kareler',
      type: 'array',
      labels: { singular: 'Kare', plural: 'Kareler' },
      fields: [
        { name: 'image', label: 'Görsel', type: 'upload', relationTo: 'images', required: true },
      ],
    },
    seoField(),
  ],
  hooks: { beforeValidate: [cleanSlug, requireDiscipline], beforeChange: [recordPreviousSlugs] },
  versions: { drafts: true, maxPerDoc: 20 },
}
