'use client'

import type { ExternalProvider, ImageRead } from '@taha/cms-config'
import { useState } from 'react'

import { mediaFrameStyle } from '../lib/media-frame'
import { Picture } from './Picture'

/** The privacy-friendly player address (ADR-0102): Vimeo with `dnt=1`, YouTube without cookies. */
export function externalEmbedUrl(provider: ExternalProvider, id: string): string {
  const encoded = encodeURIComponent(id)
  return provider === 'vimeo'
    ? `https://player.vimeo.com/video/${encoded}?dnt=1&autoplay=1`
    : `https://www.youtube-nocookie.com/embed/${encoded}?autoplay=1`
}

/**
 * A Vimeo or YouTube video as a click-to-load player (ADR-0102). The server HTML holds only our
 * own poster and a play button, in a box reserved from `width` and `height`: nothing third-party
 * loads. On click the provider's iframe replaces them. Reused wherever a page plays an external
 * video (the Work page, Home's "watch with sound").
 */
export function ExternalVideo({
  provider,
  id,
  poster,
  width,
  height,
  title,
  sizes,
  className,
}: {
  provider: ExternalProvider
  /** The provider's video id. */
  id: string
  /** Our own poster Picture, never the provider's thumbnail. */
  poster: ImageRead
  width: number
  height: number
  /** Names the play button and the iframe. */
  title: string
  sizes: string
  className?: string
}) {
  const [playing, setPlaying] = useState(false)
  return (
    <div
      className={`relative mx-auto overflow-hidden bg-placeholder ${className ?? ''}`}
      style={mediaFrameStyle(width, height)}
    >
      {playing ? (
        <iframe
          src={externalEmbedUrl(provider, id)}
          title={title}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <>
          <Picture
            image={poster}
            sizes={sizes}
            className="absolute inset-0 size-full object-cover"
          />
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`${title} videosunu oynat`}
            className="absolute inset-0 flex items-center justify-center"
          >
            <span aria-hidden="true" className="bg-background px-6 py-3 text-xl">
              ▶ Oynat
            </span>
          </button>
        </>
      )}
    </div>
  )
}
