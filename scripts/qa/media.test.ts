import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createMediaServer } from './media.ts'

const IMAGE = Buffer.from('0123456789'.repeat(100)) // 1000 bytes
const VIDEO = Buffer.from('abcdefghij'.repeat(10)) // 100 bytes

let tmp: string
let server: http.Server
let port: number

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-media-'))
  fs.mkdirSync(path.join(tmp, 'images', 'nested'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'videos'))
  fs.writeFileSync(path.join(tmp, 'images', 'poster.webp'), IMAGE)
  fs.writeFileSync(path.join(tmp, 'images', 'nested', 'a b.png'), IMAGE)
  fs.writeFileSync(path.join(tmp, 'videos', 'loop.mp4'), VIDEO)
  fs.writeFileSync(path.join(tmp, 'qa.db'), 'database')
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'outside the media folders')
  server = createMediaServer(tmp)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  fs.rmSync(tmp, { recursive: true, force: true })
})

type Answer = { status: number; headers: http.IncomingHttpHeaders; body: Buffer }

/** node:http, not fetch: fetch normalises `/../` away before the request leaves. */
const request = (
  method: string,
  rawPath: string,
  headers: Record<string, string> = {},
): Promise<Answer> =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: rawPath, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
      )
    })
    req.on('error', reject)
    req.end()
  })

describe('serving files', () => {
  it('serves an image and a video by their key, from either folder', async () => {
    const image = await request('GET', '/poster.webp')
    expect(image.status).toBe(200)
    expect(image.headers['content-type']).toBe('image/webp')
    expect(image.headers['content-length']).toBe('1000')
    expect(image.headers['accept-ranges']).toBe('bytes')
    expect(image.body.equals(IMAGE)).toBe(true)

    const video = await request('GET', '/loop.mp4')
    expect(video.status).toBe(200)
    expect(video.headers['content-type']).toBe('video/mp4')
    expect(video.body.equals(VIDEO)).toBe(true)
  })

  it('decodes percent-encoded keys and serves nested ones', async () => {
    const answer = await request('GET', '/nested/a%20b.png')
    expect(answer.status).toBe(200)
    expect(answer.headers['content-type']).toBe('image/png')
  })

  it('ignores the query string', async () => {
    expect((await request('GET', '/poster.webp?v=2')).status).toBe(200)
  })

  it('answers 404 for a missing key, a folder and the root', async () => {
    expect((await request('GET', '/nope.webp')).status).toBe(404)
    expect((await request('GET', '/nested')).status).toBe(404)
    expect((await request('GET', '/')).status).toBe(404)
  })

  it('answers 405 to a write', async () => {
    expect((await request('POST', '/poster.webp')).status).toBe(405)
  })
})

describe('byte ranges', () => {
  it('bytes=0- answers 206 with the whole file', async () => {
    const answer = await request('GET', '/poster.webp', { Range: 'bytes=0-' })
    expect(answer.status).toBe(206)
    expect(answer.headers['content-range']).toBe('bytes 0-999/1000')
    expect(answer.headers['content-length']).toBe('1000')
    expect(answer.body.equals(IMAGE)).toBe(true)
  })

  it('bytes=-500 answers the last 500 bytes', async () => {
    const answer = await request('GET', '/poster.webp', { Range: 'bytes=-500' })
    expect(answer.status).toBe(206)
    expect(answer.headers['content-range']).toBe('bytes 500-999/1000')
    expect(answer.body.equals(IMAGE.subarray(500))).toBe(true)
  })

  it('a suffix longer than the file answers the whole file', async () => {
    const answer = await request('GET', '/loop.mp4', { Range: 'bytes=-500' })
    expect(answer.status).toBe(206)
    expect(answer.headers['content-range']).toBe('bytes 0-99/100')
  })

  it('a middle range answers exactly those bytes, and an end past the file is clamped', async () => {
    const middle = await request('GET', '/poster.webp', { Range: 'bytes=10-19' })
    expect(middle.status).toBe(206)
    expect(middle.headers['content-range']).toBe('bytes 10-19/1000')
    expect(middle.body.equals(IMAGE.subarray(10, 20))).toBe(true)

    const clamped = await request('GET', '/poster.webp', { Range: 'bytes=990-5000' })
    expect(clamped.status).toBe(206)
    expect(clamped.headers['content-range']).toBe('bytes 990-999/1000')
  })

  it.each(['bytes=1000-', 'bytes=5000-6000', 'bytes=-0', 'bytes=20-10'])(
    '%s is not satisfiable: 416 with the size',
    async (range) => {
      const answer = await request('GET', '/poster.webp', { Range: range })
      expect(answer.status).toBe(416)
      expect(answer.headers['content-range']).toBe('bytes */1000')
    },
  )

  it.each(['bytes=-', 'items=0-1', 'bytes=0-1,5-6', 'bytes=a-b'])(
    'ignores a range it does not understand (%s) and serves the whole file',
    async (range) => {
      const answer = await request('GET', '/poster.webp', { Range: range })
      expect(answer.status).toBe(200)
      expect(answer.body.equals(IMAGE)).toBe(true)
    },
  )
})

