import {
  slugField,
  ValidationError,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
} from 'payload'

import { editor, publishedOrEditor } from '../access'
import { DISCIPLINE_LABELS, DISCIPLINES } from '../disciplines'
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
  ],
  hooks: { beforeValidate: [cleanSlug, requireDiscipline], beforeChange: [recordPreviousSlugs] },
  versions: { drafts: true, maxPerDoc: 20 },
}
