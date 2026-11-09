import type { Metadata } from 'next'

import { RichText } from '../../../components/RichText'
import { getPrivacy } from '../../../data/pages'
import { seoToMetadata } from '../../../lib/seo'

const TITLE = 'Gizlilik'

// The Docker image builds with no database, and a page must not read content at build time
// (infra/README.md, "What the frontend must provide", item 8). So this renders per request; the
// read is still tag-cached, so it is cheap and revalidates when the Privacy page is published.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const privacy = await getPrivacy()
  return privacy ? seoToMetadata(privacy.seo) : { title: TITLE }
}

/**
 * The privacy notice. The footer links here, so an unpublished or empty notice still renders the
 * heading and a short note (status 200) instead of a 404.
 */
export default async function PrivacyPage() {
  const privacy = await getPrivacy()
  return (
    <article className="max-w-2xl py-8">
      <h1 className="mb-6 font-serif text-4xl">{TITLE}</h1>
      {privacy?.body ? (
        <RichText data={privacy.body} />
      ) : (
        <p className="text-text-muted">Gizlilik metni henüz yayınlanmadı.</p>
      )}
    </article>
  )
}
