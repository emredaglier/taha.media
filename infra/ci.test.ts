// infra/ci.sh against a fake `docker` (no daemon, no registry), plus repo guards on the workflow
// (CODING_STANDARDS, "Repo guards"): they enforce ADR-0010's pipeline shape, not behaviour.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const script = path.resolve(import.meta.dirname, 'ci.sh')
const file = path.resolve(import.meta.dirname, '../.github/workflows/ci.yml')
const workflow = fs.readFileSync(file, 'utf8')
/** The workflow without comment lines, so a rule can't be satisfied by a comment. */
const text = workflow
  .split('\n')
  .filter((l) => !l.trim().startsWith('#'))
  .join('\n')

function ci(args: string[], env: Record<string, string> = {}) {
  // A clean environment: nothing from the developer's shell may satisfy a secret gate.
  const r = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
  })
  return { status: r.status, out: r.stdout + r.stderr }
}

const SHA = 'a'.repeat(40)
const upload = { R2_ACCOUNT_ID: 'a', R2_ASSETS_WRITE_KEY_ID: 'k', R2_ASSETS_WRITE_SECRET: 's' }
const deploy = {
  ...upload,
  DEPLOY_HOST: 'h',
  DEPLOY_USER: 'u',
  DEPLOY_SSH_KEY: 'key',
  DEPLOY_HOST_KEY: 'hostkey',
  TS_OAUTH_CLIENT_ID: 'i',
  TS_OAUTH_SECRET: 's',
}

// A fake `docker`: logs every call and answers `push` the way the real one ends its output.
const DIGEST = { web: 'a'.repeat(64), cms: 'b'.repeat(64), migrate: 'c'.repeat(64) }
function fakeDocker() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-docker-'))
  const log = path.join(dir, 'calls')
  fs.writeFileSync(
    path.join(dir, 'docker'),
    `#!/usr/bin/env bash
echo "$*" >>"${log}"
if [ "$1" = push ]; then
  case "$2" in
    */web:*) d=${DIGEST.web} ;; */cms:*) d=${DIGEST.cms} ;; */migrate:*) d=${DIGEST.migrate} ;;
  esac
  echo "The push refers to repository [\${2%:*}]"
  echo "\${2##*:}: digest: sha256:$d size: 1234"
fi
`,
    { mode: 0o755 },
  )
  // pnpm stands in for the smoke gate: records the variables it was started with.
  fs.writeFileSync(
    path.join(dir, 'pnpm'),
    `#!/usr/bin/env bash\necho "pnpm $* SMOKE_WEB_IMAGE=$SMOKE_WEB_IMAGE SMOKE_ASSET_PREFIX=$SMOKE_ASSET_PREFIX SMOKE_DEPLOYMENT_ID=$SMOKE_DEPLOYMENT_ID" >>"${log}"\nexit "\${FAKE_SMOKE_EXIT:-0}"\n`,
    { mode: 0o755 },
  )
  return {
    env: { PATH: `${dir}:${process.env.PATH ?? ''}` },
    calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []),
    done: () => fs.rmSync(dir, { recursive: true, force: true }),
  }
}

const P = 'ghcr.io/o/taha'
const registry = { IMAGE_PREFIX: P, GHCR_TOKEN: 't', GITHUB_ACTOR: 'a' }
const ref = (t: keyof typeof DIGEST) => `${P}/${t}@sha256:${DIGEST[t]}`
const images = { WEB_IMAGE: ref('web'), CMS_IMAGE: ref('cms'), MIGRATE_IMAGE: ref('migrate') }

