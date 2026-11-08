import type { ImageRead } from '@taha/cms-config'

import type { GalleryItem } from '../data/gallery'

/**
 * The file a visitor without JavaScript gets from an item's link: the largest picture for an
 * image, the MP4 for a loop.
 */
export const fullSizeFile = (item: GalleryItem): string =>
  item.kind === 'image' ? item.image.fullSrc : item.video.src

/** What the grid shows for an item: the picture itself, or a loop's poster (it never plays there). */
export const gridPicture = (item: GalleryItem): ImageRead =>
  item.kind === 'image' ? item.image : item.video.poster

/** The stored width and height, which reserve the lightbox frame before anything loads. */
export const mediaSize = (item: GalleryItem): { width: number; height: number } =>
  item.kind === 'image'
    ? { width: item.image.width, height: item.image.height }
    : { width: item.video.width, height: item.video.height }

/** "Caption · 2025", or whichever of the two is set; null when neither is. */
export const captionLine = (item: GalleryItem): string | null =>
  [item.caption, item.year].filter((part) => part !== null && part !== '').join(' · ') || null
