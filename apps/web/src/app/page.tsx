import type { Metadata } from 'next'
import Link from 'next/link'

import { FeaturedWorks } from '../components/FeaturedWorks'
import { Hero } from '../components/Hero'
import { Picture } from '../components/Picture'
import { RichText } from '../components/RichText'
import { getAbout, getSite } from '../data/pages'
import { getFeaturedWorks } from '../data/works'
import { firstParagraph } from '../lib/first-paragraph'
import { seoToMetadata } from '../lib/seo'

// The Docker image builds with no database, so Home must not read content at build time
// (infra/README.md, "What the frontend must provide", item 8). Each read is tag-cached.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite()
  return site ? seoToMetadata(site.seo, { home: true }) : {}
}

/** Home's static layout: what phones, reduced motion and no-JavaScript visitors get. */
export default async function HomePage() {
  const [site, featured, about] = await Promise.all([getSite(), getFeaturedWorks(), getAbout()])
  const intro = firstParagraph(about?.bio)
  return (
    <>
      <Hero site={site} />
      <FeaturedWorks works={featured} />
      {about?.portrait || intro ? (
        <section aria-labelledby="about-heading" className="grid gap-6 py-12 md:grid-cols-2">
          <h2 id="about-heading" className="sr-only">
            Hakkımda
          </h2>
          {about?.portrait ? (
            <Picture
              image={about.portrait}
              sizes="(min-width: 768px) 50vw, 100vw"
              className="h-auto w-full"
            />
          ) : null}
          <div>
            {intro ? <RichText data={intro} /> : null}
            <Link href="/hakkimda" className="underline">
              Daha fazlası
            </Link>
          </div>
        </section>
      ) : null}
    </>
  )
}
