// infra/runner/runner.sh and entrypoint.sh against fakes (no Docker, no GitHub): who empties the
// shared work folder between jobs (#87). Never the Mac side: Docker Desktop's VM caches what it has
// seen of the shared folder, a folder the Mac deletes can still look present to the next container,
// and that job then fails in Set up job ("Could not find file '.../_work/_PipelineMapping/<owner>'").
// The container empties it, inside the VM, before it registers.
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
  it('empties the work folder (keeping the tool cache) and TMPDIR before it registers', () => {
    sb = sandbox('runner-entry-')
    const home = sb.path('home')
    const install = sb.path('opt-runner')
    leaveJob(home)
    sb.fake('sudo', '#!/bin/sh\nexec "$@"\n')
    fs.mkdirSync(install)
    // The runner's own scripts: config.sh records what the folders hold when it registers.
    fs.writeFileSync(
      path.join(install, 'config.sh'),
      `#!/bin/sh\necho "config $*" >>"${sb.path('calls')}"\nfind "${home}" -type f | sort >"${sb.path('at-config')}"\n`,
      { mode: 0o755 },
    )
    fs.writeFileSync(
      path.join(install, 'run.sh'),
      `#!/bin/sh\necho run >>"${sb.path('calls')}"\n`,
      {
        mode: 0o755,
      },
    )

    const r = spawnSync('bash', [entrypoint], {
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
      },
    })

    expect(r.status, r.stderr).toBe(0)
    expect(sb.calls('at-config')).toEqual([
      path.join(home, '_work/_tool/node/24.0.0/arm64/bin/node'),
    ])
    expect(fs.readdirSync(path.join(home, 'tmp'))).toEqual([])
    expect(sb.calls()).toEqual([
      expect.stringMatching(new RegExp(`^config .*--work ${home}/_work( |$)`)),
      'run',
    ])
    expect(filesUnder(path.join(home, '_work'))).toEqual(['_tool/node/24.0.0/arm64/bin/node'])
  })
})
