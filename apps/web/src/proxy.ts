import { NextResponse, type NextRequest } from 'next/server'

import { isPreviewInstance, PREVIEW_ROBOTS } from './lib/preview'

/**
 * Runs on every request, at runtime, so one build serves both instances: the preview instance
 * (`PREVIEW=1`) tells crawlers to stay away on every response, prerendered pages included (a
 * `next.config` header would be fixed at build time, when PREVIEW is never set).
 *
 * Nothing in the request decides it: only the instance's environment does.
 *
 * The frontend may add its own routing here; keep the preview header on every response.
 */
export function proxy(_request: NextRequest): NextResponse {
  const response = NextResponse.next()
  if (isPreviewInstance()) response.headers.set('x-robots-tag', PREVIEW_ROBOTS)
  return response
}

export const config = { matcher: '/((?!_next/static|_next/image).*)' }
