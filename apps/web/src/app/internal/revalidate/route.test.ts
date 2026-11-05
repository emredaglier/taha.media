import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { nextCache } from '../../../test/next-cache-fake'
import { POST } from './route'

const call = (headers: Record<string, string>, body: unknown) =>
  POST(
    new Request('http://web:3000/internal/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )

const right = { 'x-revalidate-secret': 'right-secret' }

beforeEach(() => {
  process.env.REVALIDATE_SECRET = 'right-secret'
  nextCache.reset()
})
afterEach(() => {
  delete process.env.REVALIDATE_SECRET
})

describe('POST /internal/revalidate', () => {
  it('rejects a missing or wrong secret and refreshes nothing', async () => {
    expect((await call({}, { tags: ['works'] })).status).toBe(401)
    expect((await call({ 'x-revalidate-secret': 'wrong' }, { tags: ['works'] })).status).toBe(401)
    expect((await call({ 'x-revalidate-secret': 'right-secre' }, { tags: ['works'] })).status).toBe(
      401,
    )
    expect(nextCache.revalidated).toEqual([])
  })

  it('rejects everything while no secret is configured', async () => {
    delete process.env.REVALIDATE_SECRET
    expect((await call({ 'x-revalidate-secret': '' }, { tags: ['works'] })).status).toBe(401)
    expect((await call({ 'x-revalidate-secret': 'undefined' }, { tags: ['works'] })).status).toBe(
      401,
    )
    expect(nextCache.revalidated).toEqual([])
  })

  it('accepts the right secret and expires each tag at once', async () => {
    const response = await call(right, { tags: ['work:3', 'works', 'home', 'page:about'] })
    expect(response.status).toBe(200)
    expect(nextCache.revalidated).toEqual([
      { tag: 'work:3', profile: { expire: 0 } },
      { tag: 'works', profile: { expire: 0 } },
      { tag: 'home', profile: { expire: 0 } },
      { tag: 'page:about', profile: { expire: 0 } },
    ])
  })

  it('rejects malformed bodies and tags it does not know', async () => {
    expect((await call(right, 'not json')).status).toBe(400)
    expect((await call(right, { tags: [] })).status).toBe(400)
    expect((await call(right, { tags: ['anything'] })).status).toBe(400)
    expect((await call(right, { tags: ['work:abc'] })).status).toBe(400)
    expect((await call(right, { tags: [42] })).status).toBe(400)
    expect(nextCache.revalidated).toEqual([])
  })
})
