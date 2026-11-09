import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import {
  assertSafeToReset,
  lanAddress,
  parseArgs,
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

describe('assertSafeToReset', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-reset-'))
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it('accepts a folder that does not exist, an empty one and a previous QA folder', () => {
    expect(() => assertSafeToReset(path.join(tmp, 'missing'))).not.toThrow()
    const empty = path.join(tmp, 'empty')
    fs.mkdirSync(empty)
    expect(() => assertSafeToReset(empty)).not.toThrow()
    const previous = path.join(tmp, 'previous')
    fs.mkdirSync(previous)
    fs.writeFileSync(path.join(previous, 'qa.db'), '')
    expect(() => assertSafeToReset(previous)).not.toThrow()
  })

  it('refuses a folder that holds something else, rather than deleting it', () => {
    const other = path.join(tmp, 'other')
    fs.mkdirSync(other)
    fs.writeFileSync(path.join(other, 'notes.txt'), 'mine')
    expect(() => assertSafeToReset(other)).toThrow(/not a QA folder/)
  })

  it('refuses a file', () => {
    const file = path.join(tmp, 'file')
    fs.writeFileSync(file, '')
    expect(() => assertSafeToReset(file)).toThrow(/not a QA folder/)
  })
})
