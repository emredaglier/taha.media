// Repo guard (ADR-0003, ADR-0010): deploy.sh migrates BEFORE the swap and never migrates back on a
// rollback, so the previous release must keep working on the migrated schema. A migration's `up`
// may add, never drop or rename. The contract step of an expand/contract change (dropping what no
// live or previous release reads any more) needs a deliberate marker in the file:
//   // ADR-0003 contract step: <which releases stopped reading it>
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const dir = path.resolve(import.meta.dirname, '../packages/cms-config/src/migrations')
const MARKER = /\/\/ ADR-0003 contract step: \S/

/** The destructive statements in a migration's `up`, unless the file is marked as a contract step. */
function destructiveStatements(source: string): string[] {
  if (MARKER.test(source)) return []
  const up = source.split(/export async function down/)[0]!.split(/export async function up/)[1]
  if (up === undefined) return ['no up() found']
  return [
    ...up.matchAll(/\b(DROP\s+(?:TABLE|COLUMN)|RENAME\s+(?:TO|COLUMN))\b[^`;\n]{0,60}/gi),
  ].map((m) => m[0])
}

describe('migrations are additive (expand/contract)', () => {
  it('flags a drop or rename in up(), and accepts it only with the contract marker', () => {
    const drop = `export async function up({ db }) {\n  await db.run(sql\`ALTER TABLE works DROP COLUMN client;\`)\n}\nexport async function down() {}`
    expect(destructiveStatements(drop)).toEqual(['DROP COLUMN client'])
    const rebuild = `export async function up({ db }) {\n  await db.run(sql\`ALTER TABLE __new_works RENAME TO works;\`)\n}\nexport async function down() {\n DROP TABLE x\n}`
    expect(destructiveStatements(rebuild)).toEqual(['RENAME TO works'])
    expect(
      destructiveStatements(
        `// ADR-0003 contract step: v12 and v13 no longer read client\n${drop}`,
      ),
    ).toEqual([])
    // down() may drop what up() added.
    expect(
      destructiveStatements(
        `export async function up() { CREATE TABLE a }\nexport async function down() { DROP TABLE a }`,
      ),
    ).toEqual([])
  })

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts')

  it.each(files)('%s only adds', (file) => {
    expect(destructiveStatements(fs.readFileSync(path.join(dir, file), 'utf8'))).toEqual([])
  })
})
