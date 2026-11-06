// infra/deploy.sh against a fake `docker` on PATH and the stub site (post-deploy check, CDN, media
// and alert webhook). No Docker, no R2, no network beyond 127.0.0.1.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { startSiteStub } from './site-stub.ts'
import { sandbox, type Sandbox } from './test-helpers.ts'

const script = path.resolve(import.meta.dirname, 'deploy.sh')

// Records every call as "RELEASE=<r> <args>". `up` makes RELEASE live (and tells the stub);
// FAKE_UNHEALTHY / FAKE_BAD_MIGRATE / FAKE_BAD_SNAPSHOT / FAKE_BAD_PULL list tags that fail that
// step; FAKE_STUCK keeps the old release serving after `up` (containers that never changed).
const fakeDocker = `#!/usr/bin/env bash
dir="$FAKE_DIR"
echo "RELEASE=\${RELEASE:-} $*" >>"$dir/calls"
has() { [[ " $1 " == *" $2 "* ]]; }
[[ "$1" == inspect ]] && { echo "ghcr.io/o/taha/web:$(cat "$dir/live")"; exit 0; }
[[ "$1" == compose ]] || exit 0
shift
case "$1" in
  config) printf 'migrate\\ncaddy\\nweb\\nweb-preview\\ncms\\nlitestream\\n' ;;
  ps)
    if [[ "$*" == *litestream* ]]; then [[ -n "\${FAKE_LITESTREAM:-}" ]] && echo ls123; exit 0; fi
    [[ -s "$dir/live" ]] && echo cid123 ;;
  exec)
    [[ "$*" == *"litestream sync"* && -n "\${FAKE_BAD_SYNC:-}" ]] && exit 1
    [[ "$*" == *"caddy reload"* && -n "\${FAKE_BAD_RELOAD:-}" ]] && exit 1
    exit 0 ;;
  pull) has "\${FAKE_BAD_PULL:-}" "$RELEASE" && exit 1; exit 0 ;;
  run)
    if [[ "$*" == *"--entrypoint node"* ]]; then
      has "\${FAKE_BAD_SNAPSHOT:-}" "$RELEASE" && exit 1
      exit 0
    fi
    has "\${FAKE_BAD_MIGRATE:-}" "$RELEASE" && { echo "migration boom" >&2; exit 1; }
    exit 0 ;;
  up)
    echo "$RELEASE" >"$dir/live"
    pwd >"$dir/up-cwd"
    if [[ -f caddy/Caddyfile ]]; then cat caddy/Caddyfile >"$dir/caddy-at-up"; fi
    has "\${FAKE_STUCK:-}" "$RELEASE" || curl -s -X PUT "$FAKE_STUB/__live/$RELEASE" >/dev/null
    has "\${FAKE_UNHEALTHY:-}" "$RELEASE" && { echo "container web is unhealthy" >&2; exit 1; }
    exit 0 ;;
esac
`

let site: Awaited<ReturnType<typeof startSiteStub>>
let sb: Sandbox
/** The sandbox directory: FAKE_DIR for the fake, and STATE_DIR, ENV_DIR and infra/ under it. */
let dir: string

const run = (args: string[], env: Record<string, string> = {}, from = script) =>
  new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn('bash', [from, ...args], {
      env: {
        PATH: sb.PATH,
        FAKE_DIR: dir,
        FAKE_STUB: site.base,
        STATE_DIR: `${dir}/state`,
        ENV_DIR: `${dir}/env`,
        SMOKE_URL: site.base,
        SMOKE_RESOLVE: '',
        SMOKE_INSECURE: '',
        SMOKE_HOME_WAIT: '0',
        SMOKE_ASSET_ORIGIN: site.base,
        SMOKE_MEDIA_ORIGIN: `${site.base}/media`,
        ALERT_WEBHOOK_URL: `${site.base}/hook`,
        ...env,
      },
    })
    let out = ''
    child.stdout.on('data', (d: Buffer) => (out += d))
    child.stderr.on('data', (d: Buffer) => (out += d))
    child.on('close', (code) => resolve({ code, out }))
  })

const calls = () => sb.calls()
const live = () => sb.read('live').trim()
const history = () => sb.calls('state/releases')
const ups = () => calls().filter((c) => / compose up /.test(c))
const migrations = (tag: string) =>
  calls().filter((c) => c.startsWith(`RELEASE=${tag} compose run --rm --no-deps -T migrate`))

beforeAll(async () => {
  site = await startSiteStub()
})
afterAll(async () => {
  await site.close()
})
beforeEach(() => {
  sb = sandbox('deploy-test-')
  dir = sb.dir
  fs.mkdirSync(`${dir}/env`)
  sb.fake('docker', fakeDocker)
  fs.writeFileSync(`${dir}/live`, '')
  site.reset()
  site.live.tag = 'none'
  site.live.broken.clear()
  site.hooks.length = 0
})
afterEach(() => {
  sb.remove()
})

