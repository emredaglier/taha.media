// infra/assets.sh against the S3 stub and a fake `docker` on PATH (no Docker, no R2).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { startS3Stub } from './s3-stub.ts'

const script = path.resolve(import.meta.dirname, 'assets.sh')

// `create` prints a container id; `cp <ctr>:<path>/. <dest>` writes a built .next/static there,
// as the real image would hold it; every call is logged.
const fakeDocker = `#!/usr/bin/env bash
echo "$*" >>"$FAKE_DIR/calls"
case "$1" in
  create) echo ctr123 ;;
  cp)
    [[ -n "\${FAKE_EMPTY_IMAGE:-}" ]] && exit 1
    mkdir -p "$3/chunks" "$3/css"
    echo 'console.log(1)' >"$3/chunks/main-abc.js"
    echo 'body{}' >"$3/css/app-abc.css" ;;
esac
exit 0
`

let stub: Awaited<ReturnType<typeof startS3Stub>>
let dir: string
beforeEach(async () => {
  stub = await startS3Stub()
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-test-'))
  fs.mkdirSync(`${dir}/bin`)
  fs.writeFileSync(`${dir}/bin/docker`, fakeDocker, { mode: 0o755 })
  fs.writeFileSync(`${dir}/calls`, '')
})
afterEach(async () => {
  await stub.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

const run = (args: string[], env: Record<string, string> = {}) =>
  new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn('bash', [script, ...args], {
      env: {
        PATH: `${dir}/bin:${process.env.PATH ?? ''}`,
        FAKE_DIR: dir,
        S3_ENDPOINT: stub.endpoint,
        S3_BUCKET: 'bucket',
        S3_ACCESS_KEY_ID: 'k',
        S3_SECRET_ACCESS_KEY: 's',
        S3_FORCE_PATH_STYLE: 'true',
        ...env,
      },
    })
    let out = ''
    child.stdout.on('data', (d: Buffer) => (out += d))
    child.stderr.on('data', (d: Buffer) => (out += d))
    child.on('close', (code) => resolve({ code, out }))
  })
const calls = () => fs.readFileSync(`${dir}/calls`, 'utf8').trim().split('\n').filter(Boolean)

describe('infra/assets.sh', () => {
  it('prints the build args that tie the image to its release: CDN prefix and deployment id', async () => {
    const { code, out } = await run(['build-args', 'abc123'])
    expect(code).toBe(0)
    expect(out.trim()).toBe(
      '--build-arg ASSET_PREFIX=https://cdn.taha.media/releases/abc123 --build-arg DEPLOYMENT_ID=abc123',
    )
  })

  it('copies /_next/static out of the arm64 web image and uploads it under the release', async () => {
    const { code, out } = await run(['upload', 'ghcr.io/o/taha/web@sha256:abc', 'abc123'])
    expect(code, out).toBe(0)
    expect(calls()[0]).toBe('create --platform linux/arm64 ghcr.io/o/taha/web@sha256:abc')
    expect(calls()[1]).toMatch(/^cp ctr123:\/app\/apps\/web\/\.next\/static\/\. /)
    expect(calls().at(-1)).toBe('rm -f ctr123')
    const chunk = stub.objects.get('releases/abc123/_next/static/chunks/main-abc.js')
    expect(chunk?.body.toString()).toBe('console.log(1)\n')
    expect(chunk?.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(stub.objects.has('releases/abc123/_next/static/css/app-abc.css')).toBe(true)
    expect(stub.requests.some((r) => r.method === 'DELETE')).toBe(false)
  })

  it('fails, and uploads nothing, when the image has no static files', async () => {
    const { code } = await run(['upload', 'img', 'abc123'], { FAKE_EMPTY_IMAGE: '1' })
    expect(code).not.toBe(0)
    expect(stub.objects.size).toBe(0)
    expect(calls().at(-1)).toBe('rm -f ctr123')
  })

  it('prune deletes releases past 30 days but keeps the given live ones', async () => {
    const old = new Date(Date.now() - 40 * 86_400_000)
    for (const name of ['gone', 'live']) {
      stub.objects.set(`releases/${name}/_next/static/a.js`, {
        body: Buffer.from('x'),
        headers: {},
        lastModified: old,
      })
    }
    const { code, out } = await run(['prune', '--keep', 'live'])
    expect(code, out).toBe(0)
    expect(out).toContain('deleted: gone')
    expect([...stub.objects.keys()]).toEqual(['releases/live/_next/static/a.js'])
  })

  it('prune refuses to run without --keep', async () => {
    const { code, out } = await run(['prune', '--dry-run'])
    expect(code).not.toBe(0)
    expect(out).toMatch(/--keep/)
  })
})
