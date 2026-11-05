// infra/smoke.sh (the post-deploy check) against the stub site. No network beyond 127.0.0.1.
import { spawn } from 'node:child_process'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { startSiteStub } from './site-stub.ts'

const script = path.resolve(import.meta.dirname, 'smoke.sh')

let site: Awaited<ReturnType<typeof startSiteStub>>

const smoke = (env: Record<string, string> = {}) =>
  new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn('bash', [script, site.base], {
      env: {
        PATH: process.env.PATH ?? '',
        SMOKE_HOME_WAIT: '1',
        SMOKE_RELEASE: 'r1',
        SMOKE_ASSET_ORIGIN: site.base,
        SMOKE_MEDIA_ORIGIN: `${site.base}/media`,
        ...env,
      },
    })
    let out = ''
    child.stdout.on('data', (d: Buffer) => (out += d))
    child.stderr.on('data', (d: Buffer) => (out += d))
    child.on('close', (code) => resolve({ code, out }))
  })

beforeAll(async () => {
  site = await startSiteStub()
})
afterAll(async () => {
  await site.close()
})
beforeEach(() => {
  site.reset()
  site.live.tag = 'r1'
  site.live.broken.clear()
  site.hits.length = 0
})

describe('infra/smoke.sh', () => {
  it('passes after checking home, one static chunk, one Work and one R2 file', async () => {
    const { code, out } = await smoke()
    expect(out).toContain('smoke passed')
    expect(code).toBe(0)
    expect(site.hits).toEqual(
      expect.arrayContaining([
        '/',
        '/releases/r1/_next/static/chunks/main.js',
        '/isler/ornek-is',
        '/media/ornek-1a2b-small.webp',
      ]),
    )
  })

  it('fails when home does not answer 200', async () => {
    site.live.broken.add('r1')
    const { code, out } = await smoke()
    expect(code).not.toBe(0)
    expect(out).toMatch(/FAIL.*home/i)
  })

  describe('deployment id: a stale tab reloads cleanly only if the page names its release', () => {
    it('fails when the live page still belongs to another release (the swap did not happen)', async () => {
      site.live.stale = 'r0'
      const { code, out } = await smoke()
      expect(code).not.toBe(0)
      expect(out).toMatch(/FAIL.*deployment id.*r0.*r1/i)
    })

    it('fails when the page carries no deployment id at all', async () => {
      site.routes.set('/', {
        status: 200,
        type: 'text/html',
        body: site.home('r1').replace(' data-dpl-id="r1"', ''),
      })
      const { code, out } = await smoke()
      expect(code).not.toBe(0)
      expect(out).toMatch(/FAIL.*deployment id/i)
    })

    it('fails when chunks are not under this release on the CDN, or lack ?dpl=', async () => {
      const local = site.home('r1').replaceAll(`${site.base}/releases/r1`, '')
      site.routes.set('/', { status: 200, type: 'text/html', body: local })
      expect((await smoke()).out).toMatch(/FAIL.*chunk.*not under/i)

      const noDpl = site.home('r1').replaceAll('?dpl=r1', '')
      site.routes.set('/', { status: 200, type: 'text/html', body: noDpl })
      const { code, out } = await smoke()
      expect(code).not.toBe(0)
      expect(out).toMatch(/FAIL.*chunk.*dpl/i)
    })
  })

  it('fails when the static chunk is missing on the CDN (upload did not happen)', async () => {
    site.routes.set('/releases/r1/_next/static/chunks/main.js', { status: 404 })
    const { code, out } = await smoke()
    expect(code).not.toBe(0)
    expect(out).toMatch(/FAIL.*chunk.*404/i)
  })

  it('fails when the chunk answers with HTML instead of JavaScript', async () => {
    site.routes.set('/releases/r1/_next/static/chunks/main.js', {
      status: 200,
      type: 'text/html',
      body: '<html>',
    })
    const { code, out } = await smoke()
    expect(code).not.toBe(0)
    expect(out).toMatch(/FAIL.*chunk.*content type/i)
  })

  it('fails when the Work page does not answer 200', async () => {
    site.routes.set('/isler/ornek-is', { status: 500 })
    const { code, out } = await smoke()
    expect(code).not.toBe(0)
    expect(out).toMatch(/FAIL.*work/i)
  })

  it('fails when the R2 file is missing, or the Work page shows no media from R2', async () => {
    site.routes.set('/media/ornek-1a2b-small.webp', { status: 404 })
    expect((await smoke()).out).toMatch(/FAIL.*r2 file.*404/i)

    site.reset()
    site.routes.set('/isler/ornek-is', { status: 200, type: 'text/html', body: '<main>x</main>' })
    const { code, out } = await smoke()
    expect(code).not.toBe(0)
    expect(out).toMatch(/FAIL.*r2 file/i)
  })

  it('finds a Work through the /isler index when home links none', async () => {
    site.routes.set('/', {
      status: 200,
      type: 'text/html',
      body: site.home('r1').replace(/<a href="\/isler\/ornek-is">[^<]*<\/a>/, ''),
    })
    const { code } = await smoke()
    expect(code).toBe(0)
    expect(site.hits).toContain('/isler')
    expect(site.hits).toContain('/isler/ornek-is')
  })

  it('skips the Work and R2 checks with a notice while no Work is published (launch)', async () => {
    site.noWorks()
    const { code, out } = await smoke()
    expect(code).toBe(0)
    expect(out).toMatch(/NOTICE.*no Work/i)
    expect(site.hits).not.toContain('/media/ornek-1a2b-small.webp')
  })
})
