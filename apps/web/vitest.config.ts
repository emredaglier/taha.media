import path from 'node:path'

import { defineConfig, mergeConfig } from 'vitest/config'

import rootConfig from '../../vitest.config.ts'

// `vitest run` started from apps/web would otherwise find no config: no `next/cache` stand-in, no
// pinned device, about 128 false failures. Reuse the root config and keep every path in it
// resolving from the repo root, so a run from here is the same run as `pnpm test` at the root.
// The root run does not read this file (it has no `projects`), so no test file runs twice.
export default mergeConfig(
  rootConfig,
  defineConfig({ root: path.join(import.meta.dirname, '../..') }),
)
