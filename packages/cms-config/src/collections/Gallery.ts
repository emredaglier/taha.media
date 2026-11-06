import { generateKeyBetween } from 'payload/shared'
import {
  ValidationError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
  type NumberField,
} from 'payload'

import { editor } from '../access'
import { videoField } from '../video-field'

const GALLERY_YEAR_MIN = 1990

const GALLERY_KINDS = ['image', 'loop'] as const
type GalleryKind = (typeof GALLERY_KINDS)[number]

const KIND_LABELS: Record<GalleryKind, string> = { image: 'Görsel', loop: 'Döngü' }

const YEAR_MESSAGE = `Yıl ${GALLERY_YEAR_MIN} ile bu yıl arasında bir tam sayı olmalı.`

type Side = 'image' | 'video'

const SIDE_LABELS: Record<Side, string> = { image: 'Görsel', video: 'Video' }

/** Per kind: the field it needs, the field it must not have, and what the Editor reads if not. */
const ONE_THING: Record<GalleryKind, { own: Side; other: Side; missing: string; extra: string }> = {
  image: {
    own: 'image',
    other: 'video',
    missing: 'Görsel öğesi için bir görsel seçin.',
    extra: 'Görsel öğesinde video olamaz; videoyu kaldırın.',
  },
  loop: {
    own: 'video',
    other: 'image',
    missing: 'Döngü öğesi için bir video seçin.',
    extra: 'Döngü öğesinde görsel olamaz; görseli kaldırın.',
  },
}

const yearField: NumberField = {
  name: 'year',
  label: 'Yıl',
  type: 'number',
  // Payload's own min and max messages are English, so the range is checked here.
  validate: (value: number | null | undefined) => {
    if (value === null || value === undefined) return true
    const valid =
      Number.isInteger(value) && value >= GALLERY_YEAR_MIN && value <= new Date().getFullYear()
    return valid || YEAR_MESSAGE
  },
}

const isSet = (value: unknown): boolean => value !== null && value !== undefined && value !== ''

/**
 * An item is exactly one of an Image or a Gallery loop (GLOSSARY: Gallery item): the field that
 * matches `kind` is required and the other must be empty. The values are those after this save,
 * so changing only the kind is judged against what the item already holds.
 */
const oneThingOnly: CollectionBeforeValidateHook = ({ collection, data, originalDoc, req }) => {
  const pick = (name: 'kind' | Side) => (data && name in data ? data[name] : originalDoc?.[name])
  const kind = pick('kind') as GalleryKind | undefined
  if (!kind) return data

  const { own, other, missing, extra } = ONE_THING[kind]
  const errors: { path: string; label: string; message: string }[] = []
  if (!isSet(pick(own))) {
    errors.push({ path: own, label: SIDE_LABELS[own], message: missing })
  }
  if (isSet(pick(other))) {
    errors.push({ path: other, label: SIDE_LABELS[other], message: extra })
  }
  if (errors.length > 0) {
    throw new ValidationError({ collection: collection.slug, errors, req }, req.t)
  }
  return data
}

/**
 * A new item takes the first place, so the newest shows first until the Editor drags it
 * elsewhere. Payload's own hook appends a new document and only does so while the position is
 * empty, so setting it here (this hook runs before Payload's) is enough.
 */
const newItemFirst: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || data._order) return data
  const first = await req.payload.find({
    collection: 'gallery',
    depth: 0,
    limit: 1,
    pagination: false,
    req,
    select: { _order: true },
    sort: '_order',
    where: { _order: { exists: true } },
  })
  data._order = generateKeyBetween(null, first.docs[0]?._order ?? null)
  return data
}

/**
 * A Gallery item (GLOSSARY): one Image or one Gallery loop with an optional caption and year,
 * shown on the Galeri page. It has no page and no drafts: a saved item is live.
 */
export const Gallery: CollectionConfig = {
  slug: 'gallery',
  labels: { singular: 'Galeri öğesi', plural: 'Galeri' },
  // Drag to reorder in the admin list; the public order follows it.
  orderable: true,
  access: {
    // Media URLs are public anyway, and there are no drafts: every item is visible.
    read: () => true,
    create: editor,
    update: editor,
    delete: editor,
  },
  admin: {
    useAsTitle: 'caption',
    defaultColumns: ['caption', 'kind', 'year', 'updatedAt'],
  },
  hooks: {
    beforeValidate: [oneThingOnly],
    beforeChange: [newItemFirst],
  },
  fields: [
    {
      name: 'kind',
      label: 'Tür',
      type: 'select',
      required: true,
      defaultValue: 'image',
      options: GALLERY_KINDS.map((value) => ({ value, label: KIND_LABELS[value] })),
    },
    {
      name: 'image',
      label: 'Görsel',
      type: 'upload',
      relationTo: 'images',
      admin: { condition: (data) => data?.kind !== 'loop' },
    },
    {
      ...videoField({ name: 'video', label: 'Video', use: 'gallery' }),
      admin: { condition: (data) => data?.kind === 'loop' },
    },
    { name: 'caption', label: 'Açıklama', type: 'text', localized: true },
    yearField,
  ],
}
