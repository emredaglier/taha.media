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
  | 'noHand'
  | 'notSmooth'

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
  /**
   * After a reload, this tab had Hand control on and the browser says the camera is granted
   * (#58): it comes back on without the consent note, given in this tab, and without a prompt.
   */
  | { kind: 'resume' }
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
  /** No hand in view for `HAND_TUNING.lifetime.noHandMs` (#58). */
  | { kind: 'noHand'; attempt: number }
  /** The page stayed under `HAND_TUNING.lifetime.minFps` for `slowMs` (#58). */
  | { kind: 'notSmooth'; attempt: number }
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
  /**
   * Clear the tab's mark (`sessionStorage`, set by the controller when the page hides with Hand
   * control on): it was turned off, so a reload leaves it off.
   */
  | { kind: 'forget' }

export const initialHandControl: HandControlState = { phase: 'off', attempt: 0, notice: null }

/** Whether the camera is asked for or on: the toggle reads pressed, and every way out stops it. */
export const isRunning = ({ phase }: HandControlState): boolean =>
  phase === 'asking' || phase === 'loading' || phase === 'on'

type Step = { state: HandControlState; effects: HandControlEffect[] }

const unchanged = (state: HandControlState): Step => ({ state, effects: [] })

/**
 * Every way to off goes through here, so every one stops the camera, and every one clears the
 * tab's mark, except a hidden tab and unmounting (`keep`): a page hides as it unloads, so a reload
 * passes through there, and the controller clears a hidden tab's mark once it is shown again.
 */
const turnOff = (state: HandControlState, notice: HandNotice | null, keep = false): Step => ({
  state: { ...state, phase: 'off', notice },
  effects: keep ? [{ kind: 'stop' }] : [{ kind: 'stop' }, { kind: 'forget' }],
})

/** A camera or tracker answer for an attempt that is not the one waiting for it. */
const late = (state: HandControlState, attempt: number, waiting: HandPhase): boolean =>
  state.phase !== waiting || state.attempt !== attempt

/**
 * Hand control's lifecycle (#56, #58), pure: the controller runs the effects. Only Aç asks for the
 * camera, or a reload in a tab that had it on once the browser says the camera is granted
 * (`resume`); the toggle, the ×, a hidden tab, unmounting, no hand for a while and a page that
 * can't stay smooth turn it off; every way to off stops the camera, and a late answer from the
 * camera or the tracker is released.
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
    case 'resume': {
      if (state.phase !== 'off') return unchanged(state)
      const attempt = state.attempt + 1
      return {
        state: { phase: 'asking', attempt, notice: null },
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
    case 'noHand':
    case 'notSmooth':
      return late(state, event.attempt, 'on') ? unchanged(state) : turnOff(state, event.kind)
    case 'cameraEnded':
      return running && state.attempt === event.attempt
        ? turnOff(state, 'cameraEnded')
        : unchanged(state)
    case 'close':
      return running ? turnOff(state, 'stopped') : unchanged(state)
    case 'hidden':
      return running ? turnOff(state, 'hidden', true) : unchanged(state)
    case 'unmount':
      return turnOff(state, null, true)
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
  noHand: 'Elin görünmedi, elinle gezme kapandı',
  notSmooth: 'Bu cihazda akıcı çalışmıyor',
}

/** The status line, in Turkish, for a polite live region; empty when there is nothing to say. */
export const handStatus = (state: HandControlState): string =>
  state.notice ? NOTICES[state.notice] : ''
