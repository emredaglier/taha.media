// `pnpm smoke`: the release gate (spec #1 Seam 2, ADR-0010). One command, headless, exit code 0/1.
//
//   1. migrate a temp SQLite file and fill it with the demo content (`pnpm seed`), then add the
//      smoke's own content and write the manifest (cms scripts smoke:prepare, on the host)
//   2. build the images' `web` target (unless SMOKE_WEB_IMAGE names one already built)
//   3. start, on one Docker network: `web` (public), `web-preview` (PREVIEW=1, same image and
//      data) and Caddy with the local site rules in front of `web`, exactly as the Compose stack
//   4. warm the public pages' cache, then save once through the Local API with the revalidate
//      call pointing at the container (cms script smoke:live-edit)
//   5. run smoke/playwright.config.ts (desktop Chromium)
//   6. clean up (containers, network, temp files)
//
// Extra arguments go to `playwright test`, e.g. `pnpm smoke -g hakkimda`.
// Needs Docker, and Chromium for Playwright once: `pnpm exec playwright install chromium`.
// Environment:
//   SMOKE_WEB_IMAGE     use this already built image instead of building one. Then also set
//                       SMOKE_ASSET_PREFIX to the prefix it was built with (required).
//   SMOKE_ASSET_PREFIX  CDN prefix to build with (default https://cdn.taha.media/releases/smoke).
//                       Its /_next/ requests are answered by the container inside the browser.
//   SMOKE_PLATFORM      docker build platform (default: native; CI builds linux/arm64 natively)
//   SMOKE_KEEP=1        keep the temp dir, containers and network for debugging
//   SMOKE_OUTPUT_DIR    where traces, screenshots and the HTML report go (smoke/.output)
import { spawn, spawnSync, type SpawnOptions } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readManifest } from './manifest.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = process.env
const prebuilt = env.SMOKE_WEB_IMAGE
if (prebuilt && !env.SMOKE_ASSET_PREFIX) {
  console.error(
    '[smoke] SMOKE_WEB_IMAGE needs SMOKE_ASSET_PREFIX: the prefix the image was built with.',
  )
  process.exit(1)
}
const assetPrefix = env.SMOKE_ASSET_PREFIX ?? 'https://cdn.taha.media/releases/smoke'
const image = prebuilt ?? 'taha-web:smoke'
const id = `taha-smoke-${process.pid}`
const network = id
const CADDY_IMAGE = 'caddy:2.11.7-alpine'
const SECRETS = {
  PAYLOAD_SECRET: 'smoke-only-cms-payload-secret',
  REVALIDATE_SECRET: 'smoke-only-revalidate-secret',
}
/** web never signs anything; its PAYLOAD_SECRET is its own, never the cms one. */
const WEB_PAYLOAD_SECRET = 'smoke-only-web-payload-secret'

const log = (message: string) => console.log(`\n[smoke] ${message}`)

function run(command: string, args: string[], options: SpawnOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options })
    child.on('error', reject)
    child.on('exit', (status, signal) =>
      status === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(' ')} exited with ${status ?? signal}`)),
    )
  })
}

/** Polls until `ready` accepts the answer (a refused connection counts as "not yet"). */
async function waitFor(url: string, ready: (status: number) => boolean) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try {
      if (ready((await fetch(url)).status)) return
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`${url} did not become ready`)
}

const hostPort = (container: string, port: string) =>
  `http://127.0.0.1:${spawnSync('docker', ['port', container, port], { encoding: 'utf8' }).stdout.trim().split('\n')[0]!.split(':').pop()}`

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'taha-smoke-'))
const started: string[] = []
let networkCreated = false
let exitCode = 1

