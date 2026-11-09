import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import {
  assertReusable,
  assertSafeToReset,
  lanAddress,
  markQaFolder,
  parseArgs,
  QA_MARKER,
  seedEnv,
  UsageError,
  webEnv,
  type QaConfig,
} from './options.ts'

const repoRoot = '/repo'
const parse = (argv: string[], lan: string | null = '192.168.1.20') =>
  parseArgs(argv, { repoRoot, lanAddress: lan })
const config = (argv: string[] = [], lan?: string | null): QaConfig => {
  const parsed = parse(argv, lan)
  if (parsed.kind !== 'run') throw new Error('expected a run')
  return parsed.config
}

describe('parseArgs', () => {
  it('defaults to a fresh QA folder in the gitignored .qa, on 127.0.0.1, web 3000, media 4100', () => {
    expect(config()).toEqual({
      qaDir: '/repo/.qa',
      reuse: false,
      lan: false,
      host: '127.0.0.1',
      webPort: 3000,
      mediaPort: 4100,
      webOrigin: 'http://127.0.0.1:3000',
      mediaOrigin: 'http://127.0.0.1:4100',
    })
  })

  it('--reuse keeps the folder instead of reseeding', () => {
    expect(config(['--reuse']).reuse).toBe(true)
  })

  it('--dir takes a folder, resolved against the working directory', () => {
    expect(config(['--dir', '/somewhere/qa']).qaDir).toBe('/somewhere/qa')
    expect(config(['--dir=/other']).qaDir).toBe('/other')
    expect(config(['--dir', 'rel']).qaDir).toBe(path.resolve('rel'))
  })

  it('--web-port and --media-port set the ports and the media origin', () => {
    const parsed = config(['--web-port', '3100', '--media-port=4200'])
    expect(parsed.webPort).toBe(3100)
    expect(parsed.mediaPort).toBe(4200)
    expect(parsed.mediaOrigin).toBe('http://127.0.0.1:4200')
  })

  it('--lan binds both servers to the LAN address and uses it in the media origin', () => {
    const parsed = config(['--lan'])
    expect(parsed).toMatchObject({
      lan: true,
      host: '192.168.1.20',
      webOrigin: 'http://192.168.1.20:3000',
      mediaOrigin: 'http://192.168.1.20:4100',
    })
  })

  it('--lan without a LAN address says so', () => {
    expect(() => parse(['--lan'], null)).toThrow(/no LAN address/i)
  })

  it('--help asks for the usage text', () => {
    expect(parse(['--help'])).toEqual({ kind: 'help' })
    expect(parse(['-h'])).toEqual({ kind: 'help' })
  })

  it.each([
    [['--nope'], /unknown option/i],
    [['stray'], /unknown option/i],
    [['--dir'], /--dir needs a value/],
    [['--web-port'], /--web-port needs a value/],
    [['--web-port', 'abc'], /--web-port must be a port/],
    [['--web-port', '0'], /--web-port must be a port/],
    [['--media-port', '70000'], /--media-port must be a port/],
    [['--web-port', '3000', '--media-port', '3000'], /same port/i],
  ])('refuses %j', (argv, message) => {
    expect(() => parse(argv)).toThrow(UsageError)
    expect(() => parse(argv)).toThrow(message)
  })
})

describe('lanAddress', () => {
  it('picks the first external IPv4 address', () => {
    const interfaces = {
      lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      en0: [
        { address: 'fe80::1', family: 'IPv6', internal: false },
        { address: '192.168.1.20', family: 'IPv4', internal: false },
      ],
    } as unknown as ReturnType<typeof os.networkInterfaces>
    expect(lanAddress(interfaces)).toBe('192.168.1.20')
  })

  it('is null without one', () => {
    expect(lanAddress({})).toBeNull()
  })
})

