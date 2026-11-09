'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { isRunning, type HandControlEffect } from '../../lib/hand-control'
import { initialGestureState, readGesture, type HandFrame } from '../../lib/hand-gesture'
import {
  HINT_TEXT,
  HINTS,
  initialHints,
  meanLuma,
  readHints,
  type HandHint,
} from '../../lib/hand-hints'
import {
  startFrameRateWatch,
  startHandWatch,
  watchFrameRate,
  watchHand,
  type FrameRateWatch,
  type HandWatch,
} from '../../lib/hand-lifetime'
import {
  coachSeen,
  forgetOn,
  markCoachSeen,
  markHiddenWhileOn,
  mayResume,
  storageOf,
} from '../../lib/hand-session'
import { HAND_TUNING } from '../../lib/hand-tuning'
import { isMenuOpen } from '../../lib/menu-a11y'
import { createExplorer, type Explorer } from './explore'
import { createGrabScroller, handGrabSink } from './grab'
import { HandCoach } from './HandCoach'
import { overExternalPlayer, PLAYER_HINT } from './media'
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

/**
 * Reads the camera picture's mean luma (0–255) cheaply: the video drawn into a tiny offscreen
 * canvas (`HAND_TUNING.hints.lumaSize`), averaged, and only that number kept. Returns null where
 * the browser gives no 2D canvas, and from then on doesn't try again.
 */
function createLumaReader() {
  let context: CanvasRenderingContext2D | null | undefined
  return (video: HTMLVideoElement): number | null => {
    const { width, height } = HAND_TUNING.hints.lumaSize
    if (context === undefined) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      try {
        context = canvas.getContext('2d', { willReadFrequently: true })
      } catch {
        context = null
      }
    }
    if (!context) return null
    try {
      context.drawImage(video, 0, 0, width, height)
      return meanLuma(context.getImageData(0, 0, width, height).data)
    } catch {
      return null
    } finally {
      context.clearRect(0, 0, width, height) // nothing of the picture stays behind
    }
  }
}

/** How this page was loaded, for `mayResume`. */
const pageLoad = () => {
  const entry = performance.getEntriesByType?.('navigation')[0] as
    PerformanceNavigationTiming | undefined
  return {
    navigation: entry?.type,
    wasDiscarded: (document as { wasDiscarded?: boolean }).wasDiscarded === true,
    hidden: document.hidden,
    now: Date.now(),
  }
}

/**
 * Whether to come back on after a reload: one check per page load, which consumes the tab's mark.
 * React's development double mount mounts twice in a row; the second mount shares the first's
 * check, which would otherwise have taken the mark already.
 */
let resumeCheck: Promise<boolean> | null = null
const checkResume = () => {
  resumeCheck ??= mayResume(storageOf('sessionStorage'), pageLoad(), navigator.permissions).finally(
    () => {
      resumeCheck = null
    },
  )
  return resumeCheck
}

/** The Elinle gez toggle in the header, which takes focus back from the coach that opened alone. */
const headerToggle = () =>
  document.querySelector<HTMLElement>('[data-hand-toggle-slot] button[aria-pressed]')

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
 * Hand control's controller (#56, #57), in the root layout so it lives across client-side
 * navigation. It runs the lifecycle's effects (`lib/hand-control`): it owns the camera stream, the
 * tracking task (loaded through a dynamic `import()` only after Aç), the preview and the ring.
 * Each camera frame goes through the gesture reader: the cursor explores the page through the
 * same pointer events a mouse sends, a quick pinch clicks what is under it as a mouse does, and a
 * grab goes to whoever claimed it (the Helix on Home, `grab.ts`) or else scrolls the page, which
 * glides on briefly after letting go. The ring is filled while pinched and pings on a click. A
 * hidden tab, the ×, the toggle or unmounting stops every camera track and closes the task.
 *
 * Its lifetime (#58): it turns off after a while with no hand in view (longer while the coach is
 * open) and when the page can't stay smooth (`lib/hand-lifetime`). When the page hides with it on
 * (as it does when it unloads), the tab keeps the time in `sessionStorage`, so a reload moments
 * later brings it back while the browser says the camera is granted (`mayResume`, which never
 * prompts). The coach shows once per browser on first use, and the "?" on the preview replays it.
 * The hints ("Biraz yaklaş", "Daha çok ışık") show in the preview.
 */
