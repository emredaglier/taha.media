import { ValidationError, type CollectionBeforeValidateHook } from 'payload'

export const FEATURED_NEEDS_LOOP_MESSAGE = 'Öne çıkarmak için 16:9 önizleme döngüsü gerekli.'

/** How far a loop's width may be from height × 16/9 and still count as 16:9, in pixels. */
const WIDTH_TOLERANCE_PX = 2

export const isSixteenByNine = (width: number, height: number): boolean =>
  Math.abs(width - (height * 16) / 9) <= WIDTH_TOLERANCE_PX

const wrongShapeMessage = (width: number, height: number): string =>
  `Öne çıkarmak için önizleme döngüsü 16:9 olmalı; bu video ${width}×${height}. 16:9 bir döngü seçin.`

const idOf = (value: unknown): unknown =>
  typeof value === 'object' && value !== null ? (value as { id: unknown }).id : value

/**
 * A featured Work is shown on Home as a 16:9 Preview loop (GLOSSARY), so publishing one needs a
 * loop of that shape. Only the loop counts, never the main video. Drafts and Works that are not
 * featured need no loop; Payload skips `required` on drafts and cannot express "required when
 * featured", so this hook does it. It sees removing or swapping the loop through the merged
 * value of the update and the stored document.
 */
export const requireFeaturedLoop: CollectionBeforeValidateHook = async ({
  collection,
  data,
  originalDoc,
  req,
}) => {
  if (!data) return data
  const status = data._status ?? originalDoc?._status
  if (status !== 'published') return data
  const featured: unknown = data.featured ?? originalDoc?.featured
  if (!featured) return data

  const loop: unknown = data.previewLoop !== undefined ? data.previewLoop : originalDoc?.previewLoop
  const id = idOf(loop)
  let message = FEATURED_NEEDS_LOOP_MESSAGE
  if (id !== undefined && id !== null && id !== '') {
    const video = await req.payload.findByID({
      collection: 'videos',
      id: id as number,
      depth: 0,
      req,
      overrideAccess: true,
      select: { width: true, height: true },
    })
    if (video.width && video.height && isSixteenByNine(video.width, video.height)) return data
    message = wrongShapeMessage(video.width ?? 0, video.height ?? 0)
  }

  throw new ValidationError(
    {
      collection: collection.slug,
      errors: [{ path: 'previewLoop', label: 'Önizleme döngüsü', message }],
      req,
    },
    req.t,
  )
}
