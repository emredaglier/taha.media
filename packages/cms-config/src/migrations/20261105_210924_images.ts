import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`images\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_objectkey\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	\`sizes_thumbnail_url\` text,
  	\`sizes_thumbnail_width\` numeric,
  	\`sizes_thumbnail_height\` numeric,
  	\`sizes_thumbnail_mime_type\` text,
  	\`sizes_thumbnail_filesize\` numeric,
  	\`sizes_thumbnail_filename\` text,
  	\`sizes_small_url\` text,
  	\`sizes_small_width\` numeric,
  	\`sizes_small_height\` numeric,
  	\`sizes_small_mime_type\` text,
  	\`sizes_small_filesize\` numeric,
  	\`sizes_small_filename\` text,
  	\`sizes_medium_url\` text,
  	\`sizes_medium_width\` numeric,
  	\`sizes_medium_height\` numeric,
  	\`sizes_medium_mime_type\` text,
  	\`sizes_medium_filesize\` numeric,
  	\`sizes_medium_filename\` text,
  	\`sizes_large_url\` text,
  	\`sizes_large_width\` numeric,
  	\`sizes_large_height\` numeric,
  	\`sizes_large_mime_type\` text,
  	\`sizes_large_filesize\` numeric,
  	\`sizes_large_filename\` text,
  	\`sizes_xlarge_url\` text,
  	\`sizes_xlarge_width\` numeric,
  	\`sizes_xlarge_height\` numeric,
  	\`sizes_xlarge_mime_type\` text,
  	\`sizes_xlarge_filesize\` numeric,
  	\`sizes_xlarge_filename\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`images_updated_at_idx\` ON \`images\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`images_created_at_idx\` ON \`images\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`images_filename_idx\` ON \`images\` (\`filename\`);`)
  await db.run(sql`CREATE INDEX \`images_sizes_thumbnail_sizes_thumbnail_filename_idx\` ON \`images\` (\`sizes_thumbnail_filename\`);`)
  await db.run(sql`CREATE INDEX \`images_sizes_small_sizes_small_filename_idx\` ON \`images\` (\`sizes_small_filename\`);`)
  await db.run(sql`CREATE INDEX \`images_sizes_medium_sizes_medium_filename_idx\` ON \`images\` (\`sizes_medium_filename\`);`)
  await db.run(sql`CREATE INDEX \`images_sizes_large_sizes_large_filename_idx\` ON \`images\` (\`sizes_large_filename\`);`)
  await db.run(sql`CREATE INDEX \`images_sizes_xlarge_sizes_xlarge_filename_idx\` ON \`images\` (\`sizes_xlarge_filename\`);`)
  await db.run(sql`CREATE TABLE \`images_locales\` (
  	\`alt\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`images_locales_locale_parent_id_unique\` ON \`images_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`works\` ADD \`cover_id\` integer REFERENCES images(id);`)
  await db.run(sql`CREATE INDEX \`works_cover_idx\` ON \`works\` (\`cover_id\`);`)
  await db.run(sql`ALTER TABLE \`_works_v\` ADD \`version_cover_id\` integer REFERENCES images(id);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_cover_idx\` ON \`_works_v\` (\`version_cover_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`images_id\` integer REFERENCES images(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_images_id_idx\` ON \`payload_locked_documents_rels\` (\`images_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`images\`;`)
  await db.run(sql`DROP TABLE \`images_locales\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_works\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_order\` text,
  	\`year\` numeric,
  	\`generate_slug\` integer DEFAULT true,
  	\`slug\` text,
  	\`featured\` integer DEFAULT false,
  	\`featured_order\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft'
  );
  `)
  await db.run(sql`INSERT INTO \`__new_works\`("id", "_order", "year", "generate_slug", "slug", "featured", "featured_order", "updated_at", "created_at", "_status") SELECT "id", "_order", "year", "generate_slug", "slug", "featured", "featured_order", "updated_at", "created_at", "_status" FROM \`works\`;`)
  await db.run(sql`DROP TABLE \`works\`;`)
  await db.run(sql`ALTER TABLE \`__new_works\` RENAME TO \`works\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`works__order_idx\` ON \`works\` (\`_order\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`works_slug_idx\` ON \`works\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`works_featured_idx\` ON \`works\` (\`featured\`);`)
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
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`works\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new__works_v\`("id", "parent_id", "version__order", "version_year", "version_generate_slug", "version_slug", "version_featured", "version_featured_order", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version__order", "version_year", "version_generate_slug", "version_slug", "version_featured", "version_featured_order", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_works_v\`;`)
  await db.run(sql`DROP TABLE \`_works_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__works_v\` RENAME TO \`_works_v\`;`)
  await db.run(sql`CREATE INDEX \`_works_v_parent_idx\` ON \`_works_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version__order_idx\` ON \`_works_v\` (\`version__order\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_slug_idx\` ON \`_works_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_featured_idx\` ON \`_works_v\` (\`version_featured\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_updated_at_idx\` ON \`_works_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_created_at_idx\` ON \`_works_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version__status_idx\` ON \`_works_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_created_at_idx\` ON \`_works_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_updated_at_idx\` ON \`_works_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_snapshot_idx\` ON \`_works_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_published_locale_idx\` ON \`_works_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_latest_idx\` ON \`_works_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`works_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`works_id\`) REFERENCES \`works\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "works_id") SELECT "id", "order", "parent_id", "path", "users_id", "works_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_works_id_idx\` ON \`payload_locked_documents_rels\` (\`works_id\`);`)
}
