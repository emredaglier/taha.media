/**
 * Fails when a file the browser downloads names a host outside the allowlist (#80). Hand control is
 * consent-gated and the privacy notice says nothing is collected, yet MediaPipe 1.2.x sent usage
 * logs to Google (#56). `tracker.test.ts` guards that one host in the installed package; this
 * guards the built output, so the next library that phones home, a version bump that moves an
 * endpoint or a script tag in our own code fails the build too.
 *
 *   node infra/client-hosts.ts [--ext html,rsc] [--allow-empty] [--allowlist <file>] <folder>...
 *
 * Scans every file below each folder whose type a browser downloads or reads (.js .mjs .css .html
 * .wasm .task .json .txt .svg .xml .webmanifest .rsc; `--ext` narrows that, for folders that also
 * hold server code). Source maps are skipped: they are removed after upload and never ship. It
 * finds `http(s)://` and `ws(s)://` URLs and protocol-relative `//host` ones, also inside JSON
 * strings (`https:\/\/`) and in binaries. A run that finds no file at all fails, so a wrong path
 * cannot pass, unless `--allow-empty` says there may be none (the HTML Next prerenders). The
 * allowlist is `infra/client-hosts-allowlist.ts`, one commented entry per host.
 *
 * Not reported, because they cannot leave the machine or are not literal: single-label names
 * (`localhost`, Next's `http://n` base) and URLs built at run time (`https://${host}`). A host
 * assembled from pieces in code is out of reach of any scan.
 *
 * Run with Node 24 directly (types are stripped); it imports nothing but Node and the allowlist,
 * so it runs in the Dockerfile's build stage right after `next build`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { ALLOWLIST } from './client-hosts-allowlist.ts'

/** One allowlist entry: a host (or `*.sub.domain.tld`), why it is allowed, and optionally where. */
export type AllowedHost = {
  /** Lower-case hostname, or `*.` plus a hostname of at least three labels (any subdomain of it). */
  host: string
  /** Why this host may appear in the client output: what it is and why it is never a data leak. */
  reason: string
  /** Only in files whose path (forward slashes) matches. Omit when any file may name the host. */
  in?: RegExp
}

export type Finding = {
  host: string
  /** The file, as the folder argument and the path below it joined. */
  file: string
  line: number
  column: number
  /** The text around the URL, on one line, so a real call can be told from a comment. */
  excerpt: string
}

export const SCANNED_EXTENSIONS = [
  '.js',
  '.mjs',
  '.css',
  '.html',
  '.wasm',
  '.task',
  '.json',
  '.txt',
  '.svg',
  '.xml',
  '.webmanifest',
  '.rsc',
]

const MIN_REASON_LENGTH = 12
const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/
/** What follows the dot in `//name.js`: a file, not a top-level domain. */
const FILE_LIKE = new Set(
  'js mjs cjs css map json wasm task html htm ts tsx jsx svg png jpg jpeg webp avif gif ico woff woff2 ttf otf txt xml md'.split(
    ' ',
  ),
)

/** Problems in an allowlist, one sentence each; none means it may be used. */
export function allowlistProblems(list: readonly AllowedHost[]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const entry of list) {
    const label = JSON.stringify(entry.host)
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : ''
    if (reason.length < MIN_REASON_LENGTH)
      problems.push(`${label} has no reason: say what it is and why it is never a data leak`)
    const host = typeof entry.host === 'string' ? entry.host : ''
    const wildcard = host.startsWith('*.')
    const bare = wildcard ? host.slice(2) : host
    if (!HOSTNAME.test(bare) || !bare.includes('.'))
      problems.push(`${label} is not a lower-case hostname or a *.subdomain pattern`)
    else if (wildcard && bare.split('.').length < 3)
      problems.push(`${label} is too broad: a wildcard needs three labels, like *.ingest.sentry.io`)
    const key = `${entry.host}\0${entry.in?.source ?? ''}`
    if (seen.has(key)) problems.push(`${label} is listed twice with the same scope`)
    seen.add(key)
  }
  return problems
}

/** Does `pattern` (an exact host, or `*.suffix`) allow `host`? */
function hostMatches(pattern: string, host: string): boolean {
  return pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) : host === pattern
}

/** URLs with a scheme: the host stops at a port, path, query, fragment or any quote. */
const SCHEME_URL = /(?:https?|wss?):\/\/(?:[^\s/?#@"'`<>\\]*@)?([A-Za-z0-9.-]*)/gi
/** `//host.tld` not glued to a word, a path or a scheme. */
const RELATIVE_URL =
  /(?<![\w:/.\\-])\/\/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+)(?![\w.-])/g

/** JSON-escaped slashes (`https:\/\/`, `\u002F`) become plain ones, so the patterns see one form. */
const unescapeSlashes = (text: string) => text.replace(/\\u002f/gi, '/').replace(/\\\//g, '/')

/** The hosts a text names and where (offsets into the unescaped text, which `scanText` maps). */
export function extractHosts(text: string): { host: string; index: number }[] {
  const found: { host: string; index: number }[] = []
  const plain = unescapeSlashes(text)
  for (const match of plain.matchAll(SCHEME_URL)) {
    const host = match[1]!.toLowerCase().replace(/\.+$/, '')
    if (host.includes('.') && HOSTNAME.test(host)) found.push({ host, index: match.index })
  }
  for (const match of plain.matchAll(RELATIVE_URL)) {
    const host = match[1]!.toLowerCase()
    const tld = host.slice(host.lastIndexOf('.') + 1)
    if (/^[a-z]{2,24}$/.test(tld) && !FILE_LIKE.has(tld)) found.push({ host, index: match.index })
  }
  return found.sort((a, b) => a.index - b.index)
}

const toForwardSlashes = (file: string) => file.split(path.sep).join('/')

function excerptAround(text: string, index: number): string {
  return text
    .slice(Math.max(0, index - 45), index + 75)
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, (run) => (/[\n\r\t]/.test(run) ? ' ' : '.'))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Every file below `folder` of a scanned type, in a stable order. */
function filesBelow(folder: string, extensions: readonly string[]): string[] {
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const full = path.join(folder, entry.name)
      if (entry.isDirectory()) return filesBelow(full, extensions)
      return extensions.includes(path.extname(entry.name).toLowerCase()) ? [full] : []
    })
}

