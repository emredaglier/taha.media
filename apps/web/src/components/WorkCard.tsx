import { DISCIPLINE_LABELS } from '@taha/cms-config'
import Link from 'next/link'

import type { Work } from '../data/works'
import { LoopVideo } from './LoopVideo'
import { Picture } from './Picture'

const SIZES = '(min-width: 768px) 50vw, 100vw'

/** A Work in a list: its Preview loop (or cover), title, Disciplines and year, linking to its page. */
export function WorkCard({ work }: { work: Work }) {
  return (
    <Link href={`/isler/${work.slug}`} className="group block" data-cursor="İzle">
      {work.previewLoop ? (
        <LoopVideo video={work.previewLoop} sizes={SIZES} hoverToPlay />
      ) : (
        <Picture image={work.cover} sizes={SIZES} className="h-auto w-full bg-placeholder" />
      )}
      <div className="mt-3 flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-xl group-hover:underline group-hand-hover:underline">
          {work.title}
        </h2>
        <p className="text-sm text-text-muted">{work.year}</p>
      </div>
      <p className="text-sm text-text-muted">
        {work.disciplines.map((discipline) => DISCIPLINE_LABELS[discipline]).join(' · ')}
      </p>
    </Link>
  )
}
