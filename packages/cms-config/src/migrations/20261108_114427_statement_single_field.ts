import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`site_locales\` ADD \`statement\` text;`)
  await db.run(sql`ALTER TABLE \`_site_v_locales\` ADD \`version_statement\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`site_locales\` DROP COLUMN \`statement\`;`)
  await db.run(sql`ALTER TABLE \`_site_v_locales\` DROP COLUMN \`version_statement\`;`)
}
