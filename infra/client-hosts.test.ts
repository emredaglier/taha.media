// The client-output host scanner (#80): fails the web build when a file the browser downloads names
// a host outside infra/client-hosts-allowlist.ts. It runs on a folder argument, so these tests feed
// it small fixture folders (no Next build). The Dockerfile step that runs it on a real build is
// pinned in dockerfile.test.ts.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ALLOWLIST } from './client-hosts-allowlist.ts'
import { allowlistProblems, extractHosts, scanFolders, type AllowedHost } from './client-hosts.ts'

const script = path.resolve(import.meta.dirname, 'client-hosts.ts')

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taha-hosts-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const write = (rel: string, body: string | Buffer) => {
  const file = path.join(dir, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body)
}
const cli = (...args: string[]) => {
  const run = spawnSync('node', [script, ...args], { encoding: 'utf8' })
  return { status: run.status, out: run.stdout + run.stderr }
}
const hostsOf = (text: string) => extractHosts(text).map((found) => found.host)

const allow = (host: string, extra: Partial<AllowedHost> = {}): AllowedHost => ({
  host,
  reason: 'A fixture host that is only named in a test.',
  ...extra,
})

describe('the command', () => {
  it('fails on the unpatched MediaPipe logging string and names the host, the file and the code around it', () => {
    write(
      'chunks/mediapipe.js',
      'function f(){return fetch("https://odml.pa.googleapis.com/v1/log",{method:"POST"})}',
    )
    const run = cli(dir)
    expect(run.status).toBe(1)
    expect(run.out).toContain('odml.pa.googleapis.com')
    expect(run.out).toContain(path.join(dir, 'chunks/mediapipe.js'))
    expect(run.out).toContain('fetch("https://odml.pa.googleapis.com/v1/log"')
  })

  it('passes a folder that names only allowlisted hosts', () => {
    write(
      'chunks/app.js',
      'const a="https://cdn.taha.media/media/a.jpg",b="http://www.w3.org/2000/svg",c="https://react.dev/errors/"',
    )
    write('css/app.css', '@font-face{src:url(https://cdn.taha.media/f.woff2)}')
    write('index.html', '<script src="https://static.cloudflareinsights.com/beacon.min.js" defer>')
    const run = cli(dir)
    expect(run.out).toContain('ok')
    expect(run.status).toBe(0)
  })

  it('scans several folders and the files below them', () => {
    write('a/x.js', '"https://taha.media/"')
    write('b/deep/er/y.js', '"https://tracker.example.net/p"')
    const run = cli(path.join(dir, 'a'), path.join(dir, 'b'))
    expect(run.status).toBe(1)
    expect(run.out).toContain('tracker.example.net')
    expect(run.out).not.toContain('taha.media')
  })

  it('fails on a folder that is missing or holds nothing to scan, so a wrong path cannot pass', () => {
    expect(cli(path.join(dir, 'nope')).status).toBe(1)
    expect(cli(dir).status).toBe(1)
    write('photo.jpg', 'https://tracker.example.net/')
    expect(cli(dir).status).toBe(1)
  })

  it('accepts a folder with nothing to scan only when told it may be empty', () => {
    expect(cli('--allow-empty', dir).status).toBe(0)
    expect(cli('--allow-empty', path.join(dir, 'nope')).status).toBe(1)
    write('a.html', '<a href="https://tracker.example.net/">')
    expect(cli('--allow-empty', dir).status).toBe(1)
  })

  it('fails with no folder argument', () => {
    expect(cli().status).toBe(1)
  })

  it('limits a run to the file types named with --ext (server folders also hold server code)', () => {
    write('app/page.js', '"https://server-only.example.net/"')
    write('app/index.html', '<a href="https://taha.media/">')
    expect(cli('--ext', 'html,rsc', dir).status).toBe(0)
    expect(cli(dir).status).toBe(1)
  })

  it('prints each host once with its places, and how many more there are', () => {
    for (const n of [1, 2, 3, 4, 5]) write(`c${n}.js`, `x("https://tracker.example.net/${n}")`)
    write('d.js', 'y("https://other.example.org/")')
    const run = cli(dir)
    expect(run.out.match(/^tracker\.example\.net\b/gm)).toHaveLength(1)
    expect(run.out).toContain('5 places')
    expect(run.out).toMatch(/and 2 more/)
    expect(run.out).toMatch(/^other\.example\.org\b/m)
  })
})

