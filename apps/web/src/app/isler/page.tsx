import { DISCIPLINE_LABELS, DISCIPLINES, type Discipline } from '@taha/cms-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { WorkCard } from '../../components/WorkCard'
import { getWorks } from '../../data/works'

export const metadata: Metadata = { title: 'İşler' }

type Query = { disiplin?: string | string[] }

/**
 * The `?disiplin=` value as a Discipline, or undefined for no filter. Anything else (an unknown or
 * empty or repeated value) is not found: `getWorks` throws on it, so it is checked before the read.
 */
function disciplineFromQuery(value: Query['disiplin']): Discipline | undefined {
  if (value === undefined) return undefined
  const found = DISCIPLINES.find((discipline) => discipline === value)
  if (!found) notFound()
  return found
}

/** Reads `?disiplin=`, so Next renders it per request (ADR-0012); the data is still tag-cached. */
export default async function WorksPage({ searchParams }: { searchParams: Promise<Query> }) {
  const discipline = disciplineFromQuery((await searchParams).disiplin)
  const works = await getWorks({ discipline })
  const filters = [
    { label: 'Tümü', href: '/isler', current: discipline === undefined },
    ...DISCIPLINES.map((value) => ({
      label: DISCIPLINE_LABELS[value],
      href: `/isler?disiplin=${value}`,
      current: discipline === value,
    })),
  ]

  return (
    <div className="py-8">
      <h1 className="mb-6 font-serif text-4xl">İşler</h1>
      <nav aria-label="Disiplin" className="mb-8 flex flex-wrap gap-x-6 gap-y-2">
        {filters.map(({ label, href, current }) => (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={current ? 'underline' : 'text-text-muted'}
          >
            {label}
          </Link>
        ))}
      </nav>
      {works.length === 0 ? (
        <p className="text-text-muted">
          {discipline ? 'Bu disiplinde henüz iş yok.' : 'Henüz iş yok.'}
        </p>
      ) : (
        <ul className="grid gap-x-6 gap-y-10 md:grid-cols-2">
          {works.map((work) => (
            <li key={work.id}>
              <WorkCard work={work} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
