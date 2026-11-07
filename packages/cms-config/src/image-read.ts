import { IMAGE_SRCSET_SIZES } from './collections/Images'
import type { Image } from './payload-types'

/** An Image as the data module returns it. Everything the frontend needs to reserve space. */
export type ImageRead = {
  id: number
  /** What to put in `src`: the medium WebP size, or the original only when no size exists. */
  src: string
  /** `<url> <width>w` entries from the generated WebP sizes only; empty if none was generated. */
  srcset: string
  width: number
  height: number
  /** Focal point in percent of width and height (0 to 100); the centre when unset. */
  focalPoint: { x: number; y: number }
  alt: string
}

/** The generated full-frame WebP sizes of an Image, smallest to largest. */
const sizeCandidates = (doc: Image) =>
  IMAGE_SRCSET_SIZES.flatMap(({ name }) => {
    const size = doc.sizes?.[name]
    return size?.url && size.width ? [{ name, url: size.url, width: size.width }] : []
  }).sort((a, b) => a.width - b.width)

/**
 * The file to open when a visitor asks for the picture itself (no JavaScript, no lightbox): the
 * largest generated WebP size, or the original when none was generated (a small upload).
 */
export const fullSizeUrl = (doc: Image): string => sizeCandidates(doc).at(-1)?.url ?? doc.url ?? ''

/**
 * Maps an Image document to its read shape. The `srcset` lists only the full-frame WebP sizes
 * (ADR-0005): the original and the admin thumbnail never appear in it.
 */
export function toImage(doc: Image): ImageRead {
  const candidates = sizeCandidates(doc)

  const preferred = candidates.find((c) => c.name === 'medium') ?? candidates.at(-1)
  return {
    id: doc.id,
    src: preferred?.url ?? doc.url ?? '',
    srcset: candidates.map((c) => `${c.url} ${c.width}w`).join(', '),
    width: doc.width ?? 0,
    height: doc.height ?? 0,
    focalPoint: { x: doc.focalX ?? 50, y: doc.focalY ?? 50 },
    alt: doc.alt,
  }
}
