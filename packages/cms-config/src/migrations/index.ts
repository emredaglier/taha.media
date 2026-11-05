import * as migration_20261105_205422_initial from './20261105_205422_initial';
import * as migration_20261105_210257_featured_and_order from './20261105_210257_featured_and_order';

export const migrations = [
  {
    up: migration_20261105_205422_initial.up,
    down: migration_20261105_205422_initial.down,
    name: '20261105_205422_initial',
  },
  {
    up: migration_20261105_210257_featured_and_order.up,
    down: migration_20261105_210257_featured_and_order.down,
    name: '20261105_210257_featured_and_order'
  },
];
