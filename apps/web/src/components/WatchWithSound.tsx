'use client'

import type { ExternalProvider, ImageRead } from '@taha/cms-config'
import { useState } from 'react'

import { ExternalVideo } from './ExternalVideo'

/**
 * "Watch with sound": the full-length Showreel on Vimeo or YouTube. Without JavaScript it is a
 * plain link to the video's own page. With JavaScript a click shows the click-to-load player
 * right away (ADR-0102): nothing third-party loads before that click.
 */
export function WatchWithSound({
  provider,
  id,
  url,
  poster,
}: {
  provider: ExternalProvider
  id: string
  url: string
  poster: ImageRead
}) {
  const [open, setOpen] = useState(false)
  if (open) {
    return (
      <ExternalVideo
        provider={provider}
        id={id}
        poster={poster}
        width={poster.width}
        height={poster.height}
        title="Showreel"
        sizes="100vw"
        autoStart
      />
    )
  }
  return (
    <a
      href={url}
      onClick={(event) => {
        event.preventDefault()
        setOpen(true)
      }}
      className="underline"
    >
      Sesli izle
    </a>
  )
}