describe('infra/deploy.sh', () => {
  it('deploys a good release in order: pull, DB copy, migrate, swap, check; records it', async () => {
    expect((await run(['deploy', 'v1'])).code).toBe(0)
    const { code, out } = await run(['deploy', 'v2'])
    expect(code, out).toBe(0)
    expect(out).toContain('v2 is live')
    const steps = calls()
      .filter((c) => c.startsWith('RELEASE=v2 compose '))
      .map((c) => c.split(' ')[2])
    expect(steps).toEqual(['pull', 'run', 'run', 'up'])
    expect(calls().find((c) => c.startsWith('RELEASE=v2 compose pull'))).toMatch(
      /pull --quiet migrate web cms$/,
    )
    const copy = calls().find((c) => c.startsWith('RELEASE=v2') && c.includes('SNAPSHOT_NAME='))
    expect(copy).toMatch(/SNAPSHOT_NAME=\d{8}T\d{6}Z-v1-to-v2 /)
    expect(ups().at(-1)).toMatch(/--wait .*--no-deps caddy web web-preview cms litestream/)
    expect(ups().at(-1)).not.toMatch(/migrate/)
    expect(history()).toEqual(['v1', 'v2'])
    // The post-deploy check saw this release's page, chunk, a Work and its R2 file.
    expect(out).toMatch(/ok +deployment id v2/)
    expect(out).toMatch(/ok +r2 file/)
    expect(site.hooks).toEqual([])
  })

  it('a failing smoke check rolls back to the previous release by itself and alerts', async () => {
    await run(['deploy', 'v1'])
    site.live.broken.add('v2')
    const { code, out } = await run(['deploy', 'v2'])
    expect(code).not.toBe(0)
    expect(ups().map((c) => c.split(' ')[0])).toEqual(['RELEASE=v1', 'RELEASE=v2', 'RELEASE=v1'])
    expect(live()).toBe('v1')
    expect(history()).toEqual(['v1'])
    // No second migration on the way back: migrations are additive (ADR-0003).
    expect(migrations('v1')).toHaveLength(1)
    expect(out).toContain('ALERT')
    expect(site.hooks).toHaveLength(1)
    const hook = site.hooks[0]!
    expect(hook.contentType).toBe('application/json')
    const body = JSON.parse(hook.body) as { text: string; content: string }
    expect(body.text).toMatch(/v2 failed .*Rolled back to v1/)
    expect(body.content).toBe(body.text)
  })

  it('a stale page after the swap (old deployment id still served) counts as a failed check', async () => {
    await run(['deploy', 'v1'])
    const { code, out } = await run(['deploy', 'v2'], { FAKE_STUCK: 'v2' })
    expect(code).not.toBe(0)
    expect(out).toMatch(/deployment id: home is release v1, expected v2/)
    expect(live()).toBe('v1')
    expect(history()).toEqual(['v1'])
    expect(site.hooks).toHaveLength(1)
  })

  it('rolls back when the new containers never get healthy', async () => {
    await run(['deploy', 'v1'])
    const { code } = await run(['deploy', 'v2'], { FAKE_UNHEALTHY: 'v2' })
    expect(code).not.toBe(0)
    expect(live()).toBe('v1')
    expect(site.hooks).toHaveLength(1)
  })

  it('says loudly when the rollback target fails too', async () => {
    await run(['deploy', 'v1'])
    site.live.broken.add('v1')
    site.live.broken.add('v2')
    const { code } = await run(['deploy', 'v2'])
    expect(code).not.toBe(0)
    expect(site.hooks[0]?.body).toMatch(/ALSO fails/)
  })

  it('a failing migration stops before any swap, leaves the old release running and alerts', async () => {
    await run(['deploy', 'v1'])
    const { code, out } = await run(['deploy', 'v2'], { FAKE_BAD_MIGRATE: 'v2' })
    expect(code).not.toBe(0)
    expect(ups()).toHaveLength(1) // only v1's
    expect(live()).toBe('v1')
    expect(history()).toEqual(['v1'])
    expect(out).toMatch(/migrations of v2 failed/)
    expect(site.hooks).toHaveLength(1)
    expect(site.hooks[0]?.body).toMatch(/migrations of v2 failed.*v1 is still live/)
  })

  it('a failing pull or pre-migration copy stops before the migration', async () => {
    await run(['deploy', 'v1'])
    expect((await run(['deploy', 'v2'], { FAKE_BAD_PULL: 'v2' })).code).not.toBe(0)
    expect((await run(['deploy', 'v2'], { FAKE_BAD_SNAPSHOT: 'v2' })).code).not.toBe(0)
    expect(migrations('v2')).toHaveLength(0)
    expect(ups()).toHaveLength(1)
    expect(site.hooks).toHaveLength(2)
  })

  it('the first deploy has nothing to roll back to and says so', async () => {
    site.live.broken.add('v1')
    const { code } = await run(['deploy', 'v1'])
    expect(code).not.toBe(0)
    expect(site.hooks[0]?.body).toMatch(/no previous release/)
  })

  it('takes the live tag from the running container when no history exists yet', async () => {
    fs.writeFileSync(`${dir}/live`, 'manual1\n')
    site.live.broken.add('v2')
    await run(['deploy', 'v2'])
    expect(live()).toBe('manual1')
  })

  it('manual rollback goes back one release without migrating, and again', async () => {
    for (const t of ['v1', 'v2', 'v3']) await run(['deploy', t])
    expect((await run(['rollback'])).code).toBe(0)
    expect(live()).toBe('v2')
    expect(history()).toEqual(['v1', 'v2'])
    expect(migrations('v2')).toHaveLength(1)
    expect((await run(['rollback'])).code).toBe(0)
    expect(live()).toBe('v1')
    expect((await run(['rollback'])).code).not.toBe(0)
  })

  it('a manual rollback whose target fails goes back to the current release and alerts', async () => {
    for (const t of ['v1', 'v2']) await run(['deploy', t])
    site.live.broken.add('v1')
    const { code } = await run(['rollback'])
    expect(code).not.toBe(0)
    expect(live()).toBe('v2')
    expect(history()).toEqual(['v1', 'v2'])
    expect(site.hooks).toHaveLength(1)
  })

  it('live-releases lists the previous live and the live release, never a rolled-back one', async () => {
    await run(['deploy', 'A'])
    site.live.broken.add('B')
    await run(['deploy', 'B'])
    await run(['deploy', 'C'])
    expect((await run(['live-releases'])).out.trim().split('\n')).toEqual(['A', 'C'])
  })

  it('refuses to run while another deploy holds the lock, and takes over a stale lock', async () => {
    fs.mkdirSync(`${dir}/state/deploy.lock`, { recursive: true })
    fs.writeFileSync(`${dir}/state/deploy.lock/pid`, String(process.pid))
    const busy = await run(['deploy', 'v1'])
    expect(busy.code).not.toBe(0)
    expect(busy.out).toMatch(/another deploy is running/)
    expect(ups()).toHaveLength(0)

    fs.writeFileSync(`${dir}/state/deploy.lock/pid`, '999999')
    expect((await run(['deploy', 'v1'])).code).toBe(0)
    expect(fs.existsSync(`${dir}/state/deploy.lock`)).toBe(false)
  })

  it('rejects a bad tag and an unknown command', async () => {
    expect((await run(['deploy', '../x'])).code).not.toBe(0)
    expect((await run(['deploy'])).code).not.toBe(0)
    expect((await run(['nope'])).code).not.toBe(0)
    expect(calls()).toEqual([])
  })

  it('without a webhook URL the alert is only logged, loudly', async () => {
    await run(['deploy', 'v1'])
    const { code, out } = await run(['deploy', 'v2'], {
      ALERT_WEBHOOK_URL: '',
      FAKE_BAD_MIGRATE: 'v2',
    })
    expect(code).not.toBe(0)
    expect(out).toMatch(/ALERT_WEBHOOK_URL is not set/)
    expect(site.hooks).toEqual([])
  })

  it('reads deploy.env and can send a plain-text alert (ntfy)', async () => {
    await run(['deploy', 'v1'])
    fs.writeFileSync(
      `${dir}/env/deploy.env`,
      `ALERT_WEBHOOK_URL=${site.base}/hook\nALERT_WEBHOOK_FORMAT=text\n`,
    )
    await run(['deploy', 'v2'], { ALERT_WEBHOOK_URL: '', FAKE_BAD_MIGRATE: 'v2' })
    expect(site.hooks).toHaveLength(1)
    expect(site.hooks[0]?.contentType).toMatch(/^text\/plain/)
    expect(site.hooks[0]?.body).toMatch(/^taha\.media deploy on .*migrations of v2 failed/)
  })

  it('skips the pull with DEPLOY_PULL=0 (a manual roll-forward with images already on the server)', async () => {
    await run(['deploy', 'v1'], { DEPLOY_PULL: '0' })
    expect(calls().some((c) => c.includes(' pull '))).toBe(false)
  })

  describe('Litestream', () => {
    it('flushes the off-site replica before migrating when Litestream runs', async () => {
      await run(['deploy', 'v1'])
      const { code, out } = await run(['deploy', 'v2'], { FAKE_LITESTREAM: '1' })
      expect(code).toBe(0)
      const c = calls()
      const sync = c.findIndex((l) => l.includes('exec -T litestream litestream sync -wait'))
      const migrate = c.findIndex((l) =>
        l.startsWith('RELEASE=v2 compose run --rm --no-deps -T migrate'),
      )
      expect(sync).toBeGreaterThan(-1)
      expect(sync).toBeLessThan(migrate)
      expect(out).toMatch(/restore point .*-timestamp \d{4}-\d\d-\d\dT/)
    })

    it('a failed flush stops before the migration, nothing swapped', async () => {
      await run(['deploy', 'v1'])
      const { code, out } = await run(['deploy', 'v2'], {
        FAKE_LITESTREAM: '1',
        FAKE_BAD_SYNC: '1',
      })
      expect(code).not.toBe(0)
      expect(migrations('v2')).toHaveLength(0)
      expect(ups()).toHaveLength(1)
      expect(out).toMatch(/Litestream sync failed/)
      expect(site.hooks).toHaveLength(1)
    })

    it('without a running Litestream (first deploy) it carries on with a notice', async () => {
      const { code, out } = await run(['deploy', 'v1'])
      expect(code).toBe(0)
      expect(out).toMatch(/NOTICE.*litestream is not running/i)
    })
  })

  describe('versioned config (each release keeps its own infra/ folder)', () => {
    const infra = () => `${dir}/infra`
    const releaseScript = (tag: string) => `${infra()}/releases/${tag}/deploy.sh`
    const liveFile = (rel: string) => fs.readFileSync(`${infra()}/live/${rel}`, 'utf8')
    const at = (tag: string, args: string[], env: Record<string, string> = {}) =>
      run(args, env, releaseScript(tag))

    // What CI ships: the scripts plus a compose file and Caddy config marked per release.
    const ship = (tag: string, caddy: string) => {
      const root = `${infra()}/releases/${tag}`
      fs.mkdirSync(`${root}/caddy`, { recursive: true })
      fs.mkdirSync(`${root}/litestream`, { recursive: true })
      for (const f of ['deploy.sh', 'smoke.sh', 'litestream/snapshot.sh']) {
        fs.copyFileSync(path.resolve(import.meta.dirname, f), `${root}/${f}`)
        fs.chmodSync(`${root}/${f}`, 0o755)
      }
      fs.writeFileSync(`${root}/compose.yaml`, `# compose of ${tag}\n`)
      fs.writeFileSync(`${root}/caddy/Caddyfile`, caddy)
      fs.writeFileSync(`${root}/litestream/litestream.yml`, 'dbs: []\n')
    }
    const reloads = () => calls().filter((c) => c.includes('exec -T caddy caddy reload'))

    it('runs the services from live/ with the deployed release config', async () => {
      ship('v1', 'caddy one\n')
      expect((await at('v1', ['deploy', 'v1'])).code).toBe(0)
      expect(fs.realpathSync(fs.readFileSync(`${dir}/up-cwd`, 'utf8').trim())).toBe(
        fs.realpathSync(`${infra()}/live`),
      )
      expect(liveFile('compose.yaml')).toBe('# compose of v1\n')
      ship('v2', 'caddy two\n')
      expect((await at('v2', ['deploy', 'v2'])).code).toBe(0)
      expect(liveFile('caddy/Caddyfile')).toBe('caddy two\n')
      expect(reloads().length).toBeGreaterThan(0)
    })

    it('an automatic rollback brings back the previous release config', async () => {
      ship('v1', 'caddy one\n')
      await at('v1', ['deploy', 'v1'])
      ship('v2', 'caddy two\n')
      site.live.broken.add('v2')
      const { code } = await at('v2', ['deploy', 'v2'])
      expect(code).not.toBe(0)
      expect(live()).toBe('v1')
      expect(liveFile('compose.yaml')).toBe('# compose of v1\n')
      expect(fs.readFileSync(`${dir}/caddy-at-up`, 'utf8')).toBe('caddy one\n')
    })

    it('a manual rollback from live/ restores the previous config too', async () => {
      ship('v1', 'one\n')
      await at('v1', ['deploy', 'v1'])
      ship('v2', 'two\n')
      await at('v2', ['deploy', 'v2'])
      const { code } = await run(['rollback'], {}, `${infra()}/live/deploy.sh`)
      expect(code).toBe(0)
      expect(live()).toBe('v1')
      expect(liveFile('caddy/Caddyfile')).toBe('one\n')
    })

    it('drops config folders of releases that are not in the history', async () => {
      ship('v1', 'one\n')
      await at('v1', ['deploy', 'v1'])
      ship('bad', 'bad\n')
      site.live.broken.add('bad')
      await at('bad', ['deploy', 'bad'])
      ship('v2', 'two\n')
      expect((await at('v2', ['deploy', 'v2'])).code).toBe(0)
      expect(fs.readdirSync(`${infra()}/releases`).sort()).toEqual(['v1', 'v2'])
    })
  })
})
