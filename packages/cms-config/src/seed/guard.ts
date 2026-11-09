type Env = Record<string, string | undefined>

/**
 * The media settings (R2) that make an environment production: set any and the demo seed refuses.
 * Exported so the QA kit (scripts/qa) strips exactly these instead of keeping its own copy.
 */
export const MEDIA_SETTING_NAMES = [
  'MEDIA_ORIGIN',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const

/**
 * A database counts as production when the environment says so (ADR-0011, ADR-0013):
 * - `NODE_ENV=production` (the server's cms container), or `TAHA_ENV=production` for anything
 *   else that points at the live data;
 * - any media setting for R2 (`MEDIA_ORIGIN`, `S3_*`): the demo seed uploads fixtures, which must
 *   never reach the live bucket.
 * The database path is deliberately not used: it is a plain file name in every environment.
 */
export function isProductionEnvironment(env: Env = process.env): boolean {
  const set = (name: string) => (env[name] ?? '').trim() !== ''
  return (
    env.NODE_ENV === 'production' || env.TAHA_ENV === 'production' || MEDIA_SETTING_NAMES.some(set)
  )
}

/** Throws before anything is written when the environment looks like production. */
export function assertLocalEnvironment(env: Env = process.env): void {
  if (isProductionEnvironment(env)) {
    throw new Error(
      'Refusing to run the demo seed: this looks like a production environment ' +
        '(NODE_ENV=production, TAHA_ENV=production, or MEDIA_ORIGIN/S3_* set). ' +
        'Use `pnpm seed:production` on the server instead.',
    )
  }
}
