import { randomBytes } from 'node:crypto'
import path from 'node:path'

import { ValidationError, type CollectionConfig, type ImageUploadFormatOptions } from 'payload'

import { editor } from '../access'
import { guardMediaDelete } from '../media-delete'

const MB = 1024 * 1024
/**
 * Payload's multipart limit sits above the 60 MB video cap (#97), so Images keep the 20 MB they
 * had before. Checked before sharp decodes the file: a 45 MB PNG ran the 512 MB cms out of memory.
 */
export const IMAGE_MAX_BYTES = 20 * MB

// Every upload and every generated size is re-encoded to WebP. `formatOptions` is not inherited
// from `upload` by the sizes, so each one sets it.
const webp: ImageUploadFormatOptions = { format: 'webp', options: { quality: 82 } }

/**
 * The full-frame widths a visitor's browser may pick from, smallest to largest (no crop, so the
 * aspect ratio is the original's). Payload skips a size wider than the original. These, and only
 * these, feed `srcset` (ADR-0005).
 */
export const IMAGE_SRCSET_SIZES = [
  { name: 'small', width: 800 },
  { name: 'medium', width: 1280 },
  { name: 'large', width: 1920 },
  { name: 'xlarge', width: 2560 },
] as const

/**
 * Makes the stored name unique per upload (new record or replaced file), so an object key is
 * never reused and objects can be cached as immutable (ADR-0005).
 */
export function uniqueFilename(
  name: string,
  suffix = randomBytes(6).toString('hex'),
  fallback = 'image',
): string {
  const { name: base, ext } = path.parse(name)
  const safe =
    base
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || fallback
  return `${safe}-${suffix}${ext.toLowerCase()}`
}

/** An Image (GLOSSARY): an uploaded picture with WebP sizes, a focal point and required alt text. */
export const Images: CollectionConfig = {
  slug: 'images',
  labels: { singular: 'Görsel', plural: 'Görseller' },
  access: {
    // Media URLs are public anyway; the Local API read is open so any Work can embed its cover.
    read: () => true,
    create: editor,
    update: editor,
    delete: editor,
  },
  admin: { useAsTitle: 'alt', defaultColumns: ['alt', 'filename', 'createdAt'] },
  hooks: {
    beforeDelete: [guardMediaDelete('images')],
    beforeOperation: [
      ({ args, operation, req }) => {
        // Also on update: replacing the file of an existing record must not reuse a key either.
        if ((operation === 'create' || operation === 'update') && req.file) {
          if (req.file.size > IMAGE_MAX_BYTES) {
            const size = (req.file.size / MB).toFixed(1).replace('.', ',')
            const message = `Dosya boyutu en fazla 20 MB olabilir; bu dosya ${size} MB.`
            throw new ValidationError(
              { collection: 'images', errors: [{ path: 'file', label: 'Dosya', message }], req },
              req.t,
            )
          }
          req.file.name = uniqueFilename(req.file.name)
        }
        return args
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      label: 'Alternatif metin',
      type: 'text',
      required: true,
      localized: true,
      admin: { description: 'Görseli göremeyen ziyaretçiler için kısaca anlatın.' },
    },
  ],
  upload: {
    // Editors upload web-ready pictures. No SVG: it can carry a script.
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    adminThumbnail: ({ doc }) => {
      const sizes = doc.sizes as { thumbnail?: { url?: unknown } } | undefined
      if (typeof sizes?.thumbnail?.url === 'string') return sizes.thumbnail.url
      return typeof doc.url === 'string' ? doc.url : null
    },
    formatOptions: webp,
    focalPoint: true,
    imageSizes: [
      // Admin list thumbnail only; not part of any srcset.
      { name: 'thumbnail', width: 400, height: 400, crop: 'center', formatOptions: webp },
      ...IMAGE_SRCSET_SIZES.map(({ name, width }) => ({ name, width, formatOptions: webp })),
    ],
  },
}
