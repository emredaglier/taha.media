// ADR-0003 contract step: no release of this codebase is live (the cutover, #19, deploys the first one), so none reads statement_before or statement_after; the single `statement` field replaces them
import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`site_locales\` DROP COLUMN \`statement_before\`;`)
  await db.run(sql`ALTER TABLE \`site_locales\` DROP COLUMN \`statement_after\`;`)
  await db.run(sql`ALTER TABLE \`_site_v_locales\` DROP COLUMN \`version_statement_before\`;`)
  await db.run(sql`ALTER TABLE \`_site_v_locales\` DROP COLUMN \`version_statement_after\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`site_locales\` ADD \`statement_before\` text;`)
  await db.run(sql`ALTER TABLE \`site_locales\` ADD \`statement_after\` text;`)
  await db.run(sql`ALTER TABLE \`_site_v_locales\` ADD \`version_statement_before\` text;`)
  await db.run(sql`ALTER TABLE \`_site_v_locales\` ADD \`version_statement_after\` text;`)
}
