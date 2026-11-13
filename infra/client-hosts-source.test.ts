// The source half of the host allowlist (#80). The image builds with no database and every route is
// `force-dynamic`, so almost no HTML is prerendered: a `<script src>`, font `<link>`, iframe or
// preconnect written in a layout or page lives only in server code, which the scan of the built
// output cannot read. This scans `apps/web/src` itself against the same allowlist, in `pnpm test`,
// so CI's `check` job fails before the image is built.
//
// How `in:` scopes apply: they are regexes on a file's path with forward slashes, and the source
// scan matches them against the path of the source file (`.../apps/web/src/lib/site.ts`). The
// scopes written for built output (`/static/chunks/`, `/static/css/`) never
// match a source path, so they do not apply here; an entry without `in:` applies to both. A host
// that only our source needs gets its own entry, scoped to that file.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ALLOWLIST } from './client-hosts-allowlist.ts'
import { scanSource, type AllowedHost } from './client-hosts.ts'

const webSrc = path.resolve(import.meta.dirname, '../apps/web/src')

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taha-src-hosts-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const write = (rel: string, body: string) => {
  const file = path.join(dir, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body)
}
const hostsFound = (allowlist: readonly AllowedHost[] = []) =>
  scanSource(dir, allowlist).findings.map((f) => `${path.relative(dir, f.file)} ${f.host}`)

describe('the web app source', () => {
  it('names only allowlisted hosts (a layout or page that loads from elsewhere fails here)', () => {
    const { scanned, findings } = scanSource(webSrc, ALLOWLIST)
    expect(scanned).toBeGreaterThan(50)
    expect(
      findings.map((f) => `${path.relative(webSrc, f.file)}:${f.line} ${f.host}`),
      'add the host to infra/client-hosts-allowlist.ts with its reason, or remove the code',
    ).toEqual([])
  })

  it('reaches the hosts the site really uses: players, analytics beacon, own origin', () => {
    // The same scan with an empty allowlist lists them, so the test above cannot pass by scanning
    // the wrong folder or matching nothing.
    const hosts = new Set(scanSource(webSrc, []).findings.map((f) => f.host))
    for (const host of [
      'player.vimeo.com',
      'www.youtube-nocookie.com',
      'static.cloudflareinsights.com',
      'taha.media',
    ])
      expect(hosts, host).toContain(host)
  })
})

describe('the source scan', () => {
  it('fails a planted host in a layout, a page, a client component, a route and a stylesheet', () => {
    write(
      'app/layout.tsx',
      'export default () => <script src="https://tracker.example.net/a.js" />',
    )
    write(
      'app/page.tsx',
      'export default () => <link rel="preconnect" href="//fonts.example.org" />',
    )
    write('components/Player.tsx', 'const f = <iframe src="https://video.example.com/embed/1" />')
    write('app/robots.ts', 'export const u = "https://sitemap.example.io/x.xml"')
    write('app/globals.css', '@import url("https://fonts.example.net/css");')
    expect(hostsFound()).toEqual([
      'app/globals.css fonts.example.net',
      'app/layout.tsx tracker.example.net',
      'app/page.tsx fonts.example.org',
      'app/robots.ts sitemap.example.io',
      'components/Player.tsx video.example.com',
    ])
  })

  it('passes allowlisted hosts, and reports the line of a finding', () => {
    write(
      'app/layout.tsx',
      'const a = "https://cdn.taha.media/x"\n\nconst b = "https://tracker.example.net/x"\n',
    )
    const { findings } = scanSource(dir, ALLOWLIST)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ host: 'tracker.example.net', line: 3 })
  })

  it('does not scan tests, spec files, test helpers or fixtures, nor files of other types', () => {
    write('lib/a.test.ts', '"https://tracker.example.net/"')
    write('lib/a.test.tsx', '"https://tracker.example.net/"')
    write('lib/a.spec.ts', '"https://tracker.example.net/"')
    write('test/helper.ts', '"https://tracker.example.net/"')
    write('lib/__tests__/x.ts', '"https://tracker.example.net/"')
    write('lib/site-fixtures.ts', '"https://tracker.example.net/"')
    write('lib/fixtures/data.ts', '"https://tracker.example.net/"')
    write('lib/readme.md', 'https://tracker.example.net/')
    write('lib/data.json', '"https://tracker.example.net/"')
    write('lib/real.ts', '"https://taha.media/"')
    expect(scanSource(dir, []).scanned).toBe(1)
    expect(hostsFound(ALLOWLIST)).toEqual([])
  })

  it('applies an entry without `in:` and an entry scoped to the source file, not the build scopes', () => {
    write(
      'lib/site.ts',
      '"https://a.example.com/" "https://b.example.com/" "https://c.example.com/"',
    )
    write('lib/other.ts', '"https://b.example.com/"')
    const reason = 'A fixture host that is only named in a test.'
    const allowlist: AllowedHost[] = [
      { host: 'a.example.com', reason },
      { host: 'b.example.com', reason, in: /\/lib\/site\.ts$/ },
      // Scopes for built output never match a source path.
      { host: 'c.example.com', reason, in: /\/static\/chunks\// },
    ]
    expect(hostsFound(allowlist)).toEqual([
      'lib/other.ts b.example.com',
      'lib/site.ts c.example.com',
    ])
  })

  it('fails on a folder that does not exist or has no source, so a wrong path cannot pass', () => {
    expect(() => scanSource(path.join(dir, 'nope'), [])).toThrow(/not a folder/)
    expect(() => scanSource(dir, [])).toThrow(/no source files/)
  })
})
