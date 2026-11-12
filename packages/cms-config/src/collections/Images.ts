import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { ValidationError, type CollectionConfig, type ImageUploadFormatOptions } from 'payload'
import sharp from 'sharp'

import { editor } from '../access'
import { guardMediaDelete } from '../media-delete'

const MB = 1024 * 1024
/**
 * Payload's multipart limit sits above the 60 MB video cap (#97), so Images keep the 20 MB they
 * had before. Checked before sharp decodes the file: a 45 MB PNG ran the 512 MB cms out of memory.
 */
export const IMAGE_MAX_BYTES = 20 * MB

/**
 * Bytes don't bound pixels: a flat 20 MB PNG can be 20000 x 20000, which sharp decodes to about
 * 1 GB. 50 MP covers any camera photo (the largest size is 2560 wide). Read from the header only;
 * an animated WebP counts width x height x frames.
 */
export const IMAGE_MAX_PIXELS = 50_000_000

/**
 * The stored original is capped at this width and height (never enlarged): the largest srcset
 * size is 2560 wide, so more pixels only cost memory when Payload encodes the stored WebP and when
 * it reprocesses the stored file (re-crop, focal point). The sizes are still made from the upload.
 */
export const IMAGE_STORED_MAX = 4096

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
      async ({ args, operation, req }) => {
        // Also on update: replacing the file of an existing record must not reuse a key either.
        if ((operation === 'create' || operation === 'update') && req.file) {
          const refuse = (message: string): never => {
            throw new ValidationError(
              { collection: 'images', errors: [{ path: 'file', label: 'Dosya', message }], req },
              req.t,
            )
          }
          if (req.file.size > IMAGE_MAX_BYTES) {
            const size = (req.file.size / MB).toFixed(1).replace('.', ',')
            refuse(`Dosya boyutu en fazla 20 MB olabilir; bu dosya ${size} MB.`)
          }
          // metadata() reads the header only. With temp files the bytes are at tempFilePath. sharp()
          // throws at once on an empty buffer, hence the Promise.resolve().then. width and height
          // are one frame's: an animated WebP is decoded in full, so the cap counts all its pages.
          const {
            width = 0,
            height = 0,
            pages = 1,
          } = await Promise.resolve()
            .then(() => sharp(req.file?.tempFilePath || req.file?.data).metadata())
            .catch(() => refuse(`File type ${req.file?.mimetype} is not allowed.`))
          const pixels = width * height * pages
          if (pixels > IMAGE_MAX_PIXELS) {
            const mp = (pixels / 1e6).toFixed(1).replace('.', ',')
            refuse(`Görsel en fazla 50 megapiksel olabilir; bu görsel ${mp} megapiksel.`)
          }
          if (req.file.tempFilePath) {
            // Back in memory (20 MB at most): Payload writes its full-size WebP over the temp file
            // and decodes that once per size, which ran a 24 MP photo out of the 512 MB cms (#107).
            req.file.data = await fs.readFile(req.file.tempFilePath)
            await fs.unlink(req.file.tempFilePath)
            req.file.tempFilePath = ''
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
    // withoutEnlargement: smaller uploads stay as they are. It also makes Payload skip its post-crop
    // resize, so a crop made at upload is stored at the crop's size, uncapped (as before #110).
    resizeOptions: {
      width: IMAGE_STORED_MAX,
      height: IMAGE_STORED_MAX,
      fit: 'inside',
      withoutEnlargement: true,
    },
    focalPoint: true,
    imageSizes: [
      // Admin list thumbnail only; not part of any srcset.
      { name: 'thumbnail', width: 400, height: 400, crop: 'center', formatOptions: webp },
      ...IMAGE_SRCSET_SIZES.map(({ name, width }) => ({ name, width, formatOptions: webp })),
    ],
  },
}
