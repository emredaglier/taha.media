import { DISCIPLINE_LABELS } from '@taha/cms-config'
import type { Metadata } from 'next'

import { Picture } from '../../../components/Picture'
import { RichText } from '../../../components/RichText'
import { getAbout, getSite } from '../../../data/pages'
import { seoToMetadata } from '../../../lib/seo'

const TITLE = 'Hakkımda'

// The Docker image builds with no database, and a page must not read content at build time
// (infra/README.md, "What the frontend must provide", item 8). So this renders per request; the
// reads are still tag-cached and revalidate when the page is published.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const about = await getAbout()
  return about ? seoToMetadata(about.seo) : { title: TITLE }
}

/**
 * The About page and contact's main home. Every part is left out when empty; an unpublished About
 * still renders the heading and the contact.
 */
export default async function AboutPage() {
  const [about, site] = await Promise.all([getAbout(), getSite()])
  const email = site?.email ?? null
  const socials = (site?.socials ?? []).filter((social) => social.url.trim() !== '')
  return (
    <article className="max-w-2xl py-8">
      <h1 className="mb-6 font-serif text-4xl">{TITLE}</h1>
      {about?.portrait ? (
        <Picture
          image={about.portrait}
          sizes="(min-width: 42rem) 42rem, 100vw"
          className="mb-6 w-full max-w-sm bg-placeholder"
          priority
        />
      ) : null}
      {about?.bio ? <RichText data={about.bio} /> : null}
      {about?.disciplineLines.length ? (
        <dl className="my-8 space-y-3">
          {about.disciplineLines.map(({ discipline, line }) => (
            <div key={discipline}>
              <dt className="font-serif text-lg">{DISCIPLINE_LABELS[discipline]}</dt>
              <dd className="text-text-muted">{line}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {about?.clients.length ? (
        <section className="my-8">
          <h2 className="mb-4 font-serif text-2xl">Müşteriler</h2>
          <ul className="space-y-3">
            {about.clients.map((client, index) => (
              <li key={index} className="flex items-center gap-3">
                {client.logo ? (
                  <Picture
                    image={client.logo}
                    sizes="4rem"
                    className="h-12 w-12 bg-placeholder object-contain"
                  />
                ) : null}
                <span>{client.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {email || socials.length ? (
        <section className="my-8">
          <h2 className="mb-4 font-serif text-2xl">İletişim</h2>
          {email ? (
            <p className="mb-3">
              <a href={`mailto:${email}`} className="underline">
                {email}
              </a>
            </p>
          ) : null}
          {socials.length ? (
            <ul className="space-y-1">
              {socials.map((social, index) => (
                <li key={index}>
                  <a href={social.url} className="underline">
                    {social.platform}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </article>
  )
}
