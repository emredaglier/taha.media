import { DISCIPLINE_LABELS, type VideoRead } from '@taha/cms-config'
import Link from 'next/link'

import type { Work } from '../data/works'
import { WORK_LINK_ATTRIBUTE } from '../lib/home-marks'
import { LoopVideo } from './LoopVideo'

/** A Featured Work Home can show: it has the Preview loop its card plays over its poster. */
export type FeaturedWork = Work & { previewLoop: VideoRead }

/**
 * Leaves out the Works that have no Preview loop, in the order they came. The CMS refuses to
 * publish a featured Work without one (backend #43), so this only keeps older data, and drafts on
 * the preview instance, from breaking Home.
 */
export const withPreviewLoop = (works: Work[]): FeaturedWork[] =>
  works.filter((work): work is FeaturedWork => work.previewLoop !== null)

const disciplineLine = (work: Work) =>
  work.disciplines.map((discipline) => DISCIPLINE_LABELS[discipline]).join(' · ')

/** What a Helix card and its overlay need of a Featured Work, and nothing more. */
export type HelixWork = {
  slug: string
  title: string
  /** The Disciplines as one line. */
  disciplines: string
  client: string | null
  /** The Preview loop's poster, the card's still frame. */
  poster: { src: string; width: number; height: number; focalPoint: { x: number; y: number } }
}

export const toHelixWork = (work: FeaturedWork): HelixWork => {
  const { src, width, height, focalPoint } = work.previewLoop.poster
  return {
    slug: work.slug,
    title: work.title,
    disciplines: disciplineLine(work),
    client: work.client,
    poster: { src, width, height, focalPoint },
  }
}

/** One column on phones, two from 700px, three from 1100px. */
const SIZES = '(min-width: 1100px) 33vw, (min-width: 700px) 50vw, 100vw'

function FeaturedCard({ work }: { work: FeaturedWork }) {
  return (
    <li>
      <Link
        href={`/isler/${work.slug}`}
        className="group block"
        {...{ [WORK_LINK_ATTRIBUTE]: work.slug }}
      >
        {/* The loop fills a 16:9 box, so media that isn't quite 16:9 is cropped, never stretched. */}
        <div className="relative aspect-video overflow-hidden bg-placeholder">
          <LoopVideo video={work.previewLoop} sizes={SIZES} hoverToPlay fill />
        </div>
        <h3 className="mt-3 font-serif text-xl group-hover:underline">{work.title}</h3>
        <div className="mt-1 flex justify-between gap-4 text-sm">
          <p>{disciplineLine(work)}</p>
          {work.client ? <p className="text-text-muted">{work.client}</p> : null}
        </div>
      </Link>
    </li>
  )
}

/**
 * The Featured Works as plain 16:9 cards, in the Editor's order, each linking to its Work. Nothing
 * at all when there are none. This is the static Home (ADR-0103): what every visitor's server HTML
 * has, and all that visitors without the Helix get.
 */
export function FeaturedWorks({ works }: { works: FeaturedWork[] }) {
  if (works.length === 0) return null
  return (
    <section aria-labelledby="featured-heading" className="py-12">
      <h2 id="featured-heading" className="sr-only">
        Öne çıkan işler
      </h2>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-10 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-3">
        {works.map((work) => (
          <FeaturedCard key={work.id} work={work} />
        ))}
      </ul>
    </section>
  )
}
