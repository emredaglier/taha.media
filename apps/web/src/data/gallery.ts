import {
  fullSizeUrl,
  toImage,
  toVideo,
  type GalleryDoc,
  type ImageDoc,
  type ImageRead,
  type VideoDoc,
  type VideoRead,
} from '@taha/cms-config'
import { GALLERY_TAG } from '@taha/cms-config/tags'

import { getWebPayload } from '../lib/payload'
import { cachedRead, contentVersions } from './cache'

type Common = {
  id: number
  caption: string | null
  year: number | null
}

/** A Gallery item (GLOSSARY): one Image or one Gallery loop. */
export type GalleryItem =
  | (Common & {
      kind: 'image'
      /** Sizes, dimensions, focal point and alt text, as everywhere; `fullSrc` is the file to open. */
      image: ImageRead & { fullSrc: string }
    })
  | (Common & {
      kind: 'loop'
      /** The silent loop with its poster, which the grid shows. */
      video: VideoRead
    })

const text = (value: string | null | undefined): string | null => value?.trim() || null

const populated = <T extends object>(value: number | T | null | undefined): T | null =>
  typeof value === 'object' && value !== null ? value : null

/**
 * An item whose Image or Video is not populated cannot be shown, and the save rules make that
 * impossible, so it is skipped rather than failing the whole page.
 */
function toItems(doc: GalleryDoc): GalleryItem[] {
  const common = { id: doc.id, caption: text(doc.caption), year: doc.year ?? null }
  if (doc.kind === 'loop') {
    const video = populated<VideoDoc>(doc.video)
    return video ? [{ ...common, kind: 'loop', video: toVideo(video) }] : []
  }
  const image = populated<ImageDoc>(doc.image)
  return image
    ? [{ ...common, kind: 'image', image: { ...toImage(image), fullSrc: fullSizeUrl(image) } }]
    : []
}

/**
 * Every Gallery item in the Editor's order: new items first until they are dragged elsewhere. No
 * cap and no pagination. Items have no drafts, so the preview instance reads the same items as the
 * public one, just uncached.
 */
export function getGalleryItems(): Promise<GalleryItem[]> {
  return cachedRead(['gallery'], [GALLERY_TAG], async () => {
    const payload = await getWebPayload()
    const { docs } = await payload.find({
      collection: 'gallery',
      ...contentVersions(),
      // Depth 2 populates the Image, and the Video with its poster.
      depth: 2,
      sort: '_order',
      limit: 0,
      pagination: false,
    })
    return docs.flatMap(toItems)
  })
}
