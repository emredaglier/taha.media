import type { Metadata } from 'next'

import { FeaturedWorks, toRoomWork, withPreviewLoop } from '../components/FeaturedWorks'
import { Hero } from '../components/Hero'
import { HomeLoader } from '../components/HomeLoader'
import { HomeRoom } from '../components/HomeRoom'
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
 * HTML every visitor gets first, and all that visitors without the Edit Room get. On a capable
 * device the Edit Room mounts over it, and the static Home stays in the page, visually hidden, so
 * screen readers and keyboards still reach every Work. Home holds the screen and has no footer, so it sits outside the `(site)` route group and
 * renders its own `main`, a column the hero fills when no card follows it.
 */
export default async function HomePage() {
  const [site, featured] = await Promise.all([getSite(), getFeaturedWorks()])
  const works = withPreviewLoop(featured)
  return (
    <PageMain className="flex flex-col">
      <div className="flex flex-1 flex-col">
        <Hero site={site} />
        <div className="room:sr-only">
          <FeaturedWorks works={works} />
        </div>
      </div>
      {works.length > 0 ? (
        <>
          <HomeLoader />
          <HomeRoom works={works.map(toRoomWork)} showreel={site?.showreel ?? null} />
        </>
      ) : null}
    </PageMain>
  )
}