describe('environments', () => {
  const qa = config(['--dir', '/qa'])

  it('web is built and started with the database, throwaway secrets and the media origin', () => {
    // Without MEDIA_ORIGIN the build bakes in /api/... media links that web does not serve.
    expect(webEnv(qa, { PATH: '/bin' })).toMatchObject({
      PATH: '/bin',
      DATABASE_PATH: '/qa/qa.db',
      PAYLOAD_SECRET: 'qa-only-secret',
      REVALIDATE_SECRET: 'qa-only-secret',
      MEDIA_ORIGIN: 'http://127.0.0.1:4100',
    })
  })

  it('web gets the same filtered base as the seed: no production or storage settings from the shell', () => {
    const env = webEnv(qa, {
      PATH: '/bin',
      NODE_ENV: 'production',
      TAHA_ENV: 'production',
      S3_BUCKET: 'b',
      S3_ENDPOINT: 'e',
      REVALIDATE_URL: 'http://x',
      MEDIA_ORIGIN: 'https://media.example.com',
    })
    expect(env.PATH).toBe('/bin')
    expect(env.MEDIA_ORIGIN).toBe('http://127.0.0.1:4100')
    for (const name of ['NODE_ENV', 'TAHA_ENV', 'S3_BUCKET', 'S3_ENDPOINT', 'REVALIDATE_URL']) {
      expect(env).not.toHaveProperty(name)
    }
  })

  it('web blanks Sentry and analytics explicitly, so neither the shell nor apps/web/.env* fills them in', () => {
    // A set-but-empty variable wins over .env files (Next never overrides process.env) and reads
    // as unset in apps/web/src/lib/observability.ts, so QA errors and page views stay local.
    const env = webEnv(qa, {
      PATH: '/bin',
      NEXT_PUBLIC_SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1',
      NEXT_PUBLIC_CLOUDFLARE_BEACON_TOKEN: 'token',
      SENTRY_AUTH_TOKEN: 'sntrys_x',
    })
    for (const name of [
      'NEXT_PUBLIC_SENTRY_DSN',
      'NEXT_PUBLIC_CLOUDFLARE_BEACON_TOKEN',
      'SENTRY_AUTH_TOKEN',
      'SENTRY_ORG',
      'SENTRY_PROJECT',
    ]) {
      expect(env[name]).toBe('')
    }
  })

  it('the seed gets the database and no production or storage settings, so media stays on local disk', () => {
    const env = seedEnv(qa, {
      PATH: '/bin',
      NODE_ENV: 'production',
      TAHA_ENV: 'production',
      MEDIA_ORIGIN: 'https://media.example.com',
      S3_BUCKET: 'b',
      S3_ENDPOINT: 'e',
      S3_ACCESS_KEY_ID: 'k',
      S3_SECRET_ACCESS_KEY: 's',
      REVALIDATE_URL: 'http://x',
    })
    expect(env).toMatchObject({
      PATH: '/bin',
      DATABASE_PATH: '/qa/qa.db',
      PAYLOAD_DB_PUSH: 'false',
      PAYLOAD_SECRET: 'qa-only-secret',
    })
    for (const name of [
      'NODE_ENV',
      'TAHA_ENV',
      'MEDIA_ORIGIN',
      'S3_BUCKET',
      'S3_ENDPOINT',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'REVALIDATE_URL',
    ]) {
      expect(env).not.toHaveProperty(name)
    }
  })
})

