// `pnpm qa`: the QA build, for the lead session only, once, after the workers have finished
// (CLAUDE.md, "Memory-heavy commands"). It
//
//   1. refuses to start when the web or media port is taken, and says which process holds it
//   2. makes a fresh QA folder (default .qa, gitignored): migrates a SQLite database there, fills
//      it with the dev seed (Media lands in its images/ and videos/) and swaps the flat Preview
//      loops and Showreel videos for visible clips (make-loops.sh, needs ffmpeg and ffprobe).
//      `--reuse` keeps the folder instead.
//   3. deletes ALL of apps/web/.next/cache (the fetch cache serves old data; the webpack cache can
//      keep an unpatched dependency after `pnpm patch`)
//   4. builds web with the QA database, throwaway secrets and MEDIA_ORIGIN pointing at the stand-in
//   5. starts the media stand-in (scripts/qa/media.ts) and `next start`, and prints the URLs
//
// Ctrl-C stops both. Options: `pnpm qa --help`. TAHA_QA_DRY_RUN=1 (the tests set it) stops after
// the argument, reset and port checks, before anything is deleted, seeded or built.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createMediaServer } from './media.ts'
import {
  assertReusable,
  assertSafeToReset,
  lanAddress,
  markQaFolder,
  parseArgs,
  seedEnv,
  USAGE,
  UsageError,
  webEnv,
  type QaConfig,
} from './options.ts'
import { checkPorts, formatPortConflicts } from './ports.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const log = (message: string) => console.log(`\n[qa] ${message}`)

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, env, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (status, signal) =>
      status === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(' ')} exited with ${status ?? signal}`)),
    )
  })
}

/** The steps below are the ones that touch the database and Next; tests never call them. */

async function seedQaFolder(config: QaConfig) {
  assertSafeToReset(config.qaDir, repoRoot)
  fs.rmSync(config.qaDir, { recursive: true, force: true })
  fs.mkdirSync(config.qaDir, { recursive: true })
  markQaFolder(config.qaDir)
  const env = seedEnv(config, process.env)
  log(`migrating and seeding ${config.qaDir}/qa.db (Media goes to images/ and videos/ beside it)`)
  await run('pnpm', ['--filter', '@taha/cms', 'migrate'], env)
  await run('pnpm', ['seed'], env)
}

function makeLoops(config: QaConfig): Promise<void> {
  log('replacing the flat Preview loops and Showreel videos with visible clips (ffmpeg)')
  return run('sh', [path.join(repoRoot, 'scripts/qa/make-loops.sh'), config.qaDir], process.env)
}

function clearNextCache() {
  log('deleting apps/web/.next/cache')
  fs.rmSync(path.join(repoRoot, 'apps/web/.next/cache'), { recursive: true, force: true })
}

function buildWeb(config: QaConfig): Promise<void> {
  log(`building web (MEDIA_ORIGIN=${config.mediaOrigin})`)
  return run('pnpm', ['--filter', '@taha/web', 'build'], webEnv(config, process.env))
}

function startNext(config: QaConfig): ChildProcess {
  return spawn(
    'pnpm',
    [
      '--filter',
      '@taha/web',
      'exec',
      'next',
      'start',
      '-H',
      config.host,
      '-p',
      String(config.webPort),
    ],
    { cwd: repoRoot, env: webEnv(config, process.env), stdio: 'inherit' },
  )
}

async function main(): Promise<number> {
  let parsed
  try {
    parsed = parseArgs(process.argv.slice(2), { repoRoot, lanAddress: lanAddress() })
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    console.error(`${error.message}\n\n${USAGE}`)
    return 2
  }
  if (parsed.kind === 'help') {
    console.log(USAGE)
    return 0
  }
  const { config } = parsed

  try {
    if (config.reuse) {
      assertReusable(config.qaDir, repoRoot)
    } else {
      assertSafeToReset(config.qaDir, repoRoot)
      if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).error) {
        throw new UsageError(
          'ffmpeg is not installed (brew install ffmpeg); the loop maker needs it.',
        )
      }
    }
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    console.error(error.message)
    return 2
  }

  const conflicts = await checkPorts([
    { name: 'web', host: config.host, port: config.webPort },
    { name: 'media', host: config.host, port: config.mediaPort },
  ])
  if (conflicts.length > 0) {
    console.error(
      `${formatPortConflicts(conflicts)}\nStop them, or pick other ports (--web-port, --media-port).`,
    )
    return 1
  }

  if (process.env.TAHA_QA_DRY_RUN === '1') {
    // Set by qa.test.ts, which spawns this file: everything above only reads. Nothing below may
    // run in a test, because it deletes, seeds and builds.
    log('dry run: the checks passed, nothing was deleted, seeded or built')
    return 0
  }

  if (!config.reuse) {
    await seedQaFolder(config)
    await makeLoops(config)
  }
  clearNextCache()
  await buildWeb(config)

  const media = createMediaServer(config.qaDir)
  await new Promise<void>((resolve, reject) => {
    media.once('error', reject)
    media.listen(config.mediaPort, config.host, resolve)
  })
  const next = startNext(config)
  log(`web:   ${config.webOrigin}\n[qa] media: ${config.mediaOrigin}   (Ctrl-C stops both)`)

  const stop = () => {
    next.kill('SIGTERM')
    media.close()
    media.closeAllConnections()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  return new Promise((resolve) => {
    next.on('exit', (code) => {
      stop()
      resolve(code ?? 0)
    })
  })
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`\n[qa] ERROR: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    },
  )
}
