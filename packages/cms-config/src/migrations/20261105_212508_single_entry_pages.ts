import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`site_socials\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`platform\` text,
  	\`url\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`site_socials_order_idx\` ON \`site_socials\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`site_socials_parent_id_idx\` ON \`site_socials\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`showreel_id\` integer,
  	\`showreel_phone_id\` integer,
  	\`showreel_poster_id\` integer,
  	\`showreel_link_url\` text,
  	\`showreel_link_provider\` text,
  	\`showreel_link_video_id\` text,
  	\`email\` text,
  	\`seo_image_id\` integer,
  	\`_status\` text DEFAULT 'draft',
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`showreel_id\`) REFERENCES \`videos\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`showreel_phone_id\`) REFERENCES \`videos\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`showreel_poster_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`seo_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`site_showreel_idx\` ON \`site\` (\`showreel_id\`);`)
  await db.run(sql`CREATE INDEX \`site_showreel_phone_idx\` ON \`site\` (\`showreel_phone_id\`);`)
  await db.run(sql`CREATE INDEX \`site_showreel_poster_idx\` ON \`site\` (\`showreel_poster_id\`);`)
  await db.run(sql`CREATE INDEX \`site_seo_seo_image_idx\` ON \`site\` (\`seo_image_id\`);`)
  await db.run(sql`CREATE INDEX \`site__status_idx\` ON \`site\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`site_locales\` (
  	\`intro\` text,
  	\`seo_title\` text,
  	\`seo_description\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_locales_locale_parent_id_unique\` ON \`site_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_v_version_socials\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`platform\` text,
  	\`url\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_v_version_socials_order_idx\` ON \`_site_v_version_socials\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_site_v_version_socials_parent_id_idx\` ON \`_site_v_version_socials\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_showreel_id\` integer,
  	\`version_showreel_phone_id\` integer,
  	\`version_showreel_poster_id\` integer,
  	\`version_showreel_link_url\` text,
  	\`version_showreel_link_provider\` text,
  	\`version_showreel_link_video_id\` text,
  	\`version_email\` text,
  	\`version_seo_image_id\` integer,
  	\`version__status\` text DEFAULT 'draft',
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`version_showreel_id\`) REFERENCES \`videos\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_showreel_phone_id\`) REFERENCES \`videos\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_showreel_poster_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_seo_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_v_version_version_showreel_idx\` ON \`_site_v\` (\`version_showreel_id\`);`)
  await db.run(sql`CREATE INDEX \`_site_v_version_version_showreel_phone_idx\` ON \`_site_v\` (\`version_showreel_phone_id\`);`)
  await db.run(sql`CREATE INDEX \`_site_v_version_version_showreel_poster_idx\` ON \`_site_v\` (\`version_showreel_poster_id\`);`)
  await db.run(sql`CREATE INDEX \`_site_v_version_seo_version_seo_image_idx\` ON \`_site_v\` (\`version_seo_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_site_v_version_version__status_idx\` ON \`_site_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_site_v_created_at_idx\` ON \`_site_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_v_updated_at_idx\` ON \`_site_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_v_snapshot_idx\` ON \`_site_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_site_v_published_locale_idx\` ON \`_site_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_site_v_latest_idx\` ON \`_site_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_site_v_locales\` (
  	\`version_intro\` text,
  	\`version_seo_title\` text,
  	\`version_seo_description\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_v_locales_locale_parent_id_unique\` ON \`_site_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`about_clients\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`logo_id\` integer,
  	FOREIGN KEY (\`logo_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`about\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`about_clients_order_idx\` ON \`about_clients\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`about_clients_parent_id_idx\` ON \`about_clients\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`about_clients_logo_idx\` ON \`about_clients\` (\`logo_id\`);`)
  await db.run(sql`CREATE TABLE \`about\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`portrait_id\` integer,
  	\`seo_image_id\` integer,
  	\`_status\` text DEFAULT 'draft',
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`portrait_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`seo_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`about_portrait_idx\` ON \`about\` (\`portrait_id\`);`)
  await db.run(sql`CREATE INDEX \`about_seo_seo_image_idx\` ON \`about\` (\`seo_image_id\`);`)
  await db.run(sql`CREATE INDEX \`about__status_idx\` ON \`about\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`about_locales\` (
  	\`bio\` text,
  	\`discipline_lines_kurgu\` text,
  	\`discipline_lines_motion\` text,
  	\`discipline_lines_grafik\` text,
  	\`seo_title\` text,
  	\`seo_description\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`about\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`about_locales_locale_parent_id_unique\` ON \`about_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_about_v_version_clients\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`logo_id\` integer,
  	\`_uuid\` text,
  	FOREIGN KEY (\`logo_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_about_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_about_v_version_clients_order_idx\` ON \`_about_v_version_clients\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_about_v_version_clients_parent_id_idx\` ON \`_about_v_version_clients\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_about_v_version_clients_logo_idx\` ON \`_about_v_version_clients\` (\`logo_id\`);`)
  await db.run(sql`CREATE TABLE \`_about_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_portrait_id\` integer,
  	\`version_seo_image_id\` integer,
  	\`version__status\` text DEFAULT 'draft',
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`version_portrait_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_seo_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_about_v_version_version_portrait_idx\` ON \`_about_v\` (\`version_portrait_id\`);`)
  await db.run(sql`CREATE INDEX \`_about_v_version_seo_version_seo_image_idx\` ON \`_about_v\` (\`version_seo_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_about_v_version_version__status_idx\` ON \`_about_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_about_v_created_at_idx\` ON \`_about_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_about_v_updated_at_idx\` ON \`_about_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_about_v_snapshot_idx\` ON \`_about_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_about_v_published_locale_idx\` ON \`_about_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_about_v_latest_idx\` ON \`_about_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_about_v_locales\` (
  	\`version_bio\` text,
  	\`version_discipline_lines_kurgu\` text,
  	\`version_discipline_lines_motion\` text,
  	\`version_discipline_lines_grafik\` text,
  	\`version_seo_title\` text,
  	\`version_seo_description\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_about_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_about_v_locales_locale_parent_id_unique\` ON \`_about_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`privacy\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`seo_image_id\` integer,
  	\`_status\` text DEFAULT 'draft',
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`seo_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`privacy_seo_seo_image_idx\` ON \`privacy\` (\`seo_image_id\`);`)
  await db.run(sql`CREATE INDEX \`privacy__status_idx\` ON \`privacy\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`privacy_locales\` (
  	\`body\` text,
  	\`seo_title\` text,
  	\`seo_description\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`privacy\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`privacy_locales_locale_parent_id_unique\` ON \`privacy_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_privacy_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_seo_image_id\` integer,
  	\`version__status\` text DEFAULT 'draft',
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`version_seo_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_privacy_v_version_seo_version_seo_image_idx\` ON \`_privacy_v\` (\`version_seo_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_privacy_v_version_version__status_idx\` ON \`_privacy_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_privacy_v_created_at_idx\` ON \`_privacy_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_privacy_v_updated_at_idx\` ON \`_privacy_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_privacy_v_snapshot_idx\` ON \`_privacy_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_privacy_v_published_locale_idx\` ON \`_privacy_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_privacy_v_latest_idx\` ON \`_privacy_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_privacy_v_locales\` (
  	\`version_body\` text,
  	\`version_seo_title\` text,
  	\`version_seo_description\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_privacy_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_privacy_v_locales_locale_parent_id_unique\` ON \`_privacy_v_locales\` (\`_locale\`,\`_parent_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`site_socials\`;`)
  await db.run(sql`DROP TABLE \`site\`;`)
  await db.run(sql`DROP TABLE \`site_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_v_version_socials\`;`)
  await db.run(sql`DROP TABLE \`_site_v\`;`)
  await db.run(sql`DROP TABLE \`_site_v_locales\`;`)
  await db.run(sql`DROP TABLE \`about_clients\`;`)
  await db.run(sql`DROP TABLE \`about\`;`)
  await db.run(sql`DROP TABLE \`about_locales\`;`)
  await db.run(sql`DROP TABLE \`_about_v_version_clients\`;`)
  await db.run(sql`DROP TABLE \`_about_v\`;`)
  await db.run(sql`DROP TABLE \`_about_v_locales\`;`)
  await db.run(sql`DROP TABLE \`privacy\`;`)
  await db.run(sql`DROP TABLE \`privacy_locales\`;`)
  await db.run(sql`DROP TABLE \`_privacy_v\`;`)
  await db.run(sql`DROP TABLE \`_privacy_v_locales\`;`)
}
