import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`works\` ADD \`main_media_kind\` text;`)
  await db.run(sql`ALTER TABLE \`works\` ADD \`main_media_video_id\` integer REFERENCES videos(id);`)
  await db.run(sql`ALTER TABLE \`works\` ADD \`main_media_external_url\` text;`)
  await db.run(sql`ALTER TABLE \`works\` ADD \`main_media_external_provider\` text;`)
  await db.run(sql`ALTER TABLE \`works\` ADD \`main_media_external_id\` text;`)
  await db.run(sql`ALTER TABLE \`works\` ADD \`main_media_external_poster_id\` integer REFERENCES images(id);`)
  await db.run(sql`ALTER TABLE \`works\` ADD \`main_media_image_id\` integer REFERENCES images(id);`)
  await db.run(sql`CREATE INDEX \`works_main_media_main_media_video_idx\` ON \`works\` (\`main_media_video_id\`);`)
  await db.run(sql`CREATE INDEX \`works_main_media_main_media_external_poster_idx\` ON \`works\` (\`main_media_external_poster_id\`);`)
  await db.run(sql`CREATE INDEX \`works_main_media_main_media_image_idx\` ON \`works\` (\`main_media_image_id\`);`)
  await db.run(sql`ALTER TABLE \`_works_v\` ADD \`version_main_media_kind\` text;`)
  await db.run(sql`ALTER TABLE \`_works_v\` ADD \`version_main_media_video_id\` integer REFERENCES videos(id);`)
  await db.run(sql`ALTER TABLE \`_works_v\` ADD \`version_main_media_external_url\` text;`)
  await db.run(sql`ALTER TABLE \`_works_v\` ADD \`version_main_media_external_provider\` text;`)
  await db.run(sql`ALTER TABLE \`_works_v\` ADD \`version_main_media_external_id\` text;`)
  await db.run(sql`ALTER TABLE \`_works_v\` ADD \`version_main_media_external_poster_id\` integer REFERENCES images(id);`)
  await db.run(sql`ALTER TABLE \`_works_v\` ADD \`version_main_media_image_id\` integer REFERENCES images(id);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_main_media_version_main_media_video_idx\` ON \`_works_v\` (\`version_main_media_video_id\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_main_media_version_main_media_external__idx\` ON \`_works_v\` (\`version_main_media_external_poster_id\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_main_media_version_main_media_image_idx\` ON \`_works_v\` (\`version_main_media_image_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
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
  	\`preview_loop_id\` integer,
  	\`seo_image_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`cover_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`preview_loop_id\`) REFERENCES \`videos\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`seo_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_works\`("id", "_order", "year", "generate_slug", "slug", "featured", "featured_order", "cover_id", "preview_loop_id", "seo_image_id", "updated_at", "created_at", "_status") SELECT "id", "_order", "year", "generate_slug", "slug", "featured", "featured_order", "cover_id", "preview_loop_id", "seo_image_id", "updated_at", "created_at", "_status" FROM \`works\`;`)
  await db.run(sql`DROP TABLE \`works\`;`)
  await db.run(sql`ALTER TABLE \`__new_works\` RENAME TO \`works\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`works__order_idx\` ON \`works\` (\`_order\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`works_slug_idx\` ON \`works\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`works_featured_idx\` ON \`works\` (\`featured\`);`)
  await db.run(sql`CREATE INDEX \`works_cover_idx\` ON \`works\` (\`cover_id\`);`)
  await db.run(sql`CREATE INDEX \`works_preview_loop_idx\` ON \`works\` (\`preview_loop_id\`);`)
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
  	\`version_preview_loop_id\` integer,
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
  	FOREIGN KEY (\`version_preview_loop_id\`) REFERENCES \`videos\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_seo_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new__works_v\`("id", "parent_id", "version__order", "version_year", "version_generate_slug", "version_slug", "version_featured", "version_featured_order", "version_cover_id", "version_preview_loop_id", "version_seo_image_id", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version__order", "version_year", "version_generate_slug", "version_slug", "version_featured", "version_featured_order", "version_cover_id", "version_preview_loop_id", "version_seo_image_id", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_works_v\`;`)
  await db.run(sql`DROP TABLE \`_works_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__works_v\` RENAME TO \`_works_v\`;`)
  await db.run(sql`CREATE INDEX \`_works_v_parent_idx\` ON \`_works_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version__order_idx\` ON \`_works_v\` (\`version__order\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_slug_idx\` ON \`_works_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_featured_idx\` ON \`_works_v\` (\`version_featured\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_cover_idx\` ON \`_works_v\` (\`version_cover_id\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_preview_loop_idx\` ON \`_works_v\` (\`version_preview_loop_id\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_seo_version_seo_image_idx\` ON \`_works_v\` (\`version_seo_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_updated_at_idx\` ON \`_works_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version_created_at_idx\` ON \`_works_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_version_version__status_idx\` ON \`_works_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_created_at_idx\` ON \`_works_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_updated_at_idx\` ON \`_works_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_snapshot_idx\` ON \`_works_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_published_locale_idx\` ON \`_works_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_works_v_latest_idx\` ON \`_works_v\` (\`latest\`);`)
}
