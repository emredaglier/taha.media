import * as migration_20261105_205422_initial from './20261105_205422_initial';
import * as migration_20261105_210548_images from './20261105_210548_images';

export const migrations = [
  {
    up: migration_20261105_205422_initial.up,
    down: migration_20261105_205422_initial.down,
    name: '20261105_205422_initial',
  },
  {
    up: migration_20261105_210548_images.up,
    down: migration_20261105_210548_images.down,
    name: '20261105_210548_images'
  },
];
