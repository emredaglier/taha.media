import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Seam 3: the Caddyfiles, read as text (no Caddy binary needed). The rules that matter are small
// enough to evaluate here: which paths the public site refuses, and where it proxies to.
const read = (file: string) =>
  fs.readFileSync(path.resolve(import.meta.dirname, 'caddy', file), 'utf8')
const site = read('site.caddy')
const caddyfiles = { production: read('Caddyfile'), local: read('Caddyfile.local') }

/** The patterns of `@name path <patterns...>`. */
function pathMatcher(name: string): string[] {
  const line = new RegExp(`^\\s*@${name}\\s+path\\s+(.+)$`, 'm').exec(site)?.[1]
  if (!line) throw new Error(`no @${name} path matcher in site.caddy`)
  return line.trim().split(/\s+/)
}

/** Caddy's `path` matcher: case-insensitive, `*` matches any run of characters. */
function matches(patterns: string[], requestPath: string): boolean {
  return patterns.some((pattern) => {
    const source = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp(`^${source}$`, 'i').test(requestPath)
  })
}

/** The directives of the `handle` blocks, in order: [matcher or '', body]. */
function handles(): { matcher: string; body: string }[] {
  const result: { matcher: string; body: string }[] = []
  const pattern = /^\s*handle\s*(@\w+)?\s*\{/gm
  for (let match = pattern.exec(site); match; match = pattern.exec(site)) {
    let depth = 1
    let end = pattern.lastIndex
    while (depth > 0 && end < site.length) {
      if (site[end] === '{') depth += 1
      if (site[end] === '}') depth -= 1
      end += 1
    }
    result.push({ matcher: match[1] ?? '', body: site.slice(pattern.lastIndex, end - 1) })
  }
  return result
}

describe('the public site rules (site.caddy)', () => {
  const blocked = pathMatcher('internal')

  it('answers 404 for every internal endpoint and for the preview entry', () => {
    for (const p of [
      '/internal',
      '/internal/',
      '/internal/revalidate',
      '/internal/health',
      '/INTERNAL/revalidate',
      '/preview',
      '/preview/',
      '/preview/anything',
    ]) {
      expect(matches(blocked, p), p).toBe(true)
    }
  })

  it('lets every public route through', () => {
    for (const p of [
      '/',
      '/isler',
      '/isler/kis-kampanyasi',
      '/hakkimda',
      '/gizlilik',
      '/_next/static/chunks/a.js',
      '/robots.txt',
      '/sitemap.xml',
      '/internal-notes',
      '/previews',
    ]) {
      expect(matches(blocked, p), p).toBe(false)
    }
  })

  it('checks the blocked paths first and sends only the rest to web', () => {
    const [first, second, ...others] = handles()
    expect(first?.matcher).toBe('@internal')
    expect(first?.body).toMatch(/respond\s+"Not Found"\s+404/)
    expect(second?.matcher).toBe('')
    expect(second?.body).toMatch(/reverse_proxy\s+web:3000/)
    expect(others).toEqual([])
  })

  it('compresses responses', () => {
    expect(site).toMatch(/^\s*encode\s+zstd\s+gzip/m)
  })

  it('never proxies to cms, the preview instance or anything but web', () => {
    for (const text of [site, ...Object.values(caddyfiles)]) {
      const code = text.replace(/^\s*#.*$/gm, '')
      const upstreams = [...code.matchAll(/reverse_proxy\s+(\S+)/g)].map((m) => m[1])
      expect(upstreams.every((upstream) => upstream === 'web:3000')).toBe(true)
      expect(code).not.toMatch(/\bcms\b|web-preview/)
    }
  })
})

describe('the production Caddyfile', () => {
  const text = caddyfiles.production

  it('serves taha.media with the Cloudflare origin certificate and redirects www to it', () => {
    expect(text).toMatch(
      /^taha\.media\s*\{[^}]*tls \/certs\/origin\.pem \/certs\/origin\.key[^}]*import site/m,
    )
    expect(text).toMatch(/^www\.taha\.media\s*\{[^}]*redir https:\/\/taha\.media\{uri\} permanent/m)
  })

  it('takes the client address from Cloudflare only', () => {
    expect(text).toMatch(/client_ip_headers CF-Connecting-IP/)
    expect(text).toMatch(/trusted_proxies static 173\.245\.48\.0\/20/)
  })

  it('has no rate limiting at the origin (ADR-0004)', () => {
    expect(text).not.toMatch(/rate_limit/)
  })
})

describe('the local Caddyfile', () => {
  it('serves plain HTTP with the same site rules and no hostnames', () => {
    const text = caddyfiles.local
    expect(text).toMatch(/auto_https off/)
    expect(text).toMatch(/import \/etc\/caddy\/site\.caddy/)
    expect(text).toMatch(/^:80\s*\{[^}]*import site/m)
  })
})