export function HandControl() {
  const { phase } = useHandControl()
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const attempts = useRef(new Map<number, Attempt>())
  // The camera's own picture size: the preview and its dots follow it (4:3, 16:9, ...).
  const [picture, setPicture] = useState<{ width: number; height: number }>(HAND_TUNING.camera)
  // The coach while it is open, else null: its step, and whether the "?" opened it (focus goes
  // back there) or it opened by itself (focus goes back to the toggle). The tracking loop reads
  // whether it is open.
  const [coach, setCoach] = useState<{ step: number; fromHelp: boolean } | null>(null)
  const coachOpen = useRef(false)
  const help = useRef<HTMLButtonElement>(null)
  const [hints, setHints] = useState<readonly HandHint[]>([])
  // Whether the cursor is over a loaded external player (#59).
  const [overPlayer, setOverPlayer] = useState(false)

  useEffect(() => {
    const live = attempts.current
    const explorer: Explorer = createExplorer(hitTest)
    // Where the cursor is (client px), and what a grab starting there scrolls.
    let cursor: { x: number; y: number } | null = null
    const scroller = createGrabScroller(() => (cursor ? hitTest(cursor.x, cursor.y) : null))
    // Whether a grab is under way (its moves went to a claimant or to the page).
    let grabbing = false
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
      else element.dataset.pinched = 'false'
    }
    const fillRing = (pinched: boolean) => {
      if (ring.current) ring.current.dataset.pinched = String(pinched)
    }
    /**
     * Over a loaded external player the hand can't reach inside (#59): a label by the ring, and
     * the hint said once in the hints' polite live region.
     */
    const showPlayerHint = (over: boolean) => {
      if (ring.current) ring.current.dataset.player = String(over)
      setOverPlayer(over)
    }
    /** Restarts the ring's ping (its animation runs only with motion allowed). */
    const pingRing = () => {
      const ping = ring.current?.querySelector<HTMLElement>('[data-hand-ping]')
      if (!ping) return
      ping.dataset.on = 'false'
      void ping.offsetWidth
      ping.dataset.on = 'true'
    }

    /**
     * The grab moved `up` screen heights and `right` screen widths at `at` (ms): its claimant
     * takes it, or the page scrolls by the vertical part.
     */
    const grab = (up: number, right: number, at: number, since: number | undefined) => {
      grabbing = true
      if (handGrabSink()?.move(up, right)) return
      if (up !== 0) scroller.move(up, at, since)
    }
    /**
     * Ends the grab under way: its claimant settles. The page glides on only when `letGo` says
     * when the hand let go (and when its last steady frame was); otherwise it stops at once.
     */
    const endGrab = (letGo?: { steadyAt: number; at: number }) => {
      const claimed = grabbing && handGrabSink()?.end() === true
      grabbing = false
      if (letGo && !claimed) scroller.release(letGo.steadyAt, letGo.at)
      else scroller.cancel()
    }

    const track = (attempt: number) => {
      const tracker = live.get(attempt)?.tracker
      const element = video.current
      if (!tracker || !element) return
      let gesture = initialGestureState
      let last = 0
      let failures = 0
      // The lifetime's watches start with the first frame of each kind they see.
      let handWatch: HandWatch | null = null
      let frameRate: FrameRateWatch | null = null
      let hintState = initialHints
      let luma: number | null = null
      let lumaAt = -Infinity
      const readLuma = createLumaReader()

      // The page's own frame rate, on its animation frames, while on.
      let pageFrame = 0
      let stopped = false
      const onPageFrame = (now: number) => {
        if (stopped) return
        const step = frameRate ? watchFrameRate(frameRate, now) : null
        frameRate = step?.state ?? startFrameRateWatch(now)
        if (step?.event) return dispatchHand({ kind: step.event.reason, attempt })
        pageFrame = requestAnimationFrame(onPageFrame)
      }
      pageFrame = requestAnimationFrame(onPageFrame)
      // The window's focus changed: the browser may stop drawing it meanwhile (an occluded
      // window), so the watch starts afresh, with its grace, rather than reading that as slow.
      const onFocusChange = () => {
        frameRate = null
      }
      window.addEventListener('focus', onFocusChange)
      window.addEventListener('blur', onFocusChange)

      const stopCamera = everyVideoFrame(element, (now) => {
        const at = Math.max(now, last + 1) // the tracker needs rising timestamps
        last = at
        let hand: HandFrame | null
        try {
          // The tracker's score isn't used: "Daha çok ışık" is brightness only (owner).
          hand = tracker.detect(element, at)?.hand ?? null
          failures = 0
        } catch (error) {
          // Logged once per run of failures; a tracker that keeps failing turns Hand control off.
          if (failures++ === 0) console.error('Hand control: tracking failed on a frame', error)
          if (failures === HAND_TUNING.maxFailedFrames) {
            dispatchHand({ kind: 'trackingFailed', attempt })
          }
          return
        }
        if (at - lumaAt >= HAND_TUNING.hints.lumaEveryMs) {
          luma = readLuma(element) ?? luma
          lumaAt = at
        }
        const hinted = readHints(hintState, { hand, luma }, at)
        hintState = hinted.state
        if (hinted.events.length > 0) setHints(HINTS.filter((hint) => hintState[hint].on))
        drawHand(canvas.current, hand)
        const step = readGesture(gesture, hand, at)
        gesture = step.state
        for (const event of step.events) {
          switch (event.kind) {
            case 'lost':
              cursor = null
              showRing(null)
              showPlayerHint(false)
              explorer.release()
              break
            case 'move': {
              // The cursor reaches the last pixel on each side, never past it: a point on the edge
              // itself hits nothing, and MENU sits at the right edge.
              const { clientWidth: w, clientHeight: h } = document.documentElement
              cursor = {
                x: Math.min(event.point.x * w, w - 1),
                y: Math.min(event.point.y * h, h - 1),
              }
              showRing(cursor)
              explorer.moveTo(cursor.x, cursor.y)
              showPlayerHint(overExternalPlayer(hitTest(cursor.x, cursor.y)))
              break
            }
            case 'pinch':
              fillRing(true)
              scroller.cancel() // a new pinch catches a gliding page
              break
            case 'click':
              fillRing(false)
              pingRing()
              explorer.click()
              break
            case 'grab':
              grab(event.up, event.right, at, event.since)
              break
            case 'release':
              fillRing(false)
              endGrab({ steadyAt: event.steadyAt, at })
              break
          }
        }
        // Last, since turning off stops this loop. The coach open gives the visitor longer.
        const watched = watchHand(
          handWatch ?? startHandWatch(at),
          { seen: hand !== null, coach: coachOpen.current },
          at,
        )
        handWatch = watched.state
        if (watched.event) dispatchHand({ kind: watched.event.reason, attempt })
      })
      stopTracking = () => {
        stopped = true
        stopCamera()
        cancelAnimationFrame(pageFrame)
        window.removeEventListener('focus', onFocusChange)
        window.removeEventListener('blur', onFocusChange)
      }
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
          // The coach, once per browser, the first time Hand control is on (where local storage
          // is refused, each time it turns on). Not over the open menu: then on the next turn-on.
          if (!coachSeen(storageOf('localStorage')) && !isMenuOpen(document)) {
            markCoachSeen(storageOf('localStorage'))
            setCoach({ step: 0, fromHelp: false })
          }
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
          showPlayerHint(false)
          explorer.release()
          // A grab under way lets go without gliding: the Helix settles, the page stays.
          endGrab()
          cursor = null
          setHints([])
          setCoach(null)
          return
        case 'forget':
          forgetOn(storageOf('sessionStorage'))
          return
      }
    }

    const undo = setHandRunner(run)
    /** The page is hiding: if Hand control is on, the tab keeps the time, for a reload. */
    const markIfOn = () => {
      if (isRunning(handState())) markHiddenWhileOn(storageOf('sessionStorage'), Date.now())
    }
    const onVisibility = () => {
      if (document.hidden) {
        markIfOn()
        dispatchHand({ kind: 'hidden' })
      }
      // A hidden tab turned it off but kept the mark (a page also hides as it unloads, on the way
      // to a reload); shown again, the tab clears it, so a later reload stays off.
      else if (!isRunning(handState())) forgetOn(storageOf('sessionStorage'))
    }
    document.addEventListener('visibilitychange', onVisibility)
    // `pagehide` comes first as a page unloads, in case a browser hides it late or not at all.
    window.addEventListener('pagehide', markIfOn)

    // After a real reload in this tab, moments after it was on: back on, only if the browser says
    // the camera is granted (so asking opens no prompt). Checked again once the browser answers:
    // still shown, still mounted, and still off.
    void checkResume().then((resume) => {
      if (resume && !disposed && !document.hidden && handState().phase === 'off') {
        dispatchHand({ kind: 'resume' })
      }
    })

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', markIfOn)
      dispatchHand({ kind: 'unmount' })
      undo()
    }
  }, [])

  useEffect(() => {
    coachOpen.current = coach !== null
  }, [coach])
  const closeCoach = useCallback(() => setCoach(null), [])
  const coachStep = useCallback(
    (step: number) => setCoach((open) => (open ? { ...open, step } : open)),
    [],
  )
  // Focus goes back to the "?" that opened the coach, or else to the toggle.
  const coachReturn = useCallback(
    (): HTMLElement | null =>
      coach?.fromHelp && help.current?.isConnected ? help.current : headerToggle(),
    [coach?.fromHelp],
  )

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
          ref={help}
          type="button"
          aria-label="Nasıl kullanılır"
          className="pointer-events-auto absolute top-1 right-9 size-7 cursor-pointer bg-background-raised text-base leading-none"
          onClick={() => setCoach({ step: 0, fromHelp: true })}
        >
          ?
        </button>
        <button
          type="button"
          aria-label="Elinle gezmeyi kapat"
          className="pointer-events-auto absolute top-1 right-1 size-7 cursor-pointer bg-background-raised text-base leading-none"
          onClick={() => dispatchHand({ kind: 'close' })}
        >
          ×
        </button>
        {/* The hints, announced politely as they come; each is debounced, so none flickers. */}
        <div role="status" aria-live="polite" data-hand-hints="" className="px-2 text-xs">
          {hints.map((hint) => (
            <p key={hint} className="py-1">
              {HINT_TEXT[hint]}
            </p>
          ))}
          {/* Seen by the ring's label; said here (#59). */}
          {overPlayer ? <p className="sr-only">{PLAYER_HINT}</p> : null}
        </div>
      </div>
      {coach !== null && phase === 'on' ? (
        <HandCoach
          step={coach.step}
          onStep={coachStep}
          onClose={closeCoach}
          returnFocus={coachReturn}
        />
      ) : null}
      {phase === 'on' ? (
        <div
          ref={ring}
          data-hand-overlay=""
          data-hand-ring=""
          data-lost="true"
          data-pinched="false"
          data-player="false"
          aria-hidden="true"
          className="group pointer-events-none fixed top-0 left-0 z-[70] -mt-3.5 -ml-3.5 size-7 rounded-full border-2 border-text opacity-100 data-[lost=true]:opacity-0 data-[pinched=true]:bg-text motion-safe:transition-opacity motion-safe:duration-300"
        >
          {/* The click's ping: a ring that grows and fades, only with motion allowed. */}
          <span
            data-hand-ping=""
            className="absolute -inset-3 rounded-full border-2 border-text opacity-0 motion-safe:data-[on=true]:animate-hand-ping"
          />
          {/* Over an external player (#59); the hints' live region says it for screen readers. */}
          <span className="absolute top-full left-full mt-2 ml-2 hidden border border-text-muted bg-background-raised px-2 py-1 text-xs whitespace-nowrap text-text group-data-[player=true]:block">
            {PLAYER_HINT}
          </span>
        </div>
      ) : null}
    </>
  )
}
