import { describe, expect, it } from 'vitest'

import { mediaUrl, storageOptionsFromEnv } from './storage'

describe('storageOptionsFromEnv', () => {
  it('means local disk when nothing is set', () => {
    expect(storageOptionsFromEnv({})).toEqual({})
  })

  it('means R2 when the S3 variables and the media origin are set', () => {
    expect(
      storageOptionsFromEnv({
        MEDIA_ORIGIN: 'https://media.taha.media',
        S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
        S3_BUCKET: 'taha-media',
        S3_ACCESS_KEY_ID: 'k',
        S3_SECRET_ACCESS_KEY: 's',
      }),
    ).toMatchObject({
      mediaOrigin: 'https://media.taha.media',
      s3: { bucket: 'taha-media', region: 'auto', forcePathStyle: false },
    })
  })

  it('lets web build URLs from the media origin alone', () => {
    expect(storageOptionsFromEnv({ MEDIA_ORIGIN: 'https://media.taha.media' })).toEqual({
      mediaOrigin: 'https://media.taha.media',
    })
  })

  it('refuses half-set credentials, and credentials without a public origin', () => {
    expect(() => storageOptionsFromEnv({ S3_BUCKET: 'b' })).toThrow(/must be set together/)
    expect(() =>
      storageOptionsFromEnv({
        S3_ENDPOINT: 'e',
        S3_BUCKET: 'b',
        S3_ACCESS_KEY_ID: 'k',
        S3_SECRET_ACCESS_KEY: 's',
      }),
    ).toThrow(/MEDIA_ORIGIN/)
  })
})

describe('mediaUrl', () => {
  it('joins origin and key with exactly one slash', () => {
    expect(mediaUrl('https://m.test/', '/a/b.webp')).toBe('https://m.test/a/b.webp')
  })
})
