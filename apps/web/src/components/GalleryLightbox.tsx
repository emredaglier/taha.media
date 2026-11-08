'use client'

import { useEffect, useRef } from 'react'

import type { GalleryItem } from '../data/gallery'
import { captionLine, mediaSize } from '../lib/gallery-item'
import { keyAction, lightboxLabel, positionLabel, swipeAction } from '../lib/lightbox-input'
import type { Step } from '../lib/lightbox-step'
import { mediaFrameStyle } from '../lib/media-frame'
import { lockScroll, nextFocus } from '../lib/menu-a11y'
import { LoopVideo } from './LoopVideo'
import { Picture } from './Picture'

/**
 * A Gallery item full-screen over the page: a modal dialog with the item large (a loop plays,
 * under the usual loop rules), previous and next that wrap, arrow keys, swipe, Escape and a
 * Kapat button. The page behind can't scroll, focus is trapped (every Tab step is picked by
 * `nextFocus`, for Safari: webkit-focus lesson 12), and the dialog is named for a screen reader.
 * Modelled on SiteMenu. Stepping, key and swipe decisions are pure functions in `lib/`; this
 * component only wires them to the DOM. The grid owns which item is open, and gives focus back
 * to the item it opened when `onClose` runs.
 */
export function GalleryLightbox({
  items,
  index,
  onStep,
  onClose,
}: {
  items: GalleryItem[]
  index: number
  onStep: (step: Step) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const item = items[index]!
  const count = items.length
  const line = captionLine(item)
  const { width, height } = mediaSize(item)

  // Opening: the page behind stops scrolling and focus moves in (to Kapat, the first control).
  useEffect(() => {
    const unlock = lockScroll(document.documentElement)
    dialogRef.current!.querySelector<HTMLElement>('button')?.focus()
    return unlock
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const focusables = [...dialogRef.current!.querySelectorAll<HTMLElement>('button')]
        const target = nextFocus(
          focusables,
          document.activeElement as HTMLElement | null,
          event.shiftKey,
        )
        if (target) {
          event.preventDefault()
          target.focus()
        }
        return
      }
      const action = keyAction(event)
      if (!action) return
      event.preventDefault()
      if (action === 'close') onClose()
      else onStep(action === 'next' ? 1 : -1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onStep, onClose])

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={lightboxLabel(index, count, item.caption)}
      className="fixed inset-0 z-[60] flex flex-col bg-background text-text"
    >
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <p aria-live="polite" aria-atomic="true" className="text-sm">
          {positionLabel(index, count)}
          {line ? <span className="text-text-muted"> · {line}</span> : null}
        </p>
        <button type="button" onClick={onClose} className="cursor-pointer text-sm uppercase">
          Kapat
        </button>
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center px-6"
        // Horizontal pans reach the swipe handlers; vertical ones stay the browser's.
        style={{ touchAction: 'pan-y pinch-zoom' }}
        onClick={(event) => {
          // A click beside the item, on the empty backdrop, closes (Escape and Kapat work too).
          if (event.target === event.currentTarget) onClose()
        }}
        onPointerDown={(event) => {
          swipeStart.current =
            event.isPrimary && event.pointerType !== 'mouse'
              ? { x: event.clientX, y: event.clientY }
              : null
        }}
        onPointerUp={(event) => {
          const start = swipeStart.current
          swipeStart.current = null
          if (!start || !event.isPrimary) return
          const action = swipeAction(event.clientX - start.x, event.clientY - start.y)
          if (action) onStep(action === 'next' ? 1 : -1)
        }}
        onPointerCancel={() => {
          swipeStart.current = null
        }}
      >
        {/* Keyed by item, so stepping mounts a fresh picture or loop (a loop restarts). */}
        <div key={item.id} style={mediaFrameStyle(width, height)} className="relative">
          {item.kind === 'image' ? (
            <Picture
              image={item.image}
              sizes="100vw"
              priority
              className="size-full bg-placeholder object-contain"
            />
          ) : (
            <LoopVideo video={item.video} sizes="100vw" />
          )}
        </div>
      </div>
      {count > 1 ? (
        <div className="flex items-center justify-between gap-4 px-6 py-4 text-sm uppercase">
          <button type="button" onClick={() => onStep(-1)} className="cursor-pointer">
            Önceki
          </button>
          <button type="button" onClick={() => onStep(1)} className="cursor-pointer">
            Sonraki
          </button>
        </div>
      ) : null}
    </div>
  )
}
