import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`works_credits\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`works\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`works_credits_order_idx\` ON \`works_credits\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`works_credits_parent_id_idx\` ON \`works_credits\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`works_credits_locales\` (
  	\`role\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`works_credits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`works_credits_locales_locale_parent_id_unique\` ON \`works_credits_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`works_stills\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`image_id\` integer,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`works\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`works_stills_order_idx\` ON \`works_stills\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`works_stills_parent_id_idx\` ON \`works_stills\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`works_stills_image_idx\` ON \`works_stills\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`_works_v_version_credits\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_works_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_works_v_version_credits_order_idx\` ON \`_works_v_version_credits\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_credits_parent_id_idx\` ON \`_works_v_version_credits\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_works_v_version_credits_locales\` (
  	\`role\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_works_v_version_credits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_works_v_version_credits_locales_locale_parent_id_unique\` ON \`_works_v_version_credits_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_works_v_version_stills\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`image_id\` integer,
  	\`_uuid\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_works_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_works_v_version_stills_order_idx\` ON \`_works_v_version_stills\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_stills_parent_id_idx\` ON \`_works_v_version_stills\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_stills_image_idx\` ON \`_works_v_version_stills\` (\`image_id\`);`)
  await db.run(sql`ALTER TABLE \`works\` ADD \`seo_image_id\` integer REFERENCES images(id);`)
  await db.run(sql`CREATE INDEX \`works_seo_seo_image_idx\` ON \`works\` (\`seo_image_id\`);`)
  await db.run(sql`ALTER TABLE \`works_locales\` ADD \`client\` text;`)
  await db.run(sql`ALTER TABLE \`works_locales\` ADD \`role\` text;`)
  await db.run(sql`ALTER TABLE \`works_locales\` ADD \`description\` text;`)
  await db.run(sql`ALTER TABLE \`works_locales\` ADD \`seo_title\` text;`)
  await db.run(sql`ALTER TABLE \`works_locales\` ADD \`seo_description\` text;`)
  await db.run(sql`ALTER TABLE \`_works_v\` ADD \`version_seo_image_id\` integer REFERENCES images(id);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_seo_version_seo_image_idx\` ON \`_works_v\` (\`version_seo_image_id\`);`)
  await db.run(sql`ALTER TABLE \`_works_v_locales\` ADD \`version_client\` text;`)
  await db.run(sql`ALTER TABLE \`_works_v_locales\` ADD \`version_role\` text;`)
  await db.run(sql`ALTER TABLE \`_works_v_locales\` ADD \`version_description\` text;`)
  await db.run(sql`ALTER TABLE \`_works_v_locales\` ADD \`version_seo_title\` text;`)
  await db.run(sql`ALTER TABLE \`_works_v_locales\` ADD \`version_seo_description\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`works_credits\`;`)
  await db.run(sql`DROP TABLE \`works_credits_locales\`;`)
  await db.run(sql`DROP TABLE \`works_stills\`;`)
  await db.run(sql`DROP TABLE \`_works_v_version_credits\`;`)
  await db.run(sql`DROP TABLE \`_works_v_version_credits_locales\`;`)
  await db.run(sql`DROP TABLE \`_works_v_version_stills\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_works\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_order\` text,
  	\`year\` numeric,
  	\`generate_slug\` integer DEFAULT true,
  	\`slug\` text,
  	\`featured\` integer DEFAULT false,
  	\`featured_order\` numeric,
  	\`cover_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`cover_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_works\`("id", "_order", "year", "generate_slug", "slug", "featured", "featured_order", "cover_id", "updated_at", "created_at", "_status") SELECT "id", "_order", "year", "generate_slug", "slug", "featured", "featured_order", "cover_id", "updated_at", "created_at", "_status" FROM \`works\`;`)
  await db.run(sql`DROP TABLE \`works\`;`)
  await db.run(sql`ALTER TABLE \`__new_works\` RENAME TO \`works\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`works__order_idx\` ON \`works\` (\`_order\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`works_slug_idx\` ON \`works\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`works_featured_idx\` ON \`works\` (\`featured\`);`)
  await db.run(sql`CREATE INDEX \`works_cover_idx\` ON \`works\` (\`cover_id\`);`)
  await db.run(sql`CREATE INDEX \`works_updated_at_idx\` ON \`works\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`works_created_at_idx\` ON \`works\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`works__status_idx\` ON \`works\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`__new__works_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version__order\` text,
  	\`version_year\` numeric,
  	\`version_generate_slug\` integer DEFAULT true,
  	\`version_slug\` text,
  	\`version_featured\` integer DEFAULT false,
  	\`version_featured_order\` numeric,
  	\`version_cover_id\` integer,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`works\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_cover_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new__works_v\`("id", "parent_id", "version__order", "version_year", "version_generate_slug", "version_slug", "version_featured", "version_featured_order", "version_cover_id", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version__order", "version_year", "version_generate_slug", "version_slug", "version_featured", "version_featured_order", "version_cover_id", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_works_v\`;`)
  await db.run(sql`DROP TABLE \`_works_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__works_v\` RENAME TO \`_works_v\`;`)
  await db.run(sql`CREATE INDEX \`_works_v_parent_idx\` ON \`_works_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version__order_idx\` ON \`_works_v\` (\`version__order\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_slug_idx\` ON \`_works_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_featured_idx\` ON \`_works_v\` (\`version_featured\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_cover_idx\` ON \`_works_v\` (\`version_cover_id\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_updated_at_idx\` ON \`_works_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_created_at_idx\` ON \`_works_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version__status_idx\` ON \`_works_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_created_at_idx\` ON \`_works_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_updated_at_idx\` ON \`_works_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_snapshot_idx\` ON \`_works_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_published_locale_idx\` ON \`_works_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_latest_idx\` ON \`_works_v\` (\`latest\`);`)
  await db.run(sql`ALTER TABLE \`works_locales\` DROP COLUMN \`client\`;`)
  await db.run(sql`ALTER TABLE \`works_locales\` DROP COLUMN \`role\`;`)
  await db.run(sql`ALTER TABLE \`works_locales\` DROP COLUMN \`description\`;`)
  await db.run(sql`ALTER TABLE \`works_locales\` DROP COLUMN \`seo_title\`;`)
  await db.run(sql`ALTER TABLE \`works_locales\` DROP COLUMN \`seo_description\`;`)
  await db.run(sql`ALTER TABLE \`_works_v_locales\` DROP COLUMN \`version_client\`;`)
  await db.run(sql`ALTER TABLE \`_works_v_locales\` DROP COLUMN \`version_role\`;`)
  await db.run(sql`ALTER TABLE \`_works_v_locales\` DROP COLUMN \`version_description\`;`)
  await db.run(sql`ALTER TABLE \`_works_v_locales\` DROP COLUMN \`version_seo_title\`;`)
  await db.run(sql`ALTER TABLE \`_works_v_locales\` DROP COLUMN \`version_seo_description\`;`)
}
