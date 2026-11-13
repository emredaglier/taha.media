'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

import { useHomeMode } from '../lib/home-mode'
import type { HelixWork } from './FeaturedWorks'

// Its own chunk, with Three.js: fetched only once a device has passed the capability check, and
// by no other page.
const Room = dynamic(() => import('./room/Room').then((module) => module.Room), { ssr: false })

/**
 * Mounts the Edit Room over the static Home on a device that can run it (`useHomeMode`). It renders
 * nothing on the server, nor on a device that gets the static Home. If WebGL2 fails to start, or
 * its context is lost, it unmounts again and the static Home is back as it was.
 */
export function HomeRoom({
  works,
  showreel,
}: {
  works: HelixWork[]
  showreel: { src: string } | null
}) {
  const mode = useHomeMode(works.length)
  const [failed, setFailed] = useState(false)
  if (mode !== 'room' || failed) return null
  return <Room works={works} showreel={showreel} onFail={() => setFailed(true)} />
}
