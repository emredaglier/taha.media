import type { ImageRead, VideoRead } from '@taha/cms-config'

import { getGalleryItems, type GalleryItem } from './gallery'
import { getAbout } from './pages'
import { getFeaturedWorks } from './works'

/** The pictures in the menu's three frames (ADR-0106); null leaves a frame's grey slot. */
export type MenuMedia = {
  /** İşler: the first Featured Work's Preview loop. */
  isler: VideoRead | null
  /** Galeri: the first Gallery item, a loop or a still. */
  galeri: GalleryItem | null
  /** Hakkımda: the About portrait. */
  hakkimda: ImageRead | null
}

/**
 * Composed from the existing tag-cached reads. A failed read gives all nulls: the image builds
 * with no database (infra/README.md item 8), and the menu shows its grey slots instead.
 */
export async function getMenuMedia(): Promise<MenuMedia> {
  try {
    const [works, gallery, about] = await Promise.all([
      getFeaturedWorks(),
      getGalleryItems(),
      getAbout(),
    ])
    return {
      isler: works.find((work) => work.previewLoop)?.previewLoop ?? null,
      galeri: gallery[0] ?? null,
      hakkimda: about?.portrait ?? null,
    }
  } catch {
    return { isler: null, galeri: null, hakkimda: null }
  }
}