/**
 * Scans the folders; returns the files looked at and every place a host outside `allowlist` is
 * named. Throws on a folder that does not exist.
 */
export function scanFolders(
  folders: readonly string[],
  allowlist: readonly AllowedHost[],
  extensions: readonly string[] = SCANNED_EXTENSIONS,
): { scanned: number; findings: Finding[] } {
  const findings: Finding[] = []
  let scanned = 0
  for (const folder of folders) {
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory())
      throw new Error(`${folder} is not a folder: run the scan on a finished build`)
    for (const file of filesBelow(folder, extensions)) {
      scanned++
      // Latin-1 reads every byte as one character, so binaries and UTF-8 text both keep their offsets.
      const text = unescapeSlashes(fs.readFileSync(file, 'latin1'))
      const where = toForwardSlashes(file)
      let lineStarts: number[] | undefined
      for (const { host, index } of extractHosts(text)) {
        const allowed = allowlist.some(
          (entry) => hostMatches(entry.host, host) && (!entry.in || entry.in.test(where)),
        )
        if (allowed) continue
        lineStarts ??= [0, ...[...text.matchAll(/\n/g)].map((m) => m.index + 1)]
        let line = lineStarts.length
        while (lineStarts[line - 1]! > index) line--
        findings.push({
          host,
          file,
          line,
          column: index - lineStarts[line - 1]! + 1,
          excerpt: excerptAround(text, index),
        })
      }
    }
  }
  return { scanned, findings }
}

const SAMPLES_PER_HOST = 3

/** The report: each host once, how many places, and the first few with their code around them. */
export function formatFindings(findings: readonly Finding[]): string {
  const byHost = new Map<string, Finding[]>()
  for (const finding of findings)
    byHost.set(finding.host, [...(byHost.get(finding.host) ?? []), finding])
  const blocks = [...byHost].map(([host, places]) => {
    const head = `${host}  (${places.length} ${places.length === 1 ? 'place' : 'places'})`
    const samples = places
      .slice(0, SAMPLES_PER_HOST)
      .map((place) => `  ${place.file}:${place.line}:${place.column}\n    ${place.excerpt}`)
    const more = places.length - SAMPLES_PER_HOST
    return [head, ...samples, ...(more > 0 ? [`  ... and ${more} more`] : [])].join('\n')
  })
  return [
    'These hosts appear in the client output and are not in infra/client-hosts-allowlist.ts:',
    '',
    blocks.join('\n\n'),
    '',
    'A real request to one of them is a leak: Hand control, analytics and error reports are the',
    'only things that may reach outside, and the privacy notice says so. If it is only a comment,',
    'a documentation link or a name that is never requested, add the host to the allowlist with',
    'the reason (and `in:` to limit it to the file that holds it). Otherwise remove the code.',
  ].join('\n')
}

async function main(args: string[]): Promise<number> {
  const folders: string[] = []
  let extensions = SCANNED_EXTENSIONS
  let allowlist: readonly AllowedHost[] = ALLOWLIST
  let allowEmpty = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--ext') {
      extensions = (args[++i] ?? '')
        .split(',')
        .map((ext) => `.${ext.replace(/^\./, '').toLowerCase()}`)
    } else if (arg === '--allowlist') {
      // A seam for the tests: the same export shape, from another file.
      const loaded = (await import(pathToFileURL(path.resolve(args[++i] ?? '')).href)) as {
        ALLOWLIST: AllowedHost[]
      }
      allowlist = loaded.ALLOWLIST
    } else if (arg === '--allow-empty') allowEmpty = true
    else folders.push(arg)
  }
  if (folders.length === 0) {
    console.error('usage: node infra/client-hosts.ts [--ext html,rsc] [--allow-empty] <folder>...')
    return 1
  }
  const problems = allowlistProblems(allowlist)
  if (problems.length > 0) {
    console.error(`The allowlist is not valid:\n${problems.map((p) => `  ${p}`).join('\n')}`)
    return 1
  }
  const { scanned, findings } = scanFolders(folders, allowlist, extensions)
  if (scanned === 0 && !allowEmpty) {
    console.error(`No files to scan below ${folders.join(', ')}: is this a finished build?`)
    return 1
  }
  if (findings.length > 0) {
    console.error(formatFindings(findings))
    return 1
  }
  console.log(`ok: ${scanned} files scanned, every host they name is on the allowlist`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    },
  )
}
