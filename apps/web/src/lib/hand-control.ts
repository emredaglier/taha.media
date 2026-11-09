/**
 * Where Hand control is:
 * - `off`: nothing runs and no camera is on;
 * - `consenting`: the consent note is open (no camera yet);
 * - `asking`: after Aç, the browser asks for the camera;
 * - `loading`: the camera is on (the preview shows it) and the tracking files load;
 * - `on`: the fingertip is the cursor.
 */
export type HandPhase = 'off' | 'consenting' | 'asking' | 'loading' | 'on'

/** Why the status line speaks: a change worth announcing. */
export type HandNotice =
  | 'asking'
  | 'loading'
  | 'on'
  | 'stopped'
  | 'hidden'
  | 'cancelled'
  | 'refused'
  | 'unavailable'
  | 'loadFailed'
  | 'trackingFailed'
  | 'cameraEnded'

export type HandControlState = {
  phase: HandPhase
  /**
   * Counts the presses of Aç. The camera and the tracker answer asynchronously, so each answer
   * names its attempt: one for an attempt that is no longer current is released, never adopted.
   */
  attempt: number
  /** What the status line says, until dismissed; null for nothing. */
  notice: HandNotice | null
}

export type HandControlEvent =
  /** The Elinle gez toggle was pressed. */
  | { kind: 'toggle' }
  /** Aç in the consent note. */
  | { kind: 'accept' }
  /** Vazgeç or Esc in the consent note. */
  | { kind: 'decline' }
  | { kind: 'cameraGranted'; attempt: number }
  | { kind: 'cameraFailed'; attempt: number; reason: 'refused' | 'unavailable' }
  | { kind: 'trackerReady'; attempt: number }
  | { kind: 'trackerFailed'; attempt: number }
  /** The tracker kept failing on the camera frames (`HAND_TUNING.maxFailedFrames` in a row). */
  | { kind: 'trackingFailed'; attempt: number }
  /** A camera track ended on its own: the camera was unplugged or the permission revoked. */
  | { kind: 'cameraEnded'; attempt: number }
  /** The × on the preview. */
  | { kind: 'close' }
  /** The tab was hidden. */
  | { kind: 'hidden' }
  /** The controller is going away. */
  | { kind: 'unmount' }
  /** The status line has been read; clear it. */
  | { kind: 'dismissNotice' }

export type HandControlEffect =
  /** Ask the browser for the camera (only ever after Aç). */
  | { kind: 'requestCamera'; attempt: number }
  /** Show the camera in the preview and load the tracking files. */
  | { kind: 'loadTracker'; attempt: number }
  /** Run the tracker on every camera frame. */
  | { kind: 'track'; attempt: number }
  /** Stop that attempt's camera tracks and close its tracker: its answer came too late. */
  | { kind: 'release'; attempt: number }
  /** Stop every camera track, close the tracker, take the cursor away. */
  | { kind: 'stop' }

export const initialHandControl: HandControlState = { phase: 'off', attempt: 0, notice: null }

/** Whether the camera is asked for or on: the toggle reads pressed, and every way out stops it. */
export const isRunning = ({ phase }: HandControlState): boolean =>
  phase === 'asking' || phase === 'loading' || phase === 'on'

type Step = { state: HandControlState; effects: HandControlEffect[] }

const unchanged = (state: HandControlState): Step => ({ state, effects: [] })

/** Every way to off goes through here, so every one stops the camera. */
const turnOff = (state: HandControlState, notice: HandNotice | null): Step => ({
  state: { ...state, phase: 'off', notice },
  effects: [{ kind: 'stop' }],
})

/** A camera or tracker answer for an attempt that is not the one waiting for it. */
const late = (state: HandControlState, attempt: number, waiting: HandPhase): boolean =>
  state.phase !== waiting || state.attempt !== attempt

/**
 * Hand control's lifecycle (#56), pure: the controller runs the effects. Only Aç asks for the
 * camera; the toggle, the ×, a hidden tab and unmounting turn it off; every way to off stops the
 * camera, and a late answer from the camera or the tracker is released.
 */
export function handControl(state: HandControlState, event: HandControlEvent): Step {
  const running = isRunning(state)
  switch (event.kind) {
    case 'toggle':
      if (state.phase === 'off') return unchanged({ ...state, phase: 'consenting', notice: null })
      if (state.phase === 'consenting') return turnOff(state, 'cancelled')
      return turnOff(state, 'stopped')
    case 'accept': {
      if (state.phase !== 'consenting') return unchanged(state)
      const attempt = state.attempt + 1
      return {
        state: { phase: 'asking', attempt, notice: 'asking' },
        effects: [{ kind: 'requestCamera', attempt }],
      }
    }
    case 'decline':
      return state.phase === 'consenting' ? turnOff(state, 'cancelled') : unchanged(state)
    case 'cameraGranted':
      if (late(state, event.attempt, 'asking')) {
        return { state, effects: [{ kind: 'release', attempt: event.attempt }] }
      }
      return {
        state: { ...state, phase: 'loading', notice: 'loading' },
        effects: [{ kind: 'loadTracker', attempt: event.attempt }],
      }
    case 'cameraFailed':
      return late(state, event.attempt, 'asking') ? unchanged(state) : turnOff(state, event.reason)
    case 'trackerReady':
      if (late(state, event.attempt, 'loading')) {
        return { state, effects: [{ kind: 'release', attempt: event.attempt }] }
      }
      return {
        state: { ...state, phase: 'on', notice: 'on' },
        effects: [{ kind: 'track', attempt: event.attempt }],
      }
    case 'trackerFailed':
      return late(state, event.attempt, 'loading') ? unchanged(state) : turnOff(state, 'loadFailed')
    case 'trackingFailed':
      return late(state, event.attempt, 'on') ? unchanged(state) : turnOff(state, 'trackingFailed')
    case 'cameraEnded':
      return running && state.attempt === event.attempt
        ? turnOff(state, 'cameraEnded')
        : unchanged(state)
    case 'close':
      return running ? turnOff(state, 'stopped') : unchanged(state)
    case 'hidden':
      return running ? turnOff(state, 'hidden') : unchanged(state)
    case 'unmount':
      return turnOff(state, null)
    case 'dismissNotice':
      return state.notice === null ? unchanged(state) : unchanged({ ...state, notice: null })
  }
}

const NOTICES: Record<HandNotice, string> = {
  asking: 'Kamera izni bekleniyor',
  loading: 'El takibi yükleniyor',
  on: 'Elinle gezme açık',
  stopped: 'Elinle gezme kapandı',
  hidden: 'Sekme gizlendi, elinle gezme kapandı',
  cancelled: 'Kamera açılmadı',
  refused: 'Kamera izni verilmedi',
  unavailable: 'Kamera açılamadı',
  loadFailed: 'El takibi yüklenemedi',
  trackingFailed: 'El takibi durdu',
  cameraEnded: 'Kamera kapandı',
}

/** The status line, in Turkish, for a polite live region; empty when there is nothing to say. */
export const handStatus = (state: HandControlState): string =>
  state.notice ? NOTICES[state.notice] : ''
