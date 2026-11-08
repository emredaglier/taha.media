import type { Metadata } from 'next'

import { FeaturedWorks, withPreviewLoop } from '../components/FeaturedWorks'
import { Hero } from '../components/Hero'
import { PageMain } from '../components/PageFrame'
import { getSite } from '../data/pages'
import { getFeaturedWorks } from '../data/works'
import { seoToMetadata } from '../lib/seo'

// The Docker image builds with no database, so Home must not read content at build time
// (infra/README.md, "What the frontend must provide", item 8). Each read is tag-cached.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite()
  return site ? seoToMetadata(site.seo, { home: true }) : {}
}

/**
 * The static Home (ADR-0103): the hero, then the Featured Works as plain cards. It is the server
 * HTML every visitor gets first, and all that visitors without the Helix get. Home holds the
 * screen and has no footer, so it sits outside the `(site)` route group and renders its own
 * `main`, a column the hero fills when no card follows it.
 */
export default async function HomePage() {
  const [site, featured] = await Promise.all([getSite(), getFeaturedWorks()])
  return (
    <PageMain className="flex flex-col">
      <Hero site={site} />
      <FeaturedWorks works={withPreviewLoop(featured)} />
    </PageMain>
  )
}
