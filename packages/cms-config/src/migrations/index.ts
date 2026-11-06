import * as migration_20261105_205422_initial from './20261105_205422_initial';
import * as migration_20261105_210257_featured_and_order from './20261105_210257_featured_and_order';
import * as migration_20261105_210701_work_slugs from './20261105_210701_work_slugs';
import * as migration_20261105_210924_images from './20261105_210924_images';
import * as migration_20261105_211456_work_details from './20261105_211456_work_details';
import * as migration_20261105_211929_videos from './20261105_211929_videos';
import * as migration_20261105_212508_single_entry_pages from './20261105_212508_single_entry_pages';
import * as migration_20261105_212844_main_media from './20261105_212844_main_media';
import * as migration_20261106_083348_statement_fields from './20261106_083348_statement_fields';
import * as migration_20261106_083406_drop_site_intro from './20261106_083406_drop_site_intro';

export const migrations = [
  {
    up: migration_20261105_205422_initial.up,
    down: migration_20261105_205422_initial.down,
    name: '20261105_205422_initial',
  },
  {
    up: migration_20261105_210257_featured_and_order.up,
    down: migration_20261105_210257_featured_and_order.down,
    name: '20261105_210257_featured_and_order',
  },
  {
    up: migration_20261105_210701_work_slugs.up,
    down: migration_20261105_210701_work_slugs.down,
    name: '20261105_210701_work_slugs',
  },
  {
    up: migration_20261105_210924_images.up,
    down: migration_20261105_210924_images.down,
    name: '20261105_210924_images',
  },
  {
    up: migration_20261105_211456_work_details.up,
    down: migration_20261105_211456_work_details.down,
    name: '20261105_211456_work_details',
  },
  {
    up: migration_20261105_211929_videos.up,
    down: migration_20261105_211929_videos.down,
    name: '20261105_211929_videos',
  },
  {
    up: migration_20261105_212508_single_entry_pages.up,
    down: migration_20261105_212508_single_entry_pages.down,
    name: '20261105_212508_single_entry_pages',
  },
  {
    up: migration_20261105_212844_main_media.up,
    down: migration_20261105_212844_main_media.down,
    name: '20261105_212844_main_media',
  },
  {
    up: migration_20261106_083348_statement_fields.up,
    down: migration_20261106_083348_statement_fields.down,
    name: '20261106_083348_statement_fields',
  },
  {
    up: migration_20261106_083406_drop_site_intro.up,
    down: migration_20261106_083406_drop_site_intro.down,
    name: '20261106_083406_drop_site_intro'
  },
];
