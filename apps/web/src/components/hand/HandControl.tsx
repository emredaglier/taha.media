'use client'

import { useEffect, useRef, useState } from 'react'

import type { HandControlEffect } from '../../lib/hand-control'
import { initialGestureState, readGesture, type HandFrame } from '../../lib/hand-gesture'
import { HAND_TUNING } from '../../lib/hand-tuning'
import { createExplorer, type Explorer } from './explore'
import type { HandTracker } from './tracker'
import { dispatchHand, handState, setHandRunner, useHandControl } from './store'

/**
 * What the page has under a point (client px), leaving out Hand control's own overlays (the ring
 * and the preview carry `data-hand-overlay`).
 */
const hitTest = (x: number, y: number): Element | null =>
  document.elementsFromPoint(x, y).find((element) => !element.closest('[data-hand-overlay]')) ??
  null

/** A refused prompt (or a page not allowed the camera) reads differently from a broken camera. */
const cameraFailure = (error: unknown): 'refused' | 'unavailable' =>
  error instanceof DOMException &&
  (error.name === 'NotAllowedError' || error.name === 'SecurityError')
    ? 'refused'
    : 'unavailable'

/** One attempt's camera and tracker (see `HandControlState.attempt`). */
type Attempt = { stream?: MediaStream; tracker?: HandTracker }

type VideoWithFrames = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

/**
 * Calls `onFrame` once per new camera frame: on each video frame where the browser can say
 * (`requestVideoFrameCallback`), otherwise on animation frames whose video time moved on.
 */
function everyVideoFrame(video: VideoWithFrames, onFrame: (now: number) => void) {
  let handle = 0
  let stopped = false
  let lastTime = -1
  const step = (now: number) => {
    if (stopped) return
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime
      onFrame(now)
    }
    schedule()
  }
  const schedule = () => {
    handle = video.requestVideoFrameCallback
      ? video.requestVideoFrameCallback(step)
      : requestAnimationFrame(step)
  }
  schedule()
  return () => {
    stopped = true
    if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(handle)
    else cancelAnimationFrame(handle)
  }
}

/** Draws the hand's landmarks as dots on the preview (camera coordinates; CSS mirrors it). */
function drawHand(canvas: HTMLCanvasElement | null, hand: HandFrame | null) {
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  if (!hand) return
  context.fillStyle = getComputedStyle(canvas).color
  for (const point of hand) {
    context.beginPath()
    context.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, Math.PI * 2)
    context.fill()
  }
}

/**
 * Hand control's controller (#56), in the root layout so it lives across client-side
 * navigation. It runs the lifecycle's effects (`lib/hand-control`): it owns the camera stream, the
 * tracking task (loaded through a dynamic `import()` only after Aç), the preview and the ring.
 * Each camera frame goes through the gesture reader, and the cursor explores the page through the
 * same pointer events a mouse sends. A hidden tab, the ×, the toggle or unmounting stops every
 * camera track and closes the task.
 */
