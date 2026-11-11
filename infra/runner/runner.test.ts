// infra/runner/runner.sh and entrypoint.sh against fakes (no Docker, no GitHub): who empties the
// shared work folder between jobs. Why: infra/README.md, "A clean work folder per job" (#87).
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { sandbox, type Sandbox } from '../test-helpers.ts'

const runnerSh = path.resolve(import.meta.dirname, 'runner.sh')
const entrypoint = path.resolve(import.meta.dirname, 'entrypoint.sh')

/** What a finished job leaves in the shared folder: its bookkeeping, checkout, tool cache, temp. */
const LEFTOVERS = [
  '_work/_PipelineMapping/emredaglier/taha.media/PipelineFolder.json',
  '_work/taha.media/taha.media/package.json',
  '_work/_tool/node/24.0.0/arm64/bin/node',
  'tmp/taha-smoke-1/data.db',
]

function leaveJob(home: string) {
  for (const file of LEFTOVERS) {
    fs.mkdirSync(path.dirname(path.join(home, file)), { recursive: true })
    fs.writeFileSync(path.join(home, file), 'x')
  }
}

/** Every file under `dir`, relative to it, sorted. */
function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)))
    .sort()
}

let sb: Sandbox
afterEach(() => sb.remove())

describe('runner.sh', () => {
  it('leaves the work folder to the container: the Mac side deletes nothing in it between jobs', () => {
    sb = sandbox('runner-loop-')
    const home = sb.path('home')
    leaveJob(home)
    sb.fake('gh', '#!/bin/sh\necho reg-token\n')
    // The container: logs its arguments and what the shared folder holds when it starts.
    sb.fake(
      'docker',
      `#!/bin/sh\necho "$*" >>"${sb.path('calls')}"\n[ "$1" = run ] && find "${home}" -type f | sort >"${sb.path('at-start')}"\nexit 0\n`,
    )
    // One turn: the loop's pause between containers stops it (its trap exits 0).
    sb.fake('sleep', '#!/bin/sh\nkill -TERM "$PPID"\n')

    const r = spawnSync('bash', [runnerSh, 'run'], {
      encoding: 'utf8',
      env: { PATH: sb.PATH, HOME: sb.dir, CI_RUNNER_HOME: home },
    })

    expect(r.status, r.stderr).toBe(0)
    const runs = sb.calls().filter((c) => c.startsWith('run '))
    expect(runs).toHaveLength(1)
    expect(runs[0]).toContain(`--volume ${home}:${home}`)
    expect(runs[0]).toContain(`--env RUNNER_WORKDIR=${home}`)
    expect(sb.calls('at-start')).toEqual(LEFTOVERS.map((f) => path.join(home, f)).sort())
  })
})

describe('entrypoint.sh', () => {
  /** What the fake `sudo` does after logging `sudo <args>`. `logs-only` never runs the command. */
  const SUDO = {
    runs: 'exec "$@"',
    'find-fails': '[ "$1" = find ] && exit 1\nexec "$@"',
    'logs-only': 'exit 0',
  }

  /**
   * A container start after a job: the runner's own scripts are fakes, and config.sh records what
   * the shared folder holds when it registers.
   */
  function container(sudo: keyof typeof SUDO) {
    sb = sandbox('runner-entry-')
    const home = sb.path('home')
    const install = sb.path('opt-runner')
    leaveJob(home)
    sb.fake('sudo', `#!/bin/sh\necho "sudo $*" >>"${sb.path('calls')}"\n${SUDO[sudo]}\n`)
    fs.mkdirSync(install)
    fs.writeFileSync(
      path.join(install, 'config.sh'),
      `#!/bin/sh\necho "config $*" >>"${sb.path('calls')}"\nfind "${home}" -type f | sort >"${sb.path('at-config')}"\n`,
      { mode: 0o755 },
    )
    fs.writeFileSync(
      path.join(install, 'run.sh'),
      `#!/bin/sh\necho run >>"${sb.path('calls')}"\n`,
      { mode: 0o755 },
    )
    const start = (env: Record<string, string> = {}) =>
      spawnSync('bash', [entrypoint], {
        encoding: 'utf8',
        env: {
          PATH: sb.PATH,
          REG_TOKEN: 'reg-token',
          REPO_URL: 'https://github.com/emredaglier/taha.media',
          RUNNER_NAME: 'taha-mac',
          RUNNER_LABELS: 'taha-mac-arm64',
          RUNNER_WORKDIR: home,
          TMPDIR: path.join(home, 'tmp'),
          RUNNER_DIR: install,
          DOCKER_SOCKET: sb.path('no-socket'),
          ...env,
        },
      })
    return { home, start }
  }

  it('empties the work folder (keeping the tool cache) and TMPDIR with sudo before it registers', () => {
    const { home, start } = container('runs')

    const r = start()

    expect(r.status, r.stderr).toBe(0)
    expect(sb.calls('at-config')).toEqual([
      path.join(home, '_work/_tool/node/24.0.0/arm64/bin/node'),
    ])
    expect(fs.readdirSync(path.join(home, 'tmp'))).toEqual([])
    const calls = sb.calls()
    expect(calls.slice(0, 2).map((c) => c.split(' ').slice(0, 3).join(' '))).toEqual([
      `sudo find ${path.join(home, '_work')}`,
      `sudo find ${path.join(home, 'tmp')}`,
    ])
    expect(calls.slice(2)).toHaveLength(2)
    expect(calls[2]).toMatch(/^config /)
    expect(calls[2]).toContain(`--work ${home}/_work`)
    expect(calls[3]).toBe('run')
  })

  it('still registers when a delete fails, and says so', () => {
    const { start } = container('find-fails')

    const r = start()

    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr.match(/entrypoint\.sh: could not fully empty /g)).toHaveLength(2)
    expect(sb.calls().filter((c) => !c.startsWith('sudo '))).toEqual([
      expect.stringMatching(/^config /),
      'run',
    ])
  })

  const UNSAFE: [string, (home: string) => Record<string, string>][] = [
    ['RUNNER_WORKDIR is /', () => ({ RUNNER_WORKDIR: '/', TMPDIR: '/tmp/runner-tmp' })],
    ['TMPDIR is /', () => ({ TMPDIR: '/' })],
    ['TMPDIR is RUNNER_WORKDIR itself', (home) => ({ TMPDIR: home })],
    ['TMPDIR is outside RUNNER_WORKDIR', (home) => ({ TMPDIR: path.dirname(home) })],
    ['TMPDIR climbs out with ..', (home) => ({ TMPDIR: `${home}/tmp/../..` })],
  ]
  it.each(UNSAFE)('refuses to start, deleting nothing, when %s', (_, unsafe) => {
    const { home, start } = container('logs-only')

    const r = start(unsafe(home))

    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/^entrypoint\.sh: /)
    expect(sb.calls()).toEqual([])
    expect(filesUnder(home)).toEqual([...LEFTOVERS].sort())
  })
})
