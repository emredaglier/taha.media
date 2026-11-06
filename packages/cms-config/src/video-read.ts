import { toImage, type ImageRead } from './image-read'
import type { Image, Video } from './payload-types'

/** A Video as the data module returns it. Everything the frontend needs to reserve space. */
export type VideoRead = {
  id: number
  /** Public URL of the MP4. */
  src: string
  width: number
  height: number
  /** Length in seconds. */
  duration: number
  hasAudio: boolean
  /** Shown before playback, without JavaScript and under reduced motion. */
  poster: ImageRead
}

/**
 * Maps a Video document (poster populated, so read at depth 2 from a Work) to its read shape.
 * Throws on an unpopulated poster: a Video cannot be saved without one.
 */
export function toVideo(doc: Video): VideoRead {
  if (typeof doc.poster !== 'object' || doc.poster === null) {
    throw new Error('A Video has no populated poster.')
  }
  return {
    id: doc.id,
    src: doc.url ?? '',
    width: doc.width ?? 0,
    height: doc.height ?? 0,
    duration: doc.duration ?? 0,
    hasAudio: doc.hasAudio ?? false,
    poster: toImage(doc.poster as Image),
  }
}
