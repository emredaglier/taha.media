import type { Metadata } from 'next'

import { GalleryGrid } from '../../components/GalleryGrid'
import { getGalleryItems } from '../../data/gallery'

export const metadata: Metadata = { title: 'Galeri' }

// The Docker image builds with no database, and a page must not read content at build time
// (infra/README.md, "What the frontend must provide", item 8). So this renders per request; the
// read is still tag-cached, so it is cheap and revalidates when a Gallery item is saved (the
// `gallery` tag, ADR-0012).
export const dynamic = 'force-dynamic'

/** Every Gallery item in the Editor's order. Without JavaScript each item links to its file. */
export default async function GalleryPage() {
  const items = await getGalleryItems()
  return (
    <div className="py-8">
      <h1 className="mb-6 font-serif text-4xl">Galeri</h1>
      {items.length === 0 ? (
        <p className="text-text-muted">Galeri henüz boş.</p>
      ) : (
        <GalleryGrid items={items} />
      )}
    </div>
  )
}
