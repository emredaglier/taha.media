import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`works\` ADD \`_order\` text;`)
  await db.run(sql`ALTER TABLE \`works\` ADD \`featured\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`works\` ADD \`featured_order\` numeric;`)
  await db.run(sql`CREATE INDEX \`works__order_idx\` ON \`works\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`works_featured_idx\` ON \`works\` (\`featured\`);`)
  await db.run(sql`ALTER TABLE \`_works_v\` ADD \`version__order\` text;`)
  await db.run(sql`ALTER TABLE \`_works_v\` ADD \`version_featured\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`_works_v\` ADD \`version_featured_order\` numeric;`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version__order_idx\` ON \`_works_v\` (\`version__order\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_featured_idx\` ON \`_works_v\` (\`version_featured\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`works__order_idx\`;`)
  await db.run(sql`DROP INDEX \`works_featured_idx\`;`)
  await db.run(sql`ALTER TABLE \`works\` DROP COLUMN \`_order\`;`)
  await db.run(sql`ALTER TABLE \`works\` DROP COLUMN \`featured\`;`)
  await db.run(sql`ALTER TABLE \`works\` DROP COLUMN \`featured_order\`;`)
  await db.run(sql`DROP INDEX \`_works_v_version_version__order_idx\`;`)
  await db.run(sql`DROP INDEX \`_works_v_version_version_featured_idx\`;`)
  await db.run(sql`ALTER TABLE \`_works_v\` DROP COLUMN \`version__order\`;`)
  await db.run(sql`ALTER TABLE \`_works_v\` DROP COLUMN \`version_featured\`;`)
  await db.run(sql`ALTER TABLE \`_works_v\` DROP COLUMN \`version_featured_order\`;`)
}
