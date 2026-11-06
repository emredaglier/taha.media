import { sql } from '@payloadcms/db-sqlite'
import { APIError } from 'payload'
import type { CollectionBeforeDeleteHook, PayloadRequest } from 'payload'

import { anyReferences, type MediaCollection } from './media-references'

/** The noun, in the accusative, for the message ("Önce görseli oradan kaldırın"). */
const OBJECT: Record<MediaCollection, string> = { images: 'görseli', videos: 'videoyu' }
const SUBJECT: Record<MediaCollection, string> = { images: 'görsel', videos: 'video' }

export const deleteRefusalMessage = (collection: MediaCollection, places: string[]): string =>
  `Bu ${SUBJECT[collection]} kullanıldığı için silinemez: ${places.join(', ')}. ` +
  `Önce ${OBJECT[collection]} oradan kaldırın.`

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

const IDENTIFIER = /^[A-Za-z0-9_]+$/

type Reference = { tbl: string; col: string }

/**
 * Clears what still points at the media once nothing live does: old Work versions and the admin's
 * document locks. Their foreign keys have no ON DELETE action, so any such row would otherwise
 * stop the delete with a raw constraint error. Every reference column of the live tables is
 * `ON DELETE SET NULL`, which is why the guard runs first: without it, deleting a file would
 * silently strip it from a published Work or page.
 */
async function clearHistoryReferences(
  req: PayloadRequest,
  collection: MediaCollection,
  id: number | string,
): Promise<void> {
  const db = (req.payload.db as unknown as { drizzle: DrizzleLike }).drizzle
  const references = await db.all<Reference>(sql`
    SELECT m.name AS tbl, f."from" AS col
    FROM sqlite_master m, pragma_foreign_key_list(m.name) f
    WHERE m.type = 'table' AND f."table" = ${collection} AND f.on_delete = 'NO ACTION'`)
  for (const { tbl, col } of references) {
    // Names come from the schema, never from a request; the check keeps it that way.
    if (!IDENTIFIER.test(tbl) || !IDENTIFIER.test(col)) continue
    const column = sql.raw(`\`${col}\``)
    await db.run(sql`UPDATE ${sql.raw(`\`${tbl}\``)} SET ${column} = NULL WHERE ${column} = ${id}`)
  }
}

type DrizzleLike = {
  all: <T>(query: ReturnType<typeof sql>) => Promise<T[]>
  run: (query: ReturnType<typeof sql>) => Promise<unknown>
}

/**
 * `beforeDelete` for Images and Videos (issue #20). Refuses, in Turkish, to delete media that a
 * Work (published row or latest draft) or a single-entry page uses, or an Image that is a Video's
 * poster. Media that only old versions used goes through. A refused delete changes nothing, so
 * no objects move and no revalidation is sent.
 */
export const guardMediaDelete =
  (collection: MediaCollection): CollectionBeforeDeleteHook =>
  async ({ id, req }) => {
    const places = await anyReferences(req, [{ target: collection, ids: [id] }])
    if (collection === 'images') places.push(...(await videosUsingAsPoster(req, id)))
    if (places.length > 0) {
      throw new APIError(deleteRefusalMessage(collection, places), 409, null, true)
    }
    await clearHistoryReferences(req, collection, id)
  }
