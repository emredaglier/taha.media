import { ValidationError, type CollectionBeforeValidateHook } from 'payload'

import { idOf, isSet } from './media-references'

export const FEATURED_NEEDS_LOOP_MESSAGE = 'Öne çıkarmak için 16:9 önizleme döngüsü gerekli.'

/** How far a loop's width may be from height × 16/9 and still count as 16:9, in pixels. */
const WIDTH_TOLERANCE_PX = 2

export const isSixteenByNine = (width: number, height: number): boolean =>
  Math.abs(width - (height * 16) / 9) <= WIDTH_TOLERANCE_PX

const wrongShapeMessage = (width: number, height: number): string =>
  `Öne çıkarmak için önizleme döngüsü 16:9 olmalı; bu video ${width}×${height}. 16:9 bir döngü seçin.`

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
  if (isSet(id)) {
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

const replacedLoopMessage = (places: string[], width: number, height: number): string =>
  `Bu video öne çıkan bir işin önizleme döngüsü olduğu için yalnızca 16:9 bir dosyayla değiştirilebilir: ${places.join(', ')}. ` +
  `Yüklenen dosya ${width}×${height}. 16:9 bir dosya yükleyin ya da önce işin yayındaki halinde öne çıkarmayı kaldırıp yayımlayın.`

/**
 * The 16:9 rule from the Video's side (issue #46): `requireFeaturedLoop` only runs when a Work is
 * saved, so replacing the file of a Video that a featured Work already shows as its Preview loop
 * would put a loop of another shape on Home. Only a published featured Work counts, as visitors
 * see it (the main row, never a draft); a draft that uses the Video meets the Work hook when it
 * is published. A Video no featured Work uses as its loop, a main video included, is free.
 *
 * Runs after the header is read (`readAndCheck` in Videos), which writes the new file's width and
 * height into the update; a refusal there happens before anything is stored.
 *
 * Known gap, as with the delete guard (media-delete.ts): the check and the update are not atomic,
 * so a Work published as featured with this loop in between is not seen.
 */
export const keepFeaturedLoopSixteenByNine: CollectionBeforeValidateHook = async ({
  collection,
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update' || !req.file || !data || !originalDoc) return data
  const width = Number(data.width)
  const height = Number(data.height)
  if (width && height && isSixteenByNine(width, height)) return data

  const { docs } = await req.payload.find({
    collection: 'works',
    where: {
      and: [
        { _status: { equals: 'published' } },
        { featured: { equals: true } },
        { previewLoop: { equals: originalDoc.id } },
      ],
    },
    select: { title: true },
    // The admin's order, so a refusal lists the Works the way the Editor sees them.
    sort: '_order',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  if (docs.length === 0) return data

  throw new ValidationError(
    {
      collection: collection.slug,
      errors: [
        {
          path: 'file',
          label: 'Dosya',
          message: replacedLoopMessage(
            docs.map((doc) => `“${doc.title}” işi`),
            width || 0,
            height || 0,
          ),
        },
      ],
      req,
    },
    req.t,
  )
}
