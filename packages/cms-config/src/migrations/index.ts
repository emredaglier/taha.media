import * as migration_20261105_205422_initial from './20261105_205422_initial';

export const migrations = [
  {
    up: migration_20261105_205422_initial.up,
    down: migration_20261105_205422_initial.down,
    name: '20261105_205422_initial'
  },
];
