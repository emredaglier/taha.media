import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// A relative import into the package source: the guard is plain TypeScript with no imports, so
// node strips the types and runs it, and the root has no workspace dependency on cms-config.
import { MEDIA_SETTING_NAMES } from '../../packages/cms-config/src/seed/guard.ts'

export class UsageError extends Error {}

export const USAGE = `Usage: pnpm qa [options]

Builds web for QA and serves it with a media stand-in. Lead session only, once, after the workers
have finished (CLAUDE.md, "Memory-heavy commands").

Options:
  --reuse             keep the QA folder and its database; skip seeding and the loop maker
  --dir <path>        the QA folder (default: .qa in the repo, gitignored)
  --web-port <n>      port of next start (default 3000)
  --media-port <n>    port of the media stand-in (default 4100)
  --lan               bind both servers to this machine's LAN address, for a phone
  -h, --help          this text`

export type QaConfig = {
  qaDir: string
  reuse: boolean
  lan: boolean
  host: string
  webPort: number
  mediaPort: number
  webOrigin: string
  mediaOrigin: string
}

export type ParsedArgs = { kind: 'help' } | { kind: 'run'; config: QaConfig }

/** The first external IPv4 address, or null when the machine has none. */
export function lanAddress(
  interfaces: ReturnType<typeof os.networkInterfaces> = os.networkInterfaces(),
): string | null {
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address
    }
  }
  return null
}

const toPort = (flag: string, value: string): number => {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new UsageError(`${flag} must be a port from 1 to 65535, got "${value}".`)
  }
  return port
}

export function parseArgs(
  argv: string[],
  context: { repoRoot: string; lanAddress: string | null },
): ParsedArgs {
  let qaDir = path.join(context.repoRoot, '.qa')
  let reuse = false
  let lan = false
  let webPort = 3000
  let mediaPort = 4100

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '-h' || arg === '--help') return { kind: 'help' }
    if (arg === '--reuse') reuse = true
    else if (arg === '--lan') lan = true
    else if (/^--(dir|web-port|media-port)(=|$)/.test(arg)) {
      const [flag, inline] = arg.split(/=(.*)/s, 2) as [string, string | undefined]
      const value = inline ?? argv[++i]
      if (value === undefined || value === '') throw new UsageError(`${flag} needs a value.`)
      if (flag === '--dir') qaDir = path.resolve(value)
      else if (flag === '--web-port') webPort = toPort(flag, value)
      else mediaPort = toPort(flag, value)
    } else {
      throw new UsageError(`Unknown option "${arg}".`)
    }
  }
  if (webPort === mediaPort) {
    throw new UsageError(`The web and media servers cannot share the same port (${webPort}).`)
  }
  if (lan && !context.lanAddress) {
    throw new UsageError('--lan: no LAN address found (is the machine on a network?).')
  }
  const host = lan ? context.lanAddress! : '127.0.0.1'
  return {
    kind: 'run',
    config: {
      qaDir,
      reuse,
      lan,
      host,
      webPort,
      mediaPort,
      webOrigin: `http://${host}:${webPort}`,
      mediaOrigin: `http://${host}:${mediaPort}`,
    },
  }
}

/** Throwaway: the QA build never signs anything that outlives it. */
const QA_SECRET = 'qa-only-secret'

/**
 * Settings a QA environment must not inherit from the shell. The media settings that make the
 * seed refuse are the guard's own list (packages/cms-config/src/seed/guard.ts, ADR-0011), the
 * single source of truth; the rest is what the QA kit adds on top. `webEnv` and `seedEnv` both
 * start from a base without them.
 */
const INHERITED_NEVER = ['NODE_ENV', 'TAHA_ENV', ...MEDIA_SETTING_NAMES, 'REVALIDATE_URL']

function filteredBase(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...base }
  for (const name of INHERITED_NEVER) delete env[name]
  return env
}

/**
 * Sentry and analytics, which web bakes into the build (`NEXT_PUBLIC_*`) or uses to upload source
 * maps (`apps/web/next.config.ts`). Set to the empty string rather than deleted: Next never
 * overrides a variable that already exists in the environment, so an `apps/web/.env*` file cannot
 * fill them back in, and `apps/web/src/lib/observability.ts` reads an empty value as unset.
 */
const BLANKED_FOR_WEB = [
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_CLOUDFLARE_BEACON_TOKEN',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
]