describe('HEAD', () => {
  it('answers the headers of a GET without a body', async () => {
    const answer = await request('HEAD', '/poster.webp')
    expect(answer.status).toBe(200)
    expect(answer.headers['content-length']).toBe('1000')
    expect(answer.headers['content-type']).toBe('image/webp')
    expect(answer.body.length).toBe(0)
  })

  it('answers a range with its headers and no body', async () => {
    const answer = await request('HEAD', '/poster.webp', { Range: 'bytes=0-99' })
    expect(answer.status).toBe(206)
    expect(answer.headers['content-range']).toBe('bytes 0-99/1000')
    expect(answer.headers['content-length']).toBe('100')
    expect(answer.body.length).toBe(0)
  })

  it('answers 404 for a missing key', async () => {
    expect((await request('HEAD', '/nope.webp')).status).toBe(404)
  })
})

describe('CORS', () => {
  it('allows any origin on a GET, a range, a 404 and a 416', async () => {
    for (const [pathname, headers] of [
      ['/poster.webp', {}],
      ['/poster.webp', { Range: 'bytes=0-9' }],
      ['/nope.webp', {}],
      ['/poster.webp', { Range: 'bytes=5000-' }],
    ] as const) {
      const answer = await request('GET', pathname, headers)
      expect(answer.headers['access-control-allow-origin']).toBe('*')
      expect(answer.headers['access-control-expose-headers']).toContain('Content-Range')
    }
  })

  it('answers a preflight OPTIONS with 204 and the allowed headers', async () => {
    const answer = await request('OPTIONS', '/poster.webp', {
      Origin: 'http://127.0.0.1:3000',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'range',
    })
    expect(answer.status).toBe(204)
    expect(answer.headers['access-control-allow-origin']).toBe('*')
    expect(answer.headers['access-control-allow-methods']).toContain('GET')
    expect(answer.headers['access-control-allow-headers']).toContain('Range')
    expect(answer.body.length).toBe(0)
  })
})

describe('paths outside images/ and videos/', () => {
  it.each([
    '/../secret.txt',
    '/%2e%2e/secret.txt',
    '/%2E%2E/secret.txt',
    '/nested/../../secret.txt',
    '/nested/%2e%2e/%2e%2e/secret.txt',
    '/..%2fsecret.txt',
    '/..%5csecret.txt',
    '/images/../secret.txt',
  ])('refuses %s', async (rawPath) => {
    const answer = await request('GET', rawPath)
    expect(answer.status).toBe(403)
    expect(answer.body.toString()).not.toContain('outside the media folders')
  })

  it('refuses a null byte and a malformed escape', async () => {
    expect((await request('GET', '/poster.webp%00')).status).toBe(400)
    expect((await request('GET', '/%E0%A4%A')).status).toBe(400)
  })

  it('does not serve the database or any other file in the QA folder', async () => {
    expect((await request('GET', '/qa.db')).status).toBe(404)
    expect((await request('GET', '/secret.txt')).status).toBe(404)
  })

  it('does not serve a sibling folder whose name starts with images', async () => {
    fs.mkdirSync(path.join(tmp, 'images-old'))
    fs.writeFileSync(path.join(tmp, 'images-old', 'x.webp'), 'old')
    expect((await request('GET', '/../images-old/x.webp')).status).toBe(403)
    expect((await request('GET', '/x.webp')).status).toBe(404)
  })
})
