// ADR-0003 contract step: no release of this codebase is live (the cutover, #19, deploys the first one), so none reads Site `intro`; the Statement fields replace it
import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`site_locales\` DROP COLUMN \`intro\`;`)
  await db.run(sql`ALTER TABLE \`_site_v_locales\` DROP COLUMN \`version_intro\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`site_locales\` ADD \`intro\` text;`)
  await db.run(sql`ALTER TABLE \`_site_v_locales\` ADD \`version_intro\` text;`)
}
