/**
 * The Pinboard's tweens (#147): a small tween runner and the menu's four moments (open, close,
 * hover, leave), ported from the prototype (`docs/design/menu3/pinboard.js`) with its durations,
 * delays, eases and staggers. Pure: no DOM, no GSAP. The motion hook steps it once a frame and
 * draws the board state it writes.
 */

const back = (overshoot: number) => (p: number) =>
  (p - 1) ** 2 * ((overshoot + 1) * (p - 1) + overshoot) + 1

/** The prototype's eases, with GSAP's curves (power1 is quadratic, power2 cubic, power3 quartic). */
export const EASES = {
  'power1.in': (p: number) => p ** 2,
  'power1.out': (p: number) => 1 - (1 - p) ** 2,
  'power2.in': (p: number) => p ** 3,
  'power2.out': (p: number) => 1 - (1 - p) ** 3,
  'power3.in': (p: number) => p ** 4,
  'power3.out': (p: number) => 1 - (1 - p) ** 4,
  'power3.inOut': (p: number) => (p < 0.5 ? 8 * p ** 4 : 1 - 8 * (1 - p) ** 4),
  'back.out(1.05)': back(1.05),
  'back.out(1.15)': back(1.15),
}

export type EaseName = keyof typeof EASES

export type TweenOptions = {
  /** Seconds. */
  duration: number
  /** Seconds before it starts. */
  delay?: number
  /** GSAP's default, `power1.out`, when left out. */
  ease?: EaseName
  /** Seconds between targets, in order or from the last one. */
  stagger?: number | { each: number; from?: 'start' | 'end' }
  /** Once, when its last property lands; never when that one was overwritten or killed. */
  onComplete?: () => void
}

type NumberKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T]

export type Tweens = {
  /** Tweens each target's `props` from their values when it starts to these. */
  to<T extends object>(
    targets: T | readonly T[],
    props: { [K in NumberKeys<T>]?: number },
    options: TweenOptions,
  ): void
  /** Moves every tween to `now` (ms, the clock's timeline). */
  step(now: number): void
  /** Stops the tweens of these targets (only on `props`, when given), with no callback. */
  kill(targets: object | readonly object[], props?: readonly string[]): void
}

type Group = { live: number; onComplete?: () => void }
type Track = {
  target: Record<string, number>
  prop: string
  to: number
  start: number
  ms: number
  ease: (p: number) => number
  /** The value it started from; null while it waits for its start. */
  from: number | null
  done: boolean
  group: Group
}

/**
 * A runner on `clock` (ms). A new tween on a target's property overwrites the older one (GSAP's
 * `overwrite: 'auto'`, made strict): an older tween still waiting for its start is dropped at
 * once, a running one goes on until the new one starts and then hands over from where it is. So
 * the last tween asked for a property always wins, and never with a jump.
 */
export function createTweens(clock: () => number): Tweens {
  let tracks: Track[] = []
  let ended: Group[] = []

  const end = (track: Track, landed: boolean) => {
    track.done = true
    track.group.live--
    if (track.group.live === 0 && landed) ended.push(track.group)
  }
  const same = (a: Track, b: Track) =>
    a !== b && !a.done && a.target === b.target && a.prop === b.prop

  return {
    to(targets, props, { duration, delay = 0, ease = 'power1.out', stagger = 0, onComplete }) {
      const list: readonly object[] = Array.isArray(targets) ? targets : [targets]
      const { each, from } =
        typeof stagger === 'number' ? { each: stagger, from: 'start' } : stagger
      const group: Group = { live: 0, onComplete }
      const now = clock()
      list.forEach((target, i) => {
        const order = from === 'end' ? list.length - 1 - i : i
        for (const [prop, to] of Object.entries(props) as [string, number][]) {
          const track: Track = {
            target: target as Record<string, number>,
            prop,
            to,
            start: now + (delay + order * each) * 1000,
            ms: duration * 1000,
            ease: EASES[ease],
            from: null,
            done: false,
            group,
          }
          for (const other of tracks)
            if (other.from === null && same(other, track)) end(other, false)
          group.live++
          tracks.push(track)
        }
      })
      tracks = tracks.filter((track) => !track.done)
    },

    step(now) {
      for (const track of tracks) {
        if (track.done || now < track.start) continue
        if (track.from === null) {
          track.from = track.target[track.prop]!
          // Only older tracks can be running here: a newer one dropped this one while it waited.
          for (const other of tracks) if (same(other, track)) end(other, false)
        }
        const p = track.ms > 0 ? Math.min(1, (now - track.start) / track.ms) : 1
        track.target[track.prop] = track.from + (track.to - track.from) * track.ease(p)
        if (p >= 1) end(track, true)
      }
      tracks = tracks.filter((track) => !track.done)
      const callbacks = ended
      ended = []
      for (const group of callbacks) group.onComplete?.()
    },

    kill(targets, props) {
      const list: readonly object[] = Array.isArray(targets) ? targets : [targets]
      for (const track of tracks) {
        if (!track.done && list.includes(track.target) && (!props || props.includes(track.prop)))
          end(track, false)
      }
      tracks = tracks.filter((track) => !track.done)
    },
  }
}

