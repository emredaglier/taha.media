// @vitest-environment jsdom
import type { ImageRead } from '@taha/cms-config'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ExternalVideo } from './ExternalVideo'
import { externalPlayerAt } from './hand/media'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const poster: ImageRead = {
  id: 1,
  src: '/img/1-1280.webp',
  srcset: '',
  width: 1920,
  height: 1080,
  focalPoint: { x: 50, y: 50 },
  alt: 'Afiş',
}

let container: HTMLElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('the external player under Hand control (#59)', () => {
  it('is an ordinary button before it loads, and a player the hand knows once it has', () => {
    act(() =>
      root.render(
        <ExternalVideo
          provider="vimeo"
          id="1"
          poster={poster}
          width={1920}
          height={1080}
          title="Showreel"
          sizes="100vw"
        />,
      ),
    )
    const play = container.querySelector('button')!
    expect(externalPlayerAt(play)).toBeNull()
    act(() => play.click())
    const iframe = container.querySelector('iframe')!
    expect(externalPlayerAt(iframe)).toBe(iframe)
  })
})
