import type { ImageRead, VideoRead } from '@taha/cms-config'
import { GALLERY_TAG, HOME_TAG, pageTag } from '@taha/cms-config/tags'
import { connection } from 'next/server'

import { cachedRead } from './cache'
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

const NONE: MenuMedia = { isler: null, galeri: null, hakkimda: null }

/**
 * Composed from the existing reads and cached under their tags (Featured Works, Gallery, About),
 * so it is rebuilt when the CMS sends any of them and a page request reads one small value.
 *
 * A failed read gives grey slots, and is logged. The image builds with no database (infra/README.md
 * item 8), and a failed read must not be baked into a prerendered page: `connection()` then makes
 * that render dynamic, so the next request reads again.
 */
export async function getMenuMedia(): Promise<MenuMedia> {
  try {
    return await cachedRead(
      ['menu-media'],
      [HOME_TAG, GALLERY_TAG, pageTag('about')],
      async (): Promise<MenuMedia> => {
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
      },
    )
  } catch (error) {
    console.error('menu: the frame pictures could not be read; the frames stay grey', error)
    await connection()
    return NONE
  }
}
