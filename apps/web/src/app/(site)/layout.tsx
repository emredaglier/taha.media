import type { ReactNode } from 'react'

import { PageFrame } from '../../components/PageFrame'

/**
 * The pages with a footer: İşler, a Work, Hakkımda, Gizlilik and the pages to come. Home sits
 * outside this route group because it has none (ADR-0103). A route group adds nothing to the URL.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <PageFrame>{children}</PageFrame>
}
