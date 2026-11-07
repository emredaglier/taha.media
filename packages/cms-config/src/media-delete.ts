import { APIError } from 'payload'
import type { CollectionBeforeDeleteHook, PayloadRequest } from 'payload'

import { clearHistoryReferences } from './history-references'
import { anyReferences, type MediaCollection } from './media-references'

/** The noun as it reads in the refusal: "Bu görsel …", "Önce görseli oradan kaldırın". */
const NOUN: Record<MediaCollection, { nominative: string; accusative: string }> = {
  images: { nominative: 'görsel', accusative: 'görseli' },
  videos: { nominative: 'video', accusative: 'videoyu' },
}

const refusalMessage = (collection: MediaCollection, places: string[]): string =>
  `Bu ${NOUN[collection].nominative} kullanıldığı için silinemez: ${places.join(', ')}. ` +
  `Önce ${NOUN[collection].accusative} oradan kaldırın.`

/** The Videos that show this Image as their poster: a Video's poster is required (ADR-0008). */
async function videosUsingAsPoster(req: PayloadRequest, id: number | string): Promise<string[]> {
  const { docs } = await req.payload.find({
    collection: 'videos',
    where: { poster: { equals: id } },
    select: { filename: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return docs.map((doc) => `“${doc.filename}” videosunun posteri`)
}

/**
 * `beforeDelete` for Images and Videos (issue #20). Refuses, in Turkish, to delete media that a
 * Work (published row or latest draft), a single-entry page or a Gallery item uses, or an Image
 * that is a Video's poster. Media that only old versions used goes through (their references are cleared first), so
 * a file is never undeletable just because it once appeared in a version. A refused delete changes
 * nothing: no objects move and no revalidation is sent.
 *
 * Known gaps: the check and the delete are not atomic, so a save that adds a reference in between
 * is not seen; and a bulk delete applies per document, so earlier ones stay deleted when a later
 * one is refused.
 */
export const guardMediaDelete =
  (collection: MediaCollection): CollectionBeforeDeleteHook =>
  async ({ id, req }) => {
    const places = await anyReferences(req, [{ target: collection, ids: [id] }])
    if (collection === 'images') places.push(...(await videosUsingAsPoster(req, id)))
    if (places.length > 0) throw new APIError(refusalMessage(collection, places), 409, null, true)
    await clearHistoryReferences(req, collection, id)
  }
