import { notFound, permanentRedirect, redirect } from 'next/navigation'
import { expect, it } from 'vitest'

import { outcomeOfThrown } from './page-html'

/** What a page's `notFound()` or redirect call throws, as the helper sees it. */
const thrownBy = (call: () => never): unknown => {
  try {
    call()
  } catch (error) {
    return error
  }
  throw new Error('did not throw')
}

it('reports notFound() as not-found', () => {
  expect(outcomeOfThrown(thrownBy(notFound))).toMatchObject({ kind: 'not-found', status: 404 })
})

it('reports permanentRedirect() as a permanent redirect with its target', () => {
  expect(outcomeOfThrown(thrownBy(() => permanentRedirect('/isler/yeni-ad')))).toEqual({
    kind: 'redirect',
    status: 308,
    permanent: true,
    target: '/isler/yeni-ad',
  })
})

it('reports a temporary redirect as not permanent', () => {
  expect(outcomeOfThrown(thrownBy(() => redirect('/gecici')))).toMatchObject({
    kind: 'redirect',
    permanent: false,
    target: '/gecici',
  })
})

it('leaves ordinary errors alone', () => {
  expect(outcomeOfThrown(new Error('boom'))).toBeNull()
})
