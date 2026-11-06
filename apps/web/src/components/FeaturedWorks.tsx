import { DISCIPLINE_LABELS } from '@taha/cms-config'
import Link from 'next/link'

import type { Work } from '../data/works'
import { featuredGroups, type Slot } from '../lib/featured-slots'
import { LoopVideo } from './LoopVideo'
import { Picture } from './Picture'

/**
 * Where each slot sits from 700px up (a 12-column grid, A and B overlapping) and its media
 * shape; below 700px every card stacks. Positions are wireframe placeholders (the FLOW frames).
 */
const SLOT_STYLE: Record<Slot, { place: string; shape: string }> = {
  A: { place: 'min-[700px]:col-start-1 min-[700px]:col-span-5', shape: 'aspect-video' },
  B: {
    place: 'min-[700px]:col-start-4 min-[700px]:col-span-6 min-[700px]:mt-[10vw] relative z-10',
    shape: 'aspect-video',
  },
  C: {
    place: 'min-[700px]:col-start-10 min-[700px]:col-span-3 min-[700px]:mt-[3vw]',
    shape: 'aspect-[9/16]',
  },
}

const SIZES = '(min-width: 700px) 50vw, 100vw'

function FeaturedCard({ work, slot }: { work: Work; slot: Slot }) {
  const { place, shape } = SLOT_STYLE[slot]
  return (
    <li data-slot={slot} className={`min-[700px]:row-start-1 ${place}`}>
      <Link href={`/isler/${work.slug}`} className="block">
        <div className={`relative overflow-hidden bg-placeholder ${shape}`}>
          {work.previewLoop ? (
            <LoopVideo video={work.previewLoop} sizes={SIZES} hoverToPlay fill />
          ) : (
            <Picture
              image={work.cover}
              sizes={SIZES}
              className="absolute inset-0 size-full object-cover"
            />
          )}
        </div>
        <div className="mt-2 flex justify-between gap-4 text-sm">
          <p>{work.disciplines.map((discipline) => DISCIPLINE_LABELS[discipline]).join(' · ')}</p>
          {work.client ? <p className="text-text-muted">{work.client}</p> : null}
        </div>
        <h3 className="sr-only">{work.title}</h3>
      </Link>
    </li>
  )
}

/**
 * The Featured Works in the FLOW's A/B/C arrangement, repeated for each further group of three,
 * then a link to every Work. Nothing at all when there are none.
 */
export function FeaturedWorks({ works }: { works: Work[] }) {
  if (works.length === 0) return null
  return (
    <section aria-labelledby="featured-heading" className="py-12">
      <h2 id="featured-heading" className="sr-only">
        Öne çıkan işler
      </h2>
      {featuredGroups(works).map((group, index) => (
        <ul
          key={index}
          className="mb-12 grid grid-cols-1 gap-8 min-[700px]:grid-cols-12 min-[700px]:gap-x-0"
        >
          {group.map(({ slot, item }) => (
            <FeaturedCard key={item.id} work={item} slot={slot} />
          ))}
        </ul>
      ))}
      <Link href="/isler" className="underline">
        Tüm işler
      </Link>
    </section>
  )
}
