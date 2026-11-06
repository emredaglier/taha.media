import { sql } from '@payloadcms/db-sqlite'
import type { PayloadRequest } from 'payload'

import type { MediaCollection } from './media-references'

type Query = ReturnType<typeof sql>

type Drizzle = {
  all: <T>(query: Query) => Promise<T[]>
  run: (query: Query) => Promise<unknown>
}

type ForeignKey = { table: string; column: string }

/**
 * The tables that only hold history or bookkeeping, never what visitors see: Payload's version
 * tables (`_works_v`, `_works_v_version_stills`, ...) and the admin's document locks. Their
 * foreign keys have no ON DELETE action. Nothing else is ever cleared: a live column with that
 * setting should fail loudly, not be nulled.
 */
const HISTORY_TABLE = /^(_\w+_v(_\w+)?|payload_locked_documents_rels)$/

/** Names come from the schema, never from a request; the check keeps it that way. */
const IDENTIFIER = /^\w+$/

const quoted = (name: string) => sql.raw(`\`${name}\``)

/**
 * Nulls what old Work versions and admin locks still hold of one media record, so that deleting
 * it does not stop on their foreign keys with a raw constraint error. Call it only once nothing
 * live uses the media (the guard in media-delete.ts): every live reference column is
 * `ON DELETE SET NULL`, so without that check the delete would strip the file from a published
 * Work or page.
 *
 * Not transactional: the SQLite adapter runs without transactions, so a delete that fails after
 * this leaves old versions without that reference. They only lose a file that is being deleted.
 */
export async function clearHistoryReferences(
  req: PayloadRequest,
  collection: MediaCollection,
  id: number | string,
): Promise<void> {
  const db = (req.payload.db as unknown as { drizzle: Drizzle }).drizzle
  const keys = await db.all<ForeignKey>(sql`
    SELECT m.name AS "table", f."from" AS "column"
    FROM sqlite_master m, pragma_foreign_key_list(m.name) f
    WHERE m.type = 'table' AND f."table" = ${collection} AND f.on_delete = 'NO ACTION'`)
  for (const { table, column } of keys) {
    if (!HISTORY_TABLE.test(table) || !IDENTIFIER.test(table) || !IDENTIFIER.test(column)) continue
    await db.run(
      sql`UPDATE ${quoted(table)} SET ${quoted(column)} = NULL WHERE ${quoted(column)} = ${id}`,
    )
  }
}