/**
 * Environment of the web build and of `next start`. `MEDIA_ORIGIN` must be set at build time: the
 * Work pages are prerendered and media links are computed when the data is fetched, so without it
 * the build bakes in `/api/...` links web does not serve. Production, storage, Sentry and
 * analytics settings from the shell are dropped, so QA errors and page views never reach the live
 * services and a half-set `S3_*` cannot make the build throw.
 */
export function webEnv(config: QaConfig, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...filteredBase(base),
    ...Object.fromEntries(BLANKED_FOR_WEB.map((name) => [name, ''])),
    DATABASE_PATH: path.join(config.qaDir, 'qa.db'),
    PAYLOAD_SECRET: QA_SECRET,
    REVALIDATE_SECRET: QA_SECRET,
    MEDIA_ORIGIN: config.mediaOrigin,
  }
}

/**
 * Environment of the migration and the dev seed. The seed refuses a production-looking
 * environment, and with no storage settings it keeps Media on local disk next to the database
 * (`images/`, `videos/`), which is the folder the media stand-in serves.
 */
export function seedEnv(config: QaConfig, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...filteredBase(base),
    DATABASE_PATH: path.join(config.qaDir, 'qa.db'),
    PAYLOAD_SECRET: QA_SECRET,
    PAYLOAD_DB_PUSH: 'false',
  }
}

/** The file that says "the kit made this folder". A file name like `qa.db` proves nothing. */
export const QA_MARKER = '.taha-qa-kit'

/** Written when the kit creates a QA folder; a later reset or `--reuse` requires it. */
export function markQaFolder(qaDir: string): void {
  fs.writeFileSync(
    path.join(qaDir, QA_MARKER),
    'Made by `pnpm qa` (scripts/qa). The next run may delete this folder.\n',
  )
}

const realOrResolved = (p: string): string => {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

const isInside = (child: string, parent: string): boolean =>
  child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep)

/** Folders that must never be a QA folder, marker or not. A symlink is judged by its target. */
function assertNotPrecious(qaDir: string, repoRoot: string, home: string): void {
  const dir = realOrResolved(qaDir)
  if (dir === path.parse(dir).root) {
    throw new UsageError(`${qaDir} is a filesystem root; refusing to use it as a QA folder.`)
  }
  if (isInside(realOrResolved(repoRoot), dir)) {
    throw new UsageError(
      `${qaDir} is, or contains, the repository; refusing to use it as a QA folder. Pick another --dir.`,
    )
  }
  if (isInside(realOrResolved(home), dir)) {
    throw new UsageError(
      `${qaDir} is, or contains, your home folder; refusing to use it as a QA folder. Pick another --dir.`,
    )
  }
}

const hasMarker = (qaDir: string): boolean => {
  try {
    return fs.lstatSync(path.join(qaDir, QA_MARKER)).isFile()
  } catch {
    return false
  }
}

/**
 * A fresh run deletes the QA folder first. Only a folder this kit made (it holds the marker), an
 * empty one or a missing one may go: `--dir ~/Documents` must not be wiped, not even when it
 * holds a file called `qa.db`. The repository, the home folder, anything that contains them and
 * a filesystem root never go.
 */
export function assertSafeToReset(
  qaDir: string,
  repoRoot: string,
  home: string = os.homedir(),
): void {
  assertNotPrecious(qaDir, repoRoot, home)
  let stat: fs.Stats
  try {
    stat = fs.statSync(qaDir)
  } catch {
    return
  }
  const entries = stat.isDirectory() ? fs.readdirSync(qaDir) : ['(a file)']
  if (entries.length > 0 && !(stat.isDirectory() && hasMarker(qaDir))) {
    throw new UsageError(
      `${qaDir} is not a QA folder (no ${QA_MARKER} marker) and is not empty; refusing to delete it. Pick another --dir.`,
    )
  }
}

/** `--reuse` keeps a folder, so it must be one the kit made and one that holds a database. */
export function assertReusable(qaDir: string, repoRoot: string, home: string = os.homedir()): void {
  assertNotPrecious(qaDir, repoRoot, home)
  if (!fs.existsSync(path.join(qaDir, 'qa.db'))) {
    throw new UsageError(`--reuse: ${qaDir} has no qa.db. Run without --reuse first.`)
  }
  if (!hasMarker(qaDir)) {
    throw new UsageError(
      `--reuse: ${qaDir} is not a QA folder (no ${QA_MARKER} marker). Run without --reuse to make a fresh one.`,
    )
  }
}
