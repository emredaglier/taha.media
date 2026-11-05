import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`videos\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`use\` text NOT NULL,
  	\`poster_id\` integer NOT NULL,
  	\`duration\` numeric,
  	\`codec\` text,
  	\`has_audio\` integer,
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
  	FOREIGN KEY (\`poster_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`videos_poster_idx\` ON \`videos\` (\`poster_id\`);`)
  await db.run(sql`CREATE INDEX \`videos_updated_at_idx\` ON \`videos\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`videos_created_at_idx\` ON \`videos\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`videos_filename_idx\` ON \`videos\` (\`filename\`);`)
  await db.run(sql`ALTER TABLE \`works\` ADD \`preview_loop_id\` integer REFERENCES videos(id);`)
  await db.run(sql`CREATE INDEX \`works_preview_loop_idx\` ON \`works\` (\`preview_loop_id\`);`)
  await db.run(sql`ALTER TABLE \`_works_v\` ADD \`version_preview_loop_id\` integer REFERENCES videos(id);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_preview_loop_idx\` ON \`_works_v\` (\`version_preview_loop_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`videos_id\` integer REFERENCES videos(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_videos_id_idx\` ON \`payload_locked_documents_rels\` (\`videos_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`videos\`;`)
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
  	\`seo_image_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`cover_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`seo_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_works\`("id", "_order", "year", "generate_slug", "slug", "featured", "featured_order", "cover_id", "seo_image_id", "updated_at", "created_at", "_status") SELECT "id", "_order", "year", "generate_slug", "slug", "featured", "featured_order", "cover_id", "seo_image_id", "updated_at", "created_at", "_status" FROM \`works\`;`)
  await db.run(sql`DROP TABLE \`works\`;`)
  await db.run(sql`ALTER TABLE \`__new_works\` RENAME TO \`works\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`works__order_idx\` ON \`works\` (\`_order\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`works_slug_idx\` ON \`works\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`works_featured_idx\` ON \`works\` (\`featured\`);`)
  await db.run(sql`CREATE INDEX \`works_cover_idx\` ON \`works\` (\`cover_id\`);`)
  await db.run(sql`CREATE INDEX \`works_seo_seo_image_idx\` ON \`works\` (\`seo_image_id\`);`)
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
  	\`version_seo_image_id\` integer,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`works\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_cover_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_seo_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new__works_v\`("id", "parent_id", "version__order", "version_year", "version_generate_slug", "version_slug", "version_featured", "version_featured_order", "version_cover_id", "version_seo_image_id", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version__order", "version_year", "version_generate_slug", "version_slug", "version_featured", "version_featured_order", "version_cover_id", "version_seo_image_id", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_works_v\`;`)
  await db.run(sql`DROP TABLE \`_works_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__works_v\` RENAME TO \`_works_v\`;`)
  await db.run(sql`CREATE INDEX \`_works_v_parent_idx\` ON \`_works_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version__order_idx\` ON \`_works_v\` (\`version__order\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_slug_idx\` ON \`_works_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_featured_idx\` ON \`_works_v\` (\`version_featured\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_cover_idx\` ON \`_works_v\` (\`version_cover_id\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_seo_version_seo_image_idx\` ON \`_works_v\` (\`version_seo_image_id\`);`)
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
  	\`images_id\` integer,
  	\`works_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`images_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`works_id\`) REFERENCES \`works\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "images_id", "works_id") SELECT "id", "order", "parent_id", "path", "users_id", "images_id", "works_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_images_id_idx\` ON \`payload_locked_documents_rels\` (\`images_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_works_id_idx\` ON \`payload_locked_documents_rels\` (\`works_id\`);`)
}
