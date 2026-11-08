import { notFound, permanentRedirect, redirect } from 'next/navigation'
import { describe, expect, it } from 'vitest'

import { layoutsOnPath, outcomeOfThrown } from './page-html'

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

describe('layoutsOnPath', () => {
  const layouts = [
    '../app/layout.tsx',
    '../app/(site)/layout.tsx',
    '../app/(site)/isler/layout.tsx',
    '../app/galeri/layout.tsx',
  ]

  it('lists the layouts above a page, outermost first, route groups included', () => {
    expect(layoutsOnPath('../app/(site)/isler/[slug]/page.tsx', layouts)).toEqual([
      '../app/layout.tsx',
      '../app/(site)/layout.tsx',
      '../app/(site)/isler/layout.tsx',
    ])
  })

  it('leaves out a layout the page is not inside', () => {
    expect(layoutsOnPath('../app/page.tsx', layouts)).toEqual(['../app/layout.tsx'])
    expect(layoutsOnPath('../app/(site)/hakkimda/page.tsx', layouts)).toEqual([
      '../app/layout.tsx',
      '../app/(site)/layout.tsx',
    ])
  })

  it('gives the root not-found page only the root layout', () => {
    expect(layoutsOnPath('../app/not-found.tsx', layouts)).toEqual(['../app/layout.tsx'])
  })
})
