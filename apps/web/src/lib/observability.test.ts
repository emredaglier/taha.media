import { describe, expect, it } from 'vitest'

import { beaconAttributes, scrubEvent, sentryOptions } from './observability'

describe('beaconAttributes', () => {
  const live = { token: 'abc123', production: true, preview: false }

  it('loads the beacon in production with a token', () => {
    expect(beaconAttributes(live)).toEqual({
      src: 'https://static.cloudflareinsights.com/beacon.min.js',
      'data-cf-beacon': '{"token":"abc123"}',
    })
  })

  it.each([
    ['no token', { ...live, token: undefined }],
    ['a blank token', { ...live, token: '  ' }],
    ['a development build', { ...live, production: false }],
    ['the preview instance', { ...live, preview: true }],
  ])('stays off with %s', (_name, options) => {
    expect(beaconAttributes(options)).toBeNull()
  })
})

describe('sentryOptions', () => {
  it('starts only with a DSN, and passes the release along', () => {
    expect(
      sentryOptions({ dsn: 'https://k@o1.ingest.sentry.io/2', preview: false, release: 'abc' }),
    ).toEqual({ dsn: 'https://k@o1.ingest.sentry.io/2', release: 'abc' })
  })

  it('stays off without a DSN, and on the preview instance', () => {
    expect(sentryOptions({ dsn: undefined, preview: false })).toBeNull()
    expect(sentryOptions({ dsn: '', preview: false })).toBeNull()
    expect(sentryOptions({ dsn: 'https://k@o1.ingest.sentry.io/2', preview: true })).toBeNull()
  })
})

describe('scrubEvent', () => {
  const event = {
    message: 'boom',
    user: { id: '7', email: 'a@b.c', ip_address: '203.0.113.9' },
    request: {
      url: 'https://taha.media/isler',
      cookies: { session: 'secret' },
      headers: {
        Cookie: 'session=secret',
        Authorization: 'Bearer x',
        'User-Agent': 'Mozilla/5.0',
      },
    },
  }

  it('sends no user, so no IP address', () => {
    expect(scrubEvent(event)).not.toHaveProperty('user')
  })

  it('sends no cookies, in the request or in its headers, and no credentials', () => {
    const { request } = scrubEvent(event)
    expect(request).not.toHaveProperty('cookies')
    expect(Object.keys(request.headers).map((name) => name.toLowerCase())).toEqual(['user-agent'])
  })

  it('keeps what makes the error useful', () => {
    const scrubbed = scrubEvent(event)
    expect(scrubbed.message).toBe('boom')
    expect(scrubbed.request.url).toBe('https://taha.media/isler')
  })

  it('handles an event with no request, and leaves the original untouched', () => {
    expect(scrubEvent({ message: 'x', user: { ip_address: '1.1.1.1' } })).toEqual({ message: 'x' })
    expect(event.user.ip_address).toBe('203.0.113.9')
  })
})