describe('what counts as a host', () => {
  it('reads http, https, ws and wss URLs, any case, with ports, paths and credentials', () => {
    expect(
      hostsOf(
        'a("https://A.example.com/x") b("http://b.example.com:8080/") c("wss://c.example.com") ' +
          'd("ws://d.example.com?x=1") e("https://key@o1.ingest.de.sentry.io/2") f("HTTPS://F.example.com")',
      ),
    ).toEqual([
      'a.example.com',
      'b.example.com',
      'c.example.com',
      'd.example.com',
      'o1.ingest.de.sentry.io',
      'f.example.com',
    ])
  })

  it('reads protocol-relative URLs in code, markup and CSS', () => {
    expect(
      hostsOf(
        's.src="//cdn.example.com/x.js"; <a href=//b.example.org/y> url(//fonts.example.net/f)',
      ),
    ).toEqual(['cdn.example.com', 'b.example.org', 'fonts.example.net'])
  })

  it('reads URLs inside JSON strings, as Next writes them into the page HTML', () => {
    expect(
      hostsOf('{"u":"https:\\/\\/a.example.com\\/x","v":"https:\\u002F\\u002Fb.example.com"}'),
    ).toEqual(['a.example.com', 'b.example.com'])
  })

  it('reads hosts out of a binary file such as a WASM binary', () => {
    expect(hostsOf('\u0000\u0001See: https://www.tensorflow.org/lite\u0002\u0000')).toEqual([
      'www.tensorflow.org',
    ])
  })

  it('ignores what is not an external host: comments, paths, placeholders and single-label names', () => {
    expect(
      hostsOf(
        [
          '// a comment, not a URL',
          'const p = "//_next/static/chunks" + a//b',
          '// # sourceMappingURL=app.js.map',
          'new URL(path, "http://n"); x = "http://localhost:3000/"',
          'u = `https://${host}/path`; v = "https://" + host; w = "https://"',
          'x = "//foo.js"; y = "//bar.css"; z = "//baz.map"',
          'q = "a//b.example.com"',
          'import "./x.mjs"; "see http://go/link"',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('reports an IP address', () => {
    expect(hostsOf('fetch("http://192.168.1.5:9000/x")')).toEqual(['192.168.1.5'])
  })
})

describe('the allowlist', () => {
  it('allows an exact host and, with a leading *., any subdomain of it but not the bare domain', () => {
    write(
      'a.js',
      '"https://exact.example.com/" "https://o1.ingest.example.org/" "https://ingest.example.org/"',
    )
    const found = scanFolders([dir], [allow('exact.example.com'), allow('*.ingest.example.org')])
    expect(found.findings.map((f) => f.host)).toEqual(['ingest.example.org'])
  })

  it('does not allow a look-alike host', () => {
    write(
      'a.js',
      '"https://taha.media.evil.com/" "https://evil-taha.media/" "https://cdn.taha.media/"',
    )
    const found = scanFolders([dir], [allow('taha.media'), allow('cdn.taha.media')])
    expect(found.findings.map((f) => f.host).sort()).toEqual([
      'evil-taha.media',
      'taha.media.evil.com',
    ])
  })

  it('can limit a host to the files that need it', () => {
    write('media/loader.abc123.js', '// see https://github.com/some/issue')
    write('chunks/app.js', '"https://github.com/some/issue"')
    const found = scanFolders([dir], [allow('github.com', { in: /\/loader\.[^/]*$/ })])
    expect(found.findings.map((f) => path.relative(dir, f.file))).toEqual(['chunks/app.js'])
  })

  it('names the line and column of a finding and cuts a short excerpt from a long minified line', () => {
    write('a.js', `${'x'.repeat(5000)}\nvar u="https://tracker.example.net/p";${'y'.repeat(5000)}`)
    const [finding] = scanFolders([dir], []).findings
    expect(finding).toMatchObject({ host: 'tracker.example.net', line: 2, column: 8 })
    expect(finding!.excerpt).toContain('"https://tracker.example.net/p"')
    expect(finding!.excerpt.length).toBeLessThan(200)
  })

  it('every entry of the real allowlist says why it is allowed', () => {
    expect(allowlistProblems(ALLOWLIST)).toEqual([])
    expect(ALLOWLIST.length).toBeGreaterThan(0)
  })

  it('has the hosts the site itself uses, from the code that uses them', () => {
    const hosts = ALLOWLIST.map((entry) => entry.host)
    // Own origins, Cloudflare Web Analytics (BEACON_SRC) and the click-to-load players.
    for (const host of [
      'taha.media',
      'cdn.taha.media',
      'static.cloudflareinsights.com',
      'player.vimeo.com',
      'www.youtube-nocookie.com',
    ])
      expect(hosts, host).toContain(host)
    // The Sentry ingest hosts of both regions (a DSN reads `https://<key>@o1.ingest.de.sentry.io/2`).
    expect(hosts.some((host) => host.endsWith('.ingest.sentry.io'))).toBe(true)
    expect(hosts.some((host) => host.endsWith('.ingest.de.sentry.io'))).toBe(true)
    // And never the host MediaPipe logged to (#56).
    expect(hosts.some((host) => host.includes('googleapis.com'))).toBe(false)
  })
})

describe('allowlist problems', () => {
  it('fails an entry without a reason, or with a placeholder one', () => {
    for (const reason of ['', '   ', 'todo', 'ok'])
      expect(allowlistProblems([{ host: 'example.com', reason }]), JSON.stringify(reason)).toEqual([
        expect.stringContaining('example.com'),
      ])
  })

  it('fails when the reason is not a string at all', () => {
    expect(allowlistProblems([{ host: 'example.com' } as AllowedHost])).toHaveLength(1)
  })

  it('fails a host that is not a lower-case hostname or a *.subdomain pattern', () => {
    for (const host of [
      '',
      'https://example.com',
      'Example.com',
      'example.com/path',
      'localhost',
      '*',
    ])
      expect(allowlistProblems([allow(host)]), host).toHaveLength(1)
  })

  it('fails a wildcard that would allow a whole registry or domain family', () => {
    for (const host of ['*.com', '*.io', '*.co.uk', '*.sentry.io'])
      expect(allowlistProblems([allow(host)]), host).toHaveLength(1)
    expect(allowlistProblems([allow('*.ingest.sentry.io')])).toEqual([])
  })

  it('fails the same host listed twice with the same scope', () => {
    expect(allowlistProblems([allow('example.com'), allow('example.com')])).toHaveLength(1)
    expect(
      allowlistProblems([allow('example.com'), allow('example.com', { in: /loader/ })]),
    ).toEqual([])
  })

  it('makes the command refuse to scan with a bad allowlist, so a reasonless entry cannot ship', () => {
    const bad = path.join(dir, 'bad-allowlist.ts')
    fs.writeFileSync(
      bad,
      `export const ALLOWLIST = [{ host: 'tracker.example.net', reason: '' }]\n`,
    )
    write('static/a.js', '"https://taha.media/"')
    const run = spawnSync('node', [script, '--allowlist', bad, path.join(dir, 'static')], {
      encoding: 'utf8',
    })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('tracker.example.net')
    expect(run.stderr).toContain('reason')
  })
})