export type SheetKind = 'page' | 'print' | 'note' | 'story' | 'legal'

/** What the moments move on a sheet; the motion hook's sheets carry more (the hinge, the layout). */
export type MomentSheet = {
  kind: SheetKind
  /** How far it is on the board: 0 off, 1 pinned. The page sheet stays at 1 until a leave. */
  en: number
  /** Which way it is off the board: -1 above (coming in), 1 below (falling away). */
  dir: number
  /** Hover: 1 is lifted flat toward the visitor. */
  hv: number
  /** Dimmed because another sheet is hovered. */
  dim: number
  /** How far its leave flight has gone: 1 fills the view. */
  fl: number
  /** The tilt its hinge settles to (deg): `rest0`, but the page's straightens to 0 on close. */
  rest: number
  /** Its resting tilt on the board (deg). */
  rest0: number
  /** It has had its landing swing; the hinge gives one to a sheet that lands without it. */
  landed: boolean
}

export type Board<S extends MomentSheet = MomentSheet> = {
  /** The page sheet and the rest, in the prototype's order. */
  sheets: S[]
  wall: { a: number }
  /** The live page's shrink: 0 the full page, 1 pinned to the board as a sheet. */
  page: { t: number }
  /** The lamp's pool of light, gathered on the hovered sheet. */
  spot: { x: number; y: number; a: number }
  strings: { o: number }
  /** The whole board's opacity: it fades out after a leave. */
  fade: { o: number }
  open: boolean
  leaving: S | null
  hovered: S | null
  /** The fade after a leave runs. */
  fading: boolean
}

/** A sheet to hover and where its pool of light goes (the prototype puts it a tenth below its middle); null for none. */
export type HoverPick<S> = { sheet: S; x: number; y: number } | null

/**
 * The hovered sheet changes at most once per hold, so a pointer hopping between sheets can't flash
 * their dimming more than 3 times a second (WCAG 2.3.1, as the Edit Room's pointing does).
 */
export const HOVER_HOLD_SECONDS = 0.25

/** Below this a sheet is fully off the board, this close to 1 fully on it. */
const SETTLED = 1e-4

/**
 * Turns a sheet's way off the board only while it is fully on or off, so a reversal mid-flight
 * retraces its path instead of jumping to the other side. (The prototype turns it always.)
 */
function aim(sheet: MomentSheet, dir: number) {
  if (sheet.en < SETTLED || Math.abs(1 - sheet.en) < SETTLED) sheet.dir = dir
}

function resetBoard(board: Board) {
  for (const s of board.sheets) {
    Object.assign(s, {
      en: s.kind === 'page' ? 1 : 0,
      dir: -1,
      hv: 0,
      dim: 0,
      fl: 0,
      rest: s.rest0,
      landed: false,
    })
  }
  Object.assign(board, { open: false, leaving: null, hovered: null, fading: false })
  board.wall.a = 0
  board.page.t = 0
  board.spot.a = 0
  board.strings.o = 1
  board.fade.o = 1
}

/** A closed board at rest over `sheets` (the page sheet among them), resetting what they hold. */
export function createBoard<S extends MomentSheet>(sheets: S[]): Board<S> {
  const board: Board<S> = {
    sheets,
    wall: { a: 0 },
    page: { t: 0 },
    spot: { x: 0, y: 0, a: 0 },
    strings: { o: 1 },
    fade: { o: 1 },
    open: false,
    leaving: null,
    hovered: null,
    fading: false,
  }
  resetBoard(board)
  return board
}

/**
 * The four moments over `board`, on `clock` (ms): `step(now)` once a frame. `onRest` runs each
 * time the board is back closed and at rest (a close ended, a leave's fade ended, or an open cut
 * that fade short and opens at once): reset what the sheets carry beyond the moments (the hinge).
 */
