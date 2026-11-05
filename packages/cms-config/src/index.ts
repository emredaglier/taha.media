export {
  buildSiteConfig,
  siteConfigOptionsFromEnv,
  CONTENT_LOCALE,
  MIGRATION_DIR,
  TYPES_FILE,
} from './config'
export type { SiteConfigOptions } from './config'
export { Users } from './collections/Users'
export { Works } from './collections/Works'
export { DISCIPLINES, DISCIPLINE_LABELS } from './disciplines'
export type { Discipline } from './disciplines'
export type { Config, User, Work as WorkDoc } from './payload-types'