export function HandControl() {
  const { phase } = useHandControl()
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const attempts = useRef(new Map<number, Attempt>())
  // The camera's own picture size: the preview and its dots follow it (4:3, 16:9, ...).
  const [picture, setPicture] = useState<{ width: number; height: number }>(HAND_TUNING.camera)

  useEffect(() => {
    const live = attempts.current
    const explorer: Explorer = createExplorer(hitTest)
    let stopTracking: (() => void) | null = null
    // Set on unmount: an answer that arrives later is released here, since no runner is left to
    // act on the reducer's release.
    let disposed = false

    /** Whether an answer for `attempt` still has a place: mounted, and the attempt waiting. */
    const wanted = (attempt: number, phase: 'asking' | 'loading') =>
      !disposed && handState().phase === phase && handState().attempt === attempt

    const release = (attempt: number) => {
      const held = live.get(attempt)
      live.delete(attempt)
      for (const track of held?.stream?.getTracks() ?? []) track.stop()
      held?.tracker?.close()
    }

    const showRing = (point: { x: number; y: number } | null) => {
      const element = ring.current
      if (!element) return
      element.dataset.lost = point ? 'false' : 'true'
      if (point) element.style.transform = `translate(${point.x}px, ${point.y}px)`
    }

    const track = (attempt: number) => {
      const tracker = live.get(attempt)?.tracker
      const element = video.current
      if (!tracker || !element) return
      let gesture = initialGestureState
      let last = 0
      let failures = 0
      stopTracking = everyVideoFrame(element, (now) => {
        const at = Math.max(now, last + 1) // the tracker needs rising timestamps
        last = at
        let hand: HandFrame | null
        try {
          hand = tracker.detect(element, at)
          failures = 0
        } catch (error) {
          // Logged once per run of failures; a tracker that keeps failing turns Hand control off.
          if (failures++ === 0) console.error('Hand control: tracking failed on a frame', error)
          if (failures === HAND_TUNING.maxFailedFrames) {
            dispatchHand({ kind: 'trackingFailed', attempt })
          }
          return
        }
        drawHand(canvas.current, hand)
        const step = readGesture(gesture, hand, at)
        gesture = step.state
        for (const event of step.events) {
          if (event.kind === 'lost') {
            showRing(null)
            explorer.release()
          } else {
            // The cursor reaches the last pixel on each side, never past it: a point on the edge
            // itself hits nothing, and MENU sits at the right edge.
            const { clientWidth: w, clientHeight: h } = document.documentElement
            const point = {
              x: Math.min(event.point.x * w, w - 1),
              y: Math.min(event.point.y * h, h - 1),
            }
            showRing(point)
            explorer.moveTo(point.x, point.y)
          }
        }
      })
    }

    const run = (effect: HandControlEffect) => {
      switch (effect.kind) {
        case 'requestCamera': {
          const { attempt } = effect
          const { width, height } = HAND_TUNING.camera
          // Inside a promise, so a browser without `mediaDevices` fails like a broken camera.
          Promise.resolve()
            .then(() =>
              navigator.mediaDevices.getUserMedia({
                video: { width, height, facingMode: 'user' },
                audio: false,
              }),
            )
            .then(
              (stream) => {
                if (!wanted(attempt, 'asking')) {
                  // Turned off, or unmounted, while the browser asked: stop this camera now.
                  for (const track of stream.getTracks()) track.stop()
                  return
                }
                live.set(attempt, { stream })
                // An unplugged camera or a revoked permission ends the track on its own.
                for (const track of stream.getVideoTracks()) {
                  track.addEventListener('ended', () =>
                    dispatchHand({ kind: 'cameraEnded', attempt }),
                  )
                }
                dispatchHand({ kind: 'cameraGranted', attempt })
              },
              (error: unknown) =>
                dispatchHand({ kind: 'cameraFailed', attempt, reason: cameraFailure(error) }),
            )
          return
        }
        case 'loadTracker': {
          const { attempt } = effect
          import('./tracker')
            .then(({ createHandTracker }) => createHandTracker())
            .then(
              (tracker) => {
                const held = live.get(attempt)
                // Stopped, or unmounted, while it loaded.
                if (!held || !wanted(attempt, 'loading')) return tracker.close()
                held.tracker = tracker
                dispatchHand({ kind: 'trackerReady', attempt })
              },
              (error: unknown) => {
                console.error('Hand control: the tracking files did not load', error)
                dispatchHand({ kind: 'trackerFailed', attempt })
              },
            )
          return
        }
        case 'track':
          track(effect.attempt)
          return
        case 'release':
          release(effect.attempt)
          return
        case 'stop':
          stopTracking?.()
          stopTracking = null
          for (const attempt of [...live.keys()]) release(attempt)
          if (video.current) video.current.srcObject = null
          drawHand(canvas.current, null)
          showRing(null)
          explorer.release()
          return
      }
    }

    const undo = setHandRunner(run)
    const onVisibility = () => {
      if (document.hidden) dispatchHand({ kind: 'hidden' })
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      dispatchHand({ kind: 'unmount' })
      undo()
    }
  }, [])

  // The preview shows the camera from the moment it is on: it is the camera-on indicator.
  const cameraOn = phase === 'loading' || phase === 'on'
  useEffect(() => {
    const element = video.current
    const stream = attempts.current.get(handState().attempt)?.stream
    if (!cameraOn || !element || !stream) return
    element.srcObject = stream
    element.play()?.catch(() => {})
  }, [cameraOn])

  if (!cameraOn) return null
  const { width, height } = picture
  return (
    <>
      <div
        data-hand-overlay=""
        className="pointer-events-none fixed top-16 left-6 z-[60] w-48 border border-text-muted bg-background-raised text-text"
      >
        <div className="relative -scale-x-100" style={{ aspectRatio: `${width} / ${height}` }}>
          <video
            ref={video}
            muted
            playsInline
            className="absolute inset-0 size-full object-cover"
            aria-hidden="true"
            onLoadedMetadata={(event) => {
              const { videoWidth, videoHeight } = event.currentTarget
              if (videoWidth && videoHeight) setPicture({ width: videoWidth, height: videoHeight })
            }}
          />
          <canvas
            ref={canvas}
            width={width}
            height={height}
            className="absolute inset-0 size-full"
            aria-hidden="true"
          />
        </div>
        <button
          type="button"
          aria-label="Elinle gezmeyi kapat"
          className="pointer-events-auto absolute top-1 right-1 size-7 cursor-pointer bg-background-raised text-base leading-none"
          onClick={() => dispatchHand({ kind: 'close' })}
        >
          ×
        </button>
      </div>
      {phase === 'on' ? (
        <div
          ref={ring}
          data-hand-overlay=""
          data-lost="true"
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-0 z-[70] -mt-3.5 -ml-3.5 size-7 rounded-full border-2 border-text opacity-100 data-[lost=true]:opacity-0 motion-safe:transition-opacity motion-safe:duration-300"
        />
      ) : null}
    </>
  )
}
