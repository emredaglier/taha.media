import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

// The command line of `pnpm qa`, up to the point where it would seed or build. Every case here
// must stop before that: these tests never start Next, a build or a seed.
const root = path.resolve(import.meta.dirname, '../..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-cli-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const qa = (...args: string[]) =>
  spawnSync(process.execPath, ['scripts/qa/qa.ts', ...args], { cwd: root, encoding: 'utf8' })

function spawnAsync(args: string[]): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/qa/qa.ts', ...args], { cwd: root })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('exit', (status) => resolve({ status, stderr }))
  })
}

describe('pnpm qa', () => {
  it('is wired in the root package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    expect(pkg.scripts.qa).toBe('node scripts/qa/qa.ts')
  })

  it('--help prints the usage and exits 0', () => {
    const result = qa('--help')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Usage: pnpm qa')
    expect(result.stdout).toContain('--reuse')
  })

  it('an unknown option exits 2 with the usage', () => {
    const result = qa('--nope')
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Unknown option "--nope"')
    expect(result.stderr).toContain('Usage: pnpm qa')
  })

  it('--reuse on a folder without a database exits 2', () => {
    const result = qa('--reuse', '--dir', path.join(tmp, 'nothing-here'))
    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/no qa\.db/)
  })

  it('refuses a fresh run over a folder that is not a QA folder', () => {
    const other = path.join(tmp, 'other')
    fs.mkdirSync(other)
    fs.writeFileSync(path.join(other, 'notes.txt'), 'mine')
    const result = qa('--dir', other)
    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/not a QA folder/)
    expect(fs.readFileSync(path.join(other, 'notes.txt'), 'utf8')).toBe('mine')
  })

  it('refuses to run when a port is taken and names the process holding it', async () => {
    const dir = path.join(tmp, 'reuse')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'qa.db'), '')
    const holder = net.createServer()
    const port = await new Promise<number>((resolve) =>
      holder.listen(0, '127.0.0.1', () => resolve((holder.address() as AddressInfo).port)),
    )
    try {
      // Not spawnSync: that would block this event loop, and the child must connect to the holder.
      const result = await spawnAsync(['--reuse', '--dir', dir, '--web-port', String(port)])
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(`The web port 127.0.0.1:${port} is in use`)
      expect(result.stderr).toContain('--web-port')
    } finally {
      await new Promise((resolve) => holder.close(resolve))
    }
  })
})
