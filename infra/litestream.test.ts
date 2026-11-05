import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { loadCompose } from './compose-config'
import { read, sandbox, type Sandbox } from './test-helpers.ts'

// Seam 3: Litestream's config, and the restore and snapshot scripts run against a fake `docker`
// (no Docker, no R2). The real replicate-and-restore round trip is infra/litestream/drill.sh.
const dir = (file: string) => path.resolve(import.meta.dirname, 'litestream', file)
const config = parse(read('infra/litestream/litestream.yml')) as {
  socket?: { enabled?: boolean; path?: string }
  snapshot?: { interval?: string; retention?: string }
  dbs: {
    path: string
    replica: Record<string, string | boolean>
  }[]
}

describe('litestream.yml', () => {
  const db = config.dbs[0]!
  const replica = db.replica

  it('replicates the one database file that cms writes', () => {
    expect(config.dbs).toHaveLength(1)
    const compose = loadCompose('compose.yaml')
    expect(db.path).toBe(
      `/data/${path.basename(compose.services.cms?.environment?.DATABASE_PATH ?? '')}`,
    )
    expect(db.path).toBe(compose.services.cms?.environment?.DATABASE_PATH)
  })

  it('streams to an S3-compatible bucket (R2) with path-style requests', () => {
    expect(replica.type).toBe('s3')
    expect(replica['force-path-style']).toBe(true)
    // R2 wants a fixed region, "auto"; the local stand-in wants a real-looking one.
    expect(replica.region).toBe('${LITESTREAM_REGION}')
  })

  it('takes bucket, endpoint, region and credentials from the environment, never from the file', () => {
    for (const key of ['bucket', 'endpoint', 'region', 'access-key-id', 'secret-access-key']) {
      expect(String(replica[key]), key).toMatch(/^\$\{LITESTREAM_[A-Z_]+\}$/)
    }
    expect(JSON.stringify(config)).not.toMatch(/r2\.cloudflarestorage|AKIA/)
  })

  it('syncs every few seconds and keeps full snapshots for a week', () => {
    expect(replica['sync-interval']).toMatch(/^\d+s$/)
    expect(Number.parseInt(String(replica['sync-interval']), 10)).toBeLessThanOrEqual(10)
    expect(config.snapshot?.retention).toBe('168h')
  })

  it('opens the control socket where the compose health check and snapshot.sh expect it', () => {
    expect(config.socket?.enabled).toBe(true)
    const compose = loadCompose('compose.yaml')
    const tmpfs = (compose.services.litestream?.tmpfs as string[] | undefined) ?? []
    expect(tmpfs.some((t) => t.startsWith(path.dirname(config.socket?.path ?? '')))).toBe(true)
    expect(read('infra/litestream/snapshot.sh')).toContain(config.socket?.path ?? 'missing')
  })
})

describe('restore.sh and snapshot.sh', () => {
  let sb: Sandbox
  let work: string

  beforeEach(() => {
    sb = sandbox('litestream-test-')
    work = sb.dir
    // The fake docker records its arguments and, for `restore`, writes the database the real
    // container would have restored into the mounted folder.
    sb.fake(
      'docker',
      `#!/bin/bash
printf '%s\\n' "$*" >>"$FAKE_LOG"
mount=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-v" ]; then mount="\${arg%%:*}"; fi
  prev="$arg"
done
if [[ " $* " == *" restore "* && -n "$mount" && -z "$FAKE_RESTORE_FAILS" ]]; then
  printf 'SQLite format 3' >"$mount/taha.db"
fi
`,
    )
    sb.fake('chown', '#!/bin/bash\nexit 0\n')
  })
  afterEach(() => sb.remove())

  const run = (script: string, args: string[], env: Record<string, string> = {}) =>
    spawnSync('bash', [dir(script), ...args], {
      encoding: 'utf8',
      env: { PATH: sb.PATH, FAKE_LOG: sb.path('docker.log'), ...env },
    })
  const calls = () => sb.calls('docker.log')

  it('restores into an empty folder through the litestream service, as root, with the same config', () => {
    const target = path.join(work, 'restored')
    const result = run('restore.sh', ['-f', 'infra/compose.yaml', '--', target])
    expect(result.status, result.stderr).toBe(0)
    expect(calls()).toHaveLength(1)
    const [call] = calls()
    expect(call).toContain('compose -f infra/compose.yaml run --rm --no-deps --user root')
    expect(call).toContain(
      'litestream restore -config /etc/litestream/litestream.yml -o /restore/taha.db',
    )
    expect(call).toMatch(/\/data\/taha\.db$/)
    expect(fs.existsSync(path.join(target, 'taha.db'))).toBe(true)
    expect(result.stdout).toContain('taha.db')
  })

  it('passes extra restore flags through, such as a point in time', () => {
    const result = run('restore.sh', [
      '--',
      path.join(work, 'r'),
      '-timestamp',
      '2026-11-01T10:00:00Z',
    ])
    expect(result.status).toBe(0)
    expect(calls()[0]).toContain('-timestamp 2026-11-01T10:00:00Z')
  })

  it('refuses a folder that already holds files, so a live database is never overwritten', () => {
    const target = path.join(work, 'busy')
    fs.mkdirSync(target)
    fs.writeFileSync(path.join(target, 'taha.db'), 'live data')
    const result = run('restore.sh', ['--', target])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('not empty')
    expect(calls()).toEqual([])
    expect(fs.readFileSync(path.join(target, 'taha.db'), 'utf8')).toBe('live data')
  })

  it('reports a failed restore instead of pretending a database exists', () => {
    const result = run('restore.sh', ['--', path.join(work, 'none')], { FAKE_RESTORE_FAILS: '1' })
    expect(result.status).not.toBe(0)
  })

  it('snapshot.sh flushes through the control socket and waits, so a failed sync stops the deploy', () => {
    const result = run('snapshot.sh', ['-f', 'infra/compose.yaml'])
    expect(result.status, result.stderr).toBe(0)
    expect(calls()[0]).toBe(
      'compose -f infra/compose.yaml exec -T litestream litestream sync -wait -timeout 60 -socket /var/run/litestream/litestream.sock /data/taha.db',
    )
  })
})
