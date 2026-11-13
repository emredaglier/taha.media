'use client'

import type { VideoRead } from '@taha/cms-config'
import { useEffect, useRef } from 'react'

import { useLoopMode } from '../lib/loop-mode'
import { Picture } from './Picture'

/**
 * A muted, looping, inline video over its poster. The server HTML holds only the poster `<img>`
 * in a box reserved from the stored width and height. After hydration, unless the visitor asked
 * for reduced motion or Save-Data (`useLoopMode`), the `<video>` is added: it plays while in view,
 * or on cards, while a fine pointer is over the card (or focus is in it).
 */
export function LoopVideo({
  video,
  sizes,
  hoverToPlay = false,
  className,
  fill = false,
}: {
  video: VideoRead
  sizes: string
  /** Cards pass true: with a fine pointer they play on hover instead of in view. */
  hoverToPlay?: boolean
  className?: string
  /** Fills a positioned parent (cropping to it) instead of reserving its own aspect-ratio box. */
  fill?: boolean
}) {
  const mode = useLoopMode(hoverToPlay)
  const box = useRef<HTMLDivElement>(null)
  const player = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const element = player.current
    const wrapper = box.current
    if (mode === 'poster' || !element || !wrapper) return
    const play = () => void element.play().catch(() => undefined)
    const pause = () => element.pause()

    if (mode === 'view') {
      const observer = new IntersectionObserver(
        ([entry]) => (entry?.isIntersecting ? play() : pause()),
        { threshold: 0.25 },
      )
      observer.observe(wrapper)
      return () => {
        observer.disconnect()
        pause()
      }
    }

    // `hover`: the whole card is the target, not only the picture.
    const target = wrapper.closest('a') ?? wrapper
    const events = [
      ['pointerenter', play],
      ['focusin', play],
      ['pointerleave', pause],
      ['focusout', pause],
    ] as const
    for (const [name, handler] of events) target.addEventListener(name, handler)
    return () => {
      for (const [name, handler] of events) target.removeEventListener(name, handler)
      pause()
    }
  }, [mode])

  return (
    <div
      ref={box}
      className={`overflow-hidden bg-placeholder ${fill ? 'absolute inset-0 size-full' : 'relative'} ${className ?? ''}`}
      style={fill ? undefined : { aspectRatio: `${video.width} / ${video.height}` }}
    >
      <Picture
        image={video.poster}
        sizes={sizes}
        className="absolute inset-0 size-full object-cover"
      />
      {mode !== 'poster' && (
        <video
          ref={player}
          src={video.src}
          poster={video.poster.src}
          muted
          loop
          playsInline
          preload="none"
          crossOrigin="anonymous"
          data-melt=""
          aria-hidden="true"
          tabIndex={-1}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </div>
  )
}
