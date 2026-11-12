import { toImage, type ImageRead } from './image-read'
import type { ExternalProvider } from './external-video'
import type { Image, Video, Work } from './payload-types'
import { toVideo, type VideoRead } from './video-read'

/**
 * A Work's main media as the data module returns it: a discriminated union by `kind`. Only the
 * fields of the kind exist.
 */
export type MainMedia =
  | { kind: 'video'; video: VideoRead }
  | {
      kind: 'external'
      provider: ExternalProvider
      /** The provider's video id. */
      id: string
      /** The address the Editor pasted. */
      url: string
      /** Shown as a click-to-load player (frontend ADR-0102). */
      poster: ImageRead
    }
  | { kind: 'image'; image: ImageRead }

/** A populated relationship, or null when it is only an id (or empty). */
export const populated = <T>(value: number | T | null | undefined): T | null =>
  typeof value === 'object' && value !== null ? value : null

/**
 * Maps a Work's `mainMedia` group (read at depth 2, so Videos, posters and Images are populated).
 * Throws when a published Work has none or an incomplete one: publishing enforces it.
 */
export function toMainMedia(group: Work['mainMedia']): MainMedia {
  const incomplete = () => new Error('A published Work has no complete main media.')
  switch (group?.kind) {
    case 'video': {
      const video = populated<Video>(group.video)
      if (!video) throw incomplete()
      return { kind: 'video', video: toVideo(video) }
    }
    case 'image': {
      const image = populated<Image>(group.image)
      if (!image) throw incomplete()
      return { kind: 'image', image: toImage(image) }
    }
    case 'external': {
      const poster = populated<Image>(group.externalPoster)
      if (!poster || !group.externalProvider || !group.externalId || !group.externalUrl) {
        throw incomplete()
      }
      return {
        kind: 'external',
        provider: group.externalProvider,
        id: group.externalId,
        url: group.externalUrl,
        poster: toImage(poster),
      }
    }
    default:
      throw incomplete()
  }
}
