import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildSiteConfig, siteConfigOptionsFromEnv } from '@taha/cms-config'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// cms is a thin host: the schema, access and validation all live in @taha/cms-config.
export default buildSiteConfig({
  ...siteConfigOptionsFromEnv('cms'),
  adminBaseDir: dirname,
})