export function createPinboardMoments<S extends MomentSheet>(
  board: Board<S>,
  clock: () => number,
  onRest: () => void,
) {
  const tweens = createTweens(clock)
  const page = board.sheets.find((s) => s.kind === 'page')!
  const rest: MomentSheet[] = board.sheets.filter((s) => s !== page)
  let lastTurn = -Infinity
  /** A hover asked for within the hold; undefined when none waits. */
  let waiting: HoverPick<S> | undefined
  /** The fade after a leave waits for `release`: the next page is not there yet. */
  let held = false

  const toRest = () => {
    tweens.kill([...board.sheets, board.wall, board.page, board.spot, board.strings, board.fade])
    resetBoard(board)
    waiting = undefined
    held = false
    onRest()
  }

  const setHover = (pick: HoverPick<S>) => {
    const sheet = pick?.sheet ?? null
    board.hovered = sheet
    lastTurn = clock()
    for (const t of rest) {
      tweens.to(
        t,
        { hv: t === sheet ? 1 : 0, dim: sheet && t !== sheet ? 1 : 0 },
        { duration: t === sheet ? 0.45 : 0.5, ease: 'power3.out' },
      )
    }
    if (pick) {
      tweens.to(board.spot, { x: pick.x, y: pick.y, a: 1 }, { duration: 0.5, ease: 'power3.out' })
    } else tweens.to(board.spot, { a: 0 }, { duration: 0.5 })
  }

  const fade = () =>
    tweens.to(board.fade, { o: 0 }, { duration: 0.22, ease: 'power1.out', onComplete: toRest })

  return {
    /** Pins the page to the board and brings the sheets in; reverses a close from where it is. Does nothing during a leave. */
    open() {
      if (board.fading) toRest()
      if (board.open) return
      board.open = true
      page.rest = page.rest0
      page.landed = false
      for (const s of rest) {
        aim(s, -1)
        s.landed = false
      }
      tweens.to(board.wall, { a: 1 }, { duration: 0.8, ease: 'power2.out' })
      tweens.to(board.page, { t: 1 }, { duration: 0.95, ease: 'back.out(1.05)' })
      tweens.to(
        rest,
        { en: 1 },
        { duration: 0.7, ease: 'back.out(1.15)', stagger: 0.07, delay: 0.3 },
      )
    },

    /** Takes the page off its pin, straightens and grows it back while the rest falls away; reverses an open. Ignored during a leave. */
    close() {
      if (!board.open || board.leaving) return
      board.open = false
      if (board.hovered) lastTurn = clock()
      board.hovered = null
      waiting = undefined
      for (const t of rest) tweens.to(t, { hv: 0, dim: 0 }, { duration: 0.2 })
      tweens.to(board.spot, { a: 0 }, { duration: 0.2 })
      page.rest = 0
      page.landed = true
      for (const s of rest) aim(s, 1)
      tweens.to(
        rest,
        { en: 0 },
        { duration: 0.55, ease: 'power2.in', stagger: { each: 0.04, from: 'end' } },
      )
      tweens.to(
        board.page,
        { t: 0 },
        {
          duration: 0.85,
          delay: 0.2,
          ease: 'power3.inOut',
          onComplete: () => {
            if (!board.open && !board.leaving) toRest()
          },
        },
      )
      tweens.to(board.wall, { a: 0 }, { duration: 0.45, delay: 0.5, ease: 'power1.in' })
    },

    /** Lifts one sheet (null: none), at most one change per hold. Ignored during a leave. */
    hover(pick: HoverPick<S>) {
      if (board.leaving) return
      if ((pick?.sheet ?? null) === board.hovered) waiting = undefined
      else if (clock() - lastTurn >= HOVER_HOLD_SECONDS * 1000) setHover(pick)
      else waiting = pick
    },

    /**
     * Flies `sheet` off its pin at the view while the rest falls and the strings and light fade;
     * `onArrive` runs once when its picture fills the view (within 900 ms), then the board fades
     * out to rest. Only on an open board; a second leave is ignored. When `onArrive` returns true
     * the sheet keeps covering the view until `release()`, so a slow route change shows no old page.
     */
    leave(sheet: S, onArrive: () => boolean | void) {
      if (board.leaving || !board.open) return
      board.leaving = sheet
      board.hovered = sheet
      waiting = undefined
      tweens.kill(board.sheets, ['hv', 'dim'])
      for (const s of board.sheets) aim(s, 1)
      const others: MomentSheet[] = board.sheets.filter((s) => s !== sheet)
      tweens.to(others, { en: 0 }, { duration: 0.45, ease: 'power2.in', stagger: 0.03 })
      tweens.to(
        sheet as MomentSheet,
        { fl: 1, hv: 0, dim: 0, en: 1 },
        {
          duration: 0.72,
          delay: 0.1,
          ease: 'power3.in',
          onComplete: () => {
            board.open = false
            tweens.kill(board.page)
            board.page.t = 0
            held = onArrive() === true
            board.fading = true
            if (!held) fade()
          },
        },
      )
      tweens.to(board.strings, { o: 0 }, { duration: 0.3 })
      tweens.to(board.spot, { a: 0 }, { duration: 0.3 })
    },

    /** Lets a held fade run (the next page is there, or has given up). */
    release() {
      if (!held) return
      held = false
      fade()
    },

    /** Moves the board to `now` (ms, the clock's timeline). */
    step(now: number) {
      if (waiting !== undefined && now - lastTurn >= HOVER_HOLD_SECONDS * 1000) {
        const pick = waiting
        waiting = undefined
        if ((pick?.sheet ?? null) !== board.hovered) setHover(pick)
      }
      tweens.step(now)
    },
  }
}
