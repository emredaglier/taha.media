import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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
 * Environment of the web build and of `next start`. `MEDIA_ORIGIN` must be set at build time: the
 * Work pages are prerendered and media links are computed when the data is fetched, so without it
 * the build bakes in `/api/...` links web does not serve.
 */
export function webEnv(config: QaConfig, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...base,
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
  const env = { ...base }
  for (const name of [
    'NODE_ENV',
    'TAHA_ENV',
    'MEDIA_ORIGIN',
    'S3_ENDPOINT',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'REVALIDATE_URL',
  ]) {
    delete env[name]
  }
  return {
    ...env,
    DATABASE_PATH: path.join(config.qaDir, 'qa.db'),
    PAYLOAD_SECRET: QA_SECRET,
    PAYLOAD_DB_PUSH: 'false',
  }
}

/**
 * A fresh run deletes the QA folder first. Only a folder this kit made (it holds `qa.db`), an
 * empty one or a missing one may go: `--dir ~/Documents` must not be wiped.
 */
export function assertSafeToReset(qaDir: string): void {
  let stat: fs.Stats
  try {
    stat = fs.statSync(qaDir)
  } catch {
    return
  }
  const entries = stat.isDirectory() ? fs.readdirSync(qaDir) : ['(a file)']
  if (entries.length > 0 && !entries.includes('qa.db')) {
    throw new UsageError(
      `${qaDir} is not a QA folder (no qa.db) and is not empty; refusing to delete it. Pick another --dir.`,
    )
  }
}
