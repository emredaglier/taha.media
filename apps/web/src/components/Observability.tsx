'use client'

import { browserTracingIntegration, getDefaultIntegrations, init } from '@sentry/browser'
import { useEffect } from 'react'

import { SENTRY_TRACES_SAMPLE_RATE, scrubEvent, type SentryOptions } from '../lib/observability'

/**
 * Sentry, browser only (ADR-0007). The layout renders this only when `sentryOptions` returns
 * options (a DSN, and not the preview instance), so otherwise none of it runs. No replay, no
 * cookies, a low tracing sample rate, and every event is scrubbed of personal data first. The
 * default `BrowserSession` integration is dropped: it writes release-health sessions to storage.
 */
export function Observability({ options }: { options: SentryOptions }) {
  useEffect(() => {
    init({
      ...options,
      dataCollection: { userInfo: false },
      tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
      beforeSend: scrubEvent,
      beforeSendTransaction: scrubEvent,
      defaultIntegrations: getDefaultIntegrations({}).filter((i) => i.name !== 'BrowserSession'),
      integrations: [browserTracingIntegration()],
    })
    // The root layout's props persist across client navigations, so this runs once per page load.
  }, [options])
  return null
}
