'use client'

import type { ExternalProvider, ImageRead } from '@taha/cms-config'
import { useEffect, useState } from 'react'

import { HERO_GONE_ATTRIBUTE } from '../lib/home-marks'
import { ExternalVideo } from './ExternalVideo'

/**
 * The most of the screen's height the open player takes, so it fits inside the hero's fixed overlay
 * with the name and Statement under it, however wide the screen is.
 */
const PLAYER_MAX_HEIGHT_SVH = 45

/**
 * "Watch with sound": the full-length Showreel on Vimeo or YouTube. Without JavaScript it is a
 * plain link to the video's own page. With JavaScript a click shows the click-to-load player
 * right away (ADR-0102): nothing third-party loads before that click. It closes when the Helix's
 * opening takes the hero away, so a player opened there never plays on unseen.
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
  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      if (root.hasAttribute(HERO_GONE_ATTRIBUTE)) setOpen(false)
    })
    observer.observe(root, { attributes: true, attributeFilter: [HERO_GONE_ATTRIBUTE] })
    return () => observer.disconnect()
  }, [])
  if (open) {
    return (
      <div
        className="mx-auto"
        style={{
          width: `min(100%, ${((PLAYER_MAX_HEIGHT_SVH * poster.width) / poster.height).toFixed(3)}svh)`,
        }}
      >
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
      </div>
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
