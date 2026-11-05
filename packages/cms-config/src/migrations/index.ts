import * as migration_20261105_205422_initial from './20261105_205422_initial';
import * as migration_20261105_210222_work_slugs from './20261105_210222_work_slugs';

export const migrations = [
  {
    up: migration_20261105_205422_initial.up,
    down: migration_20261105_205422_initial.down,
    name: '20261105_205422_initial',
  },
  {
    up: migration_20261105_210222_work_slugs.up,
    down: migration_20261105_210222_work_slugs.down,
    name: '20261105_210222_work_slugs'
  },
];