describe('QA folder guards', () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-reset-')))
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const repo = path.join(tmp, 'repo')
  const home = path.join(tmp, 'home')
  const folder = (name: string, files: Record<string, string> = {}) => {
    const dir = path.join(tmp, name)
    fs.mkdirSync(dir, { recursive: true })
    for (const [file, content] of Object.entries(files))
      fs.writeFileSync(path.join(dir, file), content)
    return dir
  }
  const reset = (dir: string) => assertSafeToReset(dir, repo, home)

  describe('assertSafeToReset', () => {
    it('accepts a folder that does not exist and an empty one', () => {
      expect(() => reset(path.join(tmp, 'missing'))).not.toThrow()
      expect(() => reset(folder('empty'))).not.toThrow()
    })

    it('accepts a folder the kit made, and markQaFolder makes one', () => {
      const dir = folder('previous')
      markQaFolder(dir)
      expect(fs.existsSync(path.join(dir, QA_MARKER))).toBe(true)
      fs.writeFileSync(path.join(dir, 'qa.db'), '')
      expect(() => reset(dir)).not.toThrow()
    })

    it('refuses a folder that holds something else, rather than deleting it', () => {
      expect(() => reset(folder('other', { 'notes.txt': 'mine' }))).toThrow(/not a QA folder/)
    })

    it('refuses a folder with a stray qa.db but no marker (the file name alone proves nothing)', () => {
      expect(() => reset(folder('desktop', { 'qa.db': '', 'notes.txt': 'mine' }))).toThrow(
        /not a QA folder/,
      )
    })

    it('refuses a marker that is a directory, not a file', () => {
      const dir = folder('fake-marker')
      fs.mkdirSync(path.join(dir, QA_MARKER))
      expect(() => reset(dir)).toThrow(/not a QA folder/)
    })

    it('refuses a file', () => {
      const file = path.join(tmp, 'file')
      fs.writeFileSync(file, '')
      expect(() => reset(file)).toThrow(/not a QA folder/)
    })

    it('refuses a folder that is, or contains, the repository, even with the marker', () => {
      fs.mkdirSync(path.join(repo, 'apps'), { recursive: true })
      markQaFolder(repo)
      expect(() => reset(repo)).toThrow(/repository/)
      markQaFolder(tmp)
      expect(() => reset(tmp)).toThrow(/repository/)
    })

    it('refuses the home folder and any folder that contains it, even with the marker', () => {
      fs.mkdirSync(path.join(home, 'Desktop'), { recursive: true })
      markQaFolder(home)
      expect(() => reset(home)).toThrow(/home/)
      const parent = folder('homes')
      const inner = path.join(parent, 'me')
      fs.mkdirSync(inner)
      markQaFolder(parent)
      expect(() => assertSafeToReset(parent, repo, inner)).toThrow(/home/)
    })

    it('refuses a filesystem root', () => {
      expect(() => reset(path.parse(tmp).root)).toThrow(/filesystem root/)
    })

    it('judges a symlink by where it points', () => {
      fs.mkdirSync(path.join(home, 'Documents'), { recursive: true })
      const link = path.join(tmp, 'link-to-home')
      fs.symlinkSync(home, link)
      expect(() => reset(link)).toThrow(/home/)
    })

    it('accepts a QA folder inside the repository, like the default .qa', () => {
      const dir = path.join(repo, '.qa')
      fs.mkdirSync(dir, { recursive: true })
      markQaFolder(dir)
      expect(() => reset(dir)).not.toThrow()
    })
  })

  describe('assertReusable', () => {
    it('accepts a marked folder with a database', () => {
      const dir = folder('reusable', { 'qa.db': '' })
      markQaFolder(dir)
      expect(() => assertReusable(dir, repo, home)).not.toThrow()
    })

    it('refuses a folder without a database', () => {
      const dir = folder('no-db')
      markQaFolder(dir)
      expect(() => assertReusable(dir, repo, home)).toThrow(/no qa\.db/)
      expect(() => assertReusable(path.join(tmp, 'absent'), repo, home)).toThrow(/no qa\.db/)
    })

    it('refuses a folder with a qa.db but no marker', () => {
      expect(() => assertReusable(folder('unmarked', { 'qa.db': '' }), repo, home)).toThrow(
        /not a QA folder/,
      )
    })

    it('refuses the home folder even when it is marked and holds a qa.db', () => {
      fs.writeFileSync(path.join(home, 'qa.db'), '')
      expect(() => assertReusable(home, repo, home)).toThrow(/home/)
    })
  })
})
