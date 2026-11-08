'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

import { useHomeMode } from '../lib/home-mode'
import type { HelixWork } from './FeaturedWorks'

// Its own chunk, fetched only once a device has passed the capability check.
const Helix = dynamic(() => import('./helix/Helix').then((module) => module.Helix), {
  ssr: false,
})

/**
 * Mounts the Helix over the static Home on a device that can run it (`useHomeMode`). It renders
 * nothing on the server, nor on a device that gets the static Home. If WebGL2 fails to start, or
 * its context is lost, it unmounts again and the static Home is back as it was.
 */
export function HomeHelix({ works }: { works: HelixWork[] }) {
  const mode = useHomeMode(works.length)
  const [failed, setFailed] = useState(false)
  if (mode !== 'helix' || failed) return null
  return <Helix works={works} onFail={() => setFailed(true)} />
}
