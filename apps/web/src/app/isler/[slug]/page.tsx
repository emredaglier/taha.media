import { DISCIPLINE_LABELS } from '@taha/cms-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'

import { ExternalVideo } from '../../../components/ExternalVideo'
import { Picture } from '../../../components/Picture'
import { RichText } from '../../../components/RichText'
import { getPublishedWorkSlugs, getWorkBySlug, getWorks, type Work } from '../../../data/works'
import { mediaFrameStyle } from '../../../lib/media-frame'
import { nextWork } from '../../../lib/next-work'
import { seoToMetadata } from '../../../lib/seo'

type Params = { slug: string }

const MAIN_SIZES = '(min-width: 1024px) 64rem, 100vw'
const STILL_SIZES = '(min-width: 768px) 50vw, 100vw'

/**
 * Work pages render and cache on first request: the Docker image builds with no database, and a
 * page must not read content at build time (infra/README.md, item 8). So when the read fails,
 * there is nothing to prerender; `dynamicParams` stays true for everything else.
 */
export const dynamicParams = true

export async function generateStaticParams(): Promise<Params[]> {
  try {
    return (await getPublishedWorkSlugs()).map((slug) => ({ slug }))
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const found = await getWorkBySlug((await params).slug)
  return found.kind === 'work' ? seoToMetadata(found.work.seo) : {}
}

function MainMedia({ work }: { work: Work }) {
  const media = work.mainMedia
  switch (media.kind) {
    case 'video': {
      const { video } = media
      const ratio = video.width > 0 && video.height > 0 ? [video.width, video.height] : [16, 9]
      return (
        <div className="mx-auto bg-placeholder" style={mediaFrameStyle(ratio[0]!, ratio[1]!)}>
          <video
            src={video.src}
            poster={video.poster.src}
            controls
            playsInline
            preload="none"
            className="size-full"
          />
        </div>
      )
    }
    case 'external':
      return (
        <ExternalVideo
          provider={media.provider}
          id={media.id}
          poster={media.poster}
          width={media.poster.width}
          height={media.poster.height}
          title={work.title}
          sizes={MAIN_SIZES}
        />
      )
    case 'image':
      return (
        <Picture
          image={media.image}
          sizes={MAIN_SIZES}
          priority
          className="mx-auto h-auto max-h-[80svh] w-auto max-w-full bg-placeholder"
        />
      )
  }
}

/** One Work: main media first, then the details, the stills and a link to the next Work. */
export default async function WorkPage({ params }: { params: Promise<Params> }) {
  const found = await getWorkBySlug((await params).slug)
  if (found.kind === 'redirect') permanentRedirect(`/isler/${found.slug}`)
  if (found.kind === 'notFound') notFound()

  const { work } = found
  const works = await getWorks()
  const nextSlug = nextWork(
    works.map((each) => each.slug),
    work.slug,
  )
  const next = works.find((each) => each.slug === nextSlug)
  const facts = [
    { label: 'Yıl', value: String(work.year) },
    { label: 'Müşteri', value: work.client },
    { label: 'Rol', value: work.role },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value))

  return (
    <article className="py-8">
      <MainMedia work={work} />

      <header className="mt-8 mb-8">
        <h1 className="mb-2 font-serif text-4xl">{work.title}</h1>
        <p className="text-text-muted">
          {work.disciplines.map((discipline) => DISCIPLINE_LABELS[discipline]).join(' · ')}
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
          {facts.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-sm text-text-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {work.credits.length > 0 && (
        <section aria-labelledby="credits" className="mb-8">
          <h2 id="credits" className="mb-3 font-serif text-2xl">
            Emeği geçenler
          </h2>
          <ul>
            {work.credits.map((credit, index) => (
              <li key={index}>
                {credit.name}
                {credit.role && <span className="text-text-muted"> · {credit.role}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {work.description && (
        <div className="mb-8 max-w-2xl">
          <RichText data={work.description} />
        </div>
      )}

      {work.stills.length > 0 && (
        <ul className="mb-12 grid gap-6 md:grid-cols-2">
          {work.stills.map((still) => (
            <li key={still.src}>
              <Picture image={still} sizes={STILL_SIZES} className="h-auto w-full bg-placeholder" />
            </li>
          ))}
        </ul>
      )}

      {next && (
        <nav aria-label="Sonraki iş" className="border-t pt-6">
          <Link href={`/isler/${next.slug}`} className="block">
            <span className="block text-sm text-text-muted">Sonraki iş</span>
            <span className="font-serif text-2xl underline">{next.title} →</span>
          </Link>
        </nav>
      )}
    </article>
  )
}
