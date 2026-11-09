'use client'

import { useCallback, useRef, useState } from 'react'

import type { GalleryItem } from '../data/gallery'
import { captionLine, fullSizeFile, gridPicture } from '../lib/gallery-item'
import { isPlainClick } from '../lib/lightbox-input'
import { stepIndex, type Step } from '../lib/lightbox-step'
import { GalleryLightbox } from './GalleryLightbox'
import { Picture } from './Picture'

const SIZES = '(min-width: 768px) 33vw, 50vw'

/**
 * The Gallery as a grid of items. Each is a link to its full-size file, so without JavaScript it
 * still opens the picture or the loop. With JavaScript a plain click opens the lightbox instead
 * (a modified click, such as Cmd+click, keeps the link). A loop shows its poster here and plays
 * in the lightbox. Closing returns focus to the item that was opened.
 */
export function GalleryGrid({ items }: { items: GalleryItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  // The link that opened the lightbox, set on click: Safari does not focus a clicked link, so
  // `document.activeElement` can't be used to find it again.
  const opener = useRef<HTMLAnchorElement | null>(null)
  const count = items.length

  const step = useCallback(
    (direction: Step) =>
      setOpenIndex((index) => (index === null ? null : stepIndex(index, count, direction))),
    [count],
  )
  const close = useCallback(() => {
    setOpenIndex(null)
    opener.current?.focus()
  }, [])

  return (
    <>
      <ul className="grid grid-cols-2 items-start gap-4 md:grid-cols-3">
        {items.map((item, index) => {
          const line = captionLine(item)
          return (
            <li key={item.id}>
              <figure>
                <a
                  href={fullSizeFile(item)}
                  aria-haspopup="dialog"
                  className="block"
                  onClick={(event) => {
                    if (!isPlainClick(event)) return
                    event.preventDefault()
                    opener.current = event.currentTarget
                    setOpenIndex(index)
                  }}
                >
                  <Picture
                    image={gridPicture(item)}
                    sizes={SIZES}
                    className="h-auto w-full bg-placeholder"
                  />
                </a>
                {line ? (
                  <figcaption className="mt-2 text-sm text-text-muted">{line}</figcaption>
                ) : null}
              </figure>
            </li>
          )
        })}
      </ul>
      {openIndex !== null ? (
        <GalleryLightbox
          items={items}
          index={Math.min(openIndex, count - 1)}
          onStep={step}
          onClose={close}
        />
      ) : null}
    </>
  )
}