describe('infra/ci.sh', () => {
  it('builds web, cms and migrate for linux/arm64, each tied to the release by its build args', () => {
    const docker = fakeDocker()
    try {
      const r = ci(['build', SHA], { IMAGE_PREFIX: P, ...docker.env })
      expect(r.status, r.out).toBe(0)
      const builds = docker.calls().filter((c) => c.startsWith('buildx build '))
      expect(builds).toHaveLength(3)
      for (const [i, t] of ['web', 'cms', 'migrate'].entries()) {
        expect(builds[i]).toContain('--platform linux/arm64 ')
        expect(builds[i]).toContain(`--target ${t} `)
        expect(builds[i]).toContain(
          `--build-arg ASSET_PREFIX=https://cdn.taha.media/releases/${SHA} --build-arg DEPLOYMENT_ID=${SHA}`,
        )
        expect(builds[i]).toMatch(new RegExp(`-t ${P}/${t}:${SHA} --load \\.$`))
      }
    } finally {
      docker.done()
    }
  })

  it('runs the smoke gate against the built web image with its prefix and deployment id, and fails with it', () => {
    const docker = fakeDocker()
    try {
      const ok = ci(['smoke', SHA], { IMAGE_PREFIX: P, ...docker.env })
      expect(ok.status, ok.out).toBe(0)
      expect(docker.calls()).toEqual([
        `pnpm smoke SMOKE_WEB_IMAGE=${P}/web:${SHA} SMOKE_ASSET_PREFIX=https://cdn.taha.media/releases/${SHA} SMOKE_DEPLOYMENT_ID=${SHA}`,
      ])
      expect(ci(['smoke', SHA], { ...docker.env, FAKE_SMOKE_EXIT: '1' }).status).not.toBe(0)
    } finally {
      docker.done()
    }
  })

  it('publish pushes the <sha> tags only and hands each pushed digest to the later jobs', () => {
    const docker = fakeDocker()
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ci-out-')), 'output')
    try {
      const r = ci(['publish', SHA], { ...registry, ...docker.env, GITHUB_OUTPUT: out })
      expect(r.status, r.out).toBe(0)
      expect(docker.calls().filter((c) => c.startsWith('push '))).toEqual([
        `push ${P}/web:${SHA}`,
        `push ${P}/cms:${SHA}`,
        `push ${P}/migrate:${SHA}`,
      ])
      expect(fs.readFileSync(out, 'utf8')).toBe(
        `web=${ref('web')}\ncms=${ref('cms')}\nmigrate=${ref('migrate')}\n`,
      )
    } finally {
      docker.done()
      fs.rmSync(path.dirname(out), { recursive: true, force: true })
    }
  })

  it('publish refuses without registry credentials', () => {
    const docker = fakeDocker()
    try {
      expect(ci(['publish', SHA], { IMAGE_PREFIX: P, ...docker.env }).status).not.toBe(0)
      expect(docker.calls().some((c) => c.startsWith('push '))).toBe(false)
    } finally {
      docker.done()
    }
  })

  it('push moves the main tags to the published digests, in the registry, without pulling', () => {
    const docker = fakeDocker()
    try {
      const r = ci(['push', SHA], { ...registry, ...images, ...docker.env })
      expect(r.status, r.out).toBe(0)
      expect(docker.calls().filter((c) => !c.startsWith('login '))).toEqual([
        `buildx imagetools create --prefer-index=false -t ${P}/web:main ${ref('web')}`,
        `buildx imagetools create --prefer-index=false -t ${P}/cms:main ${ref('cms')}`,
        `buildx imagetools create --prefer-index=false -t ${P}/migrate:main ${ref('migrate')}`,
      ])
    } finally {
      docker.done()
    }
  })

  it('push and upload refuse anything but a published digest of the right image', () => {
    const docker = fakeDocker()
    try {
      for (const env of [
        { ...images, CMS_IMAGE: '' },
        { ...images, WEB_IMAGE: `${P}/web:${SHA}` },
        { ...images, MIGRATE_IMAGE: ref('web') },
      ]) {
        expect(ci(['push', SHA], { ...registry, ...env, ...docker.env }).status).not.toBe(0)
      }
      for (const WEB_IMAGE of ['', `${P}/web:${SHA}`, ref('cms')]) {
        const r = ci(['upload', SHA], { ...registry, ...upload, WEB_IMAGE, ...docker.env })
        expect(r.status, WEB_IMAGE).not.toBe(0)
        expect(r.out, WEB_IMAGE).toContain('WEB_IMAGE')
      }
      expect(docker.calls()).toEqual([])
    } finally {
      docker.done()
    }
  })

  describe('secret gates: delivery waits for the owner, loudly', () => {
    it('upload is not ready while any R2 secret is missing, and says which, as a warning', () => {
      const none = ci(['gate', 'upload'])
      expect(none.status).toBe(0)
      expect(none.out).toContain('ready=false')
      expect(none.out).toMatch(/::warning.*R2_ACCOUNT_ID/)
      const partial = ci(['gate', 'upload'], { ...upload, R2_ASSETS_WRITE_SECRET: '' })
      expect(partial.out).toContain('ready=false')
      expect(partial.out).toContain('R2_ASSETS_WRITE_SECRET')
      expect(ci(['gate', 'upload'], upload).out).toContain('ready=true')
    })

    it('deploy needs the tailnet, SSH and R2 secrets together', () => {
      for (const key of Object.keys(deploy)) {
        const missing = ci(['gate', 'deploy'], { ...deploy, [key]: '' })
        expect(missing.out, key).toContain('ready=false')
      }
      expect(ci(['gate', 'deploy'], deploy).out).toContain('ready=true')
    })

    it('writes the result for GitHub Actions', () => {
      const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-')), 'output')
      try {
        ci(['gate', 'upload'], { GITHUB_OUTPUT: out })
        expect(fs.readFileSync(out, 'utf8')).toBe('ready=false\n')
      } finally {
        fs.rmSync(path.dirname(out), { recursive: true, force: true })
      }
    })
  })

  it('rejects an unknown gate and a release that is not a git sha', () => {
    expect(ci(['gate', 'nope']).status).toBe(1)
    expect(ci(['build', 'latest']).status).toBe(1)
    expect(ci(['smoke', 'main']).status).toBe(1)
    expect(ci(['deploy', '../x']).status).toBe(1)
  })

  it('upload, push and deploy refuse to run without their secrets', () => {
    for (const cmd of ['upload', 'push', 'deploy']) expect(ci([cmd, SHA]).status, cmd).not.toBe(0)
  })
})

