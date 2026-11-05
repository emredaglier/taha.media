import { describe, expect, it } from 'vitest'

import { assertLocalEnvironment, isProductionEnvironment } from './guard'

describe('production detection', () => {
  it.each([
    ['NODE_ENV=production', { NODE_ENV: 'production' }],
    ['TAHA_ENV=production', { TAHA_ENV: 'production' }],
    ['a media origin (a CDN in front of R2)', { MEDIA_ORIGIN: 'https://media.taha.media' }],
    ['an R2 bucket', { S3_BUCKET: 'taha-media' }],
    ['an R2 endpoint', { S3_ENDPOINT: 'https://x.r2.cloudflarestorage.com' }],
  ])('treats %s as production', (_, env) => {
    expect(isProductionEnvironment(env)).toBe(true)
    expect(() => assertLocalEnvironment(env)).toThrow(/production/i)
  })

  it.each([
    ['empty', {}],
    ['development', { NODE_ENV: 'development' }],
    ['test', { NODE_ENV: 'test', TAHA_ENV: 'local', MEDIA_ORIGIN: '' }],
  ])('allows %s', (_, env) => {
    expect(isProductionEnvironment(env)).toBe(false)
    expect(() => assertLocalEnvironment(env)).not.toThrow()
  })
})