try {
  const dataDir = path.join(tmp, 'data')
  const manifestPath = path.join(tmp, 'manifest.json')
  fs.mkdirSync(dataDir)

  // The demo seed refuses a production-looking environment, so none of these may reach it.
  const hostEnv: NodeJS.ProcessEnv = { ...env }
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
    delete hostEnv[name]
  }
  const seedEnv = {
    ...hostEnv,
    ...SECRETS,
    DATABASE_PATH: path.join(dataDir, 'taha.db'),
    PAYLOAD_DB_PUSH: 'false',
    SMOKE_MANIFEST: manifestPath,
  }

  log('migrating and seeding the demo content (Local API, media on local disk)')
  await run('pnpm', ['--filter', '@taha/cms', 'migrate'], { env: seedEnv })
  await run('pnpm', ['seed'], { env: seedEnv })
  await run('pnpm', ['--filter', '@taha/cms', 'smoke:prepare'], { env: seedEnv })
  const manifest = readManifest(manifestPath)
  console.log(`[smoke] ${manifest.works.length} published Works, draft ${manifest.draft.slug}`)
  // The containers run as uid 10001; the host files belong to whoever runs the gate.
  await run('chmod', ['-R', 'a+rwX', dataDir])

  if (!prebuilt) {
    log(`building the web image (asset prefix: ${assetPrefix})`)
    await run('docker', [
      'build',
      '--target',
      'web',
      '--build-arg',
      `ASSET_PREFIX=${assetPrefix}`,
      // Production builds always carry both (#17); the spec checks `?dpl=`.
      '--build-arg',
      'DEPLOYMENT_ID=smoke',
      ...(env.SMOKE_PLATFORM ? ['--platform', env.SMOKE_PLATFORM] : []),
      '-t',
      image,
      '.',
    ])
  }

  log('starting web, web-preview and Caddy on one Docker network')
  await run('docker', ['network', 'create', network], { stdio: 'ignore' })
  networkCreated = true

  // Both instances read the same database; only PREVIEW differs.
  const startWeb = async (name: string, alias: string, extra: string[]) => {
    const container = `${id}-${name}`
    await run('docker', [
      'run',
      '--detach',
      '--name',
      container,
      '--network',
      network,
      '--network-alias',
      alias,
      '--publish',
      '127.0.0.1::3000',
      '--volume',
      `${dataDir}:/data`,
      '--env',
      'DATABASE_PATH=/data/taha.db',
      '--env',
      `PAYLOAD_SECRET=${WEB_PAYLOAD_SECRET}`,
      '--env',
      `REVALIDATE_SECRET=${SECRETS.REVALIDATE_SECRET}`,
      ...extra,
      image,
    ])
    started.push(container)
    const url = hostPort(container, '3000/tcp')
    await waitFor(`${url}/internal/health`, (status) => status === 200)
    return url
  }
  const webUrl = await startWeb('web', 'web', [])
  const previewUrl = await startWeb('preview', 'web-preview', ['--env', 'PREVIEW=1'])

  // The same site rules and local Caddyfile the Compose stack uses (infra/compose.local.yaml).
  const caddy = `${id}-caddy`
  await run('docker', [
    'run',
    '--detach',
    '--name',
    caddy,
    '--network',
    network,
    '--publish',
    '127.0.0.1::80',
    '--volume',
    `${path.join(root, 'infra/caddy/Caddyfile.local')}:/etc/caddy/Caddyfile:ro`,
    '--volume',
    `${path.join(root, 'infra/caddy/site.caddy')}:/etc/caddy/site.caddy:ro`,
    CADDY_IMAGE,
  ])
  started.push(caddy)
  const baseUrl = hostPort(caddy, '80/tcp')
  // Caddy answers 404 for /internal/*, and 502 until it has seen web healthy.
  await waitFor(`${baseUrl}/internal/health`, (status) => status === 404)

  // Cache the pages the live edit changes, so only the revalidate call can refresh them.
  log('warming the cache, then saving through the Local API (revalidate -> container)')
  for (const route of ['/', `/isler/${manifest.liveEdit.slug}`, '/hakkimda', '/gizlilik']) {
    await fetch(`${webUrl}${route}`)
  }
  await run('pnpm', ['--filter', '@taha/cms', 'smoke:live-edit'], {
    env: { ...seedEnv, REVALIDATE_URL: `${webUrl}/internal/revalidate` },
  })

  log(`running the Playwright smoke test against ${baseUrl}`)
  const outputDir = env.SMOKE_OUTPUT_DIR ?? path.join(root, 'smoke/.output')
  const code = await new Promise<number>((resolve) => {
    const child = spawn(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--config',
        'smoke/playwright.config.ts',
        ...process.argv.slice(2),
      ],
      {
        cwd: root,
        stdio: 'inherit',
        env: {
          ...env,
          SMOKE_BASE_URL: baseUrl,
          SMOKE_WEB_URL: webUrl,
          SMOKE_PREVIEW_URL: previewUrl,
          SMOKE_REVALIDATE_SECRET: SECRETS.REVALIDATE_SECRET,
          SMOKE_ASSET_PREFIX: assetPrefix,
          SMOKE_MEDIA_DIR: dataDir,
          SMOKE_MANIFEST: manifestPath,
          SMOKE_OUTPUT_DIR: outputDir,
        },
      },
    )
    child.on('exit', (status) => resolve(status ?? 1))
  })
  exitCode = code
  if (code !== 0) {
    log(`FAILED. Traces and screenshots: ${outputDir}`)
    for (const name of started)
      spawnSync('docker', ['logs', '--tail', '40', name], { stdio: 'inherit' })
  } else {
    log('PASSED')
  }
} catch (error) {
  console.error(`\n[smoke] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  for (const name of started)
    spawnSync('docker', ['logs', '--tail', '40', name], { stdio: 'inherit' })
} finally {
  if (env.SMOKE_KEEP === '1') {
    log(`kept: containers ${started.join(', ')}, network ${network}, data in ${tmp}`)
  } else {
    for (const name of started) spawnSync('docker', ['rm', '--force', name], { stdio: 'ignore' })
    if (networkCreated) spawnSync('docker', ['network', 'rm', network], { stdio: 'ignore' })
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
process.exit(exitCode)