describe('ci workflow (ADR-0010)', () => {
  const jobs = text.split(/^jobs:\n/m)[1] ?? ''
  const jobBlock = (name: string) =>
    new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  \\w[\\w-]*:\\n|(?![\\s\\S]))`, 'm').exec(
      jobs,
    )?.[1] ?? ''
  const steps = (job: string) =>
    jobBlock(job)
      .split(/^ {6}- /m)
      .slice(1)
  const onMain = /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/

  it('runs on pull requests and main, but not for changes only under docs/ or .scratch/', () => {
    expect(text).toMatch(/push:\s+branches: \[main\]/)
    expect(text).toMatch(/pull_request:/)
    expect(text.match(/- '!docs\/\*\*'/g)).toHaveLength(2)
    expect(text.match(/- '!\.scratch\/\*\*'/g)).toHaveLength(2)
  })

  it('check runs the same gate as a laptop (pnpm check) plus the workflow lint, and no browser', () => {
    const check = jobBlock('check')
    for (const step of ['pnpm lint', 'pnpm typecheck', 'pnpm test', 'pnpm build']) {
      expect(check).toContain(`run: ${step}`)
    }
    expect(check).toContain('run: infra/ci.sh lint-workflows')
    expect(check).not.toMatch(/playwright install|ms-playwright/)
  })

  it('has the jobs in delivery order, and nothing ships unless check and the smoke gate passed', () => {
    const order = ['check', 'build', 'upload', 'push', 'deploy']
    const at = order.map((n) => jobs.search(new RegExp(`^  ${n}:`, 'm')))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(jobBlock('check')).not.toMatch(/needs:/)
    expect(jobBlock('build')).not.toMatch(/needs:/)
    expect(jobBlock('upload')).toMatch(/needs: \[check, build\]/)
    expect(jobBlock('push')).toMatch(/needs: \[build, upload\]/)
    expect(jobBlock('deploy')).toMatch(/needs: \[push, upload\]/)
    for (const name of ['upload', 'push', 'deploy']) expect(jobBlock(name), name).toMatch(onMain)
    for (const name of ['check', 'build']) expect(jobBlock(name)).not.toMatch(/\n {4}if:/)
  })

  it('builds arm64 natively on the ARM runner, smoke-tests those images there, then publishes on main', () => {
    const build = jobBlock('build')
    expect(build).toMatch(/runs-on: ubuntu-24\.04-arm\n/)
    const at = ['infra/ci.sh build ', 'infra/ci.sh smoke ', 'infra/ci.sh publish '].map((s) =>
      build.indexOf(s),
    )
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    const publish = steps('build').find((s) => s.includes('infra/ci.sh publish ')) ?? ''
    expect(publish).toMatch(onMain)
    // The images reach later jobs through the registry, by digest, never as an artifact.
    expect(text).not.toMatch(/download-artifact/)
    for (const t of ['web', 'cms', 'migrate'])
      expect(build).toContain(`${t}: \${{ steps.publish.outputs.${t} }}`)
    expect(jobBlock('upload')).toContain('WEB_IMAGE: ${{ needs.build.outputs.web }}')
  })

  it('never skips or softens the smoke gate: no condition, no continue-on-error, no opt-out variable', () => {
    const smoke = steps('build').find((s) => s.includes('infra/ci.sh smoke ')) ?? ''
    expect(smoke).not.toBe('')
    expect(smoke).not.toMatch(/\bif:/)
    expect(smoke).not.toMatch(/continue-on-error/)
    expect(text).not.toMatch(/SMOKE_(REQUIRED|SKIP|OPTIONAL)/)
    // Only the failure report may be soft, so an exhausted artifact quota can't hide the failure.
    const soft = steps('build').filter((s) => s.includes('continue-on-error'))
    expect(soft).toHaveLength(1)
    expect(soft[0]).toMatch(/name: smoke-output/)
    expect(soft[0]).toMatch(/if: failure\(\)/)
  })

  it('gives the browser install its own short timeout (a hung apt mirror fails fast)', () => {
    const installs = steps('build').filter((s) => s.includes('playwright install'))
    expect(installs.length).toBeGreaterThan(0)
    for (const s of installs) expect(s).toMatch(/timeout-minutes: \d+/)
  })

  it('has least-privilege permissions', () => {
    expect(text).toMatch(/\npermissions:\n {2}contents: read\n/)
    for (const name of ['build', 'push']) expect(jobBlock(name), name).toMatch(/packages: write/)
    for (const name of ['upload', 'deploy']) {
      expect(jobBlock(name), name).toMatch(/packages: read/)
      expect(jobBlock(name), name).not.toMatch(/packages: write/)
    }
    expect(jobBlock('check')).not.toMatch(/permissions:/)
  })

  it('deploys one at a time, never cancelled midway, over the tailnet', () => {
    const d = jobBlock('deploy')
    expect(d).toMatch(/concurrency:\n {6}group: deploy\n {6}cancel-in-progress: false/)
    expect(d).toMatch(/uses: tailscale\/github-action@/)
    expect(d.indexOf('tailscale/github-action')).toBeLessThan(d.indexOf('infra/ci.sh deploy '))
  })

  it('gates delivery on the secrets with steps that skip, after the gate step', () => {
    for (const name of ['upload', 'deploy']) {
      const block = jobBlock(name)
      expect(block, name).toMatch(/run: infra\/ci\.sh gate /)
      const after = block.split(/run: infra\/ci\.sh gate [a-z]+\n/)[1] ?? ''
      const rest = after.split(/^ {6}- /m).slice(1)
      expect(rest.length, name).toBeGreaterThan(0)
      for (const step of rest)
        expect(step, step).toMatch(/if: steps\.gate\.outputs\.ready == 'true'/)
    }
  })

  it('is actionlint clean (when actionlint is installed)', () => {
    const r = spawnSync('actionlint', [file], { encoding: 'utf8' })
    if (r.error) return // `infra/ci.sh lint-workflows` lints the workflows in CI
    expect(r.stdout + r.stderr).toBe('')
    expect(r.status).toBe(0)
  })
})
